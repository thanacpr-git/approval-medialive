variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "ap-southeast-1"
}

variable "project_name" {
  description = "Project name"
  type        = string
  default     = "approval-medialive"
}

variable "environment" {
  description = "Environment (dev, staging, prod)"
  type        = string
  default     = "dev"
}

variable "app_url" {
  description = "Application URL (CloudFront distribution URL)"
  type        = string
  default     = "https://your-app.cloudfront.net"
}

variable "sender_email" {
  description = "Email address to send notifications from (must be verified in SES)"
  type        = string
  default     = "noreply@example.com"
}

variable "approval_emails" {
  description = "Comma-separated list of email addresses for approval notifications"
  type        = string
  default     = "admin@example.com,ops@example.com"
}
