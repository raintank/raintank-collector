#!/bin/sh
fpm -s npm -t deb -S nodejs -S nodejs-legacy -S nodejs-dev -S npm .
