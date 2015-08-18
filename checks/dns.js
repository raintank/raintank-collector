'use strict';
var http = require('http');
var config = require('../config').config;
var util = require('util');
http.globalAgent.maxSockets = 1000;
var log4js = require('log4js');
var logger = log4js.getLogger('PID:'+process.pid);

exports.execute = function(payload, service, config, timestamp, callback) {
    var profile = {
        time: null,
        answers: null,
        ttl: null,
        error: null,
        startTime: timestamp,
    };
    var post_body = JSON.stringify(payload);
    var req = http.request({
        host: 'localhost',
        port: config.probeServerPort,
        path:  '/dns',
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
                    logger.error("dns check failed. ", body);
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
    var tags = {
        endpoint_id: ""+service.endpoint_id,
        monitor_id: ""+service.id,
        collector: config.collector.slug,
        monitor_type: "dns"
    };
    var payload = [
        {
            name: util.format(
                "litmus.%s.%s.dns.time",
                service.endpoint_slug,
                config.collector.slug
            ),
            org_id: service.org_id,
            metric: "litmus.dns.time",
            interval: service.frequency,
            unit: "ms",
            target_type: "gauge",
            value: Math.round(metrics.time * 100) / 100,
            time: metrics.startTime,
            tags: tags
        },
        {
            name: util.format(
                "litmus.%s.%s.dns.default",
                service.endpoint_slug,
                config.collector.slug
            ),
            org_id: service.org_id,
            metric: "litmus.dns.default",
            interval: service.frequency,
            unit: "ms",
            target_type: "gauge",
            value: Math.round(metrics.time * 100) / 100,
            time: metrics.startTime,
            tags: tags
        },
        {
            name: util.format(
                "litmus.%s.%s.dns.ttl",
                service.endpoint_slug,
                config.collector.slug
            ),
            org_id: service.org_id,
            metric: "litmus.dns.ttl",
            interval: service.frequency,
            unit: "s",
            target_type: "gauge",
            value: metrics.ttl,
            time: metrics.startTime,
            tags: tags
        },
        {
            name: util.format(
                "litmus.%s.%s.dns.answers",
                service.endpoint_slug,
                config.collector.slug
            ),
            org_id: service.org_id,
            metric: "litmus.dns.answers",
            interval: service.frequency,
            unit: "count",
            target_type: "gauge",
            value: metrics.answers,
            time: metrics.startTime,
            tags: tags
        }
    ];
    callback(null, {success: true, results: payload, error: metrics.error});
}

function toString(type, answer) {

    var response = '';
    switch (type) {
        case 'SOA':
            response = util.format('%s %s %s %s %s %s %s',
                answer.primary,
                answer.admin,
                answer.serial,
                answer.refresh,
                answer.retry,
                answer.expiration,
                answer.minimum );
            break;
        case 'A':
        case 'AAAA':
            response = answer.address;
            break;
        case 'TXT':
        case 'CNAME':
        case 'PTR':
        case 'NS':
            response = answer.data;
            break;
        case 'SRV':
            response = util.format('%s %s %s %s',
                answer.priority,
                answer.weight,
                answer.port,
                answer.target);
            break;
        case 'MX':
            response = util.format('%s %s',
                answer.priority,
                answer.exchange);
            break;
    };
    return response;
};
