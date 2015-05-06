'use strict;'
var config = require('./config').config;
var util = require('util');
var checks = require('./checks');
var zlib = require('zlib');
var ApiClient = require("./raintank-api-client");
var querystring = require("querystring");
var log4js = require('log4js');
var logger = log4js.getLogger('PID:'+process.pid);
var io = require('socket.io-client')

var serviceCache = {};
var socket;
var metricCount = 0;
var BUFFER = [];
var ready = false;
var monitorTypes = {};
var apiClient = new ApiClient({url: config.serverUrl, apiKey: config.apiKey});

var init = function() {

    apiClient.get('monitor_types', function(err, res) {
        if (err) {
            logger.fatal("failed to get monitor_types. ", err);
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
    socket = io(util.format("%s?&apiKey=%s&name=%s", config.serverUrl, querystring.escape(config.apiKey), querystring.escape(config.collector.name)), {transports: ["websocket"], secure: secure, forceNew: true});

    socket.on('connect', function(){
        logger.info('connected to socket.io server');
    });

    socket.on("ready", function(collector) {
        config.collector = collector;
        ready = true;
    });

    socket.on('authFailed', function(reason) {
        logger.error("connection to controller failed.-", reason);
        if (reason == "Collector not found") {
            logger.info("creating new collector.");
            var params = {
                name: config.collector.name,
                enabled: true
            };
            apiClient.put('collectors', params, function(err, res) {
                socket.disconnect();
                return process.exit(1);
            })   
        } else {
            socket.disconnect();
            return process.exit(1);
        }
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
        logger.error("serviceManager connection error. ", err);
    });

    socket.on('disconnect', function(){
        ready = false;
        logger.info("disconnected from socket.io server.");
    });
    setInterval(function() {
        logger.debug("Processing %s metrics/second %s checks", metricCount/10, Object.keys(serviceCache).length);
        metricCount = 0;
    }, 10000);

    setInterval(function() {
        if (!ready) {
            return;
        }
        if (BUFFER.length == 0) {
            return;
        }
        var payload = BUFFER;
        BUFFER = [];
        metricCount = metricCount + payload.length;
        compress(payload, function(err, buffer) {
            if (err) {
                logger.error("Error compressing payload.", err);
                return;
            }
            socket.emit('results', buffer);
        });
    }, 1000);
}

exports.init = init;

function serviceUpdate(service) {
    service.updated = new Date(service.updated);

    currentService = serviceCache[service.id] || service;
    console.log("got serviceUpdate message for service: %s", service.id);
    if (service.updated >= currentService.updated) {
        service.reschedule = false;
        service.localState = currentService.state;

        if (!('timer' in currentService)) {
            logger.debug("scheduling new service", process.pid);
            service.timer = setInterval(function() { run(service.id);}, service.frequency*1000);
        } else {
            service.timer = currentService.timer;
        }

        if (service.offset != currentService.offset) {
            service.reschedule = true;
        } else if (service.frequency != currentService.frequency) {
            service.reschedule = true;
        }
        serviceCache[service.id] = service;
    } else {
        logger.error("Service to update is newer then what was provided." );
        logger.error("%s\n%s", service.updated, currentService.updated);
    }
}

function serviceRefresh(payload) {
    logger.debug("refreshing checks: check count: %s", payload.length);
    var seen = {};
    payload.forEach(function(service) {
        service.updated = new Date(service.updated);
        if (!(service.id in serviceCache) || service.updated >= serviceCache[service.id].updated) {
            service.reschedule = false;
            newService = false;
            if (!(service.id in serviceCache)) {
                newService = true;
            } else {
                service.localState = serviceCache[service.id].localState;
                service.timer = serviceCache[service.id].timer;
                if ((service.offset != serviceCache[service.id].offset) || (service.frequency != serviceCache[service.id].frequency)) {
                    service.reschedule = true;
                }
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
            _checkDelete(id);
        }
    });
}

function _checkDelete(id) {
    logger.debug("removing check %s from run queue", id);
    if ('timer' in serviceCache[id]) {
        clearInterval(serviceCache[id].timer);
    }
    delete serviceCache[id];
}

function serviceDelete(service) {
    if (service.id in serviceCache) {
        _checkDelete(service.id);
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
    var type = monitorTypes[service.monitor_type_id].name.toLowerCase();
    if (type in checks) {
        var settings = {};
        service.settings.forEach(function(setting) {
            settings[setting.variable] = setting.value;
        });
        if (!("timeout" in settings)) {
            settings["timeout"] = 10;
        }
        checks[type].execute(settings, function(err, response) {
            if  (response.success) {
                var events = [];
                var metrics = response.results;
                //console.log(metrics);
                if (metrics) {
                    metrics.forEach(function(metric) {
                        metric.collector = config.collector.id;
                        metric.interval = service.frequency;
                        var pos = 0;
                        metric.dsnames.forEach(function(dsname) {
                            if (metric.values[pos] === null || isNaN(metric.values[pos])) {
                                return;
                            }
                            metric_name = util.format("network.%s.%s", type, dsname);
                            BUFFER.push({
                                name: util.format(
                                    "%s.%s.%s",
                                    service.namespace,
                                    config.collector.slug,
                                    metric_name
                                ),
                                org_id: service.org_id,
                                collector: config.collector.slug,
                                metric: metric_name,
                                interval: service.frequency,
                                unit: metric.unit,
                                target_type: metric.target_type,
                                value: metric.values[pos],
                                time: timestamp/1000,
                                endpoint_id: service.endpoint_id,
                                monitor_id: service.id,
                            });
                            pos++;
                        });
                    });
                }
                var serviceState = 0;
                if (response.error ) {
                    logger.debug("error in check %s. sending event.", service.id)
                    serviceState = 2;
                    var eventPayload = {
                        source: "network_collector",
                        event_type: "monitor_state",
                        org_id: service.org_id,
                        endpoint_id: service.endpoint_id,
                        collector: config.collector.slug,
                        collector_id: config.collector.id,
                        monitor_id: service.id,
                        severity: 'ERROR',
                        message: response.error,
                        timestamp: timestamp
                    };
                    //console.log(eventPayload);
                    compress(eventPayload, function(err, buffer) {
                        if (err) {
                            logger.error("Error compressing payload.", err);
                            return;
                        }
                        socket.emit('event', buffer);
                    });
                    
                }
                
                if (serviceState === 0 && service.localState !== 0) {
                    logger.debug("check %s state transitioned from %s to %s", service.id, service.localState, serviceState);
                    var eventPayload = {
                        source: "network_collector",
                        event_type: "monitor_state",
                        org_id: service.org_id,
                        endpoint_id: service.endpoint_id,
                        collector: config.collector.slug,
                        collector_id: config.collector.id,
                        monitor_id: service.id,
                        severity: 'OK',
                        message: "Monitor now OK.",
                        timestamp: timestamp
                    };
                    //console.log(eventPayload);
                    compress(eventPayload, function(err, buffer) {
                        if (err) {
                            logger.error("Error compressing payload.", err);
                            return;
                        }
                        socket.emit('event', buffer);
                    });
                }
                service.localState = serviceState;
                var states = ["ok", "warn", 'error'];
                for (var state=0; state < states.length; state++) {
                    var metricName = util.format("network.%s.%s_state", type, states[state]);
                    var active = 0;
                    if (state == serviceState) {
                        active = 1;
                    }
                    BUFFER.push({
                        name: util.format("%s.%s.%s", service.namespace, config.collector.slug, metricName),
                        org_id: service.org_id,
                        collector: config.collector.slug,
                        metric: metricName,
                        interval: service.frequency,
                        unit: "state",
                        target_type: "gauge",
                        value: active,
                        time: timestamp/1000,
                        endpoint_id: service.endpoint_id,
                        monitor_id: service.id,
                    });
                }
                
            }
        });
    }
}

function compress(payload, cb) {
    /*var data = new Buffer(JSON.stringify(payload));
    zlib.deflate(data, cb);
    */
    cb(null, payload);
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
