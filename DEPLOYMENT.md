# Deployment Guide

## Prerequisites

1. **AWS CLI** configured with credentials that have admin access to the target account (185906222397)
2. **Terraform** >= 1.5 installed
3. **Node.js** >= 20 installed
4. **SES** must be out of sandbox mode OR all sender/recipient emails must be verified

## Pre-Deployment Checklist

- [ ] Update `terraform/terraform.tfvars` with your actual values:
  - `sender_email` — must be verified in SES
  - `approval_emails` — all recipients must be verified (if SES is in sandbox)
- [ ] Ensure AWS account has SES production access (or verify all email addresses)
- [ ] Ensure MediaLive channels exist in `ap-southeast-1`

## Quick Deploy

```bash
# Full deployment (interactive)
make deploy

# Or step by step:
make install        # Install dependencies
make deploy-infra   # Deploy AWS infrastructure
make fix-cors       # Fix CORS on all API Gateway routes
make build          # Build frontend
make deploy-frontend # Upload to S3 + invalidate CloudFront
make create-user    # Create admin login
```

## Step-by-Step Deployment

### 1. Set Up Terraform Backend

The deploy script automatically creates:
- S3 bucket `approval-medialive-tfstate` for state
- DynamoDB table `terraform-locks` for locking

### 2. Deploy Infrastructure

```bash
cd terraform
terraform init
terraform plan -var="environment=prod"
terraform apply -var="environment=prod"
```

This creates:
- Cognito User Pool + App Client
- DynamoDB tables (MatchSchedule, ApprovalTracking, Channels, AuditLog)
- 5 Lambda functions
- API Gateway with Cognito authorizer
- Step Function state machine
- S3 + CloudFront distribution
- CloudWatch log groups
- IAM roles and policies

### 2b. Fix CORS (Required after every infra deploy)

API Gateway CORS must be fixed after each `terraform apply` due to deployment overwrites:

```bash
make fix-cors
```

### 2c. Seed Channels

```bash
make seed-channels
```

### 3. Verify SES Emails

```bash
make verify-ses
```

Or manually:
```bash
aws ses verify-email-identity --email-address thanacpr@amazon.com --region ap-southeast-1
```

### 4. Build & Deploy Frontend

```bash
cd frontend
npm install
npm run build
```

The build script reads Terraform outputs and creates `.env.local` automatically.

```bash
# Upload to S3
aws s3 sync dist/ s3://$(terraform -chdir=../terraform output -raw s3_bucket_name) --delete

# Invalidate CloudFront
aws cloudfront create-invalidation \
  --distribution-id $(terraform -chdir=../terraform output -raw cloudfront_distribution_id) \
  --paths "/*"
```

### 5. Create Admin User

```bash
POOL_ID=$(cd terraform && terraform output -raw cognito_user_pool_id)

aws cognito-idp admin-create-user \
  --user-pool-id $POOL_ID \
  --username thanacpr@amazon.com \
  --user-attributes Name=email,Value=thanacpr@amazon.com Name=email_verified,Value=true \
  --temporary-password "TempPass123" \
  --region ap-southeast-1

aws cognito-idp admin-add-user-to-group \
  --user-pool-id $POOL_ID \
  --username thanacpr@amazon.com \
  --group-name admin \
  --region ap-southeast-1
```

### 6. Verify Deployment

1. Open the CloudFront URL from `terraform output`
2. Log in with admin credentials (change temp password on first login)
3. Navigate to "Upload Matches" and add a test match
4. Verify the match appears in "Match Schedule"

## Environment Variables

After `terraform apply`, get values for frontend `.env.local`:

```bash
cd terraform
terraform output
```

## Updating

### Frontend changes only:
```bash
make deploy-frontend
```

### Infrastructure changes:
```bash
make deploy-infra
```

### Lambda code changes:
```bash
make deploy-infra  # Terraform re-zips and deploys Lambda
```

### After any infra change:
```bash
make fix-cors      # Always re-run after terraform apply
```

### Seed/update channels:
```bash
make seed-channels
```

## Troubleshooting

### "Channel turn-off button not appearing"
- Check that the match `endTime` has passed
- Button appears only within 2 hours after match end
- Verify match status is not `turned_off` or `pending_approval`

### "Approval emails not received"
- Verify SES email identities: `aws ses list-identities --region ap-southeast-1`
- Check SES sending statistics: `aws ses get-send-statistics --region ap-southeast-1`
- Check CloudWatch logs: `/approval-medialive/step-function`

### "MediaLive StopChannel failed"
- Check Lambda has permission to the specific channel ARN
- Verify channel exists: `aws medialive describe-channel --channel-id <ID>`
- Check CloudWatch logs: `/aws/lambda/approval-medialive-stop-channel-prod`

### "CORS errors (OPTIONS returns 500)"
- Run `make fix-cors` — this is required after every `terraform apply`
- Root cause: Terraform deployment overwrites OPTIONS `selection_pattern`
- The `fix-cors.sh` script deletes and recreates all OPTIONS methods correctly

### "Audit log is empty"
- Verify `AUDIT_TABLE` env var is set on Lambda: `aws lambda get-function-configuration --function-name approval-medialive-matches-prod --region ap-southeast-1 | grep AUDIT_TABLE`
- Check CloudWatch logs for DynamoDB write errors
- Records auto-delete after 30 days (TTL)

### "CSV upload not parsing correctly"
- Multi-line quoted headers are supported (e.g. `"Multi-cdn\n(h-huawei...)"`)
- Expected columns: Match, Multi-cdn, Channel, Start time, End time
- Dates must be `M/D/YY H:MM` or `M/D/YYYY H:MM:SS` format
- Channel names map: "Sport 1" → sports1, "Sport 12-4K" → sports12-4K

### "Terraform state lock"
```bash
terraform force-unlock <LOCK_ID>
```

## Destroy (Teardown)

⚠️ **WARNING:** This destroys all infrastructure including data. Make sure to export audit logs if needed.

```bash
# Empty S3 bucket first (required)
aws s3 rm s3://approval-medialive-frontend-prod --recursive

# Destroy infrastructure
cd terraform
terraform destroy -var="environment=prod"
```

## Importing Existing Resources

If Terraform fails with "already exists" errors (e.g. after manual API Gateway changes), import the resource:

```bash
# Example: Import an existing GET method on /approval/{token}
RESOURCE_ID=$(aws apigateway get-resources --rest-api-id 9k6h6dm40i --region ap-southeast-1 \
  --query "items[?path=='/approval/{token}'].id" --output text)

cd terraform
terraform import -var="environment=prod" \
  'module.api_gateway.aws_api_gateway_method.get_approval' \
  "9k6h6dm40i/$RESOURCE_ID/GET"
```
