import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { dirname, resolve } from 'node:path';
import { defineConfig, type ViteDevServer } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react(), koreDevManifestWriter()]
});

type DevManifestPayload = {
  characterId?: string;
  animationFrames?: Record<string, string[]>;
  animationFrameRates?: Record<string, number>;
  moveOverrides?: Record<string, Record<string, unknown>>;
  spriteFrameEdits?: Record<string, Record<string, unknown>>;
  spriteSheets?: Array<Record<string, unknown>>;
  voxelProfile?: string;
  voxelFidelity?: Record<string, unknown>;
};

type DevSpriteFramePayload = {
  characterId?: string;
  frameIndex?: number;
  edit?: Record<string, unknown>;
  pngDataUrl?: string;
};

type DevImportCharacterSpriteSheetPayload = {
  characterId?: string;
  sheetId?: string;
  sheetName?: string;
  sheetDataUrl?: string;
  frames?: Array<{
    index?: number;
    dataUrl?: string;
    box?: unknown;
    width?: number;
    height?: number;
    row?: number;
  }>;
};

type DevHdVoxelPayload = {
  characterId?: string;
  voxelProfile?: string;
  voxelFidelity?: Record<string, unknown>;
  frames?: Array<{
    frameIndex?: number;
    payload?: Record<string, unknown>;
  }>;
};

type DevImportCharacterPayload = {
  characterId?: string;
  sheetDataUrl?: string;
  sourceName?: string;
  frames?: Array<{
    index?: number;
    dataUrl?: string;
    box?: unknown;
    width?: number;
    height?: number;
    row?: number;
  }>;
  manifest?: Record<string, unknown>;
};

type DevStagePayload = {
  stageId?: string;
  stage?: Record<string, unknown>;
};

type DevImportStagePayload = {
  stageId?: string;
  sourceDataUrl?: string;
  sourceName?: string;
  pieces?: Array<{
    id?: string;
    name?: string;
    dataUrl?: string;
    box?: unknown;
    width?: number;
    height?: number;
  }>;
  stage?: Record<string, unknown>;
};

type DevOnlineRoom = {
  roomId: string;
  ownerToken: string;
  hostPeerId: string;
  hostCharacterId: string;
  guestPeerId?: string;
  guestCharacterId?: string;
  stageId: string;
  status: 'waiting' | 'matched';
  updatedAt: number;
};

type DevOnlineMatchPayload = {
  peerId?: string;
  characterId?: string;
  stageId?: string;
  roomId?: string;
  ownerToken?: string;
};

type DevOnlineLeavePayload = {
  roomId?: string;
  ownerToken?: string;
  peerId?: string;
};

const DEV_ONLINE_ROOM_TTL_MS = 12_000;

