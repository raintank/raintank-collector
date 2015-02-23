'use strict';
var dns = require('native-dns');
var basicDns = require('dns');
var util = require('util');

function timeDiff(t1, t2) {
    //convert to milliseconds.
    return ((t1[0] - t2[0]) * 1e3) + ((t1[1] - t2[1])/1e6);
}

exports.execute = function(payload, callback) {
    var question = dns.Question({
        name: payload.name,
        type: payload.type,
    });
    var profile = {
        time: null,
        ttl: null,
        answers: null,
    };
    var nsserver = null;
    basicDns.lookup(payload.server, 4, function(err, address, family) {
        if (err) {
            profile.error = "Could not resolve IP of server.";
            return respond(profile, callback);
        }
        var server = {
            address: address,
            port: parseInt(payload.port),
            type: payload.protocol,
        };

        var startTime = process.hrtime();
        profile.startTime = new Date().getTime()/1000;
        var step = startTime;
        var dnsReq = dns.Request({question: question, server: server, timeout: (payload.timeout * 1000), cache: false});
        
        dnsReq.on('timeout', function(){
            profile.error = "timed out after " + payload.timeout + " seconds.";
            respond(profile, callback);
        });

        dnsReq.on('message', function(err, answer) {
            if (err) {
                console.log(err);
                profile.error = "dns lookup failure.";
                return respond(profile, callback);
            }
            var dnsTime = process.hrtime();
            profile.time = timeDiff(dnsTime, step);
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
            respond(profile, callback);
        });
        dnsReq.send()
    });
}

function respond(metrics, callback) {
    var payload = [{
        plugin: "dns",
        unit: "ms",
        dsnames: ["time"],
        target_type: "gauge",
        values: [Math.round(metrics.time * 100) / 100],
        time: metrics.startTime,
    },
    {
        plugin: "dns",
        unit: "s",
        dsnames: ["ttl"],
        target_type: "gauge",
        values: [metrics.ttl],
        time: metrics.startTime,
    },
    {
        plugin: "dns",
        unit: "count",
        dsnames: ["answers"],
        target_type: "gauge",
        values: [metrics.answers],
        time: metrics.startTime,
    }];
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
