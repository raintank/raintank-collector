'use strict';
var dns = require('native-dns');
var basicDns = require('dns');
var util = require('util');
var async = require('async');
var log4js = require('log4js');
var logger = log4js.getLogger('PID:'+process.pid);

function timeDiff(t1, t2) {
    //convert to milliseconds.
    return ((t1[0] - t2[0]) * 1e3) + ((t1[1] - t2[1])/1e6);
}

function lookupServer(server, callback) {
    basicDns.lookup(server, 4, function(err, address, family) {
        if (err) {
            return callback(err);
        }
        callback(null,address);
    });
}

exports.execute = function(payload, service, config, timestamp, callback) {
    var question = dns.Question({
        name: payload.name,
        type: payload.type,
    });
    var profile = {
        time: null,
        ttl: null,
        answers: null,
    };
    var complete = false;
    var nsservers = payload.server.split(',');
    profile.startTime = timestamp;
    var server = {
        address: null,
        port: parseInt(payload.port),
        type: payload.protocol,
    };
    var count = 0;
    var nsserver;
    var success = false;
    async.until(function(){

        if (count >= nsservers.length) {
            return true
        }
        if (success) {
            return true
        }
        nsserver = nsservers[count];
        count++;
    }, function(next) {
        lookupServer(nsserver, function(err, address) {
            if (err) {
                return next();
            }
            server.address = address;

            var startTime = process.hrtime();
            var request = {question: question, server: server, timeout: (payload.timeout * 1000), cache: false}
            var dnsReq = dns.Request(request);
            dnsReq.on('timeout', function(){
                return next();
            });

            dnsReq.on('message', function(err, answer) {
                if (err) {
                    logger.info("query %j failed with reason: %s", request, err);
                    return next();
                }
                success = true;
                var endTime = process.hrtime();
                profile.time = timeDiff(endTime, startTime);
                if (answer.answer.length > 0) {
                    profile.ttl = answer.answer[0].ttl;
                }
                profile.answers = answer.answer.length;
                if (payload.regexp && payload.regexp.length > 0) {
                    var regexMatch = false;
                    var regex = new RegExp(payload.regexp);
                    answer.answer.forEach(function(resp) {
                        var respText = toString(payload.type, resp);
                        if (regex.test(respText)) {
                            regexMatch = true;
                        }
                    });
                    if (!(regexMatch)) {
                        profile.error = 'Regular Expression not matched for any answer.';
                    };
                }
                return next();
            });
            dnsReq.send()
        });
    }, function(err) {
        if (!success) {
            profile.error = "All target servers failed to respond";
        }
        respond(profile, service, config, callback);
    });
}

function respond(metrics, service, config, callback) {
    var payload = [
        {
            name: util.format(
                "litmus.%s.%s.dns.time",
                service.endpoint_slug,
                config.collector.slug
            ),
            org_id: service.org_id,
            collector: config.collector.slug,
            metric: "litmus.dns.time",
            interval: service.frequency,
            unit: "ms",
            target_type: "gauge",
            value: Math.round(metrics.time * 100) / 100,
            time: metrics.startTime,
            endpoint_id: service.endpoint_id,
            monitor_id: service.id
        },
        {
            name: util.format(
                "litmus.%s.%s.dns.default",
                service.endpoint_slug,
                config.collector.slug
            ),
            org_id: service.org_id,
            collector: config.collector.slug,
            metric: "litmus.dns.default",
            interval: service.frequency,
            unit: "ms",
            target_type: "gauge",
            value: Math.round(metrics.time * 100) / 100,
            time: metrics.startTime,
            endpoint_id: service.endpoint_id,
            monitor_id: service.id
        },
        {
            name: util.format(
                "litmus.%s.%s.dns.ttl",
                service.endpoint_slug,
                config.collector.slug
            ),
            org_id: service.org_id,
            collector: config.collector.slug,
            metric: "litmus.dns.ttl",
            interval: service.frequency,
            unit: "s",
            target_type: "gauge",
            value: metrics.ttl,
            time: metrics.startTime,
            endpoint_id: service.endpoint_id,
            monitor_id: service.id
        },
        {
            name: util.format(
                "litmus.%s.%s.dns.answers",
                service.endpoint_slug,
                config.collector.slug
            ),
            org_id: service.org_id,
            collector: config.collector.slug,
            metric: "litmus.dns.answers",
            interval: service.frequency,
            unit: "count",
            target_type: "gauge",
            value: metrics.answers,
            time: metrics.startTime,
            endpoint_id: service.endpoint_id,
            monitor_id: service.id
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
