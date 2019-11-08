---
id: getting-started
title: Getting Started with Cumulus
hide_title: true
---

# Getting Started with Cumulus

This is your roadmap to getting started with using Cumulus. You will need an AWS account to deploy Cumulus. If you are using Cumulus for NASA, you will need to obtain a NASA NGAP AWS account.

## General Information

### AWS Services

Deploying and running Cumulus will use the following AWS services:

* IAM
* S3
* CloudFormation
* CloudWatch
* Dynamo DB
* API Gateway
* Elasticsearch
* Step Functions
* Lambda
* SNS/SQS

Optional configurations may employ the use of

* Secrets Manager (if deploying a distribution app)
* Kinesis
* CloudFront
* ELK stack

### Your NGAP AWS Account

If you have an NGAP account, the following should be set up in your account:

* Application VPC
* Security Group
* IAM Permission Boundaries
* SSH Bastion EC2 Instance
* NGAP EC2 AMIs
* S3 STS Get Keys Lambda
* VPC endpoints

You will need your Application VPC Id, Subnet Id, amd Security Group Id for your deployment.

### Cumulus Core Capabilities

#### Ingest Features

* Workflow configuration using AWS step functions
* Cumulus-provided versioned workflow tasks and support for custom tasks
* Workflow triggers on a one-time or scheduled basis or triggered by kinesis, SNS, or SQS
* Ability to run a lambda task as an ECS Activity
* Prioritization of ingest tasks via queues
* Workflow execution retention - original and final payloads

##### NASA Specific

* Common Metadata Repository (CMR) integration with Launchpad or Earthdata Login authentication

#### Archive Features

* Metrics reporting integration with an ELK stack
* Archive reconciliation report between S3 and internal data store

##### NASA Specific

* EMS Reporting
* Cloud metrics reporting and Kibana dashboards
* Archive reconciliation report between CMR and internal data store

#### Distribution Features

* Distribution API
* S3 access logs

##### NASA Specific

* Direct S3 access in-region

#### Operator Features

* Operator API
* Operator dashboard
* Ability to manage providers, collections, and workflow trigger rules
* Ability to monitor granule ingests and executions
* Ability to run reconciliation reports

### Cumulus Code and Repositories

Cumulus is primarily written in Node.js and published as versioned [NPM packages](https://www.npmjs.com/org/cumulus).

Cumulus is open source and the repositories are located on [Github](https://github.com/search?q=topic%3Anasa-cumulus+org%3Anasa&type=Repositories).

Release notes and artifacts are also on Github in the main Cumulus repository [release page](https://github.com/nasa/cumulus/releases) and operator release notes are on the Cumulus dashboard [release page](https://github.com/nasa/cumulus-dashboard/releases).

## Configure and Deploy Cumulus to your AWS Account

Follow the deployment instructions in the [deployment documentation](../deployment/deployment-readme).

## Configure and Run the Hello World Workflow

First, go through the [setup for data cookbooks](../data-cookbooks/setup).

Follow the [Hello World data cookbook](../data-cookbooks/setup)




