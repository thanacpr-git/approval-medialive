# MediaLive Channel Approval System — System Design Document

## 1. Overview

This system provides a web-based management interface for controlling AWS Elemental MediaLive channel lifecycles for live soccer broadcasts. Operators can upload match schedules, and after a match ends, initiate a multi-party approval workflow to turn off the corresponding MediaLive channel — reducing unnecessary runtime costs.

**Key Features:**
- Cognito-authenticated web UI (React SPA on S3 + CloudFront)
- Match schedule management (manual entry + CSV bulk upload)
- Time-gated "Turn Off Channel" button (appears 0–2 hours after match end)
- Multi-party email approval workflow via Step Functions
- Automated MediaLive `StopChannel` execution after all approvals
- **Dynamic channel registry** — channels stored in DynamoDB, loaded at runtime
- **Live channel status** — real-time MediaLive state (RUNNING/IDLE/UNKNOWN) on Dashboard
- **Audit Log** — all actions (create, turn-off, approve, reject, stop) stored in DynamoDB with 30-day TTL
- Full audit trail viewable in the web UI (Audit Log page)

---

## 2. Architecture Diagram

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                              INTERNET / USERS                                 │
└───────────────────────────────────┬──────────────────────────────────────────┘
                                    │
                    ┌───────────────▼───────────────┐
                    │       Amazon CloudFront        │
                    │    (HTTPS, caching, SPA)       │
                    └───────────────┬───────────────┘
                                    │
                    ┌───────────────▼───────────────┐
                    │         Amazon S3              │
                    │   (React frontend build)      │
                    └───────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────────┐
│                           AUTHENTICATION                                      │
│                                                                              │
│   ┌─────────────────────┐                                                    │
│   │   Amazon Cognito     │ ◄── User Pool (email/password)                    │
│   │   User Pool          │     Groups: admin, operator                       │
│   │   + Hosted UI        │     OAuth 2.0 / OIDC                             │
│   └─────────────────────┘                                                    │
└──────────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────────┐
│                              API LAYER                                         │
│                                                                              │
│   ┌─────────────────────┐      ┌──────────────────────────────────┐          │
│   │  API Gateway (REST)  │─────▶│  Lambda Functions (Node.js 20)   │          │
│   │  + Cognito Authorizer│      │                                  │          │
│   └─────────────────────┘      │  • matches    — CRUD + /channels │          │
│                                 │  • turnoff    — Start workflow    │          │
│   Routes:                       │  • approval   — Handle callbacks  │          │
│   GET  /matches                 │  • medialive  — StopChannel       │          │
│   POST /matches                 │  • sendEmails — Approval emails   │          │
│   GET  /channels?status=true    └──────────────────────────────────┘          │
│   POST /matches/{id}/turnoff                                                  │
│   POST /approval/{token} (public)                                            │
└──────────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────────┐
│                          DATA & ORCHESTRATION                                 │
│                                                                              │
│   ┌──────────────────────┐  ┌─────────────────────┐  ┌────────────────────┐ │
│   │     DynamoDB          │  │   Step Functions     │  │   Amazon SES       │ │
│   │     (4 tables)        │  │   (Standard)         │  │   (Email)          │ │
│   │ • MatchSchedule       │  │                     │  │                    │ │
│   │ • ApprovalTracking    │  │ Callback pattern:   │  │ • Approval emails  │ │
│   │ • Channels            │  │ waitForTaskToken     │  │ • Confirmations    │ │
│   │ • AuditLog ⭐ NEW     │  │                     │  │                    │ │
│   └──────────────────────┘  └─────────────────────┘  └────────────────────┘ │
│                                    │                                          │
│                                    ▼                                          │
│                         ┌─────────────────────┐                              │
│                         │  AWS MediaLive       │                              │
│                         │  StopChannel API     │                              │
│                         │  DescribeChannel API │                              │
│                         └─────────────────────┘                              │
│                                                                              │
│   ┌────────────────────────────────────────────────────────────────┐         │
│   │  CloudWatch Logs — /approval-medialive/activities              │         │
│   │                  — /approval-medialive/step-function           │         │
│   └────────────────────────────────────────────────────────────────┘         │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Component Details

