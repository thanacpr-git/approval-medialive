#!/bin/bash
# Cleanup script: Stop running Step Function executions and delete all matches
# Usage:
#   ./scripts/cleanup.sh              # Interactive — asks before deleting
#   ./scripts/cleanup.sh --force      # No prompts — deletes everything

set -euo pipefail

REGION="ap-southeast-1"
STATE_MACHINE_ARN="arn:aws:states:ap-southeast-1:526169475020:stateMachine:approval-medialive-channel-turnoff-prod"
MATCHES_TABLE="approval-medialive-matches-prod"
APPROVALS_TABLE="approval-medialive-approvals-prod"
FORCE="${1:-}"

echo "============================================"
echo "  🧹 Cleanup: Step Functions + Matches"
echo "============================================"
echo ""

# ---- Stop running Step Function executions ----
echo "[1/3] Checking running Step Function executions..."

RUNNING_EXECS=$(aws stepfunctions list-executions \
  --state-machine-arn "$STATE_MACHINE_ARN" \
  --status-filter RUNNING \
  --region "$REGION" \
  --query 'executions[*].executionArn' \
  --output text 2>/dev/null || echo "")

if [ -z "$RUNNING_EXECS" ] || [ "$RUNNING_EXECS" = "None" ]; then
  echo "  ✓ No running executions"
else
  COUNT=$(echo "$RUNNING_EXECS" | wc -w | tr -d ' ')
  echo "  Found $COUNT running execution(s)"
  
  if [ "$FORCE" != "--force" ]; then
    echo "  Stop all? (yes/no)"
    read -r confirm
    if [ "$confirm" != "yes" ]; then
      echo "  Skipped."
    else
      FORCE="--force"
    fi
  fi

  if [ "$FORCE" = "--force" ]; then
    for ARN in $RUNNING_EXECS; do
      aws stepfunctions stop-execution --execution-arn "$ARN" --region "$REGION" 2>/dev/null || true
      echo "  ✓ Stopped: $(echo $ARN | awk -F: '{print $NF}')"
    done
  fi
fi

# ---- Delete all matches from DynamoDB ----
echo ""
echo "[2/3] Deleting matches from $MATCHES_TABLE..."

MATCH_IDS=$(aws dynamodb scan \
  --table-name "$MATCHES_TABLE" \
  --region "$REGION" \
  --projection-expression "matchId" \
  --query 'Items[*].matchId.S' \
  --output text 2>/dev/null || echo "")

if [ -z "$MATCH_IDS" ] || [ "$MATCH_IDS" = "None" ]; then
  echo "  ✓ No matches to delete"
else
  COUNT=$(echo "$MATCH_IDS" | wc -w | tr -d ' ')
  echo "  Found $COUNT match(es)"
  
  if [ "$FORCE" != "--force" ]; then
    echo "  Delete all? (yes/no)"
    read -r confirm
    if [ "$confirm" != "yes" ]; then
      echo "  Skipped."
      MATCH_IDS=""
    fi
  fi

  for ID in $MATCH_IDS; do
    aws dynamodb delete-item \
      --table-name "$MATCHES_TABLE" \
      --key "{\"matchId\":{\"S\":\"$ID\"}}" \
      --region "$REGION" 2>/dev/null || true
    echo "  ✓ Deleted match: $ID"
  done
fi

# ---- Delete all approval tokens ----
echo ""
echo "[3/3] Deleting approval tokens from $APPROVALS_TABLE..."

APPROVAL_TOKENS=$(aws dynamodb scan \
  --table-name "$APPROVALS_TABLE" \
  --region "$REGION" \
  --projection-expression "approvalToken" \
  --query 'Items[*].approvalToken.S' \
  --output text 2>/dev/null || echo "")

if [ -z "$APPROVAL_TOKENS" ] || [ "$APPROVAL_TOKENS" = "None" ]; then
  echo "  ✓ No approval tokens to delete"
else
  COUNT=$(echo "$APPROVAL_TOKENS" | wc -w | tr -d ' ')
  echo "  Found $COUNT approval token(s)"
  
  for TOKEN in $APPROVAL_TOKENS; do
    aws dynamodb delete-item \
      --table-name "$APPROVALS_TABLE" \
      --key "{\"approvalToken\":{\"S\":\"$TOKEN\"}}" \
      --region "$REGION" 2>/dev/null || true
  done
  echo "  ✓ Deleted $COUNT approval tokens"
fi

echo ""
echo "✅ Cleanup complete!"
