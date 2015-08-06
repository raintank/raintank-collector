#!/bin/bash

# Find the directory we exist within
DIR=$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )
cd ${DIR}

: ${NAME:="raintank-collector"}
: ${VERSION:=$(npm list | head -1 | awk '{print $1}' | cut -f2 -d@)}

mkdir -p ${DIR}/artifacts
rm -f ${DIR}/artifacts/*

fpm -s npm -t deb --iteration `date +%s` \
  -d nodejs -d nodejs-legacy -d nodejs-dev -d npm -d fping \
  -p ${DIR}/artifacts/NAME-VERSION-ITERATION_ARCH.deb ../
