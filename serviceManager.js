'use strict;'
var config = require('./config').config;
var util = require('util');
var checks = require('./checks');
var zlib = require('zlib');
var querystring = require("querystring");
var log4js = require('log4js');
var logger = log4js.getLogger('PID:'+process.pid);
var io = require('socket.io-client')
var pjson = require('./package.json');


var serviceCache = {};
var socket;
var metricCount = 0;
var eventCount = 0;
var BUFFER = [];
var ready = false;
var monitorTypes = {};
var serverSocketId;

var init = function() {
    var secure = false;
    if (config.serverUrl.indexOf('https://') == 0) {
        secure = true;
    }
    var queryParams = {
      "apiKey": config.apiKey,
      "name": config.collector.name,
      "version": pjson.version,
    }
    socket = io(util.format("%s?%s", config.serverUrl, querystring.stringify(queryParams)), {transports: ["websocket"], secure: secure, forceNew: true});

    socket.on('connect', function(){
        logger.info('connected to socket.io server');
    });

    socket.on("ready", function(resp) {
        logger.info("received ready event from controller");
        config.collector = resp.collector;
        logger.info("collector.enabled is: " + config.collector.enabled);
        resp.monitor_types.forEach(function(type) {
            monitorTypes[type.id] = type;
        });
        queryParams.lastSocketId = resp.socket_id;
        // update our sockett.io uri so that next time we connect, we pass the socketid we are using.
        // this will allow the controller to immediately delete the old session and not have to wait
        // for a timeout.
        socket.io.uri = util.format("%s?%s", config.serverUrl, querystring.stringify(queryParams));
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

    socket.on('disconnect', function(err){
        ready = false;
        logger.info("disconnected from socket.io server.", err);
    });

    setInterval(function() {
        if (config.collector.enabled) {
            logger.debug("Processing %s metrics/second, %s events/second from %s checks", metricCount/10, eventCount/10, Object.keys(serviceCache).length);
            metricCount = 0;
            eventCount = 0;
        }
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

    currentService = serviceCache[service.id];
    if (!currentService) {
      currentService = service;
      //send state metrics to so graphite knows this check exists.
      var states = ["ok", "warn", 'error'];
      // set the timestamp to be before now, but at the correct offset.
      var updated_ts = Math.floor(service.updated.getTime()/1000);
      var timestamp = (updated_ts - service.frequency
          - (updated_ts % service.frequency)
          + service.offset)
      var type = monitorTypes[service.monitor_type_id].name.toLowerCase();
      var tags = [
        util.format("endpoint_id:%d", service.endpoint_id),
        util.format("monitor_id:%d", service.id),
        util.format("collector:%s", config.collector.slug)
      ];

      for (var state=0; state < states.length; state++) {
          var metricName = util.format("%s.%s_state", type, states[state]);
          var active = null;
          logger.debug("initializing metric: ", metricName);
          BUFFER.push({
              name: util.format("litmus.%s.%s.%s", service.endpoint_slug, config.collector.slug, metricName),
              org_id: service.org_id,
              metric: util.format("litmus.%s", metricName),
              interval: service.frequency,
              unit: "state",
              target_type: "gauge",
              value: null,
              time: timestamp,
              tags: tags
          });
      }
    }
    logger.info("got serviceUpdate message for service: %s", service.id);
    //logger.debug(service);
    if (service.updated >= currentService.updated) {
        if (!service.enabled) {
            if (currentService) {
                _checkDelete(service.id);
            }
            return;
        }
        service.localState = currentService.state;

        if ('timer' in currentService) {
            service.timer = currentService.timer;
        } else {
            logger.debug("scheduling new service", service.id);
        }

        serviceCache[service.id] = service;
        runNext(service.id);
    } else {
        logger.error("Service to update is newer then what was provided. %s : %s", service.updated, currentService.updated);
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
      logger.warn("check delay is " + delay + "ms. Skipping check");
      runNext(serviceId);
      return;
    } else if (delay > 30) {
      logger.info("check delay is "+ delay + "ms");
    }
    //logger.debug(util.format("running check %d now.", serviceId));
    var service = serviceCache[serviceId];
    if (!service) {
        return;
    }
    var timestamp = Math.floor(mstimestamp/1000);
    //schedule next run of check..
    runNext(service.id);
    if (!config.collector.enabled) {
      // collector is disabled.
      return;
    }

    var type = monitorTypes[service.monitor_type_id].name.toLowerCase();
    if (type in checks) {
        var settings = {};
        service.settings.forEach(function(setting) {
            settings[setting.variable] = setting.value;
        });
        if (!("timeout" in settings)) {
            settings["timeout"] = 10;
        }
        checks[type].execute(settings, service, config, timestamp, function(err, response) {
            if  (response.success) {
                var events = [];
                var metrics = response.results;
                //console.log(metrics);
                if (metrics) {
                    metrics.forEach(function(m){
                        BUFFER.push(m);
                    });
                }
                var serviceState = 0;
                if (response.error ) {
                    //logger.debug("error in check %s. sending event.", service.id)
                    serviceState = 2;
                    var eventPayload = {
                        source: "network_collector",
                        event_type: "monitor_state",
                        org_id: service.org_id,
                        severity: 'ERROR',
                        message: response.error,
                        timestamp: timestamp * 1000,
                        tags: [
                            util.format("endpoint_id:%d", service.endpoint_id),
                            util.format("endpoint:%s", service.endpoint_slug),
                            util.format("monitor_id:%d", service.id),
                            util.format("collector_id:%d", config.collector.id),
                            util.format("collector:%s", config.collector.slug),
                            util.format("monitor_type:%s", type)
                        ]
                    };
                    //console.log(eventPayload);
                    compress(eventPayload, function(err, buffer) {
                        if (err) {
                            logger.error("Error compressing payload.", err);
                            return;
                        }
                        eventCount++;
                        socket.emit('event', buffer);
                    });

                }

                if (serviceState === 0 && service.localState !== 0) {
                    //logger.debug("check %s state transitioned from %s to %s", service.id, service.localState, serviceState);
                    var eventPayload = {
                        source: "network_collector",
                        event_type: "monitor_state",
                        org_id: service.org_id,
                        severity: 'OK',
                        message: "Monitor now OK.",
                        timestamp: timestamp * 1000,
                        tags: [
                            util.format("endpoint_id:%d", service.endpoint_id),
                            util.format("endpoint:%s", service.endpoint_slug),
                            util.format("monitor_id:%d", service.id),
                            util.format("collector_id:%d", config.collector.id),
                            util.format("collector:%s", config.collector.slug),
                            util.format("monitor_type:%s", type)
                        ]
                    };
                    //console.log(eventPayload);
                    compress(eventPayload, function(err, buffer) {
                        if (err) {
                            logger.error("Error compressing payload.", err);
                            return;
                        }
                        eventCount++;
                        socket.emit('event', buffer);
                    });
                }
                service.localState = serviceState;
                var tags = [
                    util.format("endpoint_id:%d", service.endpoint_id),
                    util.format("monitor_id:%d", service.id),
                    util.format("collector:%s", config.collector.slug),
                ]
                var states = ["ok", "warn", 'error'];
                for (var state=0; state < states.length; state++) {
                    var metricName = util.format("%s.%s_state", type, states[state]);
                    var active = 0;
                    if (state == serviceState) {
                        active = 1;
                    }
                    BUFFER.push({
                        name: util.format("litmus.%s.%s.%s", service.endpoint_slug, config.collector.slug, metricName),
                        org_id: service.org_id,
                        metric: util.format("litmus.%s", metricName),
                        interval: service.frequency,
                        unit: "state",
                        target_type: "gauge",
                        value: active,
                        time: timestamp,
                        tags: tags
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
    if (wait <1) {
      wait = wait + (service.frequency * 1000);
    }
    wait += Math.random()*990;
    var next = wait + now;
    //logger.debug(util.format("running check %s again in %d ms", serviceId, wait));
    service.timer = setTimeout(function() {
        run(service.id, next);
    }, wait);
}

