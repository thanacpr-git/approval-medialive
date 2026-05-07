# MediaLive Channel Approval System

Web-based management interface for controlling AWS Elemental MediaLive channel lifecycles for live soccer broadcasts with multi-party approval workflows.

## Architecture

```
┌─────────────┐    ┌──────────────┐    ┌─────────────────┐    ┌─────────────┐
│  CloudFront │───▶│  S3 (React)  │    │  API Gateway    │───▶│   Lambda    │
│  + Cognito  │    │  Frontend    │───▶│  + Authorizer   │    │ (5 functions)│
└─────────────┘    └──────────────┘    └─────────────────┘    └─────────────┘
                                                                     │
                                              ┌──────────────────────┼──────────┐
                                              ▼                      ▼          ▼
                                       ┌────────────┐     ┌──────────────┐ ┌────────┐
                                       │  DynamoDB   │     │Step Functions│ │  SES   │
                                       │ (4 tables)  │     │  (approval)  │ │(email) │
                                       └────────────┘     └──────────────┘ └────────┘
                                                                  │
                                                                  ▼
                                                          ┌──────────────┐
                                                          │  MediaLive   │
                                                          │ StopChannel  │
                                                          └──────────────┘
```

## Project Structure

```
approval-medialive/
├── frontend/                  # React SPA (Vite + TailwindCSS)
│   ├── src/
│   │   ├── components/       # MatchCard, ConfirmDialog, Layout
│   │   ├── pages/            # Dashboard, MatchSchedule, Upload, Audit, Approval
│   │   ├── services/         # API client with Cognito auth
│   │   └── hooks/            # useChannels (loads from DynamoDB)
│   └── public/
├── lambda/                    # Lambda functions (Node.js 20.x) + audit logging
│   ├── shared/               # Shared utilities (sendApprovalEmails, auditLogger)
│   ├── matches/              # CRUD + /channels with live MediaLive status
│   ├── turnoff/              # Initiate turn-off workflow
│   ├── approval/             # Handle approval callbacks
│   ├── medialive/            # Stop MediaLive channels
├── scripts/                   # Admin scripts
│   ├── seed-channels.js      # Seed/list channels in DynamoDB
│   ├── fix-cors.sh           # Fix CORS on all API Gateway routes
│   └── cleanup.sh            # Stop Step Functions + delete all matches/approvals
├── step-function/            # Step Function ASL definition
├── terraform/                # Infrastructure as Code
│   ├── modules/
│   │   ├── cognito/          # User Pool, App Client, Groups
│   │   ├── api-gateway/      # REST API + routes + CORS
│   │   ├── lambda/           # 5 functions + IAM policies
│   │   ├── step-function/    # State machine + logging
│   │   ├── s3-cloudfront/    # Static hosting + CDN
│   │   └── dynamodb/         # 4 tables (matches, approvals, channels, auditlog)
│   ├── main.tf
│   ├── variables.tf
│   ├── outputs.tf
│   └── terraform.tfvars
├── deploy.sh                  # Automated deployment script
├── Makefile                   # Shortcut commands
├── README.md                  # This file
├── SYSTEM-DESIGN.md           # Full system design document
└── DEPLOYMENT.md              # Step-by-step deployment guide
```

## Quick Start

### Prerequisites
- Node.js 20+
- AWS CLI configured
- Terraform 1.5+

### Deploy (Full)
```bash
make deploy
```

### Deploy (Step by Step)
```bash
make install           # Install all dependencies
make deploy-infra      # Terraform apply (creates AWS resources)
make seed-channels     # Populate channels table in DynamoDB
make deploy-frontend   # Build React + upload to S3 + invalidate CloudFront
make create-user       # Create Cognito admin user
```

### Local Development
```bash
cd frontend
npm install
npm run dev            # http://localhost:3000
```

## Key Commands

| Command | Description |
|---------|-------------|
| `make deploy` | Full deployment (infra + frontend + user) |
| `make deploy-infra` | Terraform apply only |
| `make deploy-frontend` | Rebuild frontend + S3 sync + CloudFront invalidation |
| `make seed-channels` | Populate channels DynamoDB table |
| `make list-channels` | List channels from DynamoDB |
| `make create-user` | Create Cognito admin user |
| `make fix-cors` | Fix CORS on all API Gateway routes |
| `make cleanup-force` | Stop Step Functions + delete all matches/approvals |
| `make verify-ses` | Verify SES email identities |
| `make clean` | Remove build artifacts |
| `make destroy` | Destroy all infrastructure ⚠️ |

## Channel Management

Channels are stored in DynamoDB (`approval-medialive-channels-{env}`) and loaded dynamically. No redeployment needed to add/remove/change channels.

**Seed all channels:**
```bash
make seed-channels
```

**Add/update a single channel:**
```bash
aws dynamodb put-item --table-name approval-medialive-channels-prod --region ap-southeast-1 --item '{
  "channelLabel":{"S":"sports1"},
  "channelId":{"S":"3836701"},
  "arn":{"S":"arn:aws:medialive:ap-southeast-1:185906222397:channel:3836701"},
  "class":{"S":"standard"},
  "version":{"S":"paddlefish-build-771966"},
  "active":{"BOOL":true},
  "createdAt":{"S":"2026-05-06T00:00:00Z"}
}'
```

## Workflow

1. User uploads match schedule (manual or CSV)
2. After match ends, "Turn Off Channel" button appears (visible for 2 hours)
3. User clicks button → confirmation alarm dialog
4. On confirm → Lambda starts Step Function
5. Step Function sends approval emails (SES) to designated recipients
6. All parties approve → Lambda calls `medialive:StopChannel`
7. Confirmation email sent to all parties
8. All activities logged in DynamoDB Audit Log (30-day TTL)

All actions throughout the workflow are automatically recorded in the Audit Log table with 30-day retention.

## Configuration

Edit `terraform/terraform.tfvars`:
```hcl
aws_region      = "ap-southeast-1"
project_name    = "approval-medialive"
environment     = "prod"
sender_email    = "xxx@amazon.com"
approval_emails = "xxx@amazon.com"
```

## Deploying to a Different AWS Account

1. Update IAM MediaLive resource ARN in `terraform/modules/lambda/main.tf`
2. Switch AWS credentials (`aws configure` or `AWS_PROFILE`)
3. Update `terraform.tfvars` with correct emails
4. Run `make deploy`
5. Run `make seed-channels` (update `scripts/seed-channels.js` with correct ARNs if needed)

## Cost Estimate

| With Free Tier | Without Free Tier | At Scale (50 matches/mo) |
|---------------|-------------------|--------------------------|
| ~$0.50/month | ~$2.00/month | <$5.00/month |

> Note: MediaLive channel runtime costs NOT included (already running for broadcasts).
