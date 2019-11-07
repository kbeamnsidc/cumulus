#!/bin/bash
set -ex
. ./bamboo/abort-if-skip-integration-tests.sh
source .bamboo_env_vars || true

if [[ $RUN_REDEPLOYMENT != true ]]; then
  >&2 echo "***Skipping redeploy tests***"
  exit 0
fi

. ./bamboo/set-bamboo-env-variables.sh
. ./bamboo/abort-tests-if-no-code-change.sh

(cd example && npm run redeploy-test)
