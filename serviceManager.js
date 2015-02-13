'use strict;'
var config = require('./config').cnf();
var util = require('util');
var checks = require('./checks');
var zlib = require('zlib');
var ApiClient = require("./raintank-api-client");

var io = require('socket.io-client')
serviceCache = {};
var socket;
var metricCount = 0;
var BUFFER = [];

var monitorTypes = {};
var apiClient = new ApiClient({
    host: config.api.host,
    port: config.api.port,
    base: config.api.path,
    proto: config.api.protocol || "http",
});
apiClient.setToken(config.token);


var init = function() {

	apiClient.get('monitor_types', function(err, res) {
		if (err) {
			console.log("failed to get monitor_types");
			console.log(err);
			return process.exit(1);
		}
		res.data.forEach(function(type) {
			monitorTypes[type.id] = type;
		});
	});
	var secure = false;
	if (config.serverUrl.indexOf('https://') == 0) {
		secure = true;
	}
	socket = io(util.format("%s?token=%s", config.serverUrl, config.token), {transports: ["websocket"], secure: secure});

	socket.on('connect', function(){
	    console.log('connected');
	    socket.emit('register', config.location);
	});

	socket.on('refresh', function(data){
	    serviceRefresh(data);
	});

	socket.on('updated', function(data) {
		serviceUpdate(data);
	});

	socket.on('created', function(data) {
                serviceUpdate(data);
        });

	socket.on('removed', function(data) {
		serviceDelete(data);
	});

	socket.on('connect_error', function(err) {
		console.log("serviceManager connection error");
		console.log(err);
	});

	socket.on('disconnect', function(){
	    console.log("serviceManager disconnected");
	});
	setInterval(function() {
	    console.log("Processing %s metrics/second %s checks", metricCount/10, Object.keys(serviceCache).length);
	    metricCount = 0;
	}, 10000);

	setInterval(function() {
		var payload = BUFFER;
		BUFFER = [];
		metricCount = metricCount + payload.length;
        compress(payload, function(err, buffer) {
        	if (err) {
        		console.log("Error compressing payload.");
        		console.log(err);
        		return;
        	}
        	socket.emit('results', buffer);
        });
	}, 100);
}

exports.init = init;

function serviceUpdate(payload) {
	var service = JSON.parse(payload);
	if (!("updated" in service)) {
		service.updated = new Date(service.timestamp);
	} else {
		service.updated = new Date(service.updated);
	}
	currentService = serviceCache[service.id] || service;
	console.log("got serviceUpdate message for service: %s", service.id);
	if (service.updated >= currentService.updated) {
		service.reschedule = false;
		if (!('timer' in currentService)) {
			console.log("%s scheduling new service", process.pid);
			service.timer = setInterval(function() { run(service.id);}, service.frequency*1000);
		} else if (service.offset != currentService.offset) {
			service.reschedule = true;
		} else if (service.frequency != currentService.frequency) {
			service.reschedule = true;
		}
		serviceCache[service.id] = service;
	}
}

function serviceRefresh(payload) {
	config.location = payload.location;
	console.log("PID%s: refreshing service list: count: %s", process.pid, payload.services.length);
	var seen = {};
	payload.services.forEach(function(service) {
		service.updated = new Date(service.updated);
		if (!(service.id in serviceCache) || service.updated >= serviceCache[service.id].updated) {
			service.reschedule = false;
			newService = false;
			if (!(service.id in serviceCache)) {
				newService = true;
			} else if (service.offset != serviceCache[service.id].offset) {
				service.reschedule = true;
			} else if (service.frequency != serviceCache[service.id].frequency) {
				service.reschedule = true;
			}
			serviceCache[service.id] = service;
			if (newService) {
				reschedule(service.id);
			}
		}
		seen[service.id] = true;
	});
	Object.keys(serviceCache).forEach(function(id) {
		if (!(id in seen)) {
			clearInterval(serviceCache[id].timer);
			delete serviceCache[id];
		}
	});
}

function serviceDelete(payload) {
	var service = JSON.parse(payload);
	if (service.id in serviceCache) {
		console.log("removing monitor %s", service.id);
		if ('timer' in serviceCache[service.id]) {
			clearInterval(serviceCache[service.id].timer);
		}
		delete serviceCache[service.id];
	}
}

function run(serviceId) {
	var service = serviceCache[serviceId];
	if (!service) {
		return;
	}
	if (service.reschedule) {
		reschedule(serviceId);
	}
	var timestamp = new Date().getTime();
	var check = monitorTypes[service.monitor_type_id].name.toLowerCase();
	if (check in checks) {
		var settings = {};
		service.settings.forEach(function(setting) {
			settings[setting.variable] = setting.value;
		});
		checks[check].execute(settings, function(err, response) {
			if  (response.success) {
				var events = [];
				var metrics = response.results;
				//console.log(metrics);
	            if (metrics) {
	                metrics.forEach(function(metric) {
	                    metric.location = config.location.id;
	                    metric.interval = service.frequency;
	                    var pos = 0;
	                    metric.dsnames.forEach(function(dsname) {
	                        BUFFER.push({
	                            name: util.format(
	                                "raintank.service.%s.%s.%s.%s",
	                                service.slug,
	                                config.location.slug,
	                                metric.plugin,
	                                dsname
	                            ),
	                            account: service.account_id,
	                            interval: service.frequency,
	                            units: metric.unit,
	                            target_type: metric.target_type,
	                            value: metric.values[pos],
	                            time: timestamp/1000,
	                            parent: {
	                                class: 'service',
	                                id: service.id,
	                            }
	                        });
	                        pos++;
	                    });
	                });
	            }
	            if (response.error ) {
	            	console.log("error in check. sending event.")
	            	var eventPayload = {
	                    account: service.account_id,
	                    service: service.id,
	                    level: 'critical',
	                    details: config.location.name + " collector failed: "+response.error,
	                    timestamp: timestamp
	                };
	                //console.log(eventPayload);
	                compress(eventPayload, function(err, buffer) {
	                	if (err) {
		            		console.log("Error compressing payload.");
		            		console.log(err);
		            		return;
		            	}
	                	socket.emit('serviceEvent', buffer);
	                });
	                
	            }
	            var serviceState = 0;
	            if (events.length > 0) {
	            	serviceState = 2;
	            }
	            var metricName = util.format("raintank.service.%s.%s.%s.collector.state",
	            					service.slug, config.location.slug, check);
	            BUFFER.push({
	                name: metricName,
	                account: service.account_id,
	                interval: service.frequency,
	                units: "state",
	                target_type: "gauge",
	                value: serviceState,
	                time: timestamp/1000,
	                parent: {
	                    class: 'service',
	                    id: service.id,
	                }
	            });
	        }
		});
	}
}

function compress(payload, cb) {
	var data = new Buffer(JSON.stringify(payload));
	zlib.deflate(data, cb);
}

function reschedule(serviceId) {
	var service = serviceCache[serviceId];
	service.reschedule = false;
	var now = new Date().getTime();
    var seconds = Math.floor(now / 1000);
    clearInterval(service.timer);

    var wait = ((service.frequency + service.offset) - (seconds % service.frequency)) % service.frequency;
    if (wait == 0) {
    	service.timer = setInterval(function() { run(service.id);}, service.frequency*1000);
    } else {
    	setTimeout(function() {
    		service.timer = setInterval(function() {run(service.id);}, service.frequency * 1000);
    	}, wait * 1000);
    }
}
