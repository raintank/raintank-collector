'use strict;'
var config = require('./config').config;
var cluster = require('cluster');
var serviceManager = require('./serviceManager');
var log4js = require('log4js');
var logger = log4js.getLogger('PID:'+process.pid);
log4js.replaceConsole();

var restartLog = [];

if (cluster.isMaster) {
    // Fork workers.
    for (var i = 0; i < config.numCPUs; i++) {
    	logger.info("launching worker process.");
        cluster.fork();
    }

    function checkRestartRate() {
        var now = new Date().getTime();
        var restartCount = 0;
        for (var i=restartLog.length; i > 0; i--) {
            var ts = restartLog[i-1];
            var delta = now - ts;
            if (delta < 120000) {
                restartCount++;
            } else {
                restartLog.splice(i-1 ,1);
            }
        }
        logger.info("%d restarts in last 2 minutes.", restartCount);
        if (restartCount > 5) {
            logger.fatal("workers are restarting too quickly.");
            return process.exit(1);
        }
    }

    cluster.on('exit', function(worker, code, signal) {
        logger.error('worker ' + worker.process.pid + ' died, restarting.');
        restartLog.push(new Date().getTime());
        checkRestartRate();
        cluster.fork();
    });
} else {
    serviceManager.init();
}