### 3.1 Frontend (S3 + CloudFront)

| Attribute | Value |
|-----------|-------|
| Framework | React 18 + Vite + TailwindCSS |
| Auth Library | AWS Amplify v6 |
| Hosting | S3 static website + CloudFront CDN |
| Pages | Dashboard, Match Schedule, Upload Matches, Audit Log, Approval |

**Key UI behaviors:**
- "Turn Off Channel" button visible **only** when: `now > matchEndTime` AND `now < matchEndTime + 2 hours` AND status ≠ `turned_off` or `pending_approval`
- Clicking the button shows a **warning alarm dialog** requiring explicit confirmation
- **Dashboard** shows live channel status (RUNNING / IDLE / UNKNOWN) fetched from MediaLive API
- **Upload Matches** supports two modes:
  - **Manual Entry** — form with individual match fields
  - **CSV Upload** — bulk import with editable preview table
- CSV parser handles format: `Match, Multi-cdn, Channel, Start time (GMT+7), End time (GMT+7)`
- Channel names auto-mapped: "Sport 3" → `sports3`

### 3.2 Authentication (Cognito)

| Attribute | Value |
|-----------|-------|
| User Pool | `approval-medialive-prod` |
| Auth Flow | Authorization Code (PKCE) |
| Groups | `admin`, `operator` |
| Token | JWT (ID token in Authorization header) |

### 3.3 API Layer (API Gateway + Lambda)

| Method | Endpoint | Lambda | Auth | Description |
|--------|----------|--------|------|-------------|
| GET | `/matches` | matches | Cognito | List matches (optional `?month=2026-05`) |
| POST | `/matches` | matches | Cognito | Create match(es) — supports `{matches:[...]}` for bulk |
| PUT | `/matches/{id}` | matches | Cognito | Update match |
| DELETE | `/matches/{id}` | matches | Cognito | Delete match |
| GET | `/channels` | matches | Cognito | List channels from DynamoDB |
| GET | `/channels?status=true` | matches | Cognito | List channels + live MediaLive state |
| POST | `/matches/{id}/turnoff` | turnoff | Cognito | Initiate channel turn-off workflow |
| GET | `/audit-log` | matches | Cognito | List audit log entries (optional `?matchId=`) |
| POST | `/approval/{token}` | approval | **None** | Handle approval callback (public — email links) |
| GET | `/approval/{token}` | approval | **None** | Handle approval callback via email link click |

### 3.4 Data Store (DynamoDB)

#### MatchSchedule Table
| Attribute | Type | Key |
|-----------|------|-----|
| matchId | String (UUID) | PK |
| matchMonth | String (YYYY-MM) | GSI-PK (MonthIndex) |
| startTime | String (ISO 8601) | GSI-SK |
| endTime | String (ISO 8601) | — |
| homeTeam | String | — |
| awayTeam | String | — |
| channelArn | String | — |
| channelLabel | String | — |
| cdnProvider | String | — |
| status | String (`scheduled` / `pending_approval` / `turned_off`) | — |
| executionArn | String | — |
| createdAt | String (ISO 8601) | — |

#### ApprovalTracking Table
| Attribute | Type | Key |
|-----------|------|-----|
| approvalToken | String (UUID) | PK |
| matchId | String | GSI-PK (MatchIndex) |
| approverEmail | String | — |
| taskToken | String (Step Functions callback token) | — |
| status | String (`pending` / `approved` / `rejected`) | — |
| respondedAt | String (ISO 8601) | — |
| ttl | Number (epoch + 24h) | TTL attribute |

#### Channels Table ⭐ NEW
| Attribute | Type | Key |
|-----------|------|-----|
| channelLabel | String | PK |
| channelId | String | — |
| arn | String | — |
| class | String | — |
| version | String | — |
| active | Boolean | — |
| createdAt | String (ISO 8601) | — |

**Why DynamoDB for channels?** Channels can be added/removed/updated without redeploying code. The frontend fetches the channel list from the API at page load, and the Dashboard optionally fetches live MediaLive status.

