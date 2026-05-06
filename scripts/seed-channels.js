#!/usr/bin/env node
/**
 * Seed the Channels DynamoDB table with MediaLive channel data.
 * 
 * Usage:
 *   node scripts/seed-channels.js [--table TABLE_NAME] [--region REGION]
 * 
 * Environment:
 *   CHANNELS_TABLE  — DynamoDB table name (default: approval-medialive-channels-prod)
 *   AWS_REGION      — AWS region (default: ap-southeast-1)
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, ScanCommand } = require('@aws-sdk/lib-dynamodb');

const TABLE_NAME = process.env.CHANNELS_TABLE || 'approval-medialive-channels-prod';
const REGION = process.env.AWS_REGION || 'ap-southeast-1';

const client = new DynamoDBClient({ region: REGION });
const ddb = DynamoDBDocumentClient.from(client);

const CHANNELS = [
  { channelLabel: 'sports1',    channelId: '3836701', arn: 'arn:aws:medialive:ap-southeast-1:185906222397:channel:3836701', class: 'standard', version: 'paddlefish-build-771966', active: true },
  { channelLabel: 'sports2',    channelId: '2204376', arn: 'arn:aws:medialive:ap-southeast-1:185906222397:channel:2204376', class: 'standard', version: 'paddlefish-build-771966', active: true },
  { channelLabel: 'sports3',    channelId: '2596695', arn: 'arn:aws:medialive:ap-southeast-1:185906222397:channel:2596695', class: 'standard', version: 'paddlefish-build-771966', active: true },
  { channelLabel: 'sports4',    channelId: '3486994', arn: 'arn:aws:medialive:ap-southeast-1:185906222397:channel:3486994', class: 'standard', version: 'paddlefish-build-772184', active: true },
  { channelLabel: 'sports5',    channelId: '6318314', arn: 'arn:aws:medialive:ap-southeast-1:185906222397:channel:6318314', class: 'standard', version: 'paddlefish-build-772184', active: true },
  { channelLabel: 'sports6',    channelId: '5448233', arn: 'arn:aws:medialive:ap-southeast-1:185906222397:channel:5448233', class: 'standard', version: 'paddlefish-build-771966', active: true },
  { channelLabel: 'sports7',    channelId: '4232385', arn: 'arn:aws:medialive:ap-southeast-1:185906222397:channel:4232385', class: 'standard', version: 'paddlefish-build-771966', active: true },
  { channelLabel: 'sports8',    channelId: '818414',  arn: 'arn:aws:medialive:ap-southeast-1:185906222397:channel:818414',  class: 'standard', version: 'paddlefish-build-771966', active: true },
  { channelLabel: 'sports9',    channelId: '9980109', arn: 'arn:aws:medialive:ap-southeast-1:185906222397:channel:9980109', class: 'standard', version: 'paddlefish-build-771966', active: true },
  { channelLabel: 'sports10',   channelId: '1786878', arn: 'arn:aws:medialive:ap-southeast-1:185906222397:channel:1786878', class: 'standard', version: 'unknown', active: true },
  { channelLabel: 'sports11',   channelId: '5208395', arn: 'arn:aws:medialive:ap-southeast-1:185906222397:channel:5208395', class: 'standard', version: 'unknown', active: true },
  { channelLabel: 'sports12-4K', channelId: '4590036', arn: 'arn:aws:medialive:ap-southeast-1:185906222397:channel:4590036', class: 'standard', version: 'paddlefish-build-771142', active: true },
];

async function seed() {
  console.log(`Seeding ${CHANNELS.length} channels to table: ${TABLE_NAME}`);
  console.log(`Region: ${REGION}\n`);

  for (const channel of CHANNELS) {
    try {
      await ddb.send(new PutCommand({
        TableName: TABLE_NAME,
        Item: {
          ...channel,
          createdAt: new Date().toISOString(),
        },
      }));
      console.log(`  ✓ ${channel.channelLabel} (${channel.channelId})`);
    } catch (error) {
      console.error(`  ✗ ${channel.channelLabel}: ${error.message}`);
    }
  }

  console.log('\n✅ Done!');
}

async function list() {
  const result = await ddb.send(new ScanCommand({ TableName: TABLE_NAME }));
  console.log(`\nCurrent channels in ${TABLE_NAME}:`);
  console.log('─'.repeat(60));
  (result.Items || []).forEach(ch => {
    console.log(`  ${ch.channelLabel.padEnd(14)} ${ch.channelId.padEnd(10)} ${ch.active ? '✓' : '✗'} ${ch.arn}`);
  });
  console.log(`\nTotal: ${result.Items?.length || 0} channels`);
}

// Run
(async () => {
  const arg = process.argv[2];
  if (arg === '--list') {
    await list();
  } else {
    await seed();
    await list();
  }
})();
