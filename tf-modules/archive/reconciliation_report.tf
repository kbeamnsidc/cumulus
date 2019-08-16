# CreateReconciliationReport

resource "aws_lambda_function" "create_reconciliation_report" {
  function_name    = "${var.prefix}-CreateReconciliationReport"
  filename         = "${path.module}/../../packages/api/dist/createReconciliationReport/lambda.zip"
  source_code_hash = filebase64sha256("${path.module}/../../packages/api/dist/createReconciliationReport/lambda.zip")
  handler          = "index.handler"
  role             = var.lambda_processing_role_arn
  runtime          = "nodejs8.10"
  timeout          = 300
  memory_size      = 256
  environment {
    variables = {
      CMR_ENVIRONMENT       = var.cmr_environment
      CollectionsTable      = var.dynamo_tables.Collections
      DISTRIBUTION_ENDPOINT = var.distribution_url
      FilesTable            = var.dynamo_tables.Files
      GranulesTable         = var.dynamo_tables.Granules
      stackName             = var.prefix
      system_bucket         = var.system_bucket
      cmr_client_id         = var.cmr_client_id
      cmr_provider          = var.cmr_provider
      CMR_LIMIT             = var.cmr_limit
      CMR_PAGE_SIZE         = var.cmr_page_size
    }
  }
  tags = {
    Project = var.prefix
  }
  vpc_config {
    subnet_ids         = var.lambda_subnet_ids
    security_group_ids = [aws_security_group.no_ingress_all_egress.id]
  }
}