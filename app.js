'use strict;'
var configfile;
if (process.argv.indexOf("-h") != -1 || process.argv.indexOf("--help") != -1) {
	console.log("USAGE: nodejs /path/to/app.js [ -c /path/to/config/file.json]");
	console.log("  -c: optional configuration json file");
	console.log("  -h/--help: this help message.");
	process.exit();
} else if (process.argv.indexOf("-c") != -1) {
	configfile = process.argv[process.argv.indexOf("-c") + 1 ];
} else {
	configfile = "./config";
}
var config = require(configfile).config;
var cluster = require('cluster');
var serviceManager = require('./serviceManager');
var log4js = require('log4js');
var logger = log4js.getLogger('PID:'+process.pid);
log4js.replaceConsole();

if (cluster.isMaster) {
    // Fork workers.
    for (var i = 0; i < config.numCPUs; i++) {
    	logger.info("launching worker process.");
        cluster.fork();
    }

    cluster.on('exit', function(worker, code, signal) {
        logger.error('worker ' + worker.process.pid + ' died, restarting.');
        cluster.fork();
    });
} else {
    serviceManager.init();
}
