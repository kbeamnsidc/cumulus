#!/bin/bash
## This script must be run *after* env vars are set, as the PR_BRANCH is required

set -e

git diff $PR_BRANCH --quiet !(docs)

if [[ $? == 0 && ! $BRANCH == master && ! $bamboo_GIT_PR ]]; then
  >&2 echo "******Skipping publish step as PUBLISH_FLAG is not set"
  exit 0
fi