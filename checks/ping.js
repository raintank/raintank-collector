'use strict';
var ping = require('net-ping');
var dns = require('dns');
var async = require('async');

var COUNT = 5;
var sessionID = 1;

exports.execute = function(payload, callback) {
	var sid = sessionID++;
	if (sessionID > 65000) {
		sessionID = 1;
	}
	var session = ping.createSession ({retries: 0, sessionId: sid});
	var complete = false;
	session.on("close", function() {
		if (! complete) {
			console.log("PING session-%s closed early. recreating it.", sid);
			session = ping.createSession({retries: 0, sessionId: sid});
		}
	});
	var results = [];
	var profile = {
		dns: null,
		loss: null,
		min: null,
		max: null,
		avg: null,
		mean: null,
		mdev: null,
	};
	var startTime = new Date();
    profile.startTime = startTime.getTime()/1000;
    var step = startTime;
	dns.lookup(payload.hostname, 4, function(err, address, family) {
        if (err) {
            console.log(err);
            profile.error = "dns lookup failure.";
            respond(profile, callback);
            return;
        }
        var dnsTime = new Date();
        profile.dns = dnsTime.getTime() - step.getTime();
        var pings = [];
		for (var i = 0; i < COUNT; i++) {
			pings.push(function(cb) {
			    session.pingHost(address, function (error, target, sent, rcvd) {
			        if (! error) {
			            cb(null, {ms: (rcvd - sent)}); 
			        } else {
			        	cb(null, {error: error});
			        }
			    });
		    });
		}
		async.parallel(pings, function(error, results) {
			complete = true;
			
			session.close();
			if (error) {
				console.log("error received when performing pings.");
				console.log(error);
				complete = true;
			 	res.json(500, error);
			 	return;
			}
			var failCount = 0;
			var totalCount = results.length;
			var tsum = 0;
			var tsum2 = 0;
			var min = null;
			var max = null;
			var successfulResults = [];
			results.forEach(function(result) {
				if ('ms' in result) {
					if (max == null || result.ms > max) {
						max = result.ms;
					}
					if (min == null || result.ms < min) {
						min = result.ms;
					}
					tsum += result.ms;
					tsum2 += (result.ms * result.ms);
					successfulResults.push(result.ms);
				} else {
					failCount++;
				}
			});
			profile.min = min;
			profile.max = max;
			var successCount = totalCount - failCount;
			if (successCount > 0) {
				profile.avg = tsum/successCount;
				profile.mdev = Math.sqrt((tsum2/successCount) - ((tsum/successCount) *(tsum/successCount)));
			}
			if (successfulResults.length > 0) {
				successfulResults.sort();
				profile.mean = successfulResults[Math.floor(successfulResults.length/2)];
			}
			if (failCount == 0) {
				profile.loss = 0;
			} else {
				profile.loss = 100 * (failCount/totalCount);
			}
			respond(profile, callback);
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
    ['dns','min','max','avg','mean', 'mdev'].forEach(function(m) {
        if (!isNaN(metrics[m]) && metrics[m] > 0 ) {
            metrics[m] = metrics[m] = Math.round(metrics[m] * 100) / 100;
        }
        payload[0].dsnames.push(m);
        payload[0].values.push(metrics[m]);
        payload[0].time = metrics.startTime;
    });
    callback(null, {success: true, results: payload});
}

