'use strict';
var dns = require('dns');
var spawn = require('child_process').spawn;

var COUNT = 5;

exports.execute = function(payload, callback) {
	var profile = {
		loss: null,
		min: null,
		max: null,
		avg: null,
		mean: null,
		mdev: null,
	};
	dns.lookup(payload.hostname, 4, function(err, address, family) {
        if (err) {
            console.log(err);
            profile.error = "dns lookup failure.";
            respond(profile, callback);
            return;
        }
        var child = spawn("fping", ["-C", ""+COUNT, "-q", address ]);
        var output = '';
        child.stderr.on('data', function(data) {
        	output += data;
        });
        child.on("close", function(code) {
        	output = output.trim();
        	//207.99.5.164 : 698.83 445.50 718.78 466.50 -
        	var results = output.split(' ').slice(2);
			var failCount = 0;
			var totalCount = results.length;
			var tsum = 0;
			var tsum2 = 0;
			var min = null;
			var max = null;
			var successfulResults = [];
			results.forEach(function(result) {
				if (isNaN(result)) {
					failCount++;
				} else {
					result = parseFloat(result);
					if (max == null || result > max) {
						max = result;
					}
					if (min == null || result < min) {
						min = result;
					}
					tsum += result;
					tsum2 += (result * result);
					successfulResults.push(result);
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
    ['min','max','avg','mean', 'mdev'].forEach(function(m) {
        if (!isNaN(metrics[m]) && metrics[m] > 0 ) {
            metrics[m] = metrics[m] = Math.round(metrics[m] * 100) / 100;
        }
        payload[0].dsnames.push(m);
        payload[0].values.push(metrics[m]);
        payload[0].time = metrics.startTime;
    });
    callback(null, {success: true, results: payload});
}

