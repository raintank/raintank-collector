#!/bin/bash

# Find the directory we exist within
DIR=$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )
cd ${DIR}

NAME=raintank-collector
#VERSION="$(../${NAME} -v | cut -f3 -d' ')"
#BUILD="${DIR}/${NAME}-${VERSION}"
#ARCH="$(uname -m)"
#PACKAGE_NAME="${DIR}/artifacts/${NAME}-VERSION-ITERATION_ARCH.deb"

cd ${DIR}/artifacts

fpm -s npm -t deb \
  --iteration `date +%s` -d nodejs -d nodejs-legacy -d nodejs-dev -d npm ${DIR}/../
