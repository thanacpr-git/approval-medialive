// Shared Audit Logger — writes audit events to DynamoDB AuditLog table
// Used by all Lambda functions to track activities

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand } = require('@aws-sdk/lib-dynamodb');
const { randomUUID } = require('crypto');

const client = new DynamoDBClient({ region: 'ap-southeast-1' });
const ddb = DynamoDBDocumentClient.from(client);

const AUDIT_TABLE = process.env.AUDIT_TABLE || 'approval-medialive-auditlog-prod';
const TTL_DAYS = 30;

/**
 * Write an audit log entry to DynamoDB
 * @param {string} action - Action type (e.g. MATCH_CREATED, CHANNEL_STOPPED)
 * @param {object} details - Event details
 * @param {string} details.user - Who performed the action
 * @param {string} details.matchId - Match ID (optional)
 * @param {string} details.matchName - Match name (optional)
 * @param {string} details.channel - Channel label (optional)
 * @param {string} details.message - Human-readable description
 */
async function writeAuditLog(action, details = {}) {
  const now = new Date();
  const logEntry = {
    logId: randomUUID(),
    action,
    user: details.user || 'system',
    matchId: details.matchId || 'N/A',
    matchName: details.matchName || '',
    channel: details.channel || '',
    details: details.message || '',
    timestamp: now.toISOString(),
    ttl: Math.floor(now.getTime() / 1000) + (TTL_DAYS * 24 * 60 * 60), // 30 days
  };

  try {
    await ddb.send(new PutCommand({
      TableName: AUDIT_TABLE,
      Item: logEntry,
    }));
  } catch (error) {
    // Log to CloudWatch but don't fail the main operation
    console.error('Failed to write audit log:', error.message, logEntry);
  }

  return logEntry;
}

module.exports = { writeAuditLog };
