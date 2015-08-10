#!/bin/bash

# Find the directory we exist within
DIR=$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )
cd ${DIR}/..
rm -rf ~/.go_workspace/*
go get -u github.com/raintank/raintank-probe
echo $PATH
which raintank-probe
ls -la ~/.go_workspace/
cp ~/.go_workspace/bin/raintank-probe .
npm install
