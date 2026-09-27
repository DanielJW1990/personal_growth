// Krypterer porto/secret.local.json ind i trip.json → "secret".
// Brug: node porto/tools/encrypt-secret.mjs KODE
// secret.local.json er med i .gitignore og må aldrig committes.
import { readFile, writeFile } from 'node:fs/promises';
import { webcrypto as crypto } from 'node:crypto';

const dir = new URL('..', import.meta.url);
const password = (process.argv[2] || '').trim().toUpperCase();
if (!password) {
  console.error('Brug: node porto/tools/encrypt-secret.mjs KODE');
  process.exit(1);
}

const plain = await readFile(new URL('secret.local.json', dir), 'utf8');
JSON.parse(plain); // fejl tidligt ved ugyldig JSON

const b64 = (buf) => Buffer.from(buf).toString('base64');
const salt = crypto.getRandomValues(new Uint8Array(16));
const iv = crypto.getRandomValues(new Uint8Array(12));
const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
const key = await crypto.subtle.deriveKey(
  { name: 'PBKDF2', salt, iterations: 150000, hash: 'SHA-256' },
  base, { name: 'AES-GCM', length: 256 }, false, ['encrypt']
);
const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plain));

const tripUrl = new URL('trip.json', dir);
const trip = JSON.parse(await readFile(tripUrl, 'utf8'));
trip.secret = { ...trip.secret, salt: b64(salt), iv: b64(iv), data: b64(data) };
await writeFile(tripUrl, JSON.stringify(trip, null, 2) + '\n');
console.log('trip.json opdateret (secret krypteret).');
