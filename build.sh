#!/bin/sh
fpm -s npm -t deb -d nodejs -d nodejs-legacy -d nodejs-dev -d npm .
