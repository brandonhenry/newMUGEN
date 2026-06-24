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
  moveOverrides?: Record<string, Record<string, unknown>>;
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
          manifest.moveOverrides = sanitizeMoveOverrideMap(payload.moveOverrides ?? {});
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

function sanitizeMoveOverrideMap(overrides: Record<string, Record<string, unknown>>) {
  return Object.fromEntries(
    Object.entries(overrides)
      .filter(([key, value]) => key.length > 0 && value && typeof value === 'object')
      .map(([key, value]) => [key, sanitizeMoveOverride(value)])
  );
}

function sanitizeMoveOverride(override: Record<string, unknown>) {
  const allowed = new Set([
    'label',
    'startupFrames',
    'activeFrames',
    'recoveryFrames',
    'damage',
    'blockDamage',
    'hitLevel',
    'onBlockFrames',
    'onHitFrames',
    'onCounterHitFrames',
    'whiffRecoveryFrames',
    'range',
    'pushback',
    'blockPushback',
    'launchHeight',
    'tracking',
    'armorStartFrame',
    'armorEndFrame',
    'knockdown',
    'cancelWindows'
  ]);
  return Object.fromEntries(
    Object.entries(override).filter(([key, value]) => {
      if (!allowed.has(key)) return false;
      if (key === 'label' || key === 'hitLevel' || key === 'tracking') return typeof value === 'string';
      if (key === 'knockdown') return typeof value === 'boolean';
      if (key === 'cancelWindows') return Array.isArray(value);
      return Number.isFinite(value);
    })
  );
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
