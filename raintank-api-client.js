'use strict';

var http = require('http'),
	https = require('https'),
	util = require("util"),
	zlib = require("zlib"),
	querystring = require("querystring");

module.exports = Client;

// Client Class
function Client(options) {
	this.host = options.host || '127.0.0.1';
	this.port = options.port || 80;

	this.base = options.base || '/';

	this.max_concurrency = options.max_concurrency || 10;
	http.globalAgent.maxSockets = this.max_concurrency;
	this.headers = {
		'Content-Type' : 'application/json',
		'Authorization': 'Bearer '+ this.token
	};
}

Client.prototype.setToken = function(token) {
	this.token = token;
	this.headers.Authorization = 'Bearer ' + token;
}

Client.prototype.buildRequestOptions = function(method, path) {
	return  {
		host: this.host,
		port: this.port,
		path: this.base + path,
		method: method, 
		headers: this.headers,
	};
}

Client.prototype.request = function(method, path, data, callback) {
	if (typeof data === 'function'){
		callback = data;
		data = null;
	}
	var opts = this.buildRequestOptions(method, path);
	var request = http.request(opts, function(res) {
		var err = null;
		if (res.statusCode > 299) {
			err = new Error('request failed. StatusCode: '+ res.statusCode);
		}
		var raw = [];
		res.on('data', function(data) {
			raw.push(data);
		});
		res.on('end', function() {
			var buffer = Buffer.concat(raw);
			//handle compression
			if ('content-encoding' in res.headers && res.headers['content-encoding'] == 'gzip') {
                //handle gziped data.
                zlib.gunzip(buffer, function(error, decoded) {
                	if (error) {
                		return callback(new Error('could not decompress response.'), res);
                	}
                	res.data = JSON.parse(decoded);
                });
            } else {

            }
            var error, obj = marshal(buffer.toString(), function(error, obj) {
            	 if (error) {
            		err = new Error("failed to parse response body.");
	            } else {
	            	res.data = obj;
	            }
				callback(err, res);
            });
		})
		
	});
	if (data) {
		request.write(JSON.stringify(data));
	} 
	request.end();
	request.on("error", function(err) {
		callback(err, null);
	});
}

function marshal(str, callback) {
	var obj;
	var err = null;
	try {
		obj = JSON.parse(str);
	} catch (ex) {
		err = new Error("could not parse string");
	}
	callback(err, obj);

}

Client.prototype.get = function(path, data, callback) {
	if (typeof data === 'function'){
		callback = data;
		data = null;
	}
	if (data) {
		path = path + '?'+querystring.stringify(data)
	}
	this.request("GET", path, null, callback);
}

Client.prototype.put = function(path, data, callback) {
	this.request("PUT", path, data, callback);
}

Client.prototype.post = function(path, data, callback) {
	this.request("POST", path, data, callback);
}

Client.prototype.delete = function(path, data, callback) {
	// data is an optional argument.
	if (typeof data == 'function') {
		callback = data;
		data = null;
	}
	this.request("DELETE", path, data, callback);
}


