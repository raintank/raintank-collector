#!/bin/bash

# Find the directory we exist within
DIR=$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )

cd ${DIR}/..

go get -u github.com/tatsushid/go-fastping
go build -o go-ping

npm install
