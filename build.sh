#!/bin/sh
go get -u github.com/tatsushid/go-fastping
go build -o go-ping
npm install
fpm -s npm -t deb --iteration `date +%s` -d nodejs -d nodejs-legacy -d nodejs-dev -d npm .
