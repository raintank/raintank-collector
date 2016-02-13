# raintank-collector
Raintank Remote Collector Agent

The raintank-collector provides the execution of periodic network performance tests including HTTP checks, DNS and Ping.
The results of each test are then transfered back to the Raintank API where they are processed and inserted into a timeseries database.

## To run your own private collector follow these steps.

1. Add the new collector via the raintank portal.
  * navigate to the probes page then click on the "New Probe" button at the top right of the screen.
  * enter a unique name for the probe and click the "add" button.
2. If you dont already have an apiKey, create a new one.
  * Click on your user name in the left navigation menu, then click the ApiKeys submenu option.
  * Enter the key name and click 'add'
  * be sure to note down the key generated as you will need it for the collector configuration file.
3. Install the collector application - 2 options

  a.) Use dockerized version of Raintank collector
  Minimal ~30sec deployment:
  ```
docker run \
    -d \
    --name raintank-collector \
    -p 8284:8284 \
    -e "apiKey=<RAINTANK_API_KEY>" \
    -e "name=<COLLECTOR_NAME>" \
    monitoringartist/raintank-collector
  ```
  [![Dockerized Raintank collector](https://raw.githubusercontent.com/monitoringartist/docker-raintank-collector/master/doc/raintank-collector-monitoring-artist.gif)](https://github.com/monitoringartist/docker-raintank-collector)
  Visit https://github.com/monitoringartist/docker-raintank-collector for more information.

  b.) Use non containerized version of Raintank collector
  * Clone the repository
  ```
git clone https://github.com/raintank/raintank-collector.git
  ```
  * Install Go. https://golang.org/doc/install. Once you've installed Go, you'll need to configure your workspace like so: https://golang.org/doc/code.html#Workspaces
  * Install `raintank_probe`, which has taken over some of raintank_collector's functionality.
  ```
go get github.com/raintank/raintank-probe
  ```
  * Copy `raintank-probe` to `raintank-collector`'s directory.
  ```
cp $(which raintank-probe) .
  ```
  * Install all of the dependent node_modules
  ```
npm install
  ```
  * Create a config file using etc/config.json as a template, with the collector name created in step 1 and the ApiKey created in step 2.
  ```
{
	"collector": {
		"name": "PublicTest"
	},
	"numCPUs": 1,
	"serverUrl": "https://app.raintank.io",
	"apiKey": "<Your API KEY>",
	"probeServerPort": 8080
}
  ```
  * Then start the app.
  ```
nodejs app.js -c /path/to/config.json
  ```
