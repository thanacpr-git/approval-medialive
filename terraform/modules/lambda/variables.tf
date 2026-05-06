variable "project_name" {
  type = string
}

variable "environment" {
  type = string
}

variable "matches_table_name" {
  type = string
}

variable "matches_table_arn" {
  type = string
}

variable "approval_table_name" {
  type = string
}

variable "approval_table_arn" {
  type = string
}

variable "channels_table_name" {
  type = string
}

variable "channels_table_arn" {
  type = string
}

variable "audit_table_name" {
  type = string
}

variable "audit_table_arn" {
  type = string
}

variable "state_machine_arn" {
  type = string
}

variable "sender_email" {
  type = string
}

variable "approval_emails" {
  type = string
}

variable "app_url" {
  type = string
}
