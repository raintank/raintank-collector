'use strict;'
var config = require('./config').config;
var util = require('util');
var checks = require('./checks');
var zlib = require('zlib');
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

var init = function() {
    var secure = false;
    if (config.serverUrl.indexOf('https://') == 0) {
        secure = true;
    }
    socket = io(util.format("%s?&apiKey=%s&name=%s", config.serverUrl, querystring.escape(config.apiKey), querystring.escape(config.collector.name)), {transports: ["websocket"], secure: secure, forceNew: true});

    socket.on('connect', function(){
        logger.info('connected to socket.io server');
    });

    socket.on("ready", function(resp) {
        config.collector = resp.collector;
        resp.monitor_types.forEach(function(type) {
            monitorTypes[type.id] = type;
        });
        ready = true;
    });

    socket.on('error', function(reason) {
        logger.error("controller emitted an error - ", reason);
        socket.disconnect();
        return process.exit(1);
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
    logger.info("got serviceUpdate message for service: %s", service.id);
    logger.debug(service);
    if (service.updated >= currentService.updated) {
        service.localState = currentService.state;

        if ('timer' in currentService) {
            service.timer = currentService.timer;
        } else {
            logger.debug("scheduling new service", service.id);
        }

        serviceCache[service.id] = service;
        runNext(service.id);
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
            newService = false;
            if (service.id in serviceCache) {
                service.localState = serviceCache[service.id].localState;
                service.timer = serviceCache[service.id].timer;
            }
            serviceCache[service.id] = service;
            runNext(service.id);
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
        clearTimeout(serviceCache[id].timer);
    }
    delete serviceCache[id];
}

function serviceDelete(service) {
    if (service.id in serviceCache) {
        _checkDelete(service.id);
    }
}

function run(serviceId, mstimestamp) {
    var delay = new Date().getTime() - mstimestamp;
    if (delay > 100) {
      logger.error("check deley is " + delay + "ms");
    } else if (delay > 30) {
      logger.warn("check delay is "+ delay + "ms");
    }
    logger.debug(util.format("running check %d now.", serviceId));
    var service = serviceCache[serviceId];
    if (!service) {
        return;
    }
    var timestamp = Math.floor(mstimestamp/1000);
    //schedule next run of check..
    runNext(service.id);

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
                                    service.endpoint_slug,
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
                                time: timestamp,
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
			                  endpoint: service.endpoint_slug,
                        collector: config.collector.slug,
                        collector_id: config.collector.id,
                        monitor_id: service.id,
                        monitor_type: type,
                        severity: 'ERROR',
                        message: response.error,
                        timestamp: timestamp * 1000
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
			                  endpoint: service.endpoint_slug,
                        collector: config.collector.slug,
                        collector_id: config.collector.id,
                        monitor_id: service.id,
			                  monitor_type: type,
                        severity: 'OK',
                        message: "Monitor now OK.",
                        timestamp: timestamp * 1000
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
                        name: util.format("%s.%s.%s", service.endpoint_slug, config.collector.slug, metricName),
                        org_id: service.org_id,
                        collector: config.collector.slug,
                        metric: metricName,
                        interval: service.frequency,
                        unit: "state",
                        target_type: "gauge",
                        value: active,
                        time: timestamp,
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

function runNext(serviceId) {
    var service = serviceCache[serviceId];
    clearTimeout(service.timer);
    var now = new Date().getTime();

    var wait = (((service.frequency + service.offset) * 1000) - (now % (service.frequency * 1000))) % (service.frequency * 1000);
    var next = wait + now;
    logger.debug(util.format("running check %s again in %d ms", serviceId, wait));
    if (wait <= 1) {
        run(service.id, next);
    } else {
        service.timer = setTimeout(function() {
            run(service.id, next);
        }, wait);
    }
}
