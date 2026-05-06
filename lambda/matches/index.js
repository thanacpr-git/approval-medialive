// Lambda: Match Schedule CRUD + Channel Registry
// Handles GET/POST/PUT/DELETE for match schedules
// Also serves GET /channels with optional live MediaLive status

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, GetCommand, QueryCommand, DeleteCommand, UpdateCommand, ScanCommand } = require('@aws-sdk/lib-dynamodb');
const { MediaLiveClient, DescribeChannelCommand } = require('@aws-sdk/client-medialive');
const { randomUUID } = require('crypto');
const { writeAuditLog } = require('./auditLogger');

const client = new DynamoDBClient({ region: 'ap-southeast-1' });
const ddb = DynamoDBDocumentClient.from(client);
const mediaLive = new MediaLiveClient({ region: 'ap-southeast-1' });

const TABLE_NAME = process.env.MATCHES_TABLE || 'MatchSchedule';
const CHANNELS_TABLE = process.env.CHANNELS_TABLE || 'approval-medialive-channels-prod';
const AUDIT_TABLE = process.env.AUDIT_TABLE || 'approval-medialive-auditlog-prod';

exports.handler = async (event) => {
  const { httpMethod, pathParameters, body, resource, path } = event;
  const matchId = pathParameters?.id;

  try {
    // Route /channels requests
    if (resource === '/channels' || path === '/channels') {
      const withStatus = event.queryStringParameters?.status === 'true';
      return await listChannels(withStatus);
    }

    // Route /audit-log requests
    if (resource === '/audit-log' || path === '/audit-log') {
      return await listAuditLogs(event.queryStringParameters);
    }

    switch (httpMethod) {
      case 'GET':
        if (matchId) {
          return await getMatch(matchId);
        }
        return await listMatches(event.queryStringParameters);

      case 'POST':
        const postBody = JSON.parse(body);
        if (postBody.matches) {
          return await bulkCreateMatches(postBody.matches);
        }
        return await createMatch(postBody);

      case 'PUT':
        return await updateMatch(matchId, JSON.parse(body));

      case 'DELETE':
        return await deleteMatch(matchId);

      default:
        return response(405, { message: 'Method not allowed' });
    }
  } catch (error) {
    console.error('Error:', error);
    return response(500, { message: error.message });
  }
};

// ---- Audit Log ----

async function listAuditLogs(queryParams) {
  const matchId = queryParams?.matchId;

  let params;
  if (matchId) {
    params = {
      TableName: AUDIT_TABLE,
      IndexName: 'MatchIdIndex',
      KeyConditionExpression: 'matchId = :matchId',
      ExpressionAttributeValues: { ':matchId': matchId },
      ScanIndexForward: false,
      Limit: 100,
    };
    const result = await ddb.send(new QueryCommand(params));
    return response(200, result.Items || []);
  }

  const result = await ddb.send(new ScanCommand({ TableName: AUDIT_TABLE, Limit: 100 }));
  const sorted = (result.Items || []).sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  return response(200, sorted);
}

// ---- Channel Registry ----

async function listChannels(withStatus = false) {
  const result = await ddb.send(new ScanCommand({
    TableName: CHANNELS_TABLE,
  }));

  let channels = (result.Items || []).sort((a, b) =>
    a.channelLabel.localeCompare(b.channelLabel, undefined, { numeric: true })
  );

  // Optionally fetch live status from MediaLive
  if (withStatus) {
    channels = await Promise.all(channels.map(async (ch) => {
      try {
        if (!ch.arn || !ch.channelId) {
          return { ...ch, state: 'UNKNOWN' };
        }
        const desc = await mediaLive.send(new DescribeChannelCommand({
          ChannelId: ch.channelId,
        }));
        return { ...ch, state: desc.State || 'UNKNOWN' };
      } catch (error) {
        console.warn(`Failed to get status for ${ch.channelLabel}: ${error.message}`);
        return { ...ch, state: 'UNKNOWN' };
      }
    }));
  }

  return response(200, channels);
}

// ---- Match Schedule CRUD ----

async function getMatch(matchId) {
  const result = await ddb.send(new GetCommand({
    TableName: TABLE_NAME,
    Key: { matchId },
  }));

  if (!result.Item) {
    return response(404, { message: 'Match not found' });
  }
  return response(200, result.Item);
}

async function listMatches(queryParams) {
  const month = queryParams?.month; // e.g. "2026-05"

  if (month) {
    const result = await ddb.send(new QueryCommand({
      TableName: TABLE_NAME,
      IndexName: 'MonthIndex',
      KeyConditionExpression: 'matchMonth = :month',
      ExpressionAttributeValues: { ':month': month },
    }));
    return response(200, result.Items || []);
  }

  const result = await ddb.send(new ScanCommand({ TableName: TABLE_NAME }));
  return response(200, result.Items || []);
}

async function createMatch(matchData) {
  const match = {
    matchId: randomUUID(),
    matchMonth: matchData.startTime?.slice(0, 7), // "2026-05"
    homeTeam: matchData.homeTeam,
    awayTeam: matchData.awayTeam,
    startTime: matchData.startTime,
    endTime: matchData.endTime,
    channelArn: matchData.channelArn,
    channelLabel: matchData.channelLabel,
    cdnProvider: matchData.cdnProvider || 'CF, Akamai',
    status: 'scheduled',
    createdAt: new Date().toISOString(),
  };

  await ddb.send(new PutCommand({ TableName: TABLE_NAME, Item: match }));

  await writeAuditLog('MATCH_CREATED', {
    user: 'operator',
    matchId: match.matchId,
    matchName: `${match.homeTeam} vs ${match.awayTeam}`,
    channel: match.channelLabel,
    message: `Match created: ${match.homeTeam} vs ${match.awayTeam}`,
  });

  console.log(JSON.stringify({
    action: 'MATCH_CREATED',
    matchId: match.matchId,
    match: `${match.homeTeam} vs ${match.awayTeam}`,
    channel: match.channelLabel,
    timestamp: match.createdAt,
  }));

  return response(201, match);
}

async function bulkCreateMatches(matches) {
  const created = [];
  for (const matchData of matches) {
    const result = await createMatch(matchData);
    created.push(JSON.parse(result.body));
  }
  return response(201, created);
}

async function updateMatch(matchId, updates) {
  const updateExpressions = [];
  const expressionValues = {};
  const expressionNames = {};

  Object.entries(updates).forEach(([key, value]) => {
    if (key !== 'matchId') {
      updateExpressions.push(`#${key} = :${key}`);
      expressionValues[`:${key}`] = value;
      expressionNames[`#${key}`] = key;
    }
  });

  await ddb.send(new UpdateCommand({
    TableName: TABLE_NAME,
    Key: { matchId },
    UpdateExpression: `SET ${updateExpressions.join(', ')}`,
    ExpressionAttributeValues: expressionValues,
    ExpressionAttributeNames: expressionNames,
  }));

  await writeAuditLog('MATCH_UPDATED', {
    user: 'operator',
    matchId,
    message: `Match updated: ${JSON.stringify(updates)}`,
  });

  console.log(JSON.stringify({ action: 'MATCH_UPDATED', matchId, timestamp: new Date().toISOString() }));
  return response(200, { matchId, ...updates });
}

async function deleteMatch(matchId) {
  await ddb.send(new DeleteCommand({ TableName: TABLE_NAME, Key: { matchId } }));
  await writeAuditLog('MATCH_DELETED', {
    user: 'operator',
    matchId,
    message: `Match deleted`,
  });
  console.log(JSON.stringify({ action: 'MATCH_DELETED', matchId, timestamp: new Date().toISOString() }));
  return response(200, { message: 'Match deleted' });
}

// ---- Helpers ----

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
