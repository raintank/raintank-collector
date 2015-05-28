'use strict';
var dns = require('dns');
var http = require('http');
var config = require('../config').config;

exports.execute = function(payload, callback) {
	var profile = {
		loss: null,
		min: null,
		max: null,
		avg: null,
		mean: null,
		mdev: null,
		error: null,
	};
	dns.lookup(payload.hostname, 4, function(err, address, family) {
        if (err) {
            console.log(err);
            profile.error = "dns lookup failure.";
            respond(profile, callback);
            return;
        }
        http.get({
        	host: 'localhost',
        	port: config.pingServerPort,
        	path:  '/'+address,
        	agent: false,
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
	            respond(profile, callback);
	        });
        }).on('error', function(e) {
		  console.log("Got error: " + e.message);
		  profile.error = e.message
		  respond(profile, callback);
		  return;
		});
	});
}

function respond(metrics, callback) {
    var payload = [{
        plugin: "ping",
        unit: "ms",
        dsnames: [],
        target_type: "gauge",
        values: [],
        time: metrics.startTime
    },
    {
        plugin: "ping",
        unit: "%",
        dsnames: ["loss"],
        target_type: "gauge",
        values: [metrics.loss],
        time: metrics.startTime
    }];
    ['min','max','avg','mean', 'mdev'].forEach(function(m) {
        if (!isNaN(metrics[m]) && metrics[m] > 0 ) {
            metrics[m] = metrics[m] = Math.round(metrics[m] * 100) / 100;
        }
        payload[0].dsnames.push(m);
        payload[0].values.push(metrics[m]);
        payload[0].time = metrics.startTime;
    });

    callback(null, {success: true, results: payload, error: metrics.error});
}

