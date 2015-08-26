#!/bin/bash

# Find the directory we exist within
DIR=$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )

if [ -z ${PACKAGECLOUD_REPO} ] ; then
  echo "The environment variable PACKAGECLOUD_REPO must be set."
  exit 1
fi

: ${PACKAGECLOUD_OS:="ubuntu"}
: ${PACKAGECLOUD_VERSION:="trusty"}

package_cloud push ${PACKAGECLOUD_REPO}/${PACKAGECLOUD_OS}/${PACKAGECLOUD_VERSION} ${DIR}/artifacts/*.deb
git push --tags
