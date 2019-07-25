---
id: terraform-modules
title: Terraform modules
hide_title: true
---

# Developing Terraform modules

There is a Terraform module located at the top of the Cumulus repo which deploys
all of Cumulus. It is documented [here](../deployment/cumulus_component). In
order to support deployments during development and in production, the cumulus
module's `*.tf` files need to be located at the top of the repository.

Rather than have all of the Cumulus resources defined directly in that module,
separate modules for smaller components should be placed in the `tf-modules`
directory. Those individual modules should then be referenced from the main
Cumulus module.

As an example, the `s3-credentials-endpoint` is defined in
`tf-modules/s3-credentials-endpoint`. It is instantiated in
`cumulus/distribution` using:

```hcl
module "s3_credentials_endpoint" {
  source = "./tf-modules/s3-credentials-endpoint"

  distribution_url     = module.thin_egress_app.api_endpoint
  permissions_boundary = var.permissions_boundary_arn
  prefix               = var.prefix
  public_buckets       = var.public_buckets
  region               = var.region
  rest_api             = module.thin_egress_app.rest_api
  stage_name           = var.thin_egress_app_deployment_stage
  subnet_ids           = var.subnet_ids
  urs_client_id        = var.urs_client_id
  urs_client_password  = var.urs_client_password
  urs_url              = var.urs_url
  vpc_id               = var.vpc_id
}
```

The integration test deployment defined in the `example` directory contains a
root module that instantiates the cumulus module. This is the recommended way to
do incremental development of Cumulus core Terraform modules.
