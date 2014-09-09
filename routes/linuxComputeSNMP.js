'use strict';
var snmp = require('net-snmp');
var dns = require('dns');

var oidsMap = {
	//Load
	"1.3.6.1.4.1.2021.10.1.5.1": {plugin: "snmp", plugin_instance:"load", "type_instance": "1", type: "", dsnames:['value'], dstypes: ['gauge']},
	"1.3.6.1.4.1.2021.10.1.5.2": {plugin: "snmp", plugin_instance:"load", "type_instance": "5", type: "", dsnames:['value'], dstypes: ['gauge']},
	"1.3.6.1.4.1.2021.10.1.5.3": {plugin: "snmp", plugin_instance:"load", "type_instance": "15", type: "", dsnames:['value'], dstypes: ['gauge']},
	 
	 //CPU
	"1.3.6.1.4.1.2021.11.50.0": {plugin: "snmp", plugin_instance:"cpu", "type_instance": "user", type: "", dsnames:['value'], dstypes: ['derive']},
	"1.3.6.1.4.1.2021.11.51.0": {plugin: "snmp", plugin_instance:"cpu", "type_instance": "nice", type: "", dsnames:['value'], dstypes: ['derive']},
	"1.3.6.1.4.1.2021.11.52.0": {plugin: "snmp", plugin_instance:"cpu", "type_instance": "system", type: "", dsnames:['value'], dstypes: ['derive']},
	"1.3.6.1.4.1.2021.11.53.0": {plugin: "snmp", plugin_instance:"cpu", "type_instance": "idle", type: "", dsnames:['value'], dstypes: ['derive']},
	"1.3.6.1.4.1.2021.11.54.0": {plugin: "snmp", plugin_instance:"cpu", "type_instance": "wait", type: "", dsnames:['value'], dstypes: ['derive']},
	"1.3.6.1.4.1.2021.11.55.0": {plugin: "snmp", plugin_instance:"cpu", "type_instance": "kernel", type: "", dsnames:['value'], dstypes: ['derive']},
	"1.3.6.1.4.1.2021.11.56.0": {plugin: "snmp", plugin_instance:"cpu", "type_instance": "interrupt", type: "", dsnames:['value'], dstypes: ['derive']},
	"1.3.6.1.4.1.2021.11.61.0": {plugin: "snmp", plugin_instance:"cpu", "type_instance": "softIRQ", type: "", dsnames:['value'], dstypes: ['derive']},
	"1.3.6.1.4.1.2021.11.64.0": {plugin: "snmp", plugin_instance:"cpu", "type_instance": "steal", type: "", dsnames:['value'], dstypes: ['derive']},
	 
	 //Ram
	"1.3.6.1.4.1.2021.4.5.0": {plugin: "snmp", plugin_instance:"memory", "type_instance": "total", type: "", dsnames:['value'], dstypes: ['gauge']},
	"1.3.6.1.4.1.2021.4.6.0": {plugin: "snmp", plugin_instance:"memory", "type_instance": "available", type: "", dsnames:['value'], dstypes: ['gauge']},
	"1.3.6.1.4.1.2021.4.13.0": {plugin: "snmp", plugin_instance:"memory", "type_instance": "shared", type: "", dsnames:['value'], dstypes: ['gauge']},
	"1.3.6.1.4.1.2021.4.14.0": {plugin: "snmp", plugin_instance:"memory", "type_instance": "buffer", type: "", dsnames:['value'], dstypes: ['gauge']},
	"1.3.6.1.4.1.2021.4.15.0": {plugin: "snmp", plugin_instance:"memory", "type_instance": "cached", type: "", dsnames:['value'], dstypes: ['gauge']},
	 
	 //Swap
	"1.3.6.1.4.1.2021.11.62.0": {plugin: "snmp", plugin_instance:"swap", "type_instance": "in", type: "swap_io", dsnames:['value'], dstypes: ['derive']},
	"1.3.6.1.4.1.2021.11.63.0": {plugin: "snmp", plugin_instance:"swap", "type_instance": "out", type: "swap_io", dsnames:['value'], dstypes: ['derive']},
	"1.3.6.1.4.1.2021.4.3.0": {plugin: "snmp", plugin_instance:"swap", "type_instance": "total", type: "", dsnames:['value'], dstypes: ['gauge']},
	"1.3.6.1.4.1.2021.4.4.0": {plugin: "snmp", plugin_instance:"memory", "type_instance": "available", type: "", dsnames:['value'], dstypes: ['gauge']},

};

exports.run = function(req, res) {
	var version = snmp.Version1;
	if (req.body.version == '2c') {
		version = snmp.Version2c;
	}
	var options = {
	    port: parseInt(req.body.port),
	    retries: 1,
	    timeout: 5000,
	    transport: "udp4",
	    version: version
	};
	var timestamp = Math.round(new Date().getTime() / 1000);
	dns.lookup(req.body.hostname, 4, function(err, address, family) {
		if (err) {
			console.log('SNMP: DNS failure.');
			console.log(err);
	        return res.json(500, err);
		}
		var session = snmp.createSession (address, req.body.community, options);
		var oids = [];
		var payload = {metrics: [], errors: []};
		
		for(var key in oidsMap) {
		    oids.push(key);
		}

		session.get(oids, function(error, varbinds) {
			if (error) {
				console.log(error);
	        	return res.json(500, error);
	   	 	}
	   	 	var results = {};
	   	 	varbinds.forEach(function(result) {
	   	 		var value = result.value;
	   	 		var metric = oidsMap[result.oid];
	   	 		if (metric.plugin_instance == 'load') {
	   	 			value = value/100;
	   	 		}
	   	 		metric.values = [value];
	   	 		metric.time = timestamp;
	   	 		payload.metrics.push(metric);
	   	 	});


	   	 	respond(res,payload);
	   	 	session.close();
		});
		session.on('error', function(error) {
			console.log('SNMP: error event emitted.');
			console.log(error);
			payload.error.push(error);
			respond(res, payload);
			session.close();
		});
	});
}

function respond(res, payload) {
	console.log('LinuxComputeSNMP complete.')
    res.json({success: true, results: payload});
}