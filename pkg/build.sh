#!/bin/bash

# Find the directory we exist within
DIR=$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )
cd ${DIR}/..
rm -rf ~/.go_workspace/*
ls -la ~/.go_workspace/
go get -u -f github.com/raintank/raintank-probe
ls -la ~/.go_workspace/
ls -la ~/.go_workspace/src/
cp $(which raintank-probe) .
npm install
