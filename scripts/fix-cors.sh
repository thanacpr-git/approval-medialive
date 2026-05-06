#!/bin/bash
# Fix CORS for all API Gateway routes
# Run this AFTER terraform apply and AFTER create-deployment
# This script ensures all OPTIONS preflight responses work correctly

set -euo pipefail

RESTAPI="9k6h6dm40i"
REGION="ap-southeast-1"
STAGE="prod"

echo "Fixing CORS for API Gateway: $RESTAPI"

# Get resource IDs
MATCHES_ID=$(aws apigateway get-resources --rest-api-id $RESTAPI --region $REGION --query 'items[?path==`/matches`].id' --output text)
MATCHID_ID=$(aws apigateway get-resources --rest-api-id $RESTAPI --region $REGION --query 'items[?path==`/matches/{id}`].id' --output text)
TURNOFF_ID=$(aws apigateway get-resources --rest-api-id $RESTAPI --region $REGION --query 'items[?path==`/matches/{id}/turnoff`].id' --output text)
CHANNELS_ID=$(aws apigateway get-resources --rest-api-id $RESTAPI --region $REGION --query 'items[?path==`/channels`].id' --output text)
AUDITLOG_ID=$(aws apigateway get-resources --rest-api-id $RESTAPI --region $REGION --query 'items[?path==`/audit-log`].id' --output text)

echo "  /matches:              $MATCHES_ID"
echo "  /matches/{id}:         $MATCHID_ID"
echo "  /matches/{id}/turnoff: $TURNOFF_ID"
echo "  /channels:             $CHANNELS_ID"
echo "  /audit-log:            $AUDITLOG_ID"

fix_cors() {
  local RESOURCE_ID=$1
  local METHODS=$2
  local PATH_NAME=$3

  echo ""
  echo "Fixing: $PATH_NAME ($RESOURCE_ID)"

  # Delete existing OPTIONS (ignore errors if doesn't exist)
  aws apigateway delete-method --rest-api-id $RESTAPI --resource-id $RESOURCE_ID --http-method OPTIONS --region $REGION 2>/dev/null || true

  # Create fresh OPTIONS
  aws apigateway put-method --rest-api-id $RESTAPI --resource-id $RESOURCE_ID --http-method OPTIONS --authorization-type NONE --region $REGION > /dev/null

  aws apigateway put-integration --rest-api-id $RESTAPI --resource-id $RESOURCE_ID --http-method OPTIONS --type MOCK --passthrough-behavior WHEN_NO_MATCH --request-templates '{"application/json": "{\"statusCode\": 200}"}' --region $REGION > /dev/null

  aws apigateway put-method-response --rest-api-id $RESTAPI --resource-id $RESOURCE_ID --http-method OPTIONS --status-code 200 --response-parameters '{"method.response.header.Access-Control-Allow-Headers":true,"method.response.header.Access-Control-Allow-Methods":true,"method.response.header.Access-Control-Allow-Origin":true}' --region $REGION > /dev/null

  aws apigateway put-integration-response --rest-api-id $RESTAPI --resource-id $RESOURCE_ID --http-method OPTIONS --status-code 200 --selection-pattern "" --response-parameters "{\"method.response.header.Access-Control-Allow-Headers\":\"'Content-Type,Authorization'\",\"method.response.header.Access-Control-Allow-Methods\":\"'${METHODS}'\",\"method.response.header.Access-Control-Allow-Origin\":\"'*'\"}" --region $REGION > /dev/null

  echo "  ✓ $PATH_NAME done"
}

# Fix all routes
fix_cors "$MATCHES_ID" "GET,POST,OPTIONS" "/matches"
fix_cors "$MATCHID_ID" "GET,PUT,DELETE,OPTIONS" "/matches/{id}"
fix_cors "$TURNOFF_ID" "POST,OPTIONS" "/matches/{id}/turnoff"
fix_cors "$CHANNELS_ID" "GET,OPTIONS" "/channels"
fix_cors "$AUDITLOG_ID" "GET,OPTIONS" "/audit-log"

# Deploy
echo ""
echo "Deploying to stage: $STAGE"
aws apigateway create-deployment --rest-api-id $RESTAPI --stage-name $STAGE --region $REGION > /dev/null
echo "✅ CORS fix complete!"
