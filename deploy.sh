#!/bin/bash
set -euo pipefail

# ============================================================
# MediaLive Channel Approval — Deployment Script
# ============================================================
# Usage:
#   ./deploy.sh [environment]      Deploy everything (default: prod)
#   ./deploy.sh --frontend-only    Rebuild and deploy frontend only
#   ./deploy.sh --infra-only       Run terraform apply only
#   ./deploy.sh --destroy          Destroy all infrastructure
# ============================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AWS_REGION="ap-southeast-1"
PROJECT_NAME="approval-medialive"

# Set environment — only use $1 if it's not a flag
if [[ "${1:-}" != --* ]] && [[ -n "${1:-}" ]]; then
  ENVIRONMENT="$1"
else
  ENVIRONMENT="prod"
fi

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info()  { echo -e "${BLUE}[INFO]${NC} $1"; }
log_ok()    { echo -e "${GREEN}[OK]${NC} $1"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# ---- Pre-flight Checks ----
check_prerequisites() {
  log_info "Checking prerequisites..."
  
  if ! command -v aws &> /dev/null; then
    log_error "AWS CLI not found. Install: https://aws.amazon.com/cli/"
    exit 1
  fi

  if ! command -v terraform &> /dev/null; then
    log_error "Terraform not found. Install: https://developer.hashicorp.com/terraform/install"
    exit 1
  fi

  if ! command -v node &> /dev/null; then
    log_error "Node.js not found. Install: https://nodejs.org/"
    exit 1
  fi

  # Check AWS credentials
  if ! aws sts get-caller-identity &> /dev/null; then
    log_error "AWS credentials not configured. Run: aws configure"
    exit 1
  fi

  local account_id=$(aws sts get-caller-identity --query Account --output text)
  log_ok "AWS Account: $account_id"
  log_ok "Region: $AWS_REGION"
  log_ok "Environment: $ENVIRONMENT"
}

# ---- Create S3 Backend for Terraform State ----
setup_terraform_backend() {
  local bucket_name="${PROJECT_NAME}-tfstate"
  local table_name="terraform-locks"

  log_info "Setting up Terraform backend..."

  # Create S3 bucket for state (ignore if exists)
  if ! aws s3api head-bucket --bucket "$bucket_name" 2>/dev/null; then
    aws s3api create-bucket \
      --bucket "$bucket_name" \
      --region "$AWS_REGION" \
      --create-bucket-configuration LocationConstraint="$AWS_REGION"
    
    aws s3api put-bucket-versioning \
      --bucket "$bucket_name" \
      --versioning-configuration Status=Enabled

    aws s3api put-bucket-encryption \
      --bucket "$bucket_name" \
      --server-side-encryption-configuration '{
        "Rules": [{"ApplyServerSideEncryptionByDefault": {"SSEAlgorithm": "AES256"}}]
      }'
    
    log_ok "Created S3 bucket: $bucket_name"
  else
    log_ok "S3 state bucket exists: $bucket_name"
  fi

  # Create DynamoDB table for locks (ignore if exists)
  if ! aws dynamodb describe-table --table-name "$table_name" --region "$AWS_REGION" &>/dev/null; then
    aws dynamodb create-table \
      --table-name "$table_name" \
      --attribute-definitions AttributeName=LockID,AttributeType=S \
      --key-schema AttributeName=LockID,KeyType=HASH \
      --billing-mode PAY_PER_REQUEST \
      --region "$AWS_REGION"
    
    log_ok "Created DynamoDB lock table: $table_name"
  else
    log_ok "DynamoDB lock table exists: $table_name"
  fi
}

