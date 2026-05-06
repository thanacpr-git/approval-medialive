// Lambda: Initiate Channel Turn-Off
// Starts the Step Function execution for the approval workflow

const { SFNClient, StartExecutionCommand } = require('@aws-sdk/client-sfn');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
const { CloudWatchLogsClient, PutLogEventsCommand } = require('@aws-sdk/client-cloudwatch-logs');
const { writeAuditLog } = require('./auditLogger');

const sfn = new SFNClient({ region: 'ap-southeast-1' });
const ddbClient = new DynamoDBClient({ region: 'ap-southeast-1' });
const ddb = DynamoDBDocumentClient.from(ddbClient);

const STATE_MACHINE_ARN = process.env.STATE_MACHINE_ARN;
const MATCHES_TABLE = process.env.MATCHES_TABLE || 'MatchSchedule';
const APPROVAL_EMAILS = (process.env.APPROVAL_EMAILS || 'admin@example.com').split(',');
const LOG_GROUP = process.env.LOG_GROUP || '/approval-medialive/activities';

exports.handler = async (event) => {
  const matchId = event.pathParameters?.id;
  
  try {
    // 1. Get match details
    const matchResult = await ddb.send(new GetCommand({
      TableName: MATCHES_TABLE,
      Key: { matchId },
    }));

    if (!matchResult.Item) {
      return response(404, { message: 'Match not found' });
    }

    const match = matchResult.Item;

    // 2. Validate match is eligible for turn-off
    const now = new Date();
    // Treat stored times as GMT+7 if no timezone specified
    let endTimeStr = match.endTime;
    if (endTimeStr && !endTimeStr.includes('+') && !endTimeStr.includes('Z')) {
      endTimeStr = endTimeStr + '+07:00';
    }
    const endTime = new Date(endTimeStr);
    const hoursAfterEnd = (now - endTime) / (1000 * 60 * 60);

    if (hoursAfterEnd < 0) {
      return response(400, { message: 'Match has not ended yet' });
    }

    if (hoursAfterEnd > 2) {
      return response(400, { message: 'Turn-off window has expired (>2 hours after match end)' });
    }

    if (match.status === 'turned_off') {
      return response(400, { message: 'Channel already turned off' });
    }

    if (match.status === 'pending_approval') {
      return response(400, { message: 'Turn-off already in progress' });
    }

    // 3. Start Step Function execution
    const executionInput = {
      matchId: match.matchId,
      matchName: `${match.homeTeam} vs ${match.awayTeam}`,
      channelArn: match.channelArn,
      channelLabel: match.channelLabel,
      approvalEmails: APPROVAL_EMAILS,
      initiatedBy: event.requestContext?.authorizer?.claims?.email || 'unknown',
      initiatedAt: now.toISOString(),
    };

    const execution = await sfn.send(new StartExecutionCommand({
      stateMachineArn: STATE_MACHINE_ARN,
      name: `turnoff-${matchId}-${Date.now()}`,
      input: JSON.stringify(executionInput),
    }));

    // 4. Update match status
    await ddb.send(new UpdateCommand({
      TableName: MATCHES_TABLE,
      Key: { matchId },
      UpdateExpression: 'SET #status = :status, executionArn = :execArn',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: {
        ':status': 'pending_approval',
        ':execArn': execution.executionArn,
      },
    }));

    // 5. Write audit log
    await writeAuditLog('TURN_OFF_INITIATED', {
      user: executionInput.initiatedBy,
      matchId,
      matchName: executionInput.matchName,
      channel: match.channelLabel,
      message: `Turn-off initiated, Step Function started`,
    });

    console.log(JSON.stringify({
      action: 'TURN_OFF_INITIATED',
      matchId,
      matchName: executionInput.matchName,
      channelArn: match.channelArn,
      channelLabel: match.channelLabel,
      initiatedBy: executionInput.initiatedBy,
      executionArn: execution.executionArn,
      timestamp: now.toISOString(),
    }));

    return response(200, {
      message: 'Turn-off process initiated',
      executionArn: execution.executionArn,
      matchId,
    });

  } catch (error) {
    console.error('Error initiating turn-off:', error);
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
