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

Create the config/config.json with the collector name and add the URL and access token of the API service.
```
{
	"collector": {
		"name": "PublicTest",
	},
	"numCPUs": 1,
	"serverUrl": "https://portal.raintank.io",
	"apiKey": "<Your API KEY>",
}
```

Then start the app.

```
nodejs app.js
```
