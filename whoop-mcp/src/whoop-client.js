// Minimal WHOOP API v2 client with OAuth2 refresh-token handling.
// Zero external dependencies — uses Node 18+ global fetch and node:fs.
//
// WHOOP API v2 reference: https://developer.whoop.com/api
// (v1 was deprecated in 2025; this client targets v2 only.)

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const WHOOP_TOKEN_URL = 'https://api.prod.whoop.com/oauth/oauth2/token';
const WHOOP_API_BASE = 'https://api.prod.whoop.com/developer/v2';

export class WhoopClient {
  constructor(opts = {}) {
    this.clientId = opts.clientId ?? process.env.WHOOP_CLIENT_ID;
    this.clientSecret = opts.clientSecret ?? process.env.WHOOP_CLIENT_SECRET;
    this.tokenFile = opts.tokenFile ?? process.env.WHOOP_TOKEN_FILE ?? null;
    this.seedRefreshToken = opts.refreshToken ?? process.env.WHOOP_REFRESH_TOKEN ?? null;

    this.accessToken = null;
    this.accessTokenExpiry = 0; // epoch ms
    this.refreshToken = null;

    if (!this.clientId || !this.clientSecret) {
      throw new Error('Missing WHOOP_CLIENT_ID / WHOOP_CLIENT_SECRET.');
    }
    this._loadRefreshToken();
  }

  // Load the refresh token from the token file (preferred, because WHOOP
  // rotates refresh tokens) or fall back to the WHOOP_REFRESH_TOKEN seed.
  _loadRefreshToken() {
    if (this.tokenFile && existsSync(this.tokenFile)) {
      try {
        const data = JSON.parse(readFileSync(this.tokenFile, 'utf8'));
        if (data.refresh_token) {
          this.refreshToken = data.refresh_token;
          if (data.access_token && data.expires_at) {
            this.accessToken = data.access_token;
            this.accessTokenExpiry = data.expires_at;
          }
          return;
        }
      } catch {
        // Corrupt token file — fall through to the seed token.
      }
    }
    if (this.seedRefreshToken) {
      this.refreshToken = this.seedRefreshToken;
      return;
    }
    throw new Error(
      'No WHOOP refresh token found. Run `npm run auth` to authorize, ' +
      'or set WHOOP_REFRESH_TOKEN.'
    );
  }

  _persistTokens() {
    if (!this.tokenFile) return;
    try {
      mkdirSync(dirname(this.tokenFile), { recursive: true });
      writeFileSync(
        this.tokenFile,
        JSON.stringify({
          refresh_token: this.refreshToken,
          access_token: this.accessToken,
          expires_at: this.accessTokenExpiry,
        }, null, 2),
        { mode: 0o600 }
      );
    } catch (e) {
      // Non-fatal: keep the tokens in memory for the life of this process.
      process.stderr.write(`[whoop] could not persist tokens: ${e.message}\n`);
    }
  }

  async _refreshAccessToken() {
    if (!this.refreshToken) throw new Error('No refresh token available.');
    const res = await fetch(WHOOP_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: this.refreshToken,
        client_id: this.clientId,
        client_secret: this.clientSecret,
        // `offline` is required for WHOOP to return a rotated refresh token.
        scope: 'offline',
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`WHOOP token refresh failed (${res.status}): ${text}`);
    }
    const json = await res.json();
    this.accessToken = json.access_token;
    // expires_in is in seconds; renew a minute early to avoid edge expiries.
    this.accessTokenExpiry = Date.now() + ((json.expires_in ?? 3600) - 60) * 1000;
    // WHOOP rotates the refresh token — keep the new one.
    if (json.refresh_token) this.refreshToken = json.refresh_token;
    this._persistTokens();
    return this.accessToken;
  }

  async _getAccessToken() {
    if (this.accessToken && Date.now() < this.accessTokenExpiry) {
      return this.accessToken;
    }
    return this._refreshAccessToken();
  }

  async _get(path, params = {}) {
    const token = await this._getAccessToken();
    const url = new URL(WHOOP_API_BASE + path);
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
    }
    let res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (res.status === 401) {
      // Access token may have been revoked/expired early — refresh once and retry.
      await this._refreshAccessToken();
      res = await fetch(url, { headers: { Authorization: `Bearer ${this.accessToken}` } });
    }
    if (!res.ok) {
      throw new Error(`WHOOP API ${res.status} ${path}: ${await res.text().catch(() => '')}`);
    }
    return res.json();
  }

  // --- High-level v2 endpoints ---
  getRecoveryCollection(p = {}) {
    return this._get('/recovery', pick(p, ['limit', 'start', 'end', 'nextToken']));
  }
  getSleepCollection(p = {}) {
    return this._get('/activity/sleep', pick(p, ['limit', 'start', 'end', 'nextToken']));
  }
  getSleepById(id) {
    return this._get(`/activity/sleep/${encodeURIComponent(id)}`);
  }
  getCycleCollection(p = {}) {
    return this._get('/cycle', pick(p, ['limit', 'start', 'end', 'nextToken']));
  }
  getRecoveryForCycle(cycleId) {
    return this._get(`/cycle/${encodeURIComponent(cycleId)}/recovery`);
  }
  getWorkoutCollection(p = {}) {
    return this._get('/activity/workout', pick(p, ['limit', 'start', 'end', 'nextToken']));
  }
  getProfile() {
    return this._get('/user/profile/basic');
  }
  getBodyMeasurement() {
    return this._get('/user/measurement/body');
  }
}

function pick(obj, keys) {
  const out = {};
  for (const k of keys) if (obj[k] !== undefined) out[k] = obj[k];
  return out;
}
