'use strict;'

var config = {};
config.location = {
    "name": "Development12",
    "region": "AMER",
    "country": "US",
    "provider": "Docker",
    "public": false
};
config.serverUrl = "http://localhost:8181";
config.token = "d4WuLk5HtBl2NOeAdeInACDaATHF2hI9HMMyj5vUKORjsX51rGp8scSjhvVKe4Q6";
config.numCPUs = 1;


function parseEnv(name, value, cnf) {
	if (name in cnf) {
		cnf[name] = value;
		return;
	}
	var parts = name.split('_');
	var pos = 0
	var found = false
	while (!found && pos < parts.length) {
		pos = pos + 1;
		var group = parts.slice(0,pos).join('_');
		if (group in cnf){
			found = true;
			parseEnv(parts.slice(pos).join('_'), value, cnf[group]);
		}
	}
	if (!found) {
		console.log("%s not found in config", name);
	}
}

// overwrite with Environment variables
for (var key in process.env) {
	if (key.indexOf('RAINTANK_') == 0) {
		var name = key.slice(9);
		parseEnv(name, process.env[key], config);
	}
}

function getconfig() {
	return config;
}
exports.cnf = getconfig;