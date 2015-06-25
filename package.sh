#!/bin/sh
fpm -s npm -t deb --iteration `date +%s` -d nodejs -d nodejs-legacy -d nodejs-dev -d npm .
