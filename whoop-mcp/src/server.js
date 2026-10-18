#!/usr/bin/env node
// Minimal MCP (Model Context Protocol) stdio server exposing WHOOP data.
//
// Implements the JSON-RPC 2.0 / newline-delimited stdio transport directly,
// so the server has zero npm dependencies and runs with just `node`.
// Each line on stdin is one JSON-RPC message; each response is one line on stdout.

import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { WhoopClient } from './whoop-client.js';

const SERVER_INFO = { name: 'whoop-mcp', version: '1.0.0' };
const DEFAULT_PROTOCOL = '2024-11-05';
const DEFAULT_TOKEN_FILE = fileURLToPath(new URL('../.tokens.json', import.meta.url));

// The client is created lazily so `tools/list` works before authorization,
// and auth/config errors surface as tool errors rather than crashing startup.
let client = null;
function getClient() {
  if (!client) {
    client = new WhoopClient({ tokenFile: process.env.WHOOP_TOKEN_FILE || DEFAULT_TOKEN_FILE });
  }
  return client;
}

const collectionSchema = {
  type: 'object',
  properties: {
    limit: { type: 'integer', minimum: 1, maximum: 25, description: 'Max records to return (1–25).' },
    start: { type: 'string', description: 'ISO 8601 start of range, e.g. 2026-07-01T00:00:00Z.' },
    end: { type: 'string', description: 'ISO 8601 end of range.' },
    nextToken: { type: 'string', description: 'Pagination token from a previous response.' },
  },
  additionalProperties: false,
};

const idSchema = (prop, desc) => ({
  type: 'object',
  properties: { [prop]: { type: 'string', description: desc } },
  required: [prop],
  additionalProperties: false,
});

const noArgsSchema = { type: 'object', properties: {}, additionalProperties: false };

const TOOLS = [
  {
    name: 'whoop_get_recovery',
    description: 'Get recovery records (recovery score %, resting heart rate, HRV, SpO2, skin temperature), most recent first.',
    inputSchema: collectionSchema,
    handler: (c, a) => c.getRecoveryCollection(a),
  },
  {
    name: 'whoop_get_sleep',
    description: 'Get sleep records (duration, sleep stages, sleep performance %, respiratory rate, sleep need), most recent first.',
    inputSchema: collectionSchema,
    handler: (c, a) => c.getSleepCollection(a),
  },
  {
    name: 'whoop_get_sleep_by_id',
    description: 'Get a single sleep activity by its id.',
    inputSchema: idSchema('id', 'Sleep id (UUID).'),
    handler: (c, a) => c.getSleepById(a.id),
  },
  {
    name: 'whoop_get_cycles',
    description: 'Get physiological cycles (day strain, average heart rate, energy in kilojoules), most recent first.',
    inputSchema: collectionSchema,
    handler: (c, a) => c.getCycleCollection(a),
  },
  {
    name: 'whoop_get_recovery_for_cycle',
    description: 'Get the recovery associated with a specific physiological cycle.',
    inputSchema: idSchema('cycleId', 'Cycle id.'),
    handler: (c, a) => c.getRecoveryForCycle(a.cycleId),
  },
  {
    name: 'whoop_get_workouts',
    description: 'Get workout activities (sport, strain, average/max heart rate, distance, energy), most recent first.',
    inputSchema: collectionSchema,
    handler: (c, a) => c.getWorkoutCollection(a),
  },
  {
    name: 'whoop_get_profile',
    description: 'Get the basic user profile (user id, email, first/last name).',
    inputSchema: noArgsSchema,
    handler: (c) => c.getProfile(),
  },
  {
    name: 'whoop_get_body_measurement',
    description: 'Get body measurements (height, weight, max heart rate).',
    inputSchema: noArgsSchema,
    handler: (c) => c.getBodyMeasurement(),
  },
];

const toolMap = new Map(TOOLS.map((t) => [t.name, t]));

function send(msg) {
  process.stdout.write(JSON.stringify(msg) + '\n');
}
function result(id, res) { send({ jsonrpc: '2.0', id, result: res }); }
function error(id, code, message) { send({ jsonrpc: '2.0', id, error: { code, message } }); }

async function handle(msg) {
  const { id, method, params } = msg;

  // Notifications (no id) never receive a response.
  if (method === 'notifications/initialized' || method === 'notifications/cancelled') return;

  switch (method) {
    case 'initialize': {
      const protocolVersion = params?.protocolVersion || DEFAULT_PROTOCOL;
      return result(id, { protocolVersion, capabilities: { tools: {} }, serverInfo: SERVER_INFO });
    }
    case 'ping':
      return result(id, {});
    case 'tools/list':
      return result(id, {
        tools: TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })),
      });
    case 'tools/call': {
      const tool = toolMap.get(params?.name);
      if (!tool) return error(id, -32602, `Unknown tool: ${params?.name}`);
      try {
        const data = await tool.handler(getClient(), params.arguments || {});
        return result(id, { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] });
      } catch (e) {
        return result(id, { content: [{ type: 'text', text: `Error: ${e.message}` }], isError: true });
      }
    }
    default:
      if (id !== undefined) return error(id, -32601, `Method not found: ${method}`);
  }
}

const rl = createInterface({ input: process.stdin });
rl.on('line', (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;
  let msg;
  try {
    msg = JSON.parse(trimmed);
  } catch {
    return; // Ignore non-JSON lines.
  }
  Promise.resolve(handle(msg)).catch((e) => {
    if (msg && msg.id !== undefined) error(msg.id, -32603, e.message);
  });
});

process.stderr.write('[whoop-mcp] server ready (stdio)\n');
