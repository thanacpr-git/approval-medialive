# MediaLive Channel Approval — Makefile
# ============================================

.PHONY: help install dev build deploy deploy-frontend deploy-infra destroy create-user verify-ses clean

SHELL := /bin/bash
AWS_REGION := ap-southeast-1
ENVIRONMENT := prod

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

# ---- Local Development ----

install: ## Install all dependencies
	@echo "Installing frontend dependencies..."
	cd frontend && npm install
	@echo "Installing Lambda dependencies..."
	@for dir in lambda/*/; do \
		if [ -f "$$dir/package.json" ]; then \
			echo "  Installing: $$dir"; \
			cd $$dir && npm install --production && cd ../..; \
		fi; \
	done
	@echo "✅ All dependencies installed"

dev: ## Run frontend locally (http://localhost:3000)
	cd frontend && npm run dev

build: ## Build frontend for production
	cd frontend && npm run build

# ---- Deployment ----

deploy: ## Full deployment (infra + frontend + user)
	chmod +x deploy.sh && ./deploy.sh $(ENVIRONMENT)

deploy-frontend: ## Deploy frontend only (rebuild + S3 sync + CloudFront invalidation)
	chmod +x deploy.sh && ./deploy.sh --frontend-only

deploy-infra: ## Deploy infrastructure only (Terraform)
	chmod +x deploy.sh && ./deploy.sh --infra-only
	@echo "Applying CORS fix..."
	chmod +x scripts/fix-cors.sh && scripts/fix-cors.sh

destroy: ## Destroy all infrastructure ⚠️
	chmod +x deploy.sh && ./deploy.sh --destroy

# ---- Utilities ----

create-user: ## Create a new Cognito admin user
	chmod +x deploy.sh && ./deploy.sh --create-user

verify-ses: ## Verify SES email identities
	chmod +x deploy.sh && ./deploy.sh --verify-ses

fix-cors: ## Fix CORS on all API Gateway routes (run after terraform apply)
	chmod +x scripts/fix-cors.sh && scripts/fix-cors.sh

seed-channels: ## Seed channels to DynamoDB (initial setup)
	cd scripts && npm install --silent && node seed-channels.js

list-channels: ## List channels from DynamoDB
	cd scripts && node seed-channels.js --list

cleanup: ## Stop running Step Functions + delete all matches + approvals
	chmod +x scripts/cleanup.sh && scripts/cleanup.sh

cleanup-force: ## Same as cleanup but no prompts
	chmod +x scripts/cleanup.sh && scripts/cleanup.sh --force

clean: ## Clean build artifacts
	rm -rf frontend/dist
	rm -rf frontend/node_modules
	rm -rf lambda/*/node_modules
	rm -rf terraform/modules/lambda/builds
	rm -f terraform/tfplan
	@echo "✅ Cleaned"

# ---- Terraform ----

tf-init: ## Initialize Terraform
	cd terraform && terraform init

tf-plan: ## Terraform plan (dry run)
	cd terraform && terraform plan -var="environment=$(ENVIRONMENT)"

tf-apply: ## Terraform apply
	cd terraform && terraform apply -var="environment=$(ENVIRONMENT)"

tf-output: ## Show Terraform outputs
	cd terraform && terraform output

# ---- Info ----

status: ## Show deployment status
	@echo "=== Terraform State ==="
	@cd terraform && terraform output 2>/dev/null || echo "Not deployed yet"
	@echo ""
	@echo "=== S3 Bucket Contents ==="
	@BUCKET=$$(cd terraform && terraform output -raw s3_bucket_name 2>/dev/null) && \
		aws s3 ls "s3://$$BUCKET" --summarize 2>/dev/null || echo "Not deployed yet"