# ---- Install Lambda Dependencies ----
install_lambda_deps() {
  log_info "Installing Lambda dependencies..."
  
  for func_dir in "$SCRIPT_DIR"/lambda/*/; do
    if [ -f "$func_dir/package.json" ]; then
      log_info "  Installing: $(basename $func_dir)"
      (cd "$func_dir" && npm install --production --silent)
    fi
  done
  
  log_ok "Lambda dependencies installed"
}

# ---- Deploy Infrastructure (Terraform) ----
deploy_infrastructure() {
  log_info "Deploying infrastructure with Terraform..."
  
  cd "$SCRIPT_DIR/terraform"
  
  terraform init -upgrade
  
  terraform plan -out=tfplan \
    -var="environment=$ENVIRONMENT"
  
  echo ""
  log_warn "Review the plan above. Continue? (yes/no)"
  read -r confirm
  
  if [ "$confirm" != "yes" ]; then
    log_warn "Deployment cancelled."
    exit 0
  fi

  terraform apply tfplan
  rm -f tfplan

  # Capture outputs
  export CF_DISTRIBUTION_ID=$(terraform output -raw cloudfront_distribution_id 2>/dev/null || echo "")
  export CF_URL=$(terraform output -raw cloudfront_distribution_url 2>/dev/null || echo "")
  export API_URL=$(terraform output -raw api_gateway_url 2>/dev/null || echo "")
  export COGNITO_POOL_ID=$(terraform output -raw cognito_user_pool_id 2>/dev/null || echo "")
  export COGNITO_CLIENT_ID=$(terraform output -raw cognito_client_id 2>/dev/null || echo "")
  export COGNITO_DOMAIN=$(terraform output -raw cognito_domain 2>/dev/null || echo "")
  export S3_BUCKET=$(terraform output -raw s3_bucket_name 2>/dev/null || echo "")

  log_ok "Infrastructure deployed!"
  
  cd "$SCRIPT_DIR"
}

# ---- Build Frontend ----
build_frontend() {
  log_info "Building frontend..."
  
  # Always fetch from Terraform outputs (works for both full and frontend-only deploys)
  cd "$SCRIPT_DIR/terraform"
  COGNITO_POOL_ID=$(terraform output -raw cognito_user_pool_id 2>/dev/null || echo "${COGNITO_POOL_ID:-ap-southeast-1_PLACEHOLDER}")
  COGNITO_CLIENT_ID=$(terraform output -raw cognito_client_id 2>/dev/null || echo "${COGNITO_CLIENT_ID:-placeholder}")
  COGNITO_DOMAIN=$(terraform output -raw cognito_domain 2>/dev/null || echo "${COGNITO_DOMAIN:-placeholder.auth.ap-southeast-1.amazoncognito.com}")
  API_URL=$(terraform output -raw api_gateway_url 2>/dev/null || echo "${API_URL:-http://localhost:4000/api}")
  CF_URL=$(terraform output -raw cloudfront_distribution_url 2>/dev/null || echo "${CF_URL:-http://localhost:3000}")

  cd "$SCRIPT_DIR/frontend"
  cat > .env.local <<EOF
VITE_COGNITO_USER_POOL_ID=${COGNITO_POOL_ID}
VITE_COGNITO_CLIENT_ID=${COGNITO_CLIENT_ID}
VITE_COGNITO_DOMAIN=${COGNITO_DOMAIN}
VITE_API_ENDPOINT=${API_URL}
VITE_REDIRECT_SIGN_IN=${CF_URL}/
VITE_REDIRECT_SIGN_OUT=${CF_URL}/
EOF

  log_info "Frontend .env.local:"
  cat .env.local

  npm install --silent
  npm run build
  
  log_ok "Frontend built: frontend/dist/"
  
  cd "$SCRIPT_DIR"
}

# ---- Deploy Frontend to S3 ----
deploy_frontend() {
  log_info "Deploying frontend to S3..."

  if [ -z "${S3_BUCKET:-}" ]; then
    # Try to get from Terraform
    cd "$SCRIPT_DIR/terraform"
    S3_BUCKET=$(terraform output -raw s3_bucket_name 2>/dev/null || echo "")
    CF_DISTRIBUTION_ID=$(terraform output -raw cloudfront_distribution_id 2>/dev/null || echo "")
    cd "$SCRIPT_DIR"
  fi

  if [ -z "$S3_BUCKET" ]; then
    log_error "S3 bucket name not found. Run infrastructure deploy first."
    exit 1
  fi

  # Sync dist to S3
  aws s3 sync "$SCRIPT_DIR/frontend/dist" "s3://$S3_BUCKET" \
    --delete \
    --cache-control "public, max-age=31536000, immutable" \
    --exclude "index.html" \
    --exclude "*.json"

  # Upload index.html with no-cache
  aws s3 cp "$SCRIPT_DIR/frontend/dist/index.html" "s3://$S3_BUCKET/index.html" \
    --cache-control "no-cache, no-store, must-revalidate"

  # Invalidate CloudFront cache
  if [ -n "${CF_DISTRIBUTION_ID:-}" ]; then
    log_info "Invalidating CloudFront cache..."
    aws cloudfront create-invalidation \
      --distribution-id "$CF_DISTRIBUTION_ID" \
      --paths "/*" > /dev/null
    log_ok "CloudFront cache invalidated"
  fi

  log_ok "Frontend deployed to: ${CF_URL:-s3://$S3_BUCKET}"
}

# ---- Verify SES Email Identities ----
verify_ses_emails() {
  log_info "Verifying SES email identities..."
  
  local emails=(
    "thanacpr@amazon.com"
  )

  for email in "${emails[@]}"; do
    local status=$(aws ses get-identity-verification-attributes \
      --identities "$email" \
      --region "$AWS_REGION" \
      --query "VerificationAttributes.\"$email\".VerificationStatus" \
      --output text 2>/dev/null || echo "NOT_FOUND")

    if [ "$status" != "Success" ]; then
      log_warn "  $email — not verified, sending verification..."
      aws ses verify-email-identity --email-address "$email" --region "$AWS_REGION"
    else
      log_ok "  $email — verified"
    fi
  done
  
  log_warn "Check email inboxes and click verification links for unverified addresses."
}

# ---- Create Initial Cognito User ----
create_admin_user() {
  log_info "Creating initial admin user..."

  if [ -z "${COGNITO_POOL_ID:-}" ]; then
    cd "$SCRIPT_DIR/terraform"
    COGNITO_POOL_ID=$(terraform output -raw cognito_user_pool_id 2>/dev/null || echo "")
    cd "$SCRIPT_DIR"
  fi

  if [ -z "$COGNITO_POOL_ID" ]; then
    log_error "Cognito User Pool ID not found."
    return
  fi

  echo "Enter admin email:"
  read -r admin_email

  echo "Enter temporary password (min 8 chars, uppercase + lowercase + number):"
  read -rs admin_password
  echo ""

  aws cognito-idp admin-create-user \
    --user-pool-id "$COGNITO_POOL_ID" \
    --username "$admin_email" \
    --user-attributes Name=email,Value="$admin_email" Name=email_verified,Value=true \
    --temporary-password "$admin_password" \
    --region "$AWS_REGION"

  aws cognito-idp admin-add-user-to-group \
    --user-pool-id "$COGNITO_POOL_ID" \
    --username "$admin_email" \
    --group-name "admin" \
    --region "$AWS_REGION"

  log_ok "Admin user created: $admin_email (temp password — must change on first login)"
}

# ---- Print Summary ----
print_summary() {
  echo ""
  echo "============================================================"
  echo -e "${GREEN} ✅ DEPLOYMENT COMPLETE${NC}"
  echo "============================================================"
  echo ""
  echo "  Frontend URL:    ${CF_URL:-N/A}"
  echo "  API Endpoint:    ${API_URL:-N/A}"
  echo "  Cognito Pool:    ${COGNITO_POOL_ID:-N/A}"
  echo "  Cognito Client:  ${COGNITO_CLIENT_ID:-N/A}"
  echo "  S3 Bucket:       ${S3_BUCKET:-N/A}"
  echo ""
  echo "  Next Steps:"
  echo "  1. Verify SES email addresses (check inboxes)"
  echo "  2. Log in with admin credentials at ${CF_URL:-the frontend URL}"
  echo "  3. Upload your match schedule"
  echo "  4. Channels will show 'Turn Off' button 2hrs after match ends"
  echo ""
  echo "============================================================"
}

# ---- Main ----
main() {
  echo ""
  echo "============================================================"
  echo "  ⚽ MediaLive Channel Approval — Deployment"
  echo "============================================================"
  echo ""

  case "${1:-full}" in
    --frontend-only)
      check_prerequisites
      build_frontend
      deploy_frontend
      ;;
    --infra-only)
      check_prerequisites
      setup_terraform_backend
      install_lambda_deps
      deploy_infrastructure
      ;;
    --destroy)
      check_prerequisites
      cd "$SCRIPT_DIR/terraform"
      terraform destroy -var="environment=$ENVIRONMENT"
      ;;
    --create-user)
      check_prerequisites
      create_admin_user
      ;;
    --verify-ses)
      check_prerequisites
      verify_ses_emails
      ;;
    *)
      check_prerequisites
      setup_terraform_backend
      install_lambda_deps
      deploy_infrastructure
      verify_ses_emails
      build_frontend
      deploy_frontend
      create_admin_user
      print_summary
      ;;
  esac
}

main "$@"