#### AuditLog Table ⭐ NEW
| Attribute | Type | Key |
|-----------|------|-----|
| logId | String (UUID) | PK |
| matchId | String | GSI-PK (MatchIndex) |
| action | String | — |
| user | String | — |
| matchName | String | — |
| channel | String | — |
| details | Map/String | — |
| timestamp | String (ISO 8601) | — |
| ttl | Number (epoch + 30 days) | TTL attribute |

**Actions logged:**
| Action | Triggered By | Description |
|--------|-------------|-------------|
| `MATCH_CREATED` | matches Lambda | Match added (manual or CSV) |
| `MATCH_DELETED` | matches Lambda | Match removed |
| `TURN_OFF_INITIATED` | turnoff Lambda | User requested channel turn-off |
| `APPROVAL_EMAIL_SENT` | sendApprovalEmails | Approval emails dispatched via SES |
| `APPROVAL_RECEIVED` | approval Lambda | Approver clicked Approve |
| `APPROVAL_REJECTED` | approval Lambda | Approver clicked Reject |
| `CHANNEL_STOPPED` | medialive Lambda | MediaLive StopChannel succeeded |
| `CHANNEL_STOP_FAILED` | medialive Lambda | MediaLive StopChannel failed |

### 3.5 Workflow Orchestration (Step Functions)

**State Machine: `approval-medialive-channel-turnoff-prod`**

```
LogInitiation → SendApprovalEmails → WaitForApprovals → CheckAllApproved
                                                              │
                              ┌────────────────────────────────┤
                              ▼                                ▼
                     StopMediaLiveChannel              HandleRejection
                              │                               │
                              ▼                               ▼
                     LogCompletion → Success           Rejected (Fail)
```

**Approval Pattern:** Uses `waitForTaskToken` — each approver receives a unique token in their email. The Step Function pauses until `SendTaskSuccess` (approve) or `SendTaskFailure` (reject) is called via the approval API endpoint.

**Timeout:** 24 hours — if no response, the workflow fails with `ApprovalTimeout`.

### 3.6 Channel Status Display

The Dashboard fetches live channel status via `GET /channels?status=true`:

| State | Display | Meaning |
|-------|---------|---------|
| `RUNNING` | 🟢 green badge | Channel is actively broadcasting |
| `IDLE` | ⚪ gray badge | Channel is stopped |
| `STARTING` | 🔵 blue badge | Channel is starting up |
| `STOPPING` | 🟡 yellow badge | Channel is shutting down |
| `UNKNOWN` | ❓ gray badge | ARN missing or API call failed |

---

## 4. Workflow: End-to-End Channel Turn-Off

```
 1. [User]      Clicks "Turn Off Channel" button on the match card
 2. [Frontend]  Shows warning alarm dialog with match/channel details
 3. [User]      Confirms the action
 4. [Frontend]  POST /matches/{id}/turnoff → API Gateway
 5. [Lambda]    Validates match is eligible (ended ≤2h ago, not already off)
 6. [Lambda]    Starts Step Function execution with match details
 7. [Lambda]    Updates match status → "pending_approval"
 8. [StepFn]    Invokes SendApprovalEmails Lambda with task token
 9. [Lambda]    Stores approval records in DynamoDB (with task tokens)
10. [Lambda]    Sends approval emails via SES (Approve/Reject links)
11. [StepFn]    PAUSES — waiting for callback (waitForTaskToken)
12. [Approver]  Clicks Approve link in email
13. [API GW]    POST /approval/{token} → Approval Lambda
14. [Lambda]    Calls SendTaskSuccess with the stored task token
15. [StepFn]    RESUMES — checks all approved
16. [StepFn]    Invokes StopChannel Lambda
17. [Lambda]    Calls medialive:StopChannel for the specific channel
18. [Lambda]    Updates match status → "turned_off"
19. [Lambda]    Sends confirmation email via SES
20. [StepFn]    Logs completion → SUCCESS
```

---

## 5. Security

| Layer | Control |
|-------|---------|
| Frontend | Cognito authentication required (no anonymous access) |
| API | JWT authorizer on all endpoints except `/approval/{token}` |
| Approval endpoint | Token-based (UUID, 24h TTL, single-use) |
| Lambda IAM | Least-privilege: scoped to specific table ARNs and channel ARNs |
| MediaLive | IAM restricted to `StopChannel` + `DescribeChannel` only |
| S3 | Private bucket, CloudFront OAC (Origin Access Control) |
| DynamoDB | Approval tokens have 24h TTL auto-deletion |
| Audit Log | All actions logged to DynamoDB with 30-day TTL auto-deletion |
| Logging | Lambda execution logs in CloudWatch |
| Tags | All resources tagged `Project = "approval-medialive"` |

