# raintank-collector
Raintank Remote Collector Agent

The raintank-collector provides the execution of periodic network performance tests including HTTP checks, DNS and Ping.
The results of each test are then transfered back to the raintank-collector-ctrl app where they are processed and inserted into a timeseries database.

## building and running

Clone the repository
```
git clone <this_repo>
```

Install all of the dependent node_modules

```
npm install
```

Update the config/config.json with the location definition of where the collector is running and add the URL and access token of the raintank-collector-ctrl service.
```
{
	"location": {
		"name": "PublicTest",
	    "region": "APAC",
	    "country": "SG",
	    "provider": "Desktop",
	    "public": true
	},
	"numCPUs": 2,
	"serverUrl": "http://collector-ctrl:8181",
	"token": "eyJrIjoiWmZLTktlNHJ0UFFBdWtVdkRyemNiMjZPNFpralA1M3kiLCJuIjoiY29sbGVjdG9yIiwiaWQiOjF9",
	"api": {
		"host": "grafana",
		"port": "3000",
		"path": "/api/",
		"protocol": "http"
	}
}
```

Then start the app.

```
nodejs app.js
```
