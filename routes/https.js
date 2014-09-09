'use strict';
var dns = require('dns');
var https = require('https');
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
var params = ['hostname','port','timeout','path','headers','auth','expectRegex','method','post', 'validateCert'];
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
        rejectUnauthorized: (req.body.validateCert == 'true')? true: false,
    };
    
    
    var metrics = {
        dns: null,
        connect: null,
        send: null,
        wait: null,
        recv: null,
        statusCode: null,
        dataLength: null,
        error: null,
    };

    var startTime = new Date();
    metrics.startTime = startTime.getTime()/1000;
    var step = startTime;
    dns.lookup(hostname, 4, function(err, address, family) {
        if (err) {
            console.log(err);
            metrics.error = "dns lookup failure.";
            return respond(res, metrics);
        }
        var dnsTime = new Date();
        metrics.dns = dnsTime.getTime() - step.getTime();
        opts.host = address;

        step = dnsTime;
        var request = https.request(opts);

        var timeoutId = setTimeout(function() {
            request.abort();
            metrics.error = "timed out after " + req.body.timeout + " seconds.";
            return respond(res, metrics);    
        }, req.body.timeout * 1000);
        request.on('socket', function(socket) {
            socket.on('secureConnect', function() {
                var socketConnectTime = new Date();
                metrics.connect = socketConnectTime.getTime() -  step.getTime();
                step = socketConnectTime;
                //SEND DATA HERE
                // request.write();
                request.end();
            });

        });
        request.on('error', function(e) {
            console.log(e);
            metrics.error = e.message;
            return respond(res, metrics);
        });
        request.on('finish', function() {
            var requestEndTime = new Date();
            metrics.send = requestEndTime.getTime() - step.getTime();
            step = requestEndTime;
        });
        request.on('response', function(response) {
            var responseTime = new Date();

            metrics.wait = responseTime.getTime() -  step.getTime();
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
                metrics.total = endTime.getTime() - startTime.getTime();
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