---

## 6. AWS Services Used

| Service | Purpose | Region |
|---------|---------|--------|
| S3 | Frontend static hosting | ap-southeast-1 |
| CloudFront | CDN, HTTPS, SPA routing | Global |
| Cognito | User authentication & authorization | ap-southeast-1 |
| API Gateway | REST API with Cognito authorizer + CORS | ap-southeast-1 |
| Lambda | Business logic (Node.js 20.x, 5 functions) | ap-southeast-1 |
| DynamoDB | Match schedules, approval tracking, channel registry, audit log | ap-southeast-1 |
| Step Functions | Approval workflow orchestration (callback pattern) | ap-southeast-1 |
| SES | Approval & confirmation emails | ap-southeast-1 |
| MediaLive | Live channel management (StopChannel, DescribeChannel) | ap-southeast-1 |
| CloudWatch | Lambda execution logs | ap-southeast-1 |
| IAM | Least-privilege roles & policies | Global |

---

## 7. Infrastructure as Code (Terraform)

```
terraform/
├── main.tf                    # Root module — wires all modules + circular dep fix
├── variables.tf               # Input variables (region, project, emails)
├── outputs.tf                 # Exported values (URLs, IDs, ARNs)
├── terraform.tfvars           # Production values
└── modules/
    ├── cognito/               # User Pool, App Client, Domain, Groups
    ├── dynamodb/              # 4 tables: matches, approvals, channels, auditlog
    ├── lambda/                # 5 functions + IAM role + 4 policies
    ├── step-function/         # State machine + IAM + logging
    ├── api-gateway/           # REST API + 5 routes + CORS + authorizer
    └── s3-cloudfront/         # Bucket + OAC + Distribution + Policy
```

**Tagging:** All resources tagged with `Project = "approval-medialive"`.

**State:** Stored in S3 (`approval-medialive-tfstate`) with DynamoDB locking.

**Circular dependency handling:** Lambda and Step Function have a circular reference (Lambda needs SFN ARN, SFN needs Lambda ARNs). Resolved via:
- Lambda deployed first with placeholder `STATE_MACHINE_ARN`
- Step Function deployed referencing Lambda ARNs
- `null_resource` + `local-exec` updates Lambda env var with real SFN ARN
- Separate `aws_iam_role_policy` in main.tf grants SFN access to Lambda role

---

## 8. CSV Upload Format

The Upload Matches page accepts CSV files with these columns:

```csv
Match,Multi-cdn,Channel,Start time ( GMT+7 ),End time ( GMT+7 )
Arsenal vs Fulham,"CF, Akamai",Sport 1,5/2/26 23:30,5/3/26 01:30
Manchester United vs Liverpool,"CF, Akamai",Sport 2,5/3/26 21:30,5/3/26 23:30
```

**Parser features:**
- Handles quoted fields with commas (e.g. `"CF, Akamai"`)
- Handles multi-line quoted headers (e.g. `"Multi-cdn\n(h- huawei...)"`)
- Parses date formats: `M/D/YY H:MM` and `M/D/YYYY H:MM:SS`
- Auto-maps channel names: "Sport 3" → `sports3`, "Sport 12-4K" → `sports12-4K`
- Splits match names by "vs" into home/away teams
- Shows editable preview table before saving
- Displays validation warnings for unparseable rows

---

## 9. Cost Estimate (Monthly)

| Service | Cost | Notes |
|---------|------|-------|
| S3 | ~$0.00 | <5MB static files |
| CloudFront | ~$0.07 | ~3000 requests, APAC |
| Cognito | $0.00 | Free tier (50K MAU) |
| API Gateway | ~$0.00 | ~500 requests |
| Lambda | $0.00 | Free tier (1M requests) |
| DynamoDB | ~$0.00 | On-demand, minimal usage |
| Step Functions | ~$0.00 | ~80 transitions |
| SES | ~$0.00 | ~30 emails |
| CloudWatch | ~$0.01 | 5MB logs |
| **Total** | **$0.08 – $2.00** | Depends on free tier |

