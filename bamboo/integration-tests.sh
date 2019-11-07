#!/bin/bash
set -ex
. ./bamboo/abort-if-not-pr-or-redeployment.sh
. ./bamboo/abort-if-skip-integration-tests.sh
. ./bamboo/set-bamboo-env-variables.sh
. ./bamboo/abort-tests-if-no-code-change.sh


cd example && npm test