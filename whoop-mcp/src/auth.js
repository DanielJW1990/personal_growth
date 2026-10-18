#!/usr/bin/env node
// One-time WHOOP OAuth2 authorization-code helper.
//
//   node src/auth.js      (or: npm run auth)
//
// Opens the WHOOP consent page, captures the redirect on localhost, exchanges
// the code for tokens, and writes them to the token file. Run this once on a
// machine with a browser; the resulting refresh token is then reused headlessly.

import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const CLIENT_ID = process.env.WHOOP_CLIENT_ID;
const CLIENT_SECRET = process.env.WHOOP_CLIENT_SECRET;
const PORT = Number(process.env.WHOOP_AUTH_PORT || 8099);
const REDIRECT_URI = process.env.WHOOP_REDIRECT_URI || `http://localhost:${PORT}/callback`;
const TOKEN_FILE = process.env.WHOOP_TOKEN_FILE || fileURLToPath(new URL('../.tokens.json', import.meta.url));

const AUTH_URL = 'https://api.prod.whoop.com/oauth/oauth2/auth';
const TOKEN_URL = 'https://api.prod.whoop.com/oauth/oauth2/token';
// `offline` is required to receive a refresh token.
const SCOPES = 'offline read:recovery read:sleep read:cycles read:workout read:profile read:body_measurement';

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('Set WHOOP_CLIENT_ID and WHOOP_CLIENT_SECRET first (see .env.example).');
  process.exit(1);
}

const state = randomBytes(16).toString('hex');
const authorizeUrl = `${AUTH_URL}?${new URLSearchParams({
  response_type: 'code',
  client_id: CLIENT_ID,
  redirect_uri: REDIRECT_URI,
  scope: SCOPES,
  state,
}).toString()}`;

async function exchangeCode(code) {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri: REDIRECT_URI,
    }),
  });
  if (!res.ok) throw new Error(`Token exchange failed (${res.status}): ${await res.text()}`);
  return res.json();
}

function saveTokens(tok) {
  mkdirSync(dirname(TOKEN_FILE), { recursive: true });
  writeFileSync(
    TOKEN_FILE,
    JSON.stringify({
      refresh_token: tok.refresh_token,
      access_token: tok.access_token,
      expires_at: Date.now() + ((tok.expires_in ?? 3600) - 60) * 1000,
    }, null, 2),
    { mode: 0o600 }
  );
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  if (url.pathname !== '/callback') {
    res.writeHead(404).end();
    return;
  }
  const err = url.searchParams.get('error');
  const code = url.searchParams.get('code');
  const returnedState = url.searchParams.get('state');

  if (err) {
    res.writeHead(400).end(`Authorization error: ${err}`);
    return server.close(() => process.exit(1));
  }
  if (returnedState !== state) {
    res.writeHead(400).end('State mismatch — aborting.');
    return server.close(() => process.exit(1));
  }
  try {
    const tok = await exchangeCode(code);
    saveTokens(tok);
    res.writeHead(200, { 'Content-Type': 'text/html' })
      .end('<h1>WHOOP connected ✅</h1><p>You can close this tab and return to the terminal.</p>');
    console.log(`\n✅ Tokens saved to ${TOKEN_FILE}`);
    console.log('\n   For headless use, store this refresh token as WHOOP_REFRESH_TOKEN:');
    console.log(`   ${tok.refresh_token}\n`);
    server.close(() => process.exit(0));
  } catch (e) {
    res.writeHead(500).end(e.message);
    console.error(e.message);
    server.close(() => process.exit(1));
  }
});

server.listen(PORT, () => {
  console.log('\nWHOOP OAuth — open this URL in your browser and approve access:\n');
  console.log(authorizeUrl + '\n');
  console.log(`Waiting for the callback on ${REDIRECT_URI} ...`);
});
