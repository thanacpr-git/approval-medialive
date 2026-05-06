// Lambda: Stop MediaLive Channel
// Called by Step Functions after all approvals received

const { MediaLiveClient, StopChannelCommand, DescribeChannelCommand } = require('@aws-sdk/client-medialive');
const { SESClient, SendEmailCommand } = require('@aws-sdk/client-ses');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
const { writeAuditLog } = require('./auditLogger');

const mediaLive = new MediaLiveClient({ region: 'ap-southeast-1' });
const ses = new SESClient({ region: 'ap-southeast-1' });
const ddbClient = new DynamoDBClient({ region: 'ap-southeast-1' });
const ddb = DynamoDBDocumentClient.from(ddbClient);

const MATCHES_TABLE = process.env.MATCHES_TABLE || 'MatchSchedule';
const SENDER_EMAIL = process.env.SENDER_EMAIL || 'noreply@example.com';

exports.handler = async (event) => {
  const { matchId, matchName, channelArn, channelLabel, approvalEmails, initiatedBy } = event;

  try {
    // 1. Extract channel ID from ARN
    // ARN format: arn:aws:medialive:ap-southeast-1:185906222397:channel:3836701
    const channelId = channelArn.split(':').pop();

    console.log(JSON.stringify({
      action: 'STOPPING_CHANNEL',
      matchId,
      matchName,
      channelArn,
      channelId,
      channelLabel,
      timestamp: new Date().toISOString(),
    }));

    // 2. Verify channel is running before stopping
    const channelStatus = await mediaLive.send(new DescribeChannelCommand({
      ChannelId: channelId,
    }));

    if (channelStatus.State === 'IDLE') {
      console.log(`Channel ${channelLabel} (${channelId}) is already IDLE`);
    } else {
      // 3. Stop the channel
      await mediaLive.send(new StopChannelCommand({
        ChannelId: channelId,
      }));

      console.log(JSON.stringify({
        action: 'CHANNEL_STOPPED',
        matchId,
        channelId,
        channelLabel,
        previousState: channelStatus.State,
        timestamp: new Date().toISOString(),
      }));

      await writeAuditLog('CHANNEL_STOPPED', {
        user: 'system',
        matchId,
        matchName,
        channel: channelLabel,
        message: `MediaLive channel ${channelLabel} (${channelId}) stopped. Previous state: ${channelStatus.State}`,
      });
    }

    // 4. Update match status in DynamoDB
    await ddb.send(new UpdateCommand({
      TableName: MATCHES_TABLE,
      Key: { matchId },
      UpdateExpression: 'SET #status = :status, stoppedAt = :stoppedAt',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: {
        ':status': 'turned_off',
        ':stoppedAt': new Date().toISOString(),
      },
    }));

    // 5. Send confirmation email
    const emailBody = `
Channel Turn-Off Confirmation
==============================

Match: ${matchName}
Channel: ${channelLabel} (${channelId})
Channel ARN: ${channelArn}
Previous State: ${channelStatus.State}
Stopped At: ${new Date().toISOString()}
Initiated By: ${initiatedBy}

All parties approved the channel turn-off.
The MediaLive channel has been successfully stopped.
    `.trim();

    await ses.send(new SendEmailCommand({
      Source: SENDER_EMAIL,
      Destination: {
        ToAddresses: approvalEmails,
      },
      Message: {
        Subject: { Data: `✅ Channel Stopped: ${channelLabel} - ${matchName}` },
        Body: {
          Text: { Data: emailBody },
        },
      },
    }));

    console.log(JSON.stringify({
      action: 'CONFIRMATION_EMAIL_SENT',
      matchId,
      recipients: approvalEmails,
      timestamp: new Date().toISOString(),
    }));

    return {
      success: true,
      matchId,
      channelId,
      channelLabel,
      stoppedAt: new Date().toISOString(),
    };

  } catch (error) {
    console.error('Error stopping channel:', error);

    // Log the failure
    console.log(JSON.stringify({
      action: 'CHANNEL_STOP_FAILED',
      matchId,
      channelArn,
      error: error.message,
      timestamp: new Date().toISOString(),
    }));

    await writeAuditLog('CHANNEL_STOP_FAILED', {
      user: 'system',
      matchId,
      matchName,
      channel: channelLabel,
      message: `Failed to stop channel: ${error.message}`,
    });

    throw error;
  }
};
