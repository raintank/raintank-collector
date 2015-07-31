'use strict';
var dns = require('dns');
var http = require('http');
var config = require('../config').config;
var util = require('util');
http.globalAgent.maxSockets = 1000;

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

	dns.lookup(payload.hostname, 4, function(err, address, family) {
        if (err) {
            console.log(err);
            profile.error = "dns lookup failure.";
            respond(profile, service, config, callback);
            return;
        }
        http.get({
        	host: 'localhost',
        	port: config.pingServerPort,
        	path:  '/'+address,
        }, function(response) {
        	var body = '';
	        response.on('data', function(d) {
	            body += d;
	        });
	        response.on('end', function() {
	            // Data reception is done, do whatever with it!
	            var parsed;
	            try {
	            	parsed = JSON.parse(body);
	            	profile = parsed;
	            } catch (ex) {
	            	parsed = profile;
	            }
                profile.startTime = timestamp;
	            respond(profile, service, config, callback);
	        });
        }).on('error', function(e) {
		  console.log("Got error: " + e.message);
		  profile.error = e.message
		  respond(profile, service, config, callback);
		  return;
		});
	});
}

function respond(metrics, service, config, callback) {

    var payload = [];
    ['min','max','avg','mean', 'mdev'].forEach(function(m) {
        if (!isNaN(metrics[m]) && metrics[m] > 0 ) {
            metrics[m] = metrics[m] = Math.round(metrics[m] * 100) / 100;
        }
        payload.push({
            name: util.format(
                "litmus.%s.%s.ping.%s",
                service.endpoint_slug,
                config.collector.slug,
                m
            ),
            org_id: service.org_id,
            collector: config.collector.slug,
            metric: util.format("litmus.ping.%s", m),
            interval: service.frequency,
            unit: "ms",
            target_type: "gauge",
            value: metrics[m],
            time: metrics.startTime,
            endpoint_id: service.endpoint_id,
            monitor_id: service.id
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
        collector: config.collector.slug,
        metric: util.format("litmus.ping.%s", "default"),
        interval: service.frequency,
        unit: "ms",
        target_type: "gauge",
        value: metrics["mean"],
        time: metrics.startTime,
        endpoint_id: service.endpoint_id,
        monitor_id: service.id
    });
    payload.push({
        name: util.format(
            "litmus.%s.%s.ping.%s",
            service.endpoint_slug,
            config.collector.slug,
            "loss"
        ),
        org_id: service.org_id,
        collector: config.collector.slug,
        metric: util.format("litmus.ping.%s", "loss"),
        interval: service.frequency,
        unit: "%",
        target_type: "gauge",
        value: metrics["loss"],
        time: metrics.startTime,
        endpoint_id: service.endpoint_id,
        monitor_id: service.id
    });

    callback(null, {success: true, results: payload, error: metrics.error});
}

