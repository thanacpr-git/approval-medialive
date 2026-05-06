# Match Schedule Table
resource "aws_dynamodb_table" "matches" {
  name         = "${var.project_name}-matches-${var.environment}"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "matchId"

  attribute {
    name = "matchId"
    type = "S"
  }

  attribute {
    name = "matchMonth"
    type = "S"
  }

  attribute {
    name = "startTime"
    type = "S"
  }

  global_secondary_index {
    name            = "MonthIndex"
    hash_key        = "matchMonth"
    range_key       = "startTime"
    projection_type = "ALL"
  }

  point_in_time_recovery {
    enabled = true
  }

  tags = {
    Name    = "${var.project_name}-matches"
    Project = "approval-medialive"
  }
}

# Approval Tracking Table
resource "aws_dynamodb_table" "approvals" {
  name         = "${var.project_name}-approvals-${var.environment}"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "approvalToken"

  attribute {
    name = "approvalToken"
    type = "S"
  }

  attribute {
    name = "matchId"
    type = "S"
  }

  global_secondary_index {
    name            = "MatchIndex"
    hash_key        = "matchId"
    projection_type = "ALL"
  }

  ttl {
    attribute_name = "ttl"
    enabled        = true
  }

  tags = {
    Name    = "${var.project_name}-approvals"
    Project = "approval-medialive"
  }
}

# Channel Registry Table
resource "aws_dynamodb_table" "channels" {
  name         = "${var.project_name}-channels-${var.environment}"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "channelLabel"

  attribute {
    name = "channelLabel"
    type = "S"
  }

  point_in_time_recovery {
    enabled = true
  }

  tags = {
    Name    = "${var.project_name}-channels"
    Project = "approval-medialive"
  }
}

# Audit Log Table
resource "aws_dynamodb_table" "auditlog" {
  name         = "${var.project_name}-auditlog-${var.environment}"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "logId"

  attribute {
    name = "logId"
    type = "S"
  }

  attribute {
    name = "matchId"
    type = "S"
  }

  global_secondary_index {
    name            = "MatchIdIndex"
    hash_key        = "matchId"
    projection_type = "ALL"
  }

  ttl {
    attribute_name = "ttl"
    enabled        = true
  }

  tags = {
    Name    = "${var.project_name}-auditlog"
    Project = "approval-medialive"
  }
}
