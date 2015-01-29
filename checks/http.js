'use strict';
var dns = require('dns');
var http = require('http');
var zlib = require('zlib');

function expandHeaders(headersTxt) {
    var headers = {};
    if (headersTxt && headersTxt.length > 0) {
        headersTxt.split("\n").forEach(function(headerStr) {
            var parts = headerStr.split(":");
            var headerName = parts[0].trim().toLowerCase();
            var headerContent = parts.slice(1).join(':').trim();
            if (headerName.length > 0) {
                headers[headerName] = headerContent;
            }
        });
    }
    return headers;
}

function timeDiff(t1, t2) {
    //convert to milliseconds.
    return ((t1[0] - t2[0]) * 1e3) + ((t1[1] - t2[1])/1e6);
}

exports.execute = function(payload, callback) {
    var hostname = payload.host;
    var headers = expandHeaders(payload.headers);
    var expectRegex = payload.expectRegex;

    if (!("timeout" in payload)) {
        payload.timeout = 10;
    }

    if (! ('host' in headers)) {
        headers.host = hostname;
    }
    if (!('accept-encoding' in headers)) {
        headers['accept-encoding'] = 'gzip';
    }

    var opts = {
        headers: headers,
        port: parseInt(payload.port),
        method: payload.method || "GET",
        path: payload.path,
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

    var startTime = process.hrtime();
    metrics.startTime = new Date().getTime()/1000;
    var step = startTime;
    var request;
    var timedout = false;

    var timeoutId = setTimeout(function() {
        timedout = true;
        var endTime = process.hrtime();
        if (request) {
            request.abort();
        }
        metrics.error = "timed out after " + payload.timeout + " seconds.";
        metrics.total += timeDiff(endTime, step);
        return respond(metrics, callback);
    }, payload.timeout * 1000);

    dns.lookup(hostname, 4, function(err, address, family) {
        var dnsTime = process.hrtime();
        if (err) {
            clearTimeout(timeoutId);
            if (timedout) return;
            console.log(err);
            metrics.error = "dns lookup failure.";
            return respond(metrics, callback);
        }
        metrics.dns = timeDiff(dnsTime, step);
        metrics.total += metrics.dns;
        //console.log('setting http HOST to: ' + address);
        opts.host = address;

        step = dnsTime;
        request = http.request(opts);

        request.on('socket', function(socket) {
            socket.on('connect', function() {
                var socketConnectTime = process.hrtime();
                metrics.connect = timeDiff(socketConnectTime, step);
                metrics.total += metrics.connect;
                step = socketConnectTime;
                //SEND DATA HERE
                if (payload.method == "POST" && payload.post) {
                    request.write(payload.post);
                }
                request.end();
            });
            socket.on('error', function(e) {
                console.log('socket error');
                console.log(e);
            });
        });
        request.on('error', function(e) {
            var requestEndTime = process.hrtime();
            clearTimeout(timeoutId);
            if (timedout) return;

            metrics.send = timeDiff(requestEndTime, step);
            metrics.total += metrics.send;
            metrics.error = e.message;
            return respond(metrics, callback);
        });
        request.on('finish', function() {
            var requestEndTime = process.hrtime();
            metrics.send = timeDiff(requestEndTime, step);
            metrics.total += metrics.send;
            step = requestEndTime;
        });
        request.on('response', function(response) {
            var responseTime = process.hrtime();
            metrics.wait = timeDiff(responseTime, step);
            metrics.total += metrics.wait;
            step = responseTime;
            var rawResp = [];
            var dataLength = 0;
            response.on('data', function(data) {
                rawResp.push(data);
                dataLength += data.length;
                if (dataLength > (100*1024)) { //limit our size to 100Kb
                    request.abort();
                }
            });
            response.on('end', function() {
                var endTime = process.hrtime();
                clearTimeout(timeoutId);
                if (timedout) return;
                metrics.recv = timeDiff(endTime, step);
                metrics.total += metrics.recv;
                metrics.dataLength = dataLength;
                metrics.statusCode = response.statusCode;
                if (expectRegex) {
                    if ('content-encoding' in response.headers && response.headers['content-encoding'] == 'gzip') {
                        //handle gziped data.
                        var buffer = Buffer.concat(rawResp);
                        zlib.gunzip(buffer, function(err, decoded) {
                          if (err) {
                            console.log("could not decode response data.");
                            console.log(err)
                          } else {
                            var rexp = new RegExp(expectRegex, 'g');
                            if (!(rexp.test(decoded))) {
                                metrics.error = "expectRegex did not match.";
                            }
                          }
                          respond(metrics, callback);
                        });
                    } else {
                        var rexp = new RegExp(expectRegex, 'g');
                        if (!(rexp.test(rawResp))) {
                            metrics.error = "expectRegex did not match.";
                        }
                        respond(metrics, callback);
                    }
                } else {
                    return respond(metrics, callback);
                }
            });

        });
    });

}

function respond(metrics, callback) {
    var payload = [{
        plugin: "http",
        unit: "ms",
        dsnames: [],
        target_type: "gauge",
        values: [],
        time: metrics.startTime
    },{
        plugin: "http",
        unit: "bytes",
        dsnames: [],
        target_type: "gauge",
        values: [],
        time: metrics.startTime
    },
    {
        plugin: "http",
        unit: "code",
        dsnames: [],
        target_type: "gauge",
        values: [],
        time: metrics.startTime
    }];
    ['dns','connect','send','wait','recv', 'total'].forEach(function(m) {
        if (!isNaN(metrics[m]) && metrics[m] > 0 ) {
            metrics[m] = metrics[m] = Math.round(metrics[m] * 100) / 100;
        }
        payload[0].dsnames.push(m);
        payload[0].values.push(metrics[m]);
    });
    payload[1].dsnames.push('dataLength');
    if (!isNaN(metrics['dataLength']) && metrics['dataLength'] > 0 ) {
        metrics['dataLength'] = Math.round(metrics['dataLength'] * 100) / 100;
    }
    payload[1].values.push(metrics['dataLength']);
    payload[1].dsnames.push('statusCode');
    payload[1].values.push(metrics['statusCode']);

    callback(null, {success: true, results: payload, error: metrics.error});
}

