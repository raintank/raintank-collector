#!/bin/bash

# Find the directory we exist within
DIR=$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )
cd ${DIR}/..

go get -u github.com/raintank/raintank-probe
echo $PATH
which raintank-probe
ls -l ~/.go_workspace/bin/
cp ~/.go_workspace/bin/raintank-probe .
npm install
