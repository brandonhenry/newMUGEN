import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const reviewRoot = path.join(repoRoot, 'public', 'audio-review', 'character-voices');
const selectionsPath = path.join(reviewRoot, 'selections.json');
const port = Number(process.env.KORE_AUDIO_REVIEW_SAVE_PORT ?? 5174);

mkdirSync(reviewRoot, { recursive: true });

const server = createServer((request, response) => {
  setCorsHeaders(response);
  if (request.method === 'OPTIONS') {
    response.writeHead(204);
    response.end();
    return;
  }
  if (!request.url?.startsWith('/selections')) {
    response.writeHead(404, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ error: 'not found' }));
    return;
  }
  if (request.method === 'GET') {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(existsSync(selectionsPath) ? readFileSync(selectionsPath, 'utf8') : JSON.stringify({ updatedAt: null, selections: {} }));
    return;
  }
  if (request.method === 'POST') {
    readBody(request)
      .then((body) => {
        const payload = normalizePayload(JSON.parse(body || '{}'));
        writeFileSync(selectionsPath, `${JSON.stringify(payload, null, 2)}\n`);
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ ok: true, path: selectionsPath }));
      })
      .catch((error) => {
        response.writeHead(400, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ error: error.message }));
      });
    return;
  }
  response.writeHead(405, { 'content-type': 'application/json' });
  response.end(JSON.stringify({ error: 'method not allowed' }));
});

server.listen(port, '127.0.0.1', () => {
  console.log(`KORE audio review autosave listening on http://127.0.0.1:${port}/selections`);
  console.log(`Writing selections to ${selectionsPath}`);
});

function setCorsHeaders(response) {
  response.setHeader('access-control-allow-origin', '*');
  response.setHeader('access-control-allow-methods', 'GET,POST,OPTIONS');
  response.setHeader('access-control-allow-headers', 'content-type');
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => {
      body += chunk;
      if (body.length > 4_000_000) {
        reject(new Error('payload too large'));
        request.destroy();
      }
    });
    request.on('end', () => resolve(body));
    request.on('error', reject);
  });
}

function normalizePayload(payload) {
  const selections = payload && typeof payload === 'object' && payload.selections && typeof payload.selections === 'object'
    ? payload.selections
    : {};
  return {
    updatedAt: typeof payload.updatedAt === 'string' ? payload.updatedAt : new Date().toISOString(),
    selections
  };
}
