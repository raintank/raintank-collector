'use strict;'

var config = {};
config.location = {
    "name": "PublicTest",
    "region": "APAC",
    "country": "SG",
    "provider": "Desktop",
    "public": true
};
config.serverUrl = "http://localhost:8181";
config.token = "3wJvQ3G7dZ0ZPGGAk1f2dEqSSLNl3MWGccj5Mm6w22Y2Iy0L1Xp8QH9WplfYV7Gd";
config.numCPUs = 1;
config.api = {
  host: "localhost",
  port: 3000,
  path: "/api/"
};

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