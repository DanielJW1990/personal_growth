/**
 * Packs the app into one self-contained HTML file: no service worker, no
 * separate asset requests, nothing fetched from the network. Useful for
 * opening the app straight from a file or hosting it as a single page.
 *
 *   node scripts/build-standalone.mjs           -> dist-standalone/styrketraening.html
 *   node scripts/build-standalone.mjs --body    -> body only (no <html>/<head>),
 *                                                  for hosts that supply the skeleton
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = resolve(ROOT, 'dist-standalone');
const bodyOnly = process.argv.includes('--body');

rmSync(OUT_DIR, { recursive: true, force: true });

execFileSync('npx', ['vite', 'build'], {
  cwd: ROOT,
  stdio: 'inherit',
  env: { ...process.env, STANDALONE: '1' },
});

const assetsDir = resolve(OUT_DIR, 'assets');
const assets = readdirSync(assetsDir);
const scriptFile = assets.find((name) => name.endsWith('.js'));
const styleFile = assets.find((name) => name.endsWith('.css'));

if (!scriptFile || !styleFile) {
  throw new Error(`Expected one .js and one .css in ${assetsDir}, found: ${assets.join(', ')}`);
}

const script = readFileSync(resolve(assetsDir, scriptFile), 'utf8');
const style = readFileSync(resolve(assetsDir, styleFile), 'utf8');
const favicon = readFileSync(resolve(OUT_DIR, 'favicon.svg'), 'utf8');

// A literal </script> inside a string in the bundle would close the tag early.
const safeScript = script.replace(/<\/script/gi, '<\\/script');
const faviconDataUri = `data:image/svg+xml;base64,${Buffer.from(favicon, 'utf8').toString('base64')}`;

const head = `<title>Styrketræning</title>
<meta name="theme-color" content="#0b0f14" />
<link rel="icon" type="image/svg+xml" href="${faviconDataUri}" />`;

const body = `<div id="root"></div>
<style>
${style}
</style>
<script type="module">
${safeScript}
</script>`;

const page = bodyOnly
  ? `${head}\n${body}\n`
  : `<!doctype html>
<html lang="da">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
${head}
</head>
<body>
${body}
</body>
</html>
`;

const outFile = resolve(OUT_DIR, bodyOnly ? 'styrketraening.body.html' : 'styrketraening.html');
writeFileSync(outFile, page);

const sizeKb = Math.round(Buffer.byteLength(page) / 1024);
console.log(`\nWrote ${outFile} (${sizeKb} kB)`);
