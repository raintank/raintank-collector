'use strict';
var log4js = require('log4js');
var logger = log4js.getLogger('PID:'+process.pid);
var Sitespeed = require('sitespeed.io/lib/sitespeed');
var GraphiteCollector  = require("sitespeed.io/lib/graphite/graphiteCollector");
var lodash = require('lodash');
var util = require('util');

var staticConfig = {
    html: false,
    resultBaseDir: "/tmp/sitespeed",
    graphiteNamespace: "rt-sitespeed",
    browser: "chrome",
    graphiteData: "all"  //  summary,rules,pagemetrics,timings,requests"
};

var defaultConfig = {
    connection: "native",
    no: 1,
    deep: 0,
    noYslow: true,
};

var navigationTimingNames = ['navigationStart',
  'unloadEventStart',
  'unloadEventEnd',
  'redirectStart',
  'redirectEnd',
  'fetchStart',
  'domainLookupStart',
  'domainLookupEnd',
  'connectStart',
  'connectEnd',
  'secureConnectionStart',
  'requestStart',
  'responseStart',
  'responseEnd',
  'domLoading',
  'domInteractive',
  'domContentLoadedEventStart',
  'domContentLoadedEventEnd',
  'domComplete',
  'loadEventStart',
  'loadEventEnd'
];

function StatsCollector(sp_config, rt_service, rt_config, timestamp, result) {
    this.sp_config = sp_config;
    this.org_id = rt_service.org_id;
    this.endpoint_id = rt_service.endpoint_id;
    this.endpoint_slug = rt_service.endpoint_slug;
    this.monitor_id = rt.service.id;
    this.collector_id = rt_config.collector.id;
    this.collector_slug = rt_config.collector.slug;
    this.timestamp = timestamp;
    this.result = result;
    this.interval = rt_service.frequency;
}

exports.execute = function(payload, rt_service, rt_config, timestamp, callback) {
    var sp_config = lodash.clone(staticConfig);
    lodash.defaults(sp_config, payload, defaultConfig);
    sp_config.graphiteNamespace = util.format("rt-sitespeed.%s.%s", rt_service.slug, rt_config.collector.slug);
    var sp = new Sitespeed();

    sp.run(sp_config, function(err, result) {
        if (err) {
            return respond([], err.toString(), callback)
        }
        var statsCollector = new StatsCollector(sp.config, rt_service, rt_config, timestamp, result);
        var aggregates = result.result.aggregates;
        var pages = result.result.pages;
        var domains = result.result.domains;
        var stats = statsCollector.collect();
        console.log(stats);
        respond(stats, null, callback);
    });
};

function respond(payload, error, callback) {
    callback(null, {success: true, results: payload, error: error});
}

StatsCollector.prototype.collect = function() {
    var aggregates = result.result.aggregates;
    var pages = result.result.pages;
    var domains = result.result.domains;
}

StatsCollector.prototype.summaryStats = function() { 
	var payload = [];
    var self = this;
	self.result.aggregates.forEach(function(agg) {
        var metrics = ["mean"];
        var aggregatedmetrics = false;
        if (agg.stats.min != agg.stats.sum) {
            //this stat is an aggregation, so lets grab all of the computed values.
            metrics = ['min', 'p10', 'median', 'mean', 'p90', 'p99', 'max', 'sum'];
            aggregatedmetrics = true;
        }
        metrics.foreach(function(metric) {
            var measurement = "summary." + agg.title;
            if (navigationTimingNames.indexOf(agg.id) > -1) {
                measurement = "summary.navigationtiming." + agg.title;
            }
            if (aggregatedmetrics) {
                measurement = measurement + "." + metric;
            }
            payload.push({
                name: util.format(
                    "%s.%s",
                    self.sp_config.graphiteNamespace,
                    measurement
                ),
                org_id: self.org_id,
                collector: self.collector_slug,
                metric: util.format("rt-sitespeed.%s", measurement),
                interval: self.interval,
                unit: agg.unit,
                target_type: "gauge",
                value: agg.stats[metric],
                time: self.timestamp,
                endpoint_id: self.endpoint_id,
                monitor_id: self.monitor_id,
                hostname: self.sp_config.urlObject.hostname
            });
        });
	});

    
}

function getStats(config, aggregates, pages, domains) {
    metrics = [];
    aggregates.forEach(function(agg) {
        metrics.push({
            name: util.format("sitespeed.")
        })
    })
}