'use strict';
var ping = require('net-ping');
var dns = require('dns');
var async = require('async');

var COUNT = 5;
/*
var params = ['hostname'];
*/
exports.run = function(req, res) {
	var session = ping.createSession ();
	var results = [];
	var profile = {
		dns: null,
		loss: null,
		min: null,
		max: null,
		avg: null,
		mdev: null
	};
	var startTime = new Date();
    profile.startTime = startTime.getTime()/1000;
    var step = startTime;
	dns.lookup(req.body.hostname, 4, function(err, address, family) {
        if (err) {
            console.log(err);
            profile.error = "dns lookup failure.";
            return respond(res, profile);
        }
        var dnsTime = new Date();
        profile.dns = dnsTime.getTime() - step.getTime();
        var pings = [];
		for (var i = 0; i < COUNT; i++) {
			pings.push(function(cb) {
			    session.pingHost (address, function (error, target, sent, rcvd) {
			        if (! error) {
			            cb(null, {ms: (rcvd - sent)}); 
			        } else {
			        	cb(null, {error: error});
			        }
			    });
		    });
		}
		async.series(pings, function(error, results) {
			session.close();
			if (error) return res.json(500, error);
			var failCount = 0;
			var totalCount = results.length;
			var tsum = 0;
			var tsum2 = 0;
			var min = null;
			var max = null;
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
			if (failCount == 0) {
				profile.loss = 0;
			} else {
				profile.loss = 100 * (failCount/totalCount);
			}
			respond(res, profile);
		});
	});
}

function respond(res, metrics) {
    var payload = [{
        plugin: "ping",
        type: "response",
        dsnames: [],
        dstypes: [],
        values: [],
    }];
    var valid_metrics = ['dns','loss','min','max','avg', 'mdev'];
    valid_metrics.forEach(function(m) {
        if (!isNaN(metrics[m]) && metrics[m] > 0 ) {
            metrics[m] = metrics[m];
        }
        payload[0].dsnames.push(m);
        payload[0].dstypes.push('gauge');
        payload[0].values.push(metrics[m]);
        payload[0].time = metrics.startTime;
    });
    res.json({success: true, results: payload});
}

