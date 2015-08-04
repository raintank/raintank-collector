#!/bin/sh
go get -u github.com/raintank/raintank-probe
cp $GOPATH/bin/raintank-probe .
npm install
