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

Update the config.js with the location definition of where the collector is running and add the URL and access token of the raintank-collector-ctrl service.
```
config.location = {
    "id": "DEV1",
    "name": "Development",
    "region": "AMER",
    "country": "US",
    "provider": "Docker"
};
config.serverUrl = "http://raintank-collector-ctrl:8181";
config.adminToken = "jk832sjksf9asdkvnngddfg8sfk";
```

Then start the app.

```
nodejs app.js
```
