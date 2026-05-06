// Lambda: Send Approval Emails
// Called by Step Functions to send approval request emails

const { SESClient, SendEmailCommand } = require('@aws-sdk/client-ses');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand } = require('@aws-sdk/lib-dynamodb');
const { randomUUID } = require('crypto');
const { writeAuditLog } = require('./auditLogger');

const ses = new SESClient({ region: 'ap-southeast-1' });
const ddbClient = new DynamoDBClient({ region: 'ap-southeast-1' });
const ddb = DynamoDBDocumentClient.from(ddbClient);

const APPROVAL_TABLE = process.env.APPROVAL_TABLE || 'ApprovalTracking';
const SENDER_EMAIL = process.env.SENDER_EMAIL || 'noreply@example.com';
const APP_URL = process.env.APP_URL || 'https://your-app.cloudfront.net';

exports.handler = async (event) => {
  const { matchId, matchName, channelArn, channelLabel, approvalEmails, taskToken, initiatedBy } = event;

  const results = [];

  for (const email of approvalEmails) {
    try {
      // 1. Generate unique approval token for this approver
      const approvalToken = randomUUID();

      // 2. Store approval record in DynamoDB
      await ddb.send(new PutCommand({
        TableName: APPROVAL_TABLE,
        Item: {
          approvalToken,
          executionId: event.executionId || 'unknown',
          approverEmail: email,
          matchId,
          taskToken, // Step Functions callback token
          status: 'pending',
          createdAt: new Date().toISOString(),
          ttl: Math.floor(Date.now() / 1000) + (24 * 60 * 60), // 24 hour TTL
        },
      }));

      // 3. Build approval URLs
      const approveUrl = `${APP_URL}/approval/${approvalToken}?action=approve`;
      const rejectUrl = `${APP_URL}/approval/${approvalToken}?action=reject`;

      // 4. Send email
      const emailBody = `
Channel Turn-Off Approval Request
===================================

A request has been made to turn off a MediaLive channel:

Match: ${matchName}
Channel: ${channelLabel}
Channel ARN: ${channelArn}
Requested By: ${initiatedBy}
Requested At: ${new Date().toISOString()}

Please review and approve/reject this request:

✅ APPROVE: ${approveUrl}
❌ REJECT: ${rejectUrl}

This link will expire in 24 hours.
All parties must approve before the channel is turned off.
      `.trim();

      await ses.send(new SendEmailCommand({
        Source: SENDER_EMAIL,
        Destination: { ToAddresses: [email] },
        Message: {
          Subject: { Data: `🔴 Approval Required: Turn Off ${channelLabel} - ${matchName}` },
          Body: { Text: { Data: emailBody } },
        },
      }));

      results.push({ email, status: 'sent', approvalToken });

      await writeAuditLog('APPROVAL_EMAIL_SENT', {
        user: 'system',
        matchId,
        matchName,
        channel: channelLabel,
        message: `Approval email sent to ${email}`,
      });

      console.log(JSON.stringify({
        action: 'APPROVAL_EMAIL_SENT',
        matchId,
        recipient: email,
        approvalToken,
        timestamp: new Date().toISOString(),
      }));

    } catch (error) {
      console.error(`Failed to send approval email to ${email}:`, error);
      results.push({ email, status: 'failed', error: error.message });
    }
  }

  return {
    matchId,
    emailsSent: results.filter(r => r.status === 'sent').length,
    emailsFailed: results.filter(r => r.status === 'failed').length,
    results,
  };
};
