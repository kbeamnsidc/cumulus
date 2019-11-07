#!/bin/bash
set -ex
. ./bamboo/abort-if-not-pr.sh
. ./bamboo/set-bamboo-env-variables.sh
. ./bamboo/abort-tests-if-no-code-change.sh


container_id=${bamboo_planKey,,}
container_id=${container_id/-/}

export COMPOSE_FILE=./bamboo/docker-compose.yml

docker ps -a
docker-compose -p ${container_id} down
docker-compose -p ${container_id} rm -f