'use strict';
var dns = require('dns');
var http = require('http');
var zlib = require('zlib');

function expandHeaders(headersTxt) {
    var headers = {};

    headersTxt.split("\n").forEach(function(headerStr) {
        var parts = headerStr.split(":");
        var headerName = parts[0].trim().toLowerCase();
        var headerContent = parts.slice(1).join(':').trim();
        if (headerName.length > 0) {
            headers[headerName] = headerContent;
        }
    })
    return headers;
}

/*
var params = ['hostname','port','timeout','path','headers','auth','expectRegex','method','post'];
*/
exports.run = function(req, res) {
    var hostname = req.body.hostname;
    var headers = expandHeaders(req.body.headers);
    var expectRegex = req.body.expectRegex;

    if (! ('host' in headers)) {
        headers.host = hostname;
    }
    if (!('accept-encoding' in headers)) {
        headers['accept-encoding'] = 'gzip';
    }

    var opts = {
        headers: headers,
        port: parseInt(req.body.port),
        method: req.body.method,
        path: req.body.path,
        agent: false,
        servername: headers.host,
    };
    var metrics = {
        dns: null,
        connect: null,
        send: null,
        wait: null,
        recv: null,
        total: 0,
        dataLength: null,
        statusCode: null,
        error: null,
    };

    var startTime = new Date();
    metrics.startTime = startTime.getTime()/1000;
    var step = startTime;
    var request;
    var timedout = false;

    var timeoutId = setTimeout(function() {
        timedout = true;
        var endTime = new Date();
        if (request) {
            request.abort();
        }
        metrics.error = "timed out after " + req.body.timeout + " seconds.";
        metrics.total += (endTime.getTime() - step.getTime());
        return respond(res, metrics);    
    }, req.body.timeout * 1000);

    dns.lookup(hostname, 4, function(err, address, family) {
        var dnsTime = new Date();
        if (err) {
            console.log(err);
            metrics.error = "dns lookup failure.";
            return respond(res, metrics);
        }
        metrics.dns = dnsTime.getTime() - step.getTime();
        metrics.total += metrics.dns;
        //console.log('setting http HOST to: ' + address);
        opts.host = address;

        step = dnsTime;
        request = http.request(opts);

        request.on('socket', function(socket) {
            socket.on('connect', function() {
                var socketConnectTime = new Date();
                metrics.connect = socketConnectTime.getTime() -  step.getTime();
                metrics.total += metrics.connect;
                step = socketConnectTime;
                //SEND DATA HERE
                if (req.body.method == "POST" && req.body.post) {
                    request.write(req.body.post);
                }
                request.end();
            });
            socket.on('error', function(e) {
                console.log('socket error');
                console.log(e);
            });
        });
        request.on('error', function(e) {
            if (! timedout) {
                console.log('HTTP: error event emitted.');
                console.log(e);
                metrics.error = e.message;
                return respond(res, metrics);
            }
        });
        request.on('finish', function() {
            var requestEndTime = new Date();
            metrics.send = requestEndTime.getTime() - step.getTime();
            metrics.total += metrics.send;
            step = requestEndTime;
        });
        request.on('response', function(response) {
            var responseTime = new Date();
            metrics.wait = responseTime.getTime() -  step.getTime();
            metrics.total += metrics.wait;
            step = responseTime;
            var rawResp = [];
            var dataLength = 0;
            response.on('data', function(data) {
                rawResp.push(data);
                dataLength += data.length;
                if (dataLength > (100*1024)) { //limit our size to 100Kb
                    console.log("aborting request as dataLength limit reached.");
                    request.abort();
                }
            });
            response.on('end', function() {
                var endTime = new Date();
                clearTimeout(timeoutId);
                metrics.recv = endTime.getTime() - step.getTime();
                metrics.total += metrics.recv;
                metrics.dataLength = dataLength;
                metrics.statusCode = response.statusCode;
                if (expectRegex) {
                    var buffer = Buffer.concat(rawResp);
                    zlib.gunzip(buffer, function(err, decoded) {
                      if (err) {
                        console.log("could not decode response data.");
                        console.log(err)
                      } else {
                        var rexp = new RegExp(expectRegex, 'g');
                        if (!(rexp.test(decoded))) {
                            console.log("expectRegex did not match.");
                            metrics.error = "expectRegex did not match.";
                        }
                      }
                      respond(res, metrics);
                    });
                } else {
                    return respond(res, metrics);
                }
            });

        });
    });

}

function respond(res, metrics) {
    var payload = [{
        plugin: "http",
        type: "response",
        dsnames: [],
        dstypes: [],
        values: [],
    }];
    var valid_metrics = ['dns','connect','send','wait','recv', 'total', 'dataLength', 'statusCode'];
    valid_metrics.forEach(function(m) {
        if (!isNaN(metrics[m]) && metrics[m] > 0 ) {
            metrics[m] = metrics[m];
        }
        payload[0].dsnames.push(m);
        payload[0].dstypes.push('gauge');
        payload[0].values.push(metrics[m]);
        payload[0].time = metrics.startTime;
    });

    res.json({success: true, results: payload, error: metrics.error});
}

