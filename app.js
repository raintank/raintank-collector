'use strict;'
var express = require('express');
var routes = require('./routes');

var path = require('path');
var util = require('util');
var cluster = require('cluster');
var HTTP = require('http');
var numCPUs = 1;
var serviceManager = require('./serviceManager');

var app = express();

// all environments
app.set('port', process.env.PORT || 4001);
app.use(express.favicon());
app.use(express.logger('dev'));
app.use(express.json());
app.use(app.router);

if ('development' == app.get('env')) {
  app.use(express.errorHandler());
}

function log() {
    return function(req, res, next) {
        //console.log("call to " + req.path);
        next();
    }
}

app.post('/dns', routes.dns.run);
app.post('/ftp', routes.ftp.run);
app.post('/http', routes.http.run);
app.post('/https', routes.https.run);
app.post('/imap', routes.imap.run);
app.post('/ping', routes.ping.run);
app.post('/pop3', routes.pop3.run);
app.post('/smtp', routes.smtp.run);
app.post('/snmp', routes.snmp.run);
app.post('/ssh', routes.ssh.run);
app.post('/linuxComputeSNMP', routes.linuxComputeSNMP.run);

if (cluster.isMaster) {
    // Fork workers.
    for (var i = 0; i < numCPUs; i++) {
        cluster.fork();
    }

    cluster.on('exit', function(worker, code, signal) {
        console.log('worker ' + worker.process.pid + ' died');
        //cluster.fork();
    });
} else {
    // Workers can share any TCP connection
    // In this case its a HTTP server
    HTTP.createServer(app).listen(app.get('port'),function(){
        console.log('Express server listening on port ' + app.get('port'));
    });
    serviceManager.init();
}

