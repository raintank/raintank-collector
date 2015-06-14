package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"github.com/tatsushid/go-fastping"
	"math"
	"net"
	"net/http"
	"sort"
	"time"
)

type PingResult struct {
	Loss  *float64 `json:"loss"`
	Min   *float64 `json:"min"`
	Max   *float64 `json:"max"`
	Avg   *float64 `json:"avg"`
	Mean  *float64 `json:"mean"`
	Mdev  *float64 `json:"mdev"`
	Error *string  `json:"error"`
}

const count = 5

func main() {
	http.HandleFunc("/", handler)
	var port int
	flag.IntVar(&port, "p", 8080, "tcp port to listen on")
	flag.Parse()
	fmt.Println("Go-Ping server starting up.")
	http.ListenAndServe(fmt.Sprintf("127.0.0.1:%d", port), nil)
}

func handler(w http.ResponseWriter, r *http.Request) {

	ipaddr := r.URL.Path[1:]
	result := pingHost(ipaddr)
	json, err := json.Marshal(result)
	if err != nil {
		fmt.Println("failed to convert to json.")
		fmt.Println(err)
		w.WriteHeader(500)
		w.Write([]byte("could not marshal payload to json"))
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.Write(json)
	return
}

func pingHost(ipaddr string) *PingResult {
	p := fastping.NewPinger()
	results := make([]float64, count)
	result := PingResult{}
	if err := p.AddIP(ipaddr); err != nil {
		msg := "invalid IP address"
		result.Error = &msg
		return &result
	}
	for i := 0; i < count; i++ {
		p.OnRecv = func(addr *net.IPAddr, rtt time.Duration) {
			//fmt.Printf("IP Addr: %s receive, RTT: %v\n", addr.String(), rtt)
			results[i] = rtt.Seconds() * 1000
		}
		err := p.Run()
		if err != nil {
			fmt.Println(err)
		}
	}
	failCount := 0.0
	totalCount := len(results)

	tsum := 0.0
	tsum2 := 0.0
	min := math.Inf(1)
	max := 0.0
	successfullResults := make([]float64, 0)
	for _, r := range results {
		if r == 0 {
			failCount++
			continue
		}
		if r > max {
			max = r
		}
		if r < min {
			min = r
		}
		tsum += r
		tsum2 += (r * r)
		successfullResults = append(successfullResults, r)
	}
	successCount := len(successfullResults)

	if successCount > 0 {
		avg := tsum / float64(successCount)
		result.Avg = &avg
		root := math.Sqrt((tsum2 / float64(successCount)) - ((tsum / float64(successCount)) * (tsum / float64(successCount))))
		result.Mdev = &root
		sort.Float64s(successfullResults)
		mean := successfullResults[successCount/2]
		result.Mean = &mean
		result.Min = &min
		result.Max = &max
	}
	if failCount == 0 {
		loss := 0.0
		result.Loss = &loss
	} else {
		loss := 100.0 * (failCount / float64(totalCount))
		result.Loss = &loss
	}
	if *result.Loss == 100.0 {
		error := "100% packet loss"
		result.Error = &error
	}
	return &result
}
