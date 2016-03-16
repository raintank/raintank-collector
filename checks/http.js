'use strict';
var http = require('http');
var config = require('../config').config;
var util = require('util');
http.globalAgent.maxSockets = 1000;
var log4js = require('log4js');
var logger = log4js.getLogger('PID:'+process.pid);

exports.execute = function(payload, service, config, timestamp, callback) {
    var profile = {
        dns: null,
        connect: null,
        send: null,
        wait: null,
        recv: null,
        total: 0,
        dataLength: null,
        throughput: null,
        statusCode: null,
        error: null,
    };

    var post_body = JSON.stringify(payload);
    var req = http.request({
        host: 'localhost',
        port: config.probeServerPort,
        path:  '/http',
        method: 'POST',
        headers: {'Content-Type': "application/json", 'Content-Length': Buffer.byteLength(post_body, 'utf8')}
    }, function(response) {
        var body = '';
        response.on('data', function(d) {
            body += d;
        });
        response.on('end', function() {
            if (response.statusCode != 200) {
                // 500 errors are internal and should not be returned in the 
                // response payload.
                if (response.statusCode < 500) {
                    profile.error = body;
                } else {
                    logger.error("http check failed. ", body);
                }
                return respond(profile, service, config, callback);
            }
            // Data reception is done, do whatever with it!
            var parsed;
            try {
                parsed = JSON.parse(body);
                profile = parsed;
            } catch (ex) {
                parsed = profile;
            }
            //put the startTime back in the profile.
            profile.startTime = timestamp;
            respond(profile, service, config, callback);
        });
    }).on('error', function(e) {
      logger.error("Got error: " + e.message);
      return respond(profile, service, config, callback);
    });
    req.write(post_body);
    req.end();
}

function respond(metrics, service, config, callback) {
    var payload = [];
    var tags = [
        util.format("endpoint_id:%d", service.endpoint_id),
        util.format("monitor_id:%d", service.id),
        util.format("collector:%s", config.collector.slug),
    ];
    ['dns','connect','send','wait','recv', 'total'].forEach(function(m) {
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
        value: metrics['throughput'],
        time: metrics.startTime,
        tags: tags
    });
    
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