> ⚠️ MediaLive channel **runtime** costs are NOT included (~$1.83/hr per standard channel).

---

## 10. Deployment

### Prerequisites
- AWS CLI configured for target account
- Terraform >= 1.5
- Node.js >= 20
- SES email verified for sender/recipients

### Deploy Commands
```bash
make deploy           # Full deployment
make deploy-infra     # Infrastructure only
make deploy-frontend  # Frontend only
make seed-channels    # Populate channel registry
make create-user      # Create Cognito admin user
```

### Multi-Account Deployment

To deploy to a different AWS account (e.g. Mono's `185906222397`):

1. Update `terraform/modules/lambda/main.tf` — change MediaLive IAM resource ARN to target account
2. Update `terraform/terraform.tfvars` — change `approval_emails` and `sender_email`
3. Update `scripts/seed-channels.js` — ensure channel ARNs match the target account
4. Switch AWS credentials and run `make deploy`

---

## 11. Project Files

```
approval-medialive/
├── .gitignore
├── README.md                          # Quick start & commands
├── SYSTEM-DESIGN.md                   # This document
├── DEPLOYMENT.md                      # Step-by-step deployment guide
├── deploy.sh                          # Automated deployment script
├── Makefile                           # Shortcut commands
├── frontend/
│   ├── .env.example
│   ├── index.html
│   ├── package.json
│   ├── vite.config.js
│   ├── tailwind.config.js
│   ├── postcss.config.js
│   └── src/
│       ├── App.jsx                    # Routes + Cognito Authenticator
│       ├── aws-config.js             # Amplify config (reads from env)
│       ├── main.jsx
│       ├── index.css
│       ├── components/
│       │   ├── ConfirmDialog.jsx      # ⚠️ Alarm warning dialog
│       │   ├── Layout.jsx            # Sidebar navigation
│       │   └── MatchCard.jsx         # Match card + Turn Off button
│       ├── pages/
│       │   ├── Dashboard.jsx         # Stats + live channel status table
│       │   ├── MatchSchedule.jsx     # Match list with turn-off controls
│       │   ├── UploadMatch.jsx       # Manual + CSV upload modes
│       │   ├── AuditLog.jsx          # Activity log viewer
│       │   └── ApprovalPage.jsx      # Email approval callback UI
│       ├── services/
│       │   └── api.js                # API client with JWT auth
│       └── hooks/
│           └── useChannels.js        # Fetch channels from DynamoDB
├── lambda/
│   ├── matches/index.js              # CRUD + /channels + MediaLive status
│   ├── matches/auditLogger.js        # Audit logging utility (copy)
│   ├── turnoff/index.js              # Start Step Function
│   ├── turnoff/auditLogger.js        # Audit logging utility (copy)
│   ├── approval/index.js             # Handle email callbacks
│   ├── approval/auditLogger.js       # Audit logging utility (copy)
│   ├── medialive/index.js            # StopChannel command
│   ├── medialive/auditLogger.js      # Audit logging utility (copy)
│   └── shared/
│       ├── sendApprovalEmails.js     # SES email sender
│       └── auditLogger.js           # Shared audit logger (source of truth)
├── scripts/
│   ├── package.json
│   ├── seed-channels.js             # Seed/list channel registry
│   ├── fix-cors.sh                  # Fix CORS on all API Gateway routes
│   └── cleanup.sh                   # Stop executions + delete all data
├── step-function/
│   └── definition.asl.json           # State machine definition
└── terraform/
    ├── main.tf                        # Root module
    ├── variables.tf
    ├── outputs.tf
    ├── terraform.tfvars
    ├── terraform.tfvars.example
    └── modules/
        ├── api-gateway/              # REST API + /channels + CORS
        ├── cognito/                  # User Pool + Groups
        ├── dynamodb/                 # 3 tables
        ├── lambda/                   # 5 functions + IAM
        ├── s3-cloudfront/            # Static hosting
        └── step-function/            # Workflow orchestration
```
