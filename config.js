'use strict;'

var config = {};
config.location = {
	"id": "DEV1",
    "name": "Development",
    "region": "AMER",
    "country": "US",
    "provider": "Docker"
};
config.serverUrl = "http://raintank-locationmgr:8181";
config.adminToken = "jk832sjksf9asdkvnngddfg8sfk";
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