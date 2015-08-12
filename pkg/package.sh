#!/bin/bash

# Find the directory we exist within
DIR=$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )

: ${NAME:="raintank-collector"}
: ${PKG_NAME:="node-${NAME}"}
: ${VERSION:=$(npm list | head -1 | awk '{print $1}' | cut -f2 -d@)}
: ${BUILD_DIR:="${DIR}/build"}
COLLECTOR_DIR="/usr/local/lib/node_modules/${NAME}"
COLLECTOR_BUILD_DIR=${BUILD_DIR}${COLLECTOR_DIR}

cd ${DIR}

mkdir -p ${DIR}/artifacts
rm -f ${DIR}/artifacts/*

fpm -s dir -t deb --iteration `date +%s` \
  -n ${PKG_NAME} -v ${VERSION} \
  --description "Raintank Remote Collector Agent" \
  -d nodejs -d nodejs-legacy -d nodejs-dev -d npm -d fping \
  -p ${DIR}/artifacts/NAME-VERSION-ITERATION_ARCH.deb \
  --config-files etc -C ${BUILD_DIR} opt etc
