variable "project_name" {
  type = string
}

variable "environment" {
  type = string
}

variable "cognito_user_pool_arn" {
  type = string
}

variable "matches_lambda_arn" {
  type = string
}

variable "matches_lambda_name" {
  type = string
}

variable "turnoff_lambda_arn" {
  type = string
}

variable "turnoff_lambda_name" {
  type = string
}

variable "approval_lambda_arn" {
  type = string
}

variable "approval_lambda_name" {
  type = string
}
