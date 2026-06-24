import { readFile, writeFile } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { resolve } from 'node:path';
import { defineConfig, type ViteDevServer } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react(), newMugenDevManifestWriter()]
});

type DevManifestPayload = {
  characterId?: string;
  animationFrames?: Record<string, string[]>;
  animationFrameRates?: Record<string, number>;
};

function newMugenDevManifestWriter() {
  return {
    name: 'newmugen-dev-manifest-writer',
    configureServer(server: ViteDevServer) {
      server.middlewares.use('/__newmugen/dev/save-character-manifest', async (request: IncomingMessage, response: ServerResponse) => {
        if (request.method !== 'POST') {
          response.statusCode = 405;
          response.setHeader('Content-Type', 'application/json');
          response.end(JSON.stringify({ ok: false, error: 'POST required' }));
          return;
        }

        try {
          const payload = JSON.parse(await readRequestBody(request)) as DevManifestPayload;
          const characterId = payload.characterId ?? '';
          if (!/^[a-z0-9-]+$/i.test(characterId)) {
            response.statusCode = 400;
            response.setHeader('Content-Type', 'application/json');
            response.end(JSON.stringify({ ok: false, error: 'Invalid character id' }));
            return;
          }

          const manifestPath = resolve(server.config.root, 'public', 'characters', characterId, 'character.json');
          const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as Record<string, unknown>;
          manifest.animationFrames = sanitizeFrameMap(payload.animationFrames ?? {});
          manifest.animationFrameRates = sanitizeRateMap(payload.animationFrameRates ?? {});
          await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

          response.statusCode = 200;
          response.setHeader('Content-Type', 'application/json');
          response.end(JSON.stringify({ ok: true, characterId, manifestPath }));
        } catch (error) {
          response.statusCode = 500;
          response.setHeader('Content-Type', 'application/json');
          response.end(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : 'Unknown error' }));
        }
      });
    }
  };
}

function readRequestBody(request: IncomingMessage) {
  return new Promise<string>((resolveBody, rejectBody) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
    });
    request.on('end', () => resolveBody(Buffer.concat(chunks).toString('utf8')));
    request.on('error', (error) => rejectBody(error));
  });
}

function sanitizeFrameMap(frames: Record<string, string[]>) {
  return Object.fromEntries(
    Object.entries(frames)
      .filter(([, value]) => Array.isArray(value) && value.every((frame) => typeof frame === 'string'))
      .map(([key, value]) => [key, value])
  );
}

function sanitizeRateMap(rates: Record<string, number>) {
  return Object.fromEntries(
    Object.entries(rates)
      .filter(([, value]) => Number.isFinite(value))
      .map(([key, value]) => [key, Number(value)])
  );
}
