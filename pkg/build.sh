#!/bin/bash

# Find the directory we exist within
DIR=$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )
cd ${DIR}/..

go get -u github.com/raintank/raintank-probe
cp $GOPATH/bin/raintank-probe .
npm install
