#!/bin/bash

# Find the directory we exist within
DIR=$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )

: ${NAME:="raintank-collector"}
: ${VERSION:=$(npm list | head -1 | awk '{print $1}' | cut -f2 -d@)}
: ${BUILD_DIR:="${DIR}/build"}
COLLECTOR_DIR="/usr/local/lib/node_modules/${NAME}"
COLLECTOR_BUILD_DIR=${BUILD_DIR}${COLLECTOR_DIR}

# remove any existing BUILD_DIR
rm -rf ${BUILD_DIR}

mkdir -p ${BUILD_DIR}
mkdir -p ${COLLECTOR_BUILD_DIR}

cp -fr *.go *.js package.json checks ${COLLECTOR_BUILD_DIR}/
cp -fR ${DIR}/config/ubuntu/trusty/* ${BUILD_DIR}/

cd ${COLLECTOR_BUILD_DIR}

npm install
go get -u -f github.com/raintank/raintank-probe
cp $(which raintank-probe) .

