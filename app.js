'use strict;'
var config = require('./config').config;
var cluster = require('cluster');
var serviceManager = require('./serviceManager');

if (cluster.isMaster) {
    // Fork workers.
    for (var i = 0; i < config.numCPUs; i++) {
        cluster.fork();
    }

    cluster.on('exit', function(worker, code, signal) {
        console.log('worker ' + worker.process.pid + ' died, restarting.');
        //cluster.fork();
    });
} else {
    serviceManager.init();
}
