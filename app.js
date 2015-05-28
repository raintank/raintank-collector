'use strict;'
var config = require('./config').config;
var cluster = require('cluster');
var serviceManager = require('./serviceManager');
var log4js = require('log4js');
var logger = log4js.getLogger('PID:'+process.pid);
log4js.replaceConsole();
var spawn = require('child_process').spawn;

var restartLog = [];

function startPingServer() {
    logger.info("starting up go-ping server")
    var ping = spawn("./go-ping", ["-p", ""+config.pingServerPort]);
    ping.stderr.on('data', function(data) {
        logger.Error(data.toString());
    });
    ping.stdout.on('data', function(data) {
        logger.info(data.toString());
    });
    ping.on("close", function(code) {
        logger.error("Ping server terminated.");
        setTimeout(function() {
            startPingServer();
        }, 1000)
    });
 }   

if (cluster.isMaster) {
    //start up go-ping server
    startPingServer();

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