function koreDevManifestWriter() {
  const onlineRooms = new Map<string, DevOnlineRoom>();

  return {
    name: 'kore-dev-manifest-writer',
    configureServer(server: ViteDevServer) {
      server.middlewares.use('/.netlify/functions/online-matchmake', async (request: IncomingMessage, response: ServerResponse) => {
        if (request.method !== 'POST') {
          sendJson(response, 405, { error: 'POST required' });
          return;
        }
        try {
          const payload = JSON.parse(await readRequestBody(request)) as DevOnlineMatchPayload;
          sendJson(response, 200, devOnlineMatchmake(onlineRooms, payload));
        } catch (error) {
          sendJson(response, 500, { error: error instanceof Error ? error.message : 'Unknown error' });
        }
      });

      server.middlewares.use('/.netlify/functions/online-leave', async (request: IncomingMessage, response: ServerResponse) => {
        if (request.method !== 'POST') {
          sendJson(response, 405, { error: 'POST required' });
          return;
        }
        try {
          const payload = JSON.parse(await readRequestBody(request)) as DevOnlineLeavePayload;
          devOnlineLeave(onlineRooms, payload);
          sendJson(response, 200, { ok: true });
        } catch (error) {
          sendJson(response, 500, { error: error instanceof Error ? error.message : 'Unknown error' });
        }
      });

      server.middlewares.use('/__kore/dev/save-character-manifest', async (request: IncomingMessage, response: ServerResponse) => {
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
          manifest.spriteFrameEdits = sanitizeSpriteFrameEditMap(payload.spriteFrameEdits ?? {});
          manifest.spriteSheets = sanitizeSpriteSheets(payload.spriteSheets, manifest.spriteSheetPath, characterId, Number(manifest.spriteFrameCount) || 0);
          if (payload.voxelProfile) manifest.voxelProfile = sanitizeVoxelProfile(payload.voxelProfile);
          if (payload.voxelFidelity) manifest.voxelFidelity = sanitizeVoxelFidelity(payload.voxelFidelity);
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

      server.middlewares.use('/__kore/dev/save-sprite-frame', async (request: IncomingMessage, response: ServerResponse) => {
        if (request.method !== 'POST') {
          response.statusCode = 405;
          response.setHeader('Content-Type', 'application/json');
          response.end(JSON.stringify({ ok: false, error: 'POST required' }));
          return;
        }

        try {
          const payload = JSON.parse(await readRequestBody(request)) as DevSpriteFramePayload;
          const characterId = payload.characterId ?? '';
          const frameIndex = Math.round(Number(payload.frameIndex));
          if (!/^[a-z0-9-]+$/i.test(characterId) || !Number.isFinite(frameIndex) || frameIndex < 0 || frameIndex > 9999) {
            response.statusCode = 400;
            response.setHeader('Content-Type', 'application/json');
            response.end(JSON.stringify({ ok: false, error: 'Invalid character id or frame index' }));
            return;
          }

          const edit = sanitizeSpriteFrameEdit({ ...(payload.edit ?? {}), index: frameIndex });
          const characterDir = resolve(server.config.root, 'public', 'characters', characterId);
          const framesJsonPath = resolve(characterDir, 'frames', 'frames.json');
          const framePath = resolve(characterDir, 'frames', `frame-${frameIndex.toString().padStart(3, '0')}.png`);
          const manifestPath = resolve(characterDir, 'character.json');

          const pngBuffer = dataUrlToPngBuffer(payload.pngDataUrl);
          await mkdir(dirname(framePath), { recursive: true });
          await writeFile(framePath, pngBuffer);

          const frameData = JSON.parse(await readFile(framesJsonPath, 'utf8')) as {
            frames?: Array<Record<string, unknown>>;
            count?: number;
          };
          const frames = Array.isArray(frameData.frames) ? frameData.frames : [];
          const frameEntry = {
            index: frameIndex,
            path: `/characters/${characterId}/frames/frame-${frameIndex.toString().padStart(3, '0')}.png`,
            sourceMode: edit.sourceMode,
            sheetId: typeof edit.sheetId === 'string' ? edit.sheetId : undefined,
            sheetPath: typeof edit.sheetPath === 'string' ? edit.sheetPath : undefined,
            sourceName: typeof edit.sourceName === 'string' ? edit.sourceName : undefined,
            replacementName: typeof edit.replacementName === 'string' ? edit.replacementName : undefined,
            replacementWidth: Number.isFinite(edit.replacementWidth) ? edit.replacementWidth : undefined,
            replacementHeight: Number.isFinite(edit.replacementHeight) ? edit.replacementHeight : undefined,
            box: edit.box,
            width: edit.width,
            height: edit.height,
            row: edit.row,
            rotation: edit.rotation ?? 0,
            offset: edit.offset ?? [0, 0],
            scale: edit.scale ?? 1,
            hidden: edit.hidden ?? false
          };
          const existingIndex = frames.findIndex((frame) => Number(frame.index) === frameIndex);
          if (existingIndex >= 0) frames[existingIndex] = frameEntry;
          else frames.push(frameEntry);
          frameData.frames = frames.sort((a, b) => Number(a.index) - Number(b.index));
          frameData.count = Math.max(Number(frameData.count) || 0, frameIndex + 1);
          await writeFile(framesJsonPath, `${JSON.stringify(frameData, null, 2)}\n`, 'utf8');

          const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as Record<string, unknown>;
          const edits = sanitizeSpriteFrameEditMap((manifest.spriteFrameEdits as Record<string, Record<string, unknown>> | undefined) ?? {});
          edits[String(frameIndex)] = frameEntry;
          manifest.spriteFrameEdits = edits;
          manifest.spriteFrameCount = Math.max(Number(manifest.spriteFrameCount) || 0, frameIndex + 1);
          await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

          response.statusCode = 200;
          response.setHeader('Content-Type', 'application/json');
          response.end(JSON.stringify({ ok: true, characterId, frameIndex, framePath, framesJsonPath, manifestPath }));
        } catch (error) {
          response.statusCode = 500;
          response.setHeader('Content-Type', 'application/json');
          response.end(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : 'Unknown error' }));
        }
      });

      server.middlewares.use('/__kore/dev/import-character-spritesheet', async (request: IncomingMessage, response: ServerResponse) => {
        if (request.method !== 'POST') {
          response.statusCode = 405;
          response.setHeader('Content-Type', 'application/json');
          response.end(JSON.stringify({ ok: false, error: 'POST required' }));
          return;
        }

        try {
          const payload = JSON.parse(await readRequestBody(request)) as DevImportCharacterSpriteSheetPayload;
          const characterId = payload.characterId ?? '';
          const requestedSheetId = payload.sheetId ?? '';
          const sheetId = sanitizeAssetId(requestedSheetId || payload.sheetName || `sheet-${Date.now()}`);
          if (!/^[a-z0-9-]+$/i.test(characterId) || !sheetId) {
            response.statusCode = 400;
            response.setHeader('Content-Type', 'application/json');
            response.end(JSON.stringify({ ok: false, error: 'Invalid character id or sheet id' }));
            return;
          }
          const frames = Array.isArray(payload.frames) ? payload.frames : [];
          if (frames.length === 0 || frames.length > 2000) {
            response.statusCode = 400;
            response.setHeader('Content-Type', 'application/json');
            response.end(JSON.stringify({ ok: false, error: 'Expected 1-2000 frames' }));
            return;
          }

          const characterDir = resolve(server.config.root, 'public', 'characters', characterId);
          const framesDir = resolve(characterDir, 'frames');
          const sheetsDir = resolve(characterDir, 'sheets');
          const framesJsonPath = resolve(framesDir, 'frames.json');
          const manifestPath = resolve(characterDir, 'character.json');
          await mkdir(framesDir, { recursive: true });
          await mkdir(sheetsDir, { recursive: true });

          const sheetPath = `/characters/${characterId}/sheets/${sheetId}.png`;
          await writeFile(resolve(sheetsDir, `${sheetId}.png`), dataUrlToPngBuffer(payload.sheetDataUrl));

          let frameData: { frames?: Array<Record<string, unknown>>; count?: number; sheets?: Array<Record<string, unknown>>; source?: string };
          try {
            frameData = JSON.parse(await readFile(framesJsonPath, 'utf8')) as typeof frameData;
          } catch {
            frameData = { frames: [], count: 0 };
          }
          const existingFrames = Array.isArray(frameData.frames) ? frameData.frames : [];
          const startIndex = Math.max(
            Number(frameData.count) || 0,
            existingFrames.reduce((max, frame) => Math.max(max, Math.round(finiteOr(frame.index, -1)) + 1), 0)
          );
          const sheetName = typeof payload.sheetName === 'string' && payload.sheetName.trim() ? payload.sheetName.trim().slice(0, 120) : sheetId;
          const frameEntries = frames
            .map((frame, fallbackIndex) => {
              const index = startIndex + fallbackIndex;
              const box = normalizeBox(frame.box);
              return {
                index,
                dataUrl: frame.dataUrl,
                path: `/characters/${characterId}/frames/frame-${index.toString().padStart(3, '0')}.png`,
                sheetId,
                sheetPath,
                sourceName: sheetName,
                box,
                width: Math.max(1, Math.round(finiteOr(frame.width, box[2] - box[0]))),
                height: Math.max(1, Math.round(finiteOr(frame.height, box[3] - box[1]))),
                row: Math.max(0, Math.round(finiteOr(frame.row, 0)))
              };
            });

          await Promise.all(
            frameEntries.map((frame) =>
              writeFile(resolve(framesDir, `frame-${frame.index.toString().padStart(3, '0')}.png`), dataUrlToPngBuffer(frame.dataUrl))
            )
          );

          const sheetEntry = {
            id: sheetId,
            name: sheetName,
            path: sheetPath,
            frameStart: startIndex,
            frameCount: frameEntries.length
          };
          const existingSheets = Array.isArray(frameData.sheets) ? frameData.sheets : [];
          const sheets = [...existingSheets.filter((sheet) => sheet && typeof sheet === 'object' && (sheet as Record<string, unknown>).id !== sheetId), sheetEntry];
          frameData.frames = [...existingFrames, ...frameEntries.map(({ dataUrl, ...frame }) => frame)].sort((a, b) => Number(a.index) - Number(b.index));
          frameData.count = Math.max(Number(frameData.count) || 0, startIndex + frameEntries.length);
          frameData.sheets = sheets.sort((a, b) => Number(finiteOr(a.frameStart, 0)) - Number(finiteOr(b.frameStart, 0)));
          await writeFile(framesJsonPath, `${JSON.stringify(frameData, null, 2)}\n`, 'utf8');

          const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as Record<string, unknown>;
          const manifestSheets = sanitizeSpriteSheets(manifest.spriteSheets, manifest.spriteSheetPath, characterId, Number(manifest.spriteFrameCount) || startIndex);
          const nextSheets = [...manifestSheets.filter((sheet) => sheet.id !== sheetId), sheetEntry].sort((a, b) => a.frameStart - b.frameStart);
          const edits = sanitizeSpriteFrameEditMap((manifest.spriteFrameEdits as Record<string, Record<string, unknown>> | undefined) ?? {});
          frameEntries.forEach(({ dataUrl, ...frame }) => {
            edits[String(frame.index)] = sanitizeSpriteFrameEdit(frame);
          });
          manifest.spriteSheets = nextSheets;
          manifest.spriteFrameEdits = edits;
          manifest.spriteFrameCount = Math.max(Number(manifest.spriteFrameCount) || 0, startIndex + frameEntries.length);
          await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

          response.statusCode = 200;
          response.setHeader('Content-Type', 'application/json');
          response.end(JSON.stringify({ ok: true, characterId, sheet: sheetEntry, firstFrameIndex: startIndex, frameCount: frameEntries.length }));
        } catch (error) {
          response.statusCode = 500;
          response.setHeader('Content-Type', 'application/json');
          response.end(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : 'Unknown error' }));
        }
      });

      server.middlewares.use('/__kore/dev/save-hd-voxels', async (request: IncomingMessage, response: ServerResponse) => {
        if (request.method !== 'POST') {
          response.statusCode = 405;
          response.setHeader('Content-Type', 'application/json');
          response.end(JSON.stringify({ ok: false, error: 'POST required' }));
          return;
        }

        try {
          const payload = JSON.parse(await readRequestBody(request)) as DevHdVoxelPayload;
          const characterId = payload.characterId ?? '';
          if (!/^[a-z0-9-]+$/i.test(characterId)) {
            response.statusCode = 400;
            response.setHeader('Content-Type', 'application/json');
            response.end(JSON.stringify({ ok: false, error: 'Invalid character id' }));
            return;
          }
          const frames = Array.isArray(payload.frames) ? payload.frames : [];
          if (frames.length === 0 || frames.length > 2500) {
            response.statusCode = 400;
            response.setHeader('Content-Type', 'application/json');
            response.end(JSON.stringify({ ok: false, error: 'Expected 1-2500 HD voxel frames' }));
            return;
          }

          const characterDir = resolve(server.config.root, 'public', 'characters', characterId);
          const voxelsDir = resolve(characterDir, 'voxels-hd');
          const manifestPath = resolve(characterDir, 'character.json');
          await mkdir(voxelsDir, { recursive: true });

          for (const frame of frames) {
            const frameIndex = Math.round(Number(frame.frameIndex));
            if (!Number.isFinite(frameIndex) || frameIndex < 0 || frameIndex > 9999 || !frame.payload || typeof frame.payload !== 'object') continue;
            const framePath = resolve(voxelsDir, `frame-${frameIndex.toString().padStart(3, '0')}.json`);
            await writeFile(framePath, `${JSON.stringify(sanitizeHdVoxelPayload(frame.payload))}\n`, 'utf8');
          }

          const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as Record<string, unknown>;
          manifest.voxelProfile = sanitizeVoxelProfile(payload.voxelProfile ?? 'hd-image-source');
          manifest.voxelFidelity = sanitizeVoxelFidelity(payload.voxelFidelity ?? {});
          await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

          response.statusCode = 200;
          response.setHeader('Content-Type', 'application/json');
          response.end(JSON.stringify({ ok: true, characterId, frameCount: frames.length, voxelsDir, manifestPath }));
        } catch (error) {
          response.statusCode = 500;
          response.setHeader('Content-Type', 'application/json');
          response.end(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : 'Unknown error' }));
        }
      });

      server.middlewares.use('/__kore/dev/import-character', async (request: IncomingMessage, response: ServerResponse) => {
        if (request.method !== 'POST') {
          response.statusCode = 405;
          response.setHeader('Content-Type', 'application/json');
          response.end(JSON.stringify({ ok: false, error: 'POST required' }));
          return;
        }

        try {
          const payload = JSON.parse(await readRequestBody(request)) as DevImportCharacterPayload;
          const characterId = payload.characterId ?? '';
          if (!/^[a-z0-9-]+$/i.test(characterId)) {
            response.statusCode = 400;
            response.setHeader('Content-Type', 'application/json');
            response.end(JSON.stringify({ ok: false, error: 'Invalid character id' }));
            return;
          }
          const frames = Array.isArray(payload.frames) ? payload.frames : [];
          if (frames.length === 0 || frames.length > 2000) {
            response.statusCode = 400;
            response.setHeader('Content-Type', 'application/json');
            response.end(JSON.stringify({ ok: false, error: 'Expected 1-2000 frames' }));
            return;
          }
          const manifest = sanitizeImportedManifest(payload.manifest ?? {}, characterId, frames.length);
          const characterDir = resolve(server.config.root, 'public', 'characters', characterId);
          const framesDir = resolve(characterDir, 'frames');
          await mkdir(framesDir, { recursive: true });

          await writeFile(resolve(characterDir, 'animation-sheet.png'), dataUrlToPngBuffer(payload.sheetDataUrl));

          const frameEntries = frames
            .map((frame, fallbackIndex) => {
              const index = Math.max(0, Math.round(finiteOr(frame.index, fallbackIndex)));
              const framePath = `/characters/${characterId}/frames/frame-${index.toString().padStart(3, '0')}.png`;
              return {
                index,
                dataUrl: frame.dataUrl,
                path: framePath,
                sheetId: 'main',
                sheetPath: `/characters/${characterId}/animation-sheet.png`,
                sourceName: payload.sourceName ?? 'Main Sheet',
                box: normalizeBox(frame.box),
                width: Math.max(1, Math.round(finiteOr(frame.width, 32))),
                height: Math.max(1, Math.round(finiteOr(frame.height, 32))),
                row: Math.max(0, Math.round(finiteOr(frame.row, 0)))
              };
            })
            .sort((a, b) => a.index - b.index);

          await Promise.all(
            frameEntries.map((frame) =>
              writeFile(resolve(framesDir, `frame-${frame.index.toString().padStart(3, '0')}.png`), dataUrlToPngBuffer(frame.dataUrl))
            )
          );

          await writeFile(
            resolve(framesDir, 'frames.json'),
            `${JSON.stringify({
              source: payload.sourceName ?? 'imported sprite sheet',
              count: frameEntries.length,
              sheets: [{
                id: 'main',
                name: payload.sourceName ?? 'Main Sheet',
                path: `/characters/${characterId}/animation-sheet.png`,
                frameStart: 0,
                frameCount: frameEntries.length
              }],
              frames: frameEntries.map(({ dataUrl, ...frame }) => frame)
            }, null, 2)}\n`,
            'utf8'
          );
          await writeFile(resolve(characterDir, 'character.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

          const indexPath = resolve(server.config.root, 'public', 'characters', 'index.json');
          const index = JSON.parse(await readFile(indexPath, 'utf8')) as { characters?: string[] };
          const characterIds = Array.isArray(index.characters) ? index.characters : [];
          if (!characterIds.includes(characterId)) characterIds.push(characterId);
          await writeFile(indexPath, `${JSON.stringify({ characters: characterIds }, null, 2)}\n`, 'utf8');

          response.statusCode = 200;
          response.setHeader('Content-Type', 'application/json');
          response.end(JSON.stringify({ ok: true, characterId, frameCount: frameEntries.length }));
        } catch (error) {
          response.statusCode = 500;
          response.setHeader('Content-Type', 'application/json');
          response.end(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : 'Unknown error' }));
        }
      });

      server.middlewares.use('/__kore/dev/save-stage', async (request: IncomingMessage, response: ServerResponse) => {
        if (request.method !== 'POST') {
          response.statusCode = 405;
          response.setHeader('Content-Type', 'application/json');
          response.end(JSON.stringify({ ok: false, error: 'POST required' }));
          return;
        }

        try {
          const payload = JSON.parse(await readRequestBody(request)) as DevStagePayload;
          const stageId = payload.stageId ?? '';
          if (!isSafeId(stageId)) {
            response.statusCode = 400;
            response.setHeader('Content-Type', 'application/json');
            response.end(JSON.stringify({ ok: false, error: 'Invalid stage id' }));
            return;
          }
          const stageDir = resolve(server.config.root, 'public', 'stages', stageId);
          await mkdir(stageDir, { recursive: true });
          const stage = sanitizeStageManifest(payload.stage ?? {}, stageId);
          await writeFile(resolve(stageDir, 'stage.json'), `${JSON.stringify(stage, null, 2)}\n`, 'utf8');
          await updateStageIndex(server.config.root, stageId);
          response.statusCode = 200;
          response.setHeader('Content-Type', 'application/json');
          response.end(JSON.stringify({ ok: true, stageId }));
        } catch (error) {
          response.statusCode = 500;
          response.setHeader('Content-Type', 'application/json');
          response.end(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : 'Unknown error' }));
        }
      });

      server.middlewares.use('/__kore/dev/import-stage', async (request: IncomingMessage, response: ServerResponse) => {
        if (request.method !== 'POST') {
          response.statusCode = 405;
          response.setHeader('Content-Type', 'application/json');
          response.end(JSON.stringify({ ok: false, error: 'POST required' }));
          return;
        }

        try {
          const payload = JSON.parse(await readRequestBody(request)) as DevImportStagePayload;
          const stageId = payload.stageId ?? '';
          if (!isSafeId(stageId)) {
            response.statusCode = 400;
            response.setHeader('Content-Type', 'application/json');
            response.end(JSON.stringify({ ok: false, error: 'Invalid stage id' }));
            return;
          }
          const pieces = Array.isArray(payload.pieces) ? payload.pieces.slice(0, 200) : [];
          if (pieces.length === 0) {
            response.statusCode = 400;
            response.setHeader('Content-Type', 'application/json');
            response.end(JSON.stringify({ ok: false, error: 'Expected stage pieces' }));
            return;
          }
          const stageDir = resolve(server.config.root, 'public', 'stages', stageId);
          const piecesDir = resolve(stageDir, 'pieces');
          await mkdir(piecesDir, { recursive: true });
          await writeFile(resolve(stageDir, 'source.png'), dataUrlToPngBuffer(payload.sourceDataUrl));
          await Promise.all(
            pieces.map((piece, index) => {
              const pieceId = sanitizePieceId(piece.id ?? `piece-${index.toString().padStart(3, '0')}`);
              return writeFile(resolve(piecesDir, `${pieceId}.png`), dataUrlToPngBuffer(piece.dataUrl));
            })
          );
          await writeFile(
            resolve(stageDir, 'pieces.json'),
            `${JSON.stringify({
              source: payload.sourceName ?? 'imported stage sheet',
              pieces: pieces.map((piece, index) => {
                const pieceId = sanitizePieceId(piece.id ?? `piece-${index.toString().padStart(3, '0')}`);
                return {
                  id: pieceId,
                  name: piece.name ?? pieceId,
                  imagePath: `/stages/${stageId}/pieces/${pieceId}.png`,
                  box: normalizeBox(piece.box),
                  width: Math.max(1, Math.round(finiteOr(piece.width, 32))),
                  height: Math.max(1, Math.round(finiteOr(piece.height, 32)))
                };
              })
            }, null, 2)}\n`,
            'utf8'
          );
          const stage = sanitizeStageManifest(payload.stage ?? {}, stageId);
          await writeFile(resolve(stageDir, 'stage.json'), `${JSON.stringify(stage, null, 2)}\n`, 'utf8');
          await updateStageIndex(server.config.root, stageId);
          response.statusCode = 200;
          response.setHeader('Content-Type', 'application/json');
          response.end(JSON.stringify({ ok: true, stageId, pieceCount: pieces.length }));
        } catch (error) {
          response.statusCode = 500;
          response.setHeader('Content-Type', 'application/json');
          response.end(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : 'Unknown error' }));
        }
      });

      server.middlewares.use('/__kore/dev/save-stage-piece', async (request: IncomingMessage, response: ServerResponse) => {
        if (request.method !== 'POST') {
          response.statusCode = 405;
          response.setHeader('Content-Type', 'application/json');
          response.end(JSON.stringify({ ok: false, error: 'POST required' }));
          return;
        }

        try {
          const payload = JSON.parse(await readRequestBody(request)) as {
            stageId?: string;
            pieceId?: string;
            pngDataUrl?: string;
          };
          const stageId = payload.stageId ?? '';
          const pieceId = sanitizePieceId(payload.pieceId ?? '');
          if (!isSafeId(stageId) || !pieceId) {
            response.statusCode = 400;
            response.setHeader('Content-Type', 'application/json');
            response.end(JSON.stringify({ ok: false, error: 'Invalid stage or piece id' }));
            return;
          }
          const piecePath = resolve(server.config.root, 'public', 'stages', stageId, 'pieces', `${pieceId}.png`);
          await mkdir(dirname(piecePath), { recursive: true });
          await writeFile(piecePath, dataUrlToPngBuffer(payload.pngDataUrl));
          response.statusCode = 200;
          response.setHeader('Content-Type', 'application/json');
          response.end(JSON.stringify({ ok: true, stageId, pieceId }));
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

function devOnlineMatchmake(rooms: Map<string, DevOnlineRoom>, payload: DevOnlineMatchPayload) {
  pruneDevOnlineRooms(rooms);
  const peerId = safeOnlineString(payload.peerId);
  const characterId = safeOnlineString(payload.characterId);
  const stageId = safeOnlineString(payload.stageId) || 'training-area';
  if (!peerId || !characterId) throw new Error('Missing peer or character id');

  const existing = payload.roomId && payload.ownerToken ? rooms.get(payload.roomId) : undefined;
  if (existing && existing.ownerToken === payload.ownerToken) {
    existing.updatedAt = Date.now();
    rooms.set(existing.roomId, existing);
    return devOnlineRoomToResult(existing, 'host');
  }

  const waitingRoom = [...rooms.values()].find((room) => room.status === 'waiting' && room.hostPeerId !== peerId);
  if (waitingRoom) {
    waitingRoom.status = 'matched';
    waitingRoom.guestPeerId = peerId;
    waitingRoom.guestCharacterId = characterId;
    waitingRoom.updatedAt = Date.now();
    rooms.set(waitingRoom.roomId, waitingRoom);
    return devOnlineRoomToResult(waitingRoom, 'guest');
  }

  const room: DevOnlineRoom = {
    roomId: randomUUID(),
    ownerToken: randomUUID(),
    hostPeerId: peerId,
    hostCharacterId: characterId,
    stageId,
    status: 'waiting',
    updatedAt: Date.now()
  };
  rooms.set(room.roomId, room);
  return devOnlineRoomToResult(room, 'host');
}

function devOnlineLeave(rooms: Map<string, DevOnlineRoom>, payload: DevOnlineLeavePayload) {
  if (payload.roomId && payload.ownerToken) {
    const room = rooms.get(payload.roomId);
    if (room?.ownerToken === payload.ownerToken) rooms.delete(payload.roomId);
    return;
  }
  const peerId = safeOnlineString(payload.peerId);
  if (!peerId) return;
  for (const [roomId, room] of rooms.entries()) {
    if (room.hostPeerId === peerId || room.guestPeerId === peerId) rooms.delete(roomId);
  }
}

function devOnlineRoomToResult(room: DevOnlineRoom, role: 'host' | 'guest') {
  return {
    role,
    status: room.status,
    roomId: room.roomId,
    ownerToken: room.ownerToken,
    hostPeerId: room.hostPeerId,
    guestPeerId: room.guestPeerId,
    hostCharacterId: room.hostCharacterId,
    guestCharacterId: room.guestCharacterId,
    stageId: room.stageId
  };
}

function pruneDevOnlineRooms(rooms: Map<string, DevOnlineRoom>) {
  const now = Date.now();
  for (const [roomId, room] of rooms.entries()) {
    if (now - room.updatedAt > DEV_ONLINE_ROOM_TTL_MS) rooms.delete(roomId);
  }
}

function safeOnlineString(value: unknown) {
  return typeof value === 'string' ? value.slice(0, 160) : '';
}

function sendJson(response: ServerResponse, statusCode: number, payload: unknown) {
  response.statusCode = statusCode;
  response.setHeader('Content-Type', 'application/json');
  response.end(JSON.stringify(payload));
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

function dataUrlToPngBuffer(dataUrl: unknown) {
  if (typeof dataUrl !== 'string') throw new Error('Missing PNG data URL');
  const match = dataUrl.match(/^data:image\/png;base64,([a-z0-9+/=]+)$/i);
  if (!match) throw new Error('Invalid PNG data URL');
  return Buffer.from(match[1], 'base64');
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

function sanitizeVoxelProfile(value: string) {
  return value === 'hd-image-source' ? 'hd-image-source' : value === 'image-source' ? 'image-source' : 'image-source';
}

function sanitizeVoxelFidelity(value: Record<string, unknown>) {
  const lod = value.lod && typeof value.lod === 'object' ? value.lod as Record<string, unknown> : {};
  return {
    resolutionScale: Math.max(1, Math.min(4, finiteOr(value.resolutionScale, 2))),
    maxRows: Math.max(24, Math.min(96, Math.round(finiteOr(value.maxRows, 64)))),
    depth: Math.max(0.08, Math.min(0.5, finiteOr(value.depth, 0.24))),
    alphaThreshold: Math.max(1, Math.min(254, Math.round(finiteOr(value.alphaThreshold, 24)))),
    paletteSnap: Math.max(1, Math.min(32, Math.round(finiteOr(value.paletteSnap, 1)))),
    mergeRuns: value.mergeRuns !== false,
    lod: {
      mobileStep: Math.max(1, Math.min(4, Math.round(finiteOr(lod.mobileStep, 2)))),
      farStep: Math.max(1, Math.min(4, Math.round(finiteOr(lod.farStep, 2))))
    }
  };
}

function sanitizeHdVoxelPayload(payload: Record<string, unknown>) {
  const palette = Array.isArray(payload.palette)
    ? payload.palette.filter((color): color is string => typeof color === 'string' && /^#[0-9a-f]{6}$/i.test(color)).slice(0, 512)
    : [];
  const allowedParts = new Set(['head', 'torso', 'leadArm', 'rearArm', 'leadLeg', 'rearLeg']);
  const voxels = Array.isArray(payload.voxels)
    ? payload.voxels
        .filter((voxel): voxel is Record<string, unknown> => Boolean(voxel) && typeof voxel === 'object')
        .map((voxel) => {
          const part = typeof voxel.part === 'string' && allowedParts.has(voxel.part) ? voxel.part : 'torso';
          return {
            part,
            x: Number(finiteOr(voxel.x, 0).toFixed(5)),
            y: Number(finiteOr(voxel.y, 0).toFixed(5)),
            z: Number(finiteOr(voxel.z, 0).toFixed(5)),
            w: Number(Math.max(0.001, finiteOr(voxel.w, 0.05)).toFixed(5)),
            h: Number(Math.max(0.001, finiteOr(voxel.h, 0.05)).toFixed(5)),
            d: Number(Math.max(0.001, finiteOr(voxel.d, 0.18)).toFixed(5)),
            c: Math.max(0, Math.min(Math.max(0, palette.length - 1), Math.round(finiteOr(voxel.c, 0)))),
            s: Math.max(0, Math.min(Math.max(0, palette.length - 1), Math.round(finiteOr(voxel.s, finiteOr(voxel.c, 0)))))
          };
        })
        .slice(0, 12000)
    : [];
  return {
    format: 'kore-hd-voxels-v1',
    palette,
    voxels,
    source: payload.source && typeof payload.source === 'object' ? payload.source : undefined
  };
}

function sanitizeSpriteFrameEditMap(edits: Record<string, Record<string, unknown>>) {
  return Object.fromEntries(
    Object.entries(edits)
      .filter(([key, value]) => /^\d+$/.test(key) && value && typeof value === 'object')
      .map(([key, value]) => [key, sanitizeSpriteFrameEdit({ ...value, index: Number(key) })])
  );
}

function sanitizeSpriteFrameEdit(edit: Record<string, unknown>) {
  const index = Math.max(0, Math.round(finiteOr(edit.index, 0)));
  const box = normalizeBox(edit.box);
  const width = Math.max(1, Math.round(finiteOr(edit.width, box[2] - box[0])));
  const height = Math.max(1, Math.round(finiteOr(edit.height, box[3] - box[1])));
  const offset = normalizeOffset(edit.offset);
  const rotation = normalizeRotation(edit.rotation);
  const scale = Math.max(0.25, Math.min(4, finiteOr(edit.scale, 1)));
  const sourceMode = edit.sourceMode === 'replacement' ? 'replacement' : 'sheet';
  return {
    index,
    path: typeof edit.path === 'string' ? edit.path : undefined,
    sourceMode,
    sheetId: typeof edit.sheetId === 'string' ? sanitizeAssetId(edit.sheetId) : undefined,
    sheetPath: typeof edit.sheetPath === 'string' && edit.sheetPath.startsWith('/characters/') ? edit.sheetPath : undefined,
    sourceName: typeof edit.sourceName === 'string' ? edit.sourceName.slice(0, 120) : undefined,
    replacementName: sourceMode === 'replacement' && typeof edit.replacementName === 'string' ? edit.replacementName.slice(0, 120) : undefined,
    replacementWidth: sourceMode === 'replacement' ? Math.max(1, Math.round(finiteOr(edit.replacementWidth, width))) : undefined,
    replacementHeight: sourceMode === 'replacement' ? Math.max(1, Math.round(finiteOr(edit.replacementHeight, height))) : undefined,
    box,
    width,
    height,
    row: Number.isFinite(edit.row) ? Math.round(Number(edit.row)) : undefined,
    rotation,
    offset,
    scale,
    hidden: Boolean(edit.hidden)
  };
}

function sanitizeAssetId(value: unknown) {
  return typeof value === 'string'
    ? value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48)
    : '';
}

function sanitizeSpriteSheets(value: unknown, fallbackPath: unknown, characterId: string, fallbackCount: number) {
  const fallbackSheetPath = typeof fallbackPath === 'string' ? fallbackPath : `/characters/${characterId}/animation-sheet.png`;
  const fromManifest = Array.isArray(value)
    ? value
        .filter((sheet): sheet is Record<string, unknown> => Boolean(sheet) && typeof sheet === 'object')
        .map((sheet, index) => ({
          id: sanitizeAssetId(sheet.id) || `sheet-${index + 1}`,
          name: typeof sheet.name === 'string' && sheet.name.trim() ? sheet.name.trim().slice(0, 120) : `Sheet ${index + 1}`,
          path: typeof sheet.path === 'string' && sheet.path.startsWith('/characters/') ? sheet.path : fallbackSheetPath,
          frameStart: Math.max(0, Math.round(finiteOr(sheet.frameStart, 0))),
          frameCount: Math.max(0, Math.round(finiteOr(sheet.frameCount, fallbackCount)))
        }))
        .filter((sheet) => sheet.frameCount > 0)
    : [];
  if (fromManifest.length > 0) return fromManifest;
  return [{
    id: 'main',
    name: 'Main Sheet',
    path: fallbackSheetPath,
    frameStart: 0,
    frameCount: Math.max(0, Math.round(fallbackCount))
  }];
}

function normalizeBox(value: unknown): [number, number, number, number] {
  const fallback: [number, number, number, number] = [0, 0, 32, 32];
  if (!Array.isArray(value) || value.length < 4) return fallback;
  const x1 = Math.max(0, Math.round(finiteOr(value[0], fallback[0])));
  const y1 = Math.max(0, Math.round(finiteOr(value[1], fallback[1])));
  const x2 = Math.max(x1 + 1, Math.round(finiteOr(value[2], fallback[2])));
  const y2 = Math.max(y1 + 1, Math.round(finiteOr(value[3], fallback[3])));
  return [x1, y1, x2, y2];
}

function normalizeOffset(value: unknown): [number, number] {
  if (!Array.isArray(value) || value.length < 2) return [0, 0];
  return [
    Math.round(finiteOr(value[0], 0)),
    Math.round(finiteOr(value[1], 0))
  ];
}

function normalizeRotation(value: unknown) {
  const rotation = Math.round(finiteOr(value, 0) / 90) * 90;
  return ((rotation % 360) + 360) % 360;
}

function finiteOr(value: unknown, fallback: number) {
  return Number.isFinite(value) ? Number(value) : fallback;
}

function isSafeId(value: string) {
  return /^[a-z0-9-]+$/i.test(value);
}

function sanitizePieceId(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48);
}

async function updateStageIndex(root: string, stageId: string) {
  const indexPath = resolve(root, 'public', 'stages', 'index.json');
  let ids: string[] = [];
  try {
    const index = JSON.parse(await readFile(indexPath, 'utf8')) as { stages?: string[] };
    ids = Array.isArray(index.stages) ? index.stages : [];
  } catch {
    ids = [];
  }
  if (!ids.includes(stageId)) ids.push(stageId);
  await mkdir(dirname(indexPath), { recursive: true });
  await writeFile(indexPath, `${JSON.stringify({ stages: ids }, null, 2)}\n`, 'utf8');
}

function sanitizeStageManifest(stage: Record<string, unknown>, stageId: string) {
  const colors = {
    floor: typeof stage.floor === 'string' ? stage.floor : '#07182c',
    rail: typeof stage.rail === 'string' ? stage.rail : '#2ee6ff',
    light: typeof stage.light === 'string' ? stage.light : '#dbe8ff'
  };
  return {
    ...stage,
    id: stageId,
    name: typeof stage.name === 'string' && stage.name.trim() ? stage.name.trim() : stageId,
    subtitle: typeof stage.subtitle === 'string' ? stage.subtitle : 'Sprite-cutout arena',
    renderMode: stage.renderMode === 'spriteCutout' ? 'spriteCutout' : 'procedural',
    floor: colors.floor,
    rail: colors.rail,
    light: colors.light,
    skyboxPath: typeof stage.skyboxPath === 'string' ? stage.skyboxPath : undefined,
    sourcePath: typeof stage.sourcePath === 'string' ? stage.sourcePath : `/stages/${stageId}/source.png`,
    thumbnailPath: typeof stage.thumbnailPath === 'string' ? stage.thumbnailPath : undefined,
    world: sanitizeStageWorld(stage.world),
    camera: stage.camera && typeof stage.camera === 'object' ? stage.camera : undefined,
    lighting: stage.lighting && typeof stage.lighting === 'object' ? stage.lighting : undefined,
    backgroundLayers: sanitizeStageLayers(stage.backgroundLayers),
    props: sanitizeStageProps(stage.props)
  };
}

function sanitizeStageWorld(value: unknown) {
  const world = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  return {
    width: Math.max(12, finiteOr(world.width, 96)),
    depth: Math.max(8, finiteOr(world.depth, 42)),
    floorY: finiteOr(world.floorY, -0.045),
    backgroundColor: typeof world.backgroundColor === 'string' ? world.backgroundColor : '#101114'
  };
}

function sanitizeStageLayers(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((layer) => layer && typeof layer === 'object')
    .map((raw, index) => {
      const layer = raw as Record<string, unknown>;
      return {
        id: typeof layer.id === 'string' ? layer.id : `layer-${index}`,
        imagePath: typeof layer.imagePath === 'string' ? layer.imagePath : '',
        position: normalizeVec3(layer.position, [0, 3, -12]),
        scale: normalizeVec3(layer.scale, [12, 8, 1]),
        rotation: normalizeVec3(layer.rotation, [0, 0, 0]),
        opacity: Math.max(0, Math.min(1, finiteOr(layer.opacity, 1)))
      };
    })
    .filter((layer) => layer.imagePath);
}

function sanitizeStageProps(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((prop) => prop && typeof prop === 'object')
    .map((raw, index) => {
      const prop = raw as Record<string, unknown>;
      return {
        id: typeof prop.id === 'string' ? prop.id : `prop-${index}`,
        name: typeof prop.name === 'string' ? prop.name : `Prop ${index + 1}`,
        imagePath: typeof prop.imagePath === 'string' ? prop.imagePath : '',
        position: normalizeVec3(prop.position, [0, 1, 0]),
        scale: normalizeVec3(prop.scale, [1, 1, 1]),
        rotation: normalizeVec3(prop.rotation, [0, 0, 0]),
        opacity: Math.max(0, Math.min(1, finiteOr(prop.opacity, 1))),
        billboard: Boolean(prop.billboard),
        renderMode: prop.renderMode === 'voxel' ? 'voxel' : 'plane',
        voxelDepth: Math.max(0.04, Math.min(0.8, finiteOr(prop.voxelDepth, 0.16))),
        voxelScale: Math.max(2, Math.min(12, Math.round(finiteOr(prop.voxelScale, 4)))),
        hidden: Boolean(prop.hidden),
        locked: Boolean(prop.locked)
      };
    })
    .filter((prop) => prop.imagePath);
}

function normalizeVec3(value: unknown, fallback: [number, number, number]): [number, number, number] {
  if (!Array.isArray(value) || value.length < 3) return fallback;
  return [
    finiteOr(value[0], fallback[0]),
    finiteOr(value[1], fallback[1]),
    finiteOr(value[2], fallback[2])
  ];
}

function sanitizeImportedManifest(manifest: Record<string, unknown>, characterId: string, frameCount: number) {
  const displayName = typeof manifest.displayName === 'string' && manifest.displayName.trim() ? manifest.displayName.trim() : characterId;
  const colors = manifest.colors && typeof manifest.colors === 'object' ? manifest.colors as Record<string, unknown> : {};
  const stats = manifest.stats && typeof manifest.stats === 'object' ? manifest.stats as Record<string, unknown> : {};
  const animationFrames = sanitizeFrameMap((manifest.animationFrames as Record<string, string[]> | undefined) ?? {});
  const animationFrameRates = sanitizeRateMap((manifest.animationFrameRates as Record<string, number> | undefined) ?? {});
  const moves = Array.isArray(manifest.moves) ? manifest.moves : [];
  return {
    ...manifest,
    id: characterId,
    displayName,
    renderMode: 'spriteVoxel',
    modelPath: `spritevoxel://${characterId}`,
    spriteSheetPath: `/characters/${characterId}/animation-sheet.png`,
    spriteSheets: sanitizeSpriteSheets(manifest.spriteSheets, manifest.spriteSheetPath, characterId, frameCount),
    spriteFrameCount: frameCount,
    voxelProfile: 'image-source',
    animationFrames,
    animationFrameRates,
    animationFps: Math.max(1, finiteOr(manifest.animationFps, 6)),
    scale: Math.max(0.25, finiteOr(manifest.scale, 1.08)),
    cameraOffset: Array.isArray(manifest.cameraOffset) && manifest.cameraOffset.length >= 3 ? manifest.cameraOffset : [0, 1.22, 0],
    stats: {
      health: Math.max(1, Math.round(finiteOr(stats.health, 100))),
      speed: Math.max(1, finiteOr(stats.speed, 5)),
      sidestepSpeed: Math.max(1, finiteOr(stats.sidestepSpeed, 4.35)),
      jumpForce: Math.max(1, finiteOr(stats.jumpForce, 8)),
      gravity: Math.max(1, finiteOr(stats.gravity, 18))
    },
    moves,
    moveOverrides: sanitizeMoveOverrideMap((manifest.moveOverrides as Record<string, Record<string, unknown>> | undefined) ?? {}),
    spriteFrameEdits: sanitizeSpriteFrameEditMap((manifest.spriteFrameEdits as Record<string, Record<string, unknown>> | undefined) ?? {}),
    hurtboxes: Array.isArray(manifest.hurtboxes) && manifest.hurtboxes.length > 0 ? manifest.hurtboxes : [{ offset: [0, 1, 0], size: [0.86, 1.9, 0.58] }],
    inputMap: manifest.inputMap && typeof manifest.inputMap === 'object' ? manifest.inputMap : { jab: 'J', kick: 'K', heavy: 'L', special: 'U', block: 'I' },
    colors: {
      primary: typeof colors.primary === 'string' ? colors.primary : '#2ee6ff',
      secondary: typeof colors.secondary === 'string' ? colors.secondary : '#111224',
      accent: typeof colors.accent === 'string' ? colors.accent : '#ffd45e'
    },
    aiProfile: manifest.aiProfile && typeof manifest.aiProfile === 'object'
      ? manifest.aiProfile
      : { aggression: 0.62, guard: 0.42, spacing: 1.45, specialChance: 0.22 }
  };
}
