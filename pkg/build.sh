#!/bin/bash

# Find the directory we exist within
DIR=$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )
cd ${DIR}/..
go get -u -f github.com/raintank/raintank-probe
cp $(which raintank-probe) .
npm install
