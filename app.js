'use strict;'
var config = require('./config').config;
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
