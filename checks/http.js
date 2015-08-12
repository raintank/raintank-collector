'use strict';
var dns = require('dns');
var http = require('http');
var zlib = require('zlib');
var util = require('util');

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

exports.execute = function(payload, service, config, timestamp, callback) {
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
    metrics.startTime = timestamp;
    var step = startTime;
    var request;
    var timedout = false;

    var timeoutId = setTimeout(function() {
        timedout = true;
        if (request) {
            request.abort();
        }
        metrics.error = "timed out after " + payload.timeout + " seconds.";
        return respond(metrics, service, config, callback);
    }, payload.timeout * 1000);

    dns.lookup(hostname, 4, function(err, address, family) {
        var dnsTime = process.hrtime();
        if (err) {
            clearTimeout(timeoutId);
            if (timedout) return;
            console.log(err);
            metrics.error = "dns lookup failure.";
            return respond(metrics, service, config, callback);
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
            return respond(metrics, service, config, callback);
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
                if (metrics.statusCode >= 400) {
                    metrics.error = "Invalid statusCode. "+metrics.statusCode;
                }
                if (expectRegex && !metrics.error) {
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
                          respond(metrics, service, config, callback);
                        });
                    } else {
                        var rexp = new RegExp(expectRegex, 'g');
                        if (!(rexp.test(rawResp))) {
                            metrics.error = "expectRegex did not match.";
                        }
                        respond(metrics, service, config, callback);
                    }
                } else {
                    return respond(metrics, service, config, callback);
                }
            });

        });
    });

}

function respond(metrics, service, config, callback) {
    var payload = [];
    var tags = {
        endpoint_id: service.endpoint_id,
        monitor_id: service.id,
        collector: config.collector.slug,
        monitor_type: "http"
    };
    ['dns','connect','send','wait','recv', 'total'].forEach(function(m) {
        if (!isNaN(metrics[m]) && metrics[m] > 0 ) {
            metrics[m] = metrics[m] = Math.round(metrics[m] * 100) / 100;
        }
        payload.push({
            name: util.format(
                "litmus.%s.%s.http.%s",
                service.endpoint_slug,
                config.collector.slug,
                m
            ),
            org_id: service.org_id,
            metric: util.format("litmus.http.%s", m),
            interval: service.frequency,
            unit: "ms",
            target_type: "gauge",
            value: metrics[m],
            time: metrics.startTime,
            tags: tags
        });
    });
    
    payload.push({
        name: util.format(
            "litmus.%s.%s.http.default",
            service.endpoint_slug,
            config.collector.slug
        ),
        org_id: service.org_id,
        metric: "litmus.http.default",
        interval: service.frequency,
        unit: "ms",
        target_type: "gauge",
        value: metrics['total'],
        time: metrics.startTime,
        tags: tags
    });

    if (!isNaN(metrics['dataLength']) && metrics['dataLength'] > 0 ) {
        metrics['dataLength'] = Math.round(metrics['dataLength'] * 100) / 100;
    }
    payload.push({
        name: util.format(
            "litmus.%s.%s.http.dataLength",
            service.endpoint_slug,
            config.collector.slug
        ),
        org_id: service.org_id,
        metric: "litmus.http.dataLength",
        interval: service.frequency,
        unit: "bytes",
        target_type: "gauge",
        value: metrics['dataLength'],
        time: metrics.startTime,
        tags: tags
    });

    if (metrics['dataLength'] > 0 && metrics['recv'] > 0) {
        payload.push({
            name: util.format(
                "litmus.%s.%s.http.throughput",
                service.endpoint_slug,
                config.collector.slug
            ),
            org_id: service.org_id,
            metric: "litmus.http.throughput",
            interval: service.frequency,
            unit: "bytes",
            target_type: "gauge",
            value: metrics['dataLength']/(metrics['recv']/1000),
            time: metrics.startTime,
            tags: tags
        });
    }

    payload.push({
        name: util.format(
            "litmus.%s.%s.http.statusCode",
            service.endpoint_slug,
            config.collector.slug
        ),
        org_id: service.org_id,
        metric: "litmus.http.statusCode",
        interval: service.frequency,
        unit: "code",
        target_type: "gauge",
        value: metrics['statusCode'],
        time: metrics.startTime,
        tags: tags
    });

    callback(null, {success: true, results: payload, error: metrics.error});
}

