'use strict';
var http = require('http');
var config = require('../config').config;
var util = require('util');
http.globalAgent.maxSockets = 1000;
var log4js = require('log4js');
var logger = log4js.getLogger('PID:'+process.pid);

exports.execute = function(payload, service, config, timestamp, callback) {
    var profile = {
        loss: null,
        min: null,
        max: null,
        avg: null,
        mean: null,
        mdev: null,
        error: null,
        startTime: timestamp,
    };
    var post_body = JSON.stringify(payload);
    var req = http.request({
        host: 'localhost',
        port: config.probeServerPort,
        path:  '/ping',
        method: 'POST',
        headers: {'Content-Type': "application/json", 'Content-Length': post_body.length}
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
                    logger.error("ping check failed. ", body);
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
    var tags = [
        util.format("endpoint_id:%d", service.endpoint_id),
        util.format("monitor_id:%d", service.id),
        util.format("collector:%s", config.collector.slug),
    ];
    var payload = [];
    ['min','max','avg','mean', 'mdev'].forEach(function(m) {
        payload.push({
            name: util.format(
                "litmus.%s.%s.ping.%s",
                service.endpoint_slug,
                config.collector.slug,
                m
            ),
            org_id: service.org_id,
            metric: util.format("litmus.ping.%s", m),
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
            "litmus.%s.%s.ping.%s",
            service.endpoint_slug,
            config.collector.slug,
            "default"
        ),
        org_id: service.org_id,
        metric: util.format("litmus.ping.%s", "default"),
        interval: service.frequency,
        unit: "ms",
        target_type: "gauge",
        value: metrics["mean"],
        time: metrics.startTime,
        tags: tags
    });
    payload.push({
        name: util.format(
            "litmus.%s.%s.ping.%s",
            service.endpoint_slug,
            config.collector.slug,
            "loss"
        ),
        org_id: service.org_id,
        metric: util.format("litmus.ping.%s", "loss"),
        interval: service.frequency,
        unit: "%",
        target_type: "gauge",
        value: metrics["loss"],
        time: metrics.startTime,
        tags: tags
    });

    callback(null, {success: true, results: payload, error: metrics.error});
}

