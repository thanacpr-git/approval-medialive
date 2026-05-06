// Lambda: Handle Approval Callbacks
// Receives approval/rejection from email links and notifies Step Functions

const { SFNClient, SendTaskSuccessCommand, SendTaskFailureCommand } = require('@aws-sdk/client-sfn');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
const { writeAuditLog } = require('./auditLogger');

const sfn = new SFNClient({ region: 'ap-southeast-1' });
const ddbClient = new DynamoDBClient({ region: 'ap-southeast-1' });
const ddb = DynamoDBDocumentClient.from(ddbClient);

const APPROVAL_TABLE = process.env.APPROVAL_TABLE || 'ApprovalTracking';

exports.handler = async (event) => {
  const token = event.pathParameters?.token;
  // Support both GET (email link click) and POST (API call)
  const queryAction = event.queryStringParameters?.action;
  const bodyAction = event.body ? JSON.parse(event.body).action : null;
  const action = queryAction || bodyAction || 'approve';

  try {
    // 1. Look up the task token from DynamoDB
    const approvalRecord = await ddb.send(new GetCommand({
      TableName: APPROVAL_TABLE,
      Key: { approvalToken: token },
    }));

    if (!approvalRecord.Item) {
      return response(404, { message: 'Approval token not found or expired' });
    }

    const record = approvalRecord.Item;

    if (record.status !== 'pending') {
      return response(400, { message: 'This approval has already been processed' });
    }

    // 2. Update approval record
    await ddb.send(new UpdateCommand({
      TableName: APPROVAL_TABLE,
      Key: { approvalToken: token },
      UpdateExpression: 'SET #status = :status, respondedAt = :respondedAt',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: {
        ':status': action === 'approve' ? 'approved' : 'rejected',
        ':respondedAt': new Date().toISOString(),
      },
    }));

    // 3. Notify Step Functions
    if (action === 'approve') {
      await sfn.send(new SendTaskSuccessCommand({
        taskToken: record.taskToken,
        output: JSON.stringify({
          approved: true,
          approver: record.approverEmail,
          approvedAt: new Date().toISOString(),
        }),
      }));

      await writeAuditLog('APPROVAL_RECEIVED', {
        user: record.approverEmail,
        matchId: record.matchId,
        channel: '',
        message: `Approved by ${record.approverEmail}`,
      });

      console.log(JSON.stringify({
        action: 'APPROVAL_RECEIVED',
        approver: record.approverEmail,
        matchId: record.matchId,
        decision: 'approved',
        timestamp: new Date().toISOString(),
      }));
    } else {
      await sfn.send(new SendTaskFailureCommand({
        taskToken: record.taskToken,
        error: 'ApprovalRejected',
        cause: `Rejected by ${record.approverEmail}`,
      }));

      await writeAuditLog('APPROVAL_REJECTED', {
        user: record.approverEmail,
        matchId: record.matchId,
        channel: '',
        message: `Rejected by ${record.approverEmail}`,
      });

      console.log(JSON.stringify({
        action: 'APPROVAL_REJECTED',
        approver: record.approverEmail,
        matchId: record.matchId,
        decision: 'rejected',
        timestamp: new Date().toISOString(),
      }));
    }

    return response(200, {
      message: action === 'approve' ? 'Approval recorded' : 'Rejection recorded',
      status: action,
    });

  } catch (error) {
    console.error('Error processing approval:', error);
    return response(500, { message: error.message });
  }
};

function response(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    },
    body: JSON.stringify(body),
  };
}
