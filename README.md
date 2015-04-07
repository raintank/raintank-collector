# raintank-collector
Raintank Remote Collector Agent

The raintank-collector provides the execution of periodic network performance tests including HTTP checks, DNS and Ping.
The results of each test are then transfered back to the raintank-collector-ctrl app where they are processed and inserted into a timeseries database.

## building and running

Clone the repository
```
git clone https://github.com/raintank/raintank-collector.git
```

Install all of the dependent node_modules

```
npm install
```

Create the config/config.json with the collector name and add the URL and access token of the raintank-collector-ctrl and API services.
You can optionally include a list of 'tags' in the 'collector' configuration.  These tags will be added to the collector on creation only.
```
{
	"collector": {
		"name": "PublicTest",
	},
	"numCPUs": 1,
	"serverUrl": "https://portal.raintank.io:8443",
	"token": "<Your API KEY>",
	"api": {
		"host": "portal.raintank.io",
		"port": "443",
		"path": "/api/",
		"protocol": "https"
	}
}
```

Then start the app.

```
nodejs app.js
```
