import { mkdir, readFile, rm, unlink, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { dirname, extname, resolve } from 'node:path';
import { defineConfig, type ViteDevServer } from 'vite';
import react from '@vitejs/plugin-react';
import { importMugenStageFiles, importMugenStageFolder } from './mugenStageImporter';
import { sanitizeStageManifest as sanitizeStageManifestPayload } from './src/lib/stageManifestSanitizer';

export default defineConfig({
  plugins: [react(), koreDevManifestWriter()]
});

type DevManifestPayload = {
  characterId?: string;
  locked?: boolean;
  unplayable?: boolean;
  variant?: boolean;
  variantOf?: string;
  hasTransform?: boolean;
  transformCharacterId?: string;
  faceCardPath?: string;
  modelScale?: Record<string, unknown>;
  animationFrames?: Record<string, string[]>;
  animationFrameRates?: Record<string, number>;
  animationScales?: Record<string, Record<string, unknown>>;
  animationFrameScales?: Record<string, Record<string, Record<string, unknown>>>;
  moveOverrides?: Record<string, Record<string, unknown>>;
  getupFrameOverrides?: Record<string, unknown>;
  effects?: Array<Record<string, unknown>>;
  moveEffects?: Record<string, Array<Record<string, unknown>>>;
  spriteFrameEdits?: Record<string, Record<string, unknown>>;
  spriteSheets?: Array<Record<string, unknown>>;
  voxelProfile?: string;
  voxelFidelity?: Record<string, unknown>;
};

type DevEffectSpriteSheetPayload = {
  characterId?: string;
  effectId?: string;
  effectName?: string;
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

type DevEffectSoundPayload = {
  characterId?: string;
  effectId?: string;
  fileName?: string;
  dataUrl?: string;
};

type DevMoveSoundPayload = {
  characterId?: string;
  moveKey?: string;
  fileName?: string;
  dataUrl?: string;
};

type DevEffectFramePayload = {
  characterId?: string;
  effectId?: string;
  frameIndex?: number;
  edit?: Record<string, unknown>;
  pngDataUrl?: string;
};

type DevDeleteEffectFramePayload = {
  characterId?: string;
  effectId?: string;
  frameIndex?: number;
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

type DevDeleteCharacterSpriteSheetPayload = {
  characterId?: string;
  sheetId?: string;
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
  faceCardDataUrl?: string;
  faceCardFileName?: string;
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

type DevFaceCardPayload = {
  characterId?: string;
  fileName?: string;
  dataUrl?: string;
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

type DevImportStagePropsPayload = {
  packId?: string;
  packName?: string;
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
};

type DevImportMugenStagePayload = {
  folderPath?: string;
  stageId?: string;
};

type DevImportMugenStageFilesPayload = {
  stageId?: string;
  files?: Array<{
    relativePath?: string;
    dataUrl?: string;
  }>;
};

type DevDeleteStagePayload = {
  stageId?: string;
};

type DevDeleteStagePropPayload = {
  propId?: string;
};

type DevConvertStagePropPayload = {
  propId?: string;
  kind?: 'floor' | 'skybox';
};

type DevImportStagePropAssetPayload = {
  id?: string;
  name?: string;
  dataUrl?: string;
  width?: number;
  height?: number;
};

type DevImportStageEnvironmentAssetPayload = {
  kind?: 'floor' | 'skybox';
  id?: string;
  name?: string;
  dataUrl?: string;
};

type DevImportStageFloorSoundPayload = {
  floorId?: string;
  soundKey?: 'run' | 'jump' | 'land' | 'sprint';
  fileName?: string;
  dataUrl?: string;
};

type DevUpdateStageFloorEffectsPayload = {
  floorId?: string;
  effects?: Record<string, unknown>;
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

type DevLeaderboardEntry = {
  playerId: string;
  displayName: string;
  points: number;
  updatedAt: number;
};

type DevLeaderboardSubmitPayload = {
  winner?: Partial<DevLeaderboardEntry>;
  loser?: Partial<DevLeaderboardEntry>;
};

const DEV_ONLINE_ROOM_TTL_MS = 12_000;
const DEV_LEADERBOARD_POINTS_PER_WIN = 100;

function koreDevManifestWriter() {
  const onlineRooms = new Map<string, DevOnlineRoom>();
  const leaderboard = new Map<string, DevLeaderboardEntry>();

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

      server.middlewares.use('/.netlify/functions/online-leaderboard', async (request: IncomingMessage, response: ServerResponse) => {
        if (request.method !== 'GET') {
          sendJson(response, 405, { error: 'GET required' });
          return;
        }
        sendJson(response, 200, { entries: sortDevLeaderboard([...leaderboard.values()]).slice(0, 100) });
      });

      server.middlewares.use('/.netlify/functions/online-leaderboard-submit', async (request: IncomingMessage, response: ServerResponse) => {
        if (request.method !== 'POST') {
          sendJson(response, 405, { error: 'POST required' });
          return;
        }
        try {
          const payload = JSON.parse(await readRequestBody(request)) as DevLeaderboardSubmitPayload;
          sendJson(response, 200, devSubmitLeaderboardResult(leaderboard, payload));
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
          manifest.locked = Boolean(payload.locked);
          manifest.unplayable = Boolean(payload.unplayable);
          manifest.variant = Boolean(payload.variant);
          const variantOf = sanitizeCharacterReference(payload.variantOf, characterId);
          if (manifest.variant && variantOf) manifest.variantOf = variantOf;
          else delete manifest.variantOf;
          manifest.hasTransform = Boolean(payload.hasTransform);
          const transformCharacterId = sanitizeCharacterReference(payload.transformCharacterId, characterId);
          if (manifest.hasTransform && transformCharacterId) manifest.transformCharacterId = transformCharacterId;
          else delete manifest.transformCharacterId;
          const faceCardPath = sanitizeCharacterAssetPath(payload.faceCardPath, characterId);
          if (faceCardPath) manifest.faceCardPath = faceCardPath;
          else delete manifest.faceCardPath;
          manifest.modelScale = sanitizeCharacterModelScale(payload.modelScale, Number(manifest.scale) || 1);
          manifest.animationFrames = sanitizeFrameMap(payload.animationFrames ?? {});
          manifest.animationFrameRates = sanitizeRateMap(payload.animationFrameRates ?? {});
          manifest.animationScales = sanitizeAnimationScaleMap(payload.animationScales ?? {});
          const animationFrameScales = sanitizeAnimationFrameScaleMap(payload.animationFrameScales ?? {});
          if (Object.keys(animationFrameScales).length > 0) manifest.animationFrameScales = animationFrameScales;
          else delete manifest.animationFrameScales;
          manifest.moveOverrides = sanitizeMoveOverrideMap(payload.moveOverrides ?? {});
          const getupFrameOverrides = sanitizeGetupFrameOverrides(payload.getupFrameOverrides ?? {});
          if (Object.keys(getupFrameOverrides).length > 0) manifest.getupFrameOverrides = getupFrameOverrides;
          else delete manifest.getupFrameOverrides;
          manifest.effects = sanitizeCharacterEffects(payload.effects ?? []);
          manifest.moveEffects = sanitizeCharacterMoveEffects(payload.moveEffects ?? {});
          manifest.spriteFrameEdits = sanitizeSpriteFrameEditMap(payload.spriteFrameEdits ?? {});
          manifest.spriteSheets = sanitizeSpriteSheets(payload.spriteSheets, manifest.spriteSheetPath, characterId, Number(manifest.spriteFrameCount) || 0);
          if (payload.voxelProfile) manifest.voxelProfile = sanitizeVoxelProfile(payload.voxelProfile);
          if (payload.voxelFidelity) manifest.voxelFidelity = sanitizeVoxelFidelity(payload.voxelFidelity);
          await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

          response.statusCode = 200;
          response.setHeader('Content-Type', 'application/json');
          response.end(JSON.stringify({ ok: true, characterId, manifestPath }));
        } catch (error) {
          response.statusCode = error && typeof error === 'object' && typeof (error as { statusCode?: unknown }).statusCode === 'number'
            ? (error as { statusCode: number }).statusCode
            : 500;
          response.setHeader('Content-Type', 'application/json');
          response.end(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : 'Unknown error' }));
        }
      });

      server.middlewares.use('/__kore/dev/save-character-effects', async (request: IncomingMessage, response: ServerResponse) => {
        if (request.method !== 'POST') {
          sendJson(response, 405, { ok: false, error: 'POST required' });
          return;
        }
        try {
          const payload = JSON.parse(await readRequestBody(request)) as DevManifestPayload;
          const characterId = payload.characterId ?? '';
          if (!/^[a-z0-9-]+$/i.test(characterId)) {
            sendJson(response, 400, { ok: false, error: 'Invalid character id' });
            return;
          }
          const manifestPath = resolve(server.config.root, 'public', 'characters', characterId, 'character.json');
          const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as Record<string, unknown>;
          manifest.effects = sanitizeCharacterEffects(payload.effects ?? []);
          manifest.moveEffects = sanitizeCharacterMoveEffects(payload.moveEffects ?? {});
          await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
          sendJson(response, 200, { ok: true, characterId, manifestPath });
        } catch (error) {
          sendJson(response, 500, { ok: false, error: error instanceof Error ? error.message : 'Unknown error' });
        }
      });

      server.middlewares.use('/__kore/dev/save-character-face-card', async (request: IncomingMessage, response: ServerResponse) => {
        if (request.method !== 'POST') {
          sendJson(response, 405, { ok: false, error: 'POST required' });
          return;
        }
        try {
          const payload = JSON.parse(await readRequestBody(request)) as DevFaceCardPayload;
          const characterId = payload.characterId ?? '';
          if (!/^[a-z0-9-]+$/i.test(characterId)) {
            sendJson(response, 400, { ok: false, error: 'Invalid character id' });
            return;
          }
          const image = dataUrlToImageBuffer(payload.dataUrl);
          const characterDir = resolve(server.config.root, 'public', 'characters', characterId);
          await mkdir(characterDir, { recursive: true });
          const fileName = `face-card.${image.extension}`;
          const faceCardPath = `/characters/${characterId}/${fileName}`;
          await writeFile(resolve(characterDir, fileName), image.buffer);
          const manifestPath = resolve(characterDir, 'character.json');
          const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as Record<string, unknown>;
          manifest.faceCardPath = faceCardPath;
          await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
          sendJson(response, 200, { ok: true, characterId, path: faceCardPath });
        } catch (error) {
          sendJson(response, 500, { ok: false, error: error instanceof Error ? error.message : 'Unknown error' });
        }
      });

      server.middlewares.use('/__kore/dev/import-effect-spritesheet', async (request: IncomingMessage, response: ServerResponse) => {
        if (request.method !== 'POST') {
          sendJson(response, 405, { ok: false, error: 'POST required' });
          return;
        }
        try {
          const payload = JSON.parse(await readRequestBody(request)) as DevEffectSpriteSheetPayload;
          const characterId = payload.characterId ?? '';
          const effectId = sanitizeAssetId(payload.effectId || payload.effectName || `effect-${Date.now()}`);
          if (!/^[a-z0-9-]+$/i.test(characterId) || !effectId) {
            sendJson(response, 400, { ok: false, error: 'Invalid character id or effect id' });
            return;
          }
          const frames = Array.isArray(payload.frames) ? payload.frames : [];
          if (frames.length === 0 || frames.length > 1000) {
            sendJson(response, 400, { ok: false, error: 'Expected 1-1000 effect frames' });
            return;
          }
          const effectDir = resolve(server.config.root, 'public', 'characters', characterId, 'effects', effectId);
          const framesDir = resolve(effectDir, 'frames');
          await mkdir(framesDir, { recursive: true });
          await writeFile(resolve(effectDir, 'source.png'), dataUrlToPngBuffer(payload.sheetDataUrl));
          const frameEntries = frames.map((frame, fallbackIndex) => {
            const index = Math.max(0, Math.round(finiteOr(frame.index, fallbackIndex)));
            const box = normalizeBox(frame.box);
            return {
              index,
              dataUrl: frame.dataUrl,
              path: `/characters/${characterId}/effects/${effectId}/frames/frame-${index.toString().padStart(3, '0')}.png`,
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
          const metadata = {
            id: effectId,
            name: typeof payload.effectName === 'string' && payload.effectName.trim() ? payload.effectName.trim().slice(0, 120) : effectId,
            spriteSheetPath: `/characters/${characterId}/effects/${effectId}/source.png`,
            frames: frameEntries.map((frame) => frame.path),
            effectFrameEdits: Object.fromEntries(
              frameEntries.map((frame) => [
                String(frame.index),
                sanitizeSpriteFrameEdit({
                  index: frame.index,
                  path: frame.path,
                  sourceMode: 'sheet',
                  sheetId: 'source',
                  sheetPath: `/characters/${characterId}/effects/${effectId}/source.png`,
                  sourceName: typeof payload.effectName === 'string' && payload.effectName.trim() ? payload.effectName.trim().slice(0, 120) : effectId,
                  box: frame.box,
                  width: frame.width,
                  height: frame.height,
                  row: frame.row,
                  rotation: 0,
                  offset: [0, 0],
                  scale: 1
                })
              ])
            )
          };
          await writeFile(resolve(effectDir, 'effect.json'), `${JSON.stringify({ ...metadata, frameData: frameEntries.map(({ dataUrl, ...frame }) => frame) }, null, 2)}\n`, 'utf8');
          sendJson(response, 200, { ok: true, characterId, effect: metadata });
        } catch (error) {
          sendJson(response, 500, { ok: false, error: error instanceof Error ? error.message : 'Unknown error' });
        }
      });

      server.middlewares.use('/__kore/dev/save-effect-frame', async (request: IncomingMessage, response: ServerResponse) => {
        if (request.method !== 'POST') {
          sendJson(response, 405, { ok: false, error: 'POST required' });
          return;
        }
        try {
          const payload = JSON.parse(await readRequestBody(request)) as DevEffectFramePayload;
          const characterId = payload.characterId ?? '';
          const effectId = sanitizeAssetId(payload.effectId ?? '');
          const frameIndex = Math.max(0, Math.round(finiteOr(payload.frameIndex, 0)));
          if (!/^[a-z0-9-]+$/i.test(characterId) || !effectId) {
            sendJson(response, 400, { ok: false, error: 'Invalid character or effect id' });
            return;
          }

          const effectDir = resolve(server.config.root, 'public', 'characters', characterId, 'effects', effectId);
          const framesDir = resolve(effectDir, 'frames');
          await mkdir(framesDir, { recursive: true });
          const framePath = `/characters/${characterId}/effects/${effectId}/frames/frame-${frameIndex.toString().padStart(3, '0')}.png`;
          const edit = sanitizeSpriteFrameEdit({
            ...(payload.edit ?? {}),
            index: frameIndex,
            path: framePath,
            sheetPath: `/characters/${characterId}/effects/${effectId}/source.png`
          });
          await writeFile(resolve(framesDir, `frame-${frameIndex.toString().padStart(3, '0')}.png`), dataUrlToPngBuffer(payload.pngDataUrl));

          const manifestPath = resolve(server.config.root, 'public', 'characters', characterId, 'character.json');
          const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as Record<string, unknown>;
          const effects = sanitizeCharacterEffects((manifest.effects as Array<Record<string, unknown>> | undefined) ?? []);
          const nextEffects = effects.map((effect) => {
            if (effect.id !== effectId) return effect;
            const frames = [...(effect.frames ?? [])];
            frames[frameIndex] = framePath;
            return sanitizeCharacterEffect({
              ...effect,
              frames,
              effectFrameEdits: {
                ...(effect.effectFrameEdits ?? {}),
                [String(frameIndex)]: edit
              }
            }, 0);
          });
          manifest.effects = nextEffects;
          await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

          const effectJsonPath = resolve(effectDir, 'effect.json');
          let effectJson: Record<string, unknown> = {};
          try {
            effectJson = JSON.parse(await readFile(effectJsonPath, 'utf8')) as Record<string, unknown>;
          } catch {
            effectJson = {};
          }
          effectJson.frames = Array.isArray(effectJson.frames) ? effectJson.frames : [];
          (effectJson.frames as string[])[frameIndex] = framePath;
          effectJson.effectFrameEdits = {
            ...((effectJson.effectFrameEdits as Record<string, unknown> | undefined) ?? {}),
            [String(frameIndex)]: edit
          };
          await writeFile(effectJsonPath, `${JSON.stringify(effectJson, null, 2)}\n`, 'utf8');

          sendJson(response, 200, { ok: true, characterId, effectId, frameIndex, framePath, edit });
        } catch (error) {
          sendJson(response, 500, { ok: false, error: error instanceof Error ? error.message : 'Unknown error' });
        }
      });

      server.middlewares.use('/__kore/dev/delete-effect-frame', async (request: IncomingMessage, response: ServerResponse) => {
        if (request.method !== 'POST') {
          sendJson(response, 405, { ok: false, error: 'POST required' });
          return;
        }
        try {
          const payload = JSON.parse(await readRequestBody(request)) as DevDeleteEffectFramePayload;
          const characterId = payload.characterId ?? '';
          const effectId = sanitizeAssetId(payload.effectId ?? '');
          const frameIndex = Math.max(0, Math.round(finiteOr(payload.frameIndex, 0)));
          if (!/^[a-z0-9-]+$/i.test(characterId) || !effectId) {
            sendJson(response, 400, { ok: false, error: 'Invalid character or effect id' });
            return;
          }

          const effectDir = resolve(server.config.root, 'public', 'characters', characterId, 'effects', effectId);
          const framesDir = resolve(effectDir, 'frames');
          const manifestPath = resolve(server.config.root, 'public', 'characters', characterId, 'character.json');
          const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as Record<string, unknown>;
          const effects = sanitizeCharacterEffects((manifest.effects as Array<Record<string, unknown>> | undefined) ?? []);
          const targetEffect = effects.find((effect) => effect.id === effectId);
          if (!targetEffect) {
            sendJson(response, 404, { ok: false, error: 'Effect not found' });
            return;
          }
          const oldFrames = [...(targetEffect.frames ?? [])];
          if (frameIndex >= oldFrames.length) {
            sendJson(response, 400, { ok: false, error: 'Frame index out of range' });
            return;
          }

          const oldFrameRecords = oldFrames.map((framePath, oldIndex) => ({
            oldIndex,
            framePath,
            edit: targetEffect.effectFrameEdits?.[String(oldIndex)]
          }));
          const remainingRecords = oldFrameRecords.filter((record) => record.oldIndex !== frameIndex);
          const frameBuffers = await Promise.all(
            remainingRecords.map(async (record) => {
              const fallbackPath = resolve(framesDir, `frame-${record.oldIndex.toString().padStart(3, '0')}.png`);
              const manifestFramePath = typeof record.framePath === 'string' && record.framePath.startsWith(`/characters/${characterId}/effects/${effectId}/frames/`)
                ? resolve(server.config.root, 'public', record.framePath.replace(/^\/+/, ''))
                : fallbackPath;
              try {
                return await readFile(manifestFramePath);
              } catch {
                try {
                  return await readFile(fallbackPath);
                } catch {
                  return null;
                }
              }
            })
          );

          const nextFrames = remainingRecords.map((_, newIndex) => `/characters/${characterId}/effects/${effectId}/frames/frame-${newIndex.toString().padStart(3, '0')}.png`);
          const nextEffectFrameEdits = Object.fromEntries(
            remainingRecords.map((record, newIndex) => {
              const nextPath = nextFrames[newIndex];
              return [
                String(newIndex),
                sanitizeSpriteFrameEdit({
                  ...(record.edit ?? {}),
                  index: newIndex,
                  path: nextPath,
                  sourceMode: record.edit?.sourceMode ?? 'sheet',
                  sheetId: record.edit?.sheetId ?? 'source',
                  sheetPath: targetEffect.spriteSheetPath ?? record.edit?.sheetPath,
                  sourceName: targetEffect.name
                })
              ];
            })
          );

          await Promise.all(
            frameBuffers.map((buffer, newIndex) => (
              buffer
                ? writeFile(resolve(framesDir, `frame-${newIndex.toString().padStart(3, '0')}.png`), buffer)
                : Promise.resolve()
            ))
          );
          await Promise.all(
            oldFrames.slice(remainingRecords.length).map((_, staleOffset) =>
              unlink(resolve(framesDir, `frame-${(remainingRecords.length + staleOffset).toString().padStart(3, '0')}.png`)).catch(() => undefined)
            )
          );

          const nextEffects = effects.map((effect) => (
            effect.id === effectId
              ? sanitizeCharacterEffect({
                  ...effect,
                  frames: nextFrames,
                  effectFrameEdits: nextEffectFrameEdits
                }, 0)
              : effect
          ));
          manifest.effects = nextEffects;
          await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

          const effectJsonPath = resolve(effectDir, 'effect.json');
          let effectJson: Record<string, unknown> = {};
          try {
            effectJson = JSON.parse(await readFile(effectJsonPath, 'utf8')) as Record<string, unknown>;
          } catch {
            effectJson = {};
          }
          effectJson.frames = nextFrames;
          effectJson.effectFrameEdits = nextEffectFrameEdits;
          if (Array.isArray(effectJson.frameData)) {
            effectJson.frameData = (effectJson.frameData as Array<Record<string, unknown>>)
              .filter((_, oldIndex) => oldIndex !== frameIndex)
              .map((entry, newIndex) => ({
                ...entry,
                ...(nextEffectFrameEdits[String(newIndex)] ?? {}),
                index: newIndex,
                path: nextFrames[newIndex]
              }));
          }
          await writeFile(effectJsonPath, `${JSON.stringify(effectJson, null, 2)}\n`, 'utf8');

          sendJson(response, 200, {
            ok: true,
            characterId,
            effectId,
            deletedFrameIndex: frameIndex,
            frames: nextFrames,
            effectFrameEdits: nextEffectFrameEdits
          });
        } catch (error) {
          sendJson(response, 500, { ok: false, error: error instanceof Error ? error.message : 'Unknown error' });
        }
      });

      server.middlewares.use('/__kore/dev/import-effect-sound', async (request: IncomingMessage, response: ServerResponse) => {
        if (request.method !== 'POST') {
          sendJson(response, 405, { ok: false, error: 'POST required' });
          return;
        }
        try {
          const payload = JSON.parse(await readRequestBody(request)) as DevEffectSoundPayload;
          const characterId = payload.characterId ?? '';
          const effectId = sanitizeAssetId(payload.effectId ?? '');
          const fileName = sanitizeMediaFileName(payload.fileName ?? `sound-${Date.now()}.wav`);
          if (!/^[a-z0-9-]+$/i.test(characterId) || !effectId || !fileName) {
            sendJson(response, 400, { ok: false, error: 'Invalid character, effect, or file name' });
            return;
          }
          const soundDir = resolve(server.config.root, 'public', 'characters', characterId, 'effects', effectId, 'sounds');
          await mkdir(soundDir, { recursive: true });
          await writeFile(resolve(soundDir, fileName), dataUrlToMediaBuffer(payload.dataUrl));
          sendJson(response, 200, { ok: true, path: `/characters/${characterId}/effects/${effectId}/sounds/${fileName}` });
        } catch (error) {
          sendJson(response, 500, { ok: false, error: error instanceof Error ? error.message : 'Unknown error' });
        }
      });

      server.middlewares.use('/__kore/dev/import-move-sound', async (request: IncomingMessage, response: ServerResponse) => {
        if (request.method !== 'POST') {
          sendJson(response, 405, { ok: false, error: 'POST required' });
          return;
        }
        try {
          const payload = JSON.parse(await readRequestBody(request)) as DevMoveSoundPayload;
          const characterId = payload.characterId ?? '';
          const moveKey = sanitizeAssetId(payload.moveKey ?? '');
          const fileName = sanitizeMediaFileName(payload.fileName ?? `sound-${Date.now()}.wav`);
          if (!/^[a-z0-9-]+$/i.test(characterId) || !moveKey || !fileName) {
            sendJson(response, 400, { ok: false, error: 'Invalid character, move, or file name' });
            return;
          }
          const soundDir = resolve(server.config.root, 'public', 'characters', characterId, 'moves', moveKey, 'sounds');
          await mkdir(soundDir, { recursive: true });
          await writeFile(resolve(soundDir, fileName), dataUrlToMediaBuffer(payload.dataUrl));
          sendJson(response, 200, { ok: true, path: `/characters/${characterId}/moves/${moveKey}/sounds/${fileName}` });
        } catch (error) {
          sendJson(response, 500, { ok: false, error: error instanceof Error ? error.message : 'Unknown error' });
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
            hidden: edit.hidden ?? false,
            revision: edit.revision
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

      server.middlewares.use('/__kore/dev/delete-character-spritesheet', async (request: IncomingMessage, response: ServerResponse) => {
        if (request.method !== 'POST') {
          response.statusCode = 405;
          response.setHeader('Content-Type', 'application/json');
          response.end(JSON.stringify({ ok: false, error: 'POST required' }));
          return;
        }

        try {
          const payload = JSON.parse(await readRequestBody(request)) as DevDeleteCharacterSpriteSheetPayload;
          const characterId = payload.characterId ?? '';
          const sheetId = sanitizeAssetId(payload.sheetId ?? '');
          if (!/^[a-z0-9-]+$/i.test(characterId) || !sheetId) {
            response.statusCode = 400;
            response.setHeader('Content-Type', 'application/json');
            response.end(JSON.stringify({ ok: false, error: 'Invalid character id or sheet id' }));
            return;
          }
          if (sheetId === 'main' || sheetId === 'source') {
            response.statusCode = 400;
            response.setHeader('Content-Type', 'application/json');
            response.end(JSON.stringify({ ok: false, error: 'The base sprite sheet cannot be deleted' }));
            return;
          }

          const characterDir = resolve(server.config.root, 'public', 'characters', characterId);
          const framesDir = resolve(characterDir, 'frames');
          const voxelsHdDir = resolve(characterDir, 'voxels-hd');
          const framesJsonPath = resolve(framesDir, 'frames.json');
          const manifestPath = resolve(characterDir, 'character.json');
          const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as Record<string, unknown>;
          const manifestSheets = sanitizeSpriteSheets(manifest.spriteSheets, manifest.spriteSheetPath, characterId, Number(manifest.spriteFrameCount) || 0);
          const sheet = manifestSheets.find((entry) => entry.id === sheetId);
          if (!sheet) {
            response.statusCode = 404;
            response.setHeader('Content-Type', 'application/json');
            response.end(JSON.stringify({ ok: false, error: 'Sprite sheet not found' }));
            return;
          }
          if (!sheet.path.startsWith(`/characters/${characterId}/sheets/`)) {
            response.statusCode = 400;
            response.setHeader('Content-Type', 'application/json');
            response.end(JSON.stringify({ ok: false, error: 'Only imported sprite sheets can be deleted' }));
            return;
          }

          let frameData: { frames?: Array<Record<string, unknown>>; count?: number; sheets?: Array<Record<string, unknown>>; source?: string };
          try {
            frameData = JSON.parse(await readFile(framesJsonPath, 'utf8')) as typeof frameData;
          } catch {
            frameData = { frames: [], count: Number(manifest.spriteFrameCount) || 0 };
          }
          const existingFrames = Array.isArray(frameData.frames) ? frameData.frames : [];
          const sheetStart = Math.max(0, Math.round(sheet.frameStart));
          const sheetEnd = sheetStart + Math.max(0, Math.round(sheet.frameCount));
          const deletedIndexes = new Set<number>();
          const framePathsToDelete = new Set<string>();
          const nextFrames = existingFrames.map((frame) => {
            const index = Math.max(0, Math.round(finiteOr(frame.index, -1)));
            const belongsToSheet = frame.sheetId === sheetId || (index >= sheetStart && index < sheetEnd);
            if (!belongsToSheet) return frame;
            deletedIndexes.add(index);
            if (typeof frame.path === 'string' && frame.path.startsWith(`/characters/${characterId}/frames/`)) {
              framePathsToDelete.add(frame.path);
            }
            return sanitizeSpriteFrameEdit({
              ...frame,
              index,
              hidden: true,
              revision: Date.now()
            });
          });

          for (const index of deletedIndexes) {
            framePathsToDelete.add(`/characters/${characterId}/frames/frame-${index.toString().padStart(3, '0')}.png`);
          }
          const sheetFilePath = resolve(server.config.root, 'public', sheet.path.slice(1));
          await rm(sheetFilePath, { force: true });
          await Promise.all([...framePathsToDelete].map((framePath) => rm(resolve(server.config.root, 'public', framePath.slice(1)), { force: true })));
          await Promise.all([...deletedIndexes].map((index) => rm(resolve(voxelsHdDir, `frame-${index.toString().padStart(3, '0')}.json`), { force: true })));

          const deletedPathSet = new Set([...deletedIndexes].map((index) => `/characters/${characterId}/frames/frame-${index.toString().padStart(3, '0')}.png`));
          frameData.frames = nextFrames.sort((a, b) => Number(a.index) - Number(b.index));
          frameData.sheets = (Array.isArray(frameData.sheets) ? frameData.sheets : [])
            .filter((entry) => entry && typeof entry === 'object' && (entry as Record<string, unknown>).id !== sheetId);
          frameData.count = Math.max(Number(frameData.count) || 0, Number(manifest.spriteFrameCount) || 0);
          await writeFile(framesJsonPath, `${JSON.stringify(frameData, null, 2)}\n`, 'utf8');

          const edits = sanitizeSpriteFrameEditMap((manifest.spriteFrameEdits as Record<string, Record<string, unknown>> | undefined) ?? {});
          nextFrames.forEach((frame) => {
            const index = Math.max(0, Math.round(finiteOr(frame.index, -1)));
            if (deletedIndexes.has(index)) edits[String(index)] = sanitizeSpriteFrameEdit(frame);
          });
          const animationFrames = sanitizeFrameMap((manifest.animationFrames as Record<string, string[]> | undefined) ?? {});
          Object.entries(animationFrames).forEach(([key, frames]) => {
            animationFrames[key] = frames.filter((framePath) => !deletedPathSet.has(framePath));
          });
          manifest.animationFrames = animationFrames;
          manifest.spriteFrameEdits = edits;
          manifest.spriteSheets = manifestSheets.filter((entry) => entry.id !== sheetId);
          manifest.spriteFrameCount = Math.max(Number(manifest.spriteFrameCount) || 0, Number(frameData.count) || 0);
          await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

          response.statusCode = 200;
          response.setHeader('Content-Type', 'application/json');
          response.end(JSON.stringify({ ok: true, characterId, sheetId, deletedFrames: deletedIndexes.size }));
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
          if (payload.faceCardDataUrl) {
            const faceCard = dataUrlToImageBuffer(payload.faceCardDataUrl);
            const fileName = `face-card.${faceCard.extension}`;
            await writeFile(resolve(characterDir, fileName), faceCard.buffer);
            manifest.faceCardPath = `/characters/${characterId}/${fileName}`;
          }
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
          const stage = sanitizeStageManifestPayload(payload.stage ?? {}, stageId);
          await writeFile(resolve(stageDir, 'stage.json'), `${JSON.stringify(stage, null, 2)}\n`, 'utf8');
          await updateStageIndex(server.config.root, stageId);
          response.statusCode = 200;
          response.setHeader('Content-Type', 'application/json');
          response.end(JSON.stringify({ ok: true, stageId, stage }));
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
          const stage = sanitizeStageManifestPayload(payload.stage ?? {}, stageId);
          await writeFile(resolve(stageDir, 'stage.json'), `${JSON.stringify(stage, null, 2)}\n`, 'utf8');
          await updateStageIndex(server.config.root, stageId);
          response.statusCode = 200;
          response.setHeader('Content-Type', 'application/json');
          response.end(JSON.stringify({ ok: true, stageId, pieceCount: pieces.length, stage }));
        } catch (error) {
          response.statusCode = 500;
          response.setHeader('Content-Type', 'application/json');
          response.end(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : 'Unknown error' }));
        }
      });

      server.middlewares.use('/__kore/dev/import-stage-props', async (request: IncomingMessage, response: ServerResponse) => {
        if (request.method !== 'POST') {
          response.statusCode = 405;
          response.setHeader('Content-Type', 'application/json');
          response.end(JSON.stringify({ ok: false, error: 'POST required' }));
          return;
        }

        try {
          const payload = JSON.parse(await readRequestBody(request)) as DevImportStagePropsPayload;
          const packId = sanitizeAssetId(payload.packId ?? '');
          if (!isSafeId(packId)) {
            response.statusCode = 400;
            response.setHeader('Content-Type', 'application/json');
            response.end(JSON.stringify({ ok: false, error: 'Invalid prop pack id' }));
            return;
          }
          const pieces = Array.isArray(payload.pieces) ? payload.pieces.slice(0, 300) : [];
          if (pieces.length === 0) {
            response.statusCode = 400;
            response.setHeader('Content-Type', 'application/json');
            response.end(JSON.stringify({ ok: false, error: 'Expected prop pieces' }));
            return;
          }

          const packDir = resolve(server.config.root, 'public', 'stage-props', packId);
          const piecesDir = resolve(packDir, 'pieces');
          await mkdir(piecesDir, { recursive: true });
          if (payload.sourceDataUrl) await writeFile(resolve(packDir, 'source.png'), dataUrlToPngBuffer(payload.sourceDataUrl));
          const props = await Promise.all(pieces.map(async (piece, index) => {
            const pieceId = sanitizePieceId(piece.id ?? `piece-${index.toString().padStart(3, '0')}`);
            await writeFile(resolve(piecesDir, `${pieceId}.png`), dataUrlToPngBuffer(piece.dataUrl));
            const width = Math.max(1, Math.round(finiteOr(piece.width, 96)));
            const height = Math.max(1, Math.round(finiteOr(piece.height, 96)));
            return {
              id: `${packId}-${pieceId}`,
              name: typeof piece.name === 'string' && piece.name.trim() ? piece.name.trim() : pieceId,
              imagePath: `/stage-props/${packId}/pieces/${pieceId}.png`,
              thumbnailPath: `/stage-props/${packId}/pieces/${pieceId}.png`,
              width,
              height,
              sourcePackId: packId,
              sourceName: typeof payload.packName === 'string' && payload.packName.trim()
                ? payload.packName.trim()
                : payload.sourceName ?? packId,
              sourceKind: 'spritesheet',
              tags: ['spritesheet', packId],
              defaultScale: [
                Math.max(0.8, Math.min(8, width / 96)),
                Math.max(0.8, Math.min(6, height / 96)),
                1
              ],
              defaultRenderMode: 'voxel',
              defaultVoxelDepth: 0.16,
              defaultVoxelScale: width > 600 || height > 300 ? 8 : 5
            };
          }));
          await updateStagePropIndex(server.config.root, props);

          response.statusCode = 200;
          response.setHeader('Content-Type', 'application/json');
          response.end(JSON.stringify({ ok: true, packId, props, propCount: props.length }));
        } catch (error) {
          response.statusCode = 500;
          response.setHeader('Content-Type', 'application/json');
          response.end(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : 'Unknown error' }));
        }
      });

      server.middlewares.use('/__kore/dev/import-stage-prop-asset', async (request: IncomingMessage, response: ServerResponse) => {
        if (request.method !== 'POST') {
          response.statusCode = 405;
          response.setHeader('Content-Type', 'application/json');
          response.end(JSON.stringify({ ok: false, error: 'POST required' }));
          return;
        }

        try {
          const payload = JSON.parse(await readRequestBody(request)) as DevImportStagePropAssetPayload;
          const image = dataUrlToImageBuffer(payload.dataUrl);
          const baseId = sanitizeAssetId(payload.id || payload.name || image.extension || 'prop') || `prop-${Date.now().toString(36)}`;
          const propDir = resolve(server.config.root, 'public', 'stage-props', 'manual');
          await mkdir(propDir, { recursive: true });
          const fileName = `${baseId}.${image.extension}`;
          await writeFile(resolve(propDir, fileName), image.buffer);
          const width = Math.max(1, Math.round(finiteOr(payload.width, 128)));
          const height = Math.max(1, Math.round(finiteOr(payload.height, 128)));
          const prop = {
            id: `manual-${baseId}`,
            name: typeof payload.name === 'string' && payload.name.trim() ? payload.name.trim() : baseId,
            imagePath: `/stage-props/manual/${fileName}`,
            thumbnailPath: `/stage-props/manual/${fileName}`,
            width,
            height,
            sourcePackId: 'manual',
            sourceName: 'Manual Props',
            sourceKind: 'manual',
            tags: ['manual'],
            defaultScale: [
              Math.max(0.8, Math.min(8, width / 96)),
              Math.max(0.8, Math.min(6, height / 96)),
              1
            ],
            defaultRenderMode: 'voxel',
            defaultVoxelDepth: 0.16,
            defaultVoxelScale: width > 600 || height > 300 ? 8 : 5
          };
          await updateStagePropIndex(server.config.root, [prop]);
          response.statusCode = 200;
          response.setHeader('Content-Type', 'application/json');
          response.end(JSON.stringify({ ok: true, prop }));
        } catch (error) {
          response.statusCode = 500;
          response.setHeader('Content-Type', 'application/json');
          response.end(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : 'Unknown error' }));
        }
      });

      server.middlewares.use('/__kore/dev/import-stage-environment-asset', async (request: IncomingMessage, response: ServerResponse) => {
        if (request.method !== 'POST') {
          response.statusCode = 405;
          response.setHeader('Content-Type', 'application/json');
          response.end(JSON.stringify({ ok: false, error: 'POST required' }));
          return;
        }

        try {
          const payload = JSON.parse(await readRequestBody(request)) as DevImportStageEnvironmentAssetPayload;
          const kind = payload.kind === 'skybox' ? 'skybox' : 'floor';
          const image = dataUrlToImageBuffer(payload.dataUrl);
          const id = sanitizeAssetId(payload.id || payload.name || kind) || `${kind}-${Date.now().toString(36)}`;
          const dirName = kind === 'skybox' ? 'skies' : 'floors';
          const assetDir = resolve(server.config.root, 'public', 'stage-assets', dirName, id);
          await mkdir(assetDir, { recursive: true });
          const fileName = kind === 'skybox' ? `sky.${image.extension}` : `texture.${image.extension}`;
          await writeFile(resolve(assetDir, fileName), image.buffer);
          const publicPath = `/stage-assets/${dirName}/${id}/${fileName}`;
          if (kind === 'skybox') {
            const sky = {
              id,
              name: typeof payload.name === 'string' && payload.name.trim() ? payload.name.trim() : id,
              imagePath: publicPath,
              thumbnailPath: publicPath
            };
            await updateStageAssetIndex(server.config.root, { skies: [sky] });
            response.statusCode = 200;
            response.setHeader('Content-Type', 'application/json');
            response.end(JSON.stringify({ ok: true, kind, sky }));
            return;
          }
          const floor = {
            id,
            name: typeof payload.name === 'string' && payload.name.trim() ? payload.name.trim() : id,
            texturePath: publicPath,
            thumbnailPath: publicPath,
            repeat: [24, 24],
            sounds: {},
            effects: {}
          };
          await updateStageAssetIndex(server.config.root, { floors: [floor] });
          response.statusCode = 200;
          response.setHeader('Content-Type', 'application/json');
          response.end(JSON.stringify({ ok: true, kind, floor }));
        } catch (error) {
          response.statusCode = 500;
          response.setHeader('Content-Type', 'application/json');
          response.end(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : 'Unknown error' }));
        }
      });

      server.middlewares.use('/__kore/dev/convert-stage-prop-asset', async (request: IncomingMessage, response: ServerResponse) => {
        if (request.method !== 'POST') {
          response.statusCode = 405;
          response.setHeader('Content-Type', 'application/json');
          response.end(JSON.stringify({ ok: false, error: 'POST required' }));
          return;
        }

        try {
          const payload = JSON.parse(await readRequestBody(request)) as DevConvertStagePropPayload;
          const propId = typeof payload.propId === 'string' ? payload.propId.trim() : '';
          const kind = payload.kind === 'skybox' ? 'skybox' : payload.kind === 'floor' ? 'floor' : undefined;
          if (!propId || !kind) {
            response.statusCode = 400;
            response.setHeader('Content-Type', 'application/json');
            response.end(JSON.stringify({ ok: false, error: 'Missing prop conversion target' }));
            return;
          }

          const propIndexPath = resolve(server.config.root, 'public', 'stage-props', 'index.json');
          const propManifest = JSON.parse(await readFile(propIndexPath, 'utf8')) as { props?: Array<Record<string, unknown>> };
          const props = Array.isArray(propManifest.props) ? propManifest.props : [];
          const prop = props.find((entry) => entry.id === propId);
          if (!prop) {
            response.statusCode = 404;
            response.setHeader('Content-Type', 'application/json');
            response.end(JSON.stringify({ ok: false, error: 'Prop not found' }));
            return;
          }

          const imagePath = typeof prop.imagePath === 'string' ? prop.imagePath : '';
          if (!imagePath.startsWith('/stage-props/')) {
            response.statusCode = 400;
            response.setHeader('Content-Type', 'application/json');
            response.end(JSON.stringify({ ok: false, error: 'Prop image must be a local stage prop asset' }));
            return;
          }

          const publicRoot = resolve(server.config.root, 'public');
          const sourcePath = resolve(publicRoot, imagePath.replace(/^\/+/, ''));
          const propRoot = resolve(publicRoot, 'stage-props');
          if (!sourcePath.startsWith(propRoot)) {
            response.statusCode = 400;
            response.setHeader('Content-Type', 'application/json');
            response.end(JSON.stringify({ ok: false, error: 'Unsafe prop image path' }));
            return;
          }

          const extension = extname(sourcePath).replace(/^\./, '').toLowerCase();
          const allowedExtension = ['png', 'webp', 'jpg', 'jpeg'].includes(extension) ? extension : 'png';
          const image = await readFile(sourcePath);
          const propName = typeof prop.name === 'string' && prop.name.trim() ? prop.name.trim() : propId;
          const baseId = sanitizeAssetId(propName || propId) || sanitizeAssetId(propId) || Date.now().toString(36);
          const assetId = sanitizeAssetId(`${kind === 'skybox' ? 'sky' : 'floor'}-${baseId}`);
          const dirName = kind === 'skybox' ? 'skies' : 'floors';
          const assetDir = resolve(publicRoot, 'stage-assets', dirName, assetId);
          await mkdir(assetDir, { recursive: true });
          const fileName = kind === 'skybox' ? `sky.${allowedExtension}` : `texture.${allowedExtension}`;
          await writeFile(resolve(assetDir, fileName), image);
          const publicPath = `/stage-assets/${dirName}/${assetId}/${fileName}`;
          const nextProps = props.filter((entry) => entry.id !== propId);
          await writeFile(propIndexPath, `${JSON.stringify({ props: nextProps }, null, 2)}\n`, 'utf8');

          if (kind === 'skybox') {
            const sky = {
              id: assetId,
              name: propName,
              imagePath: publicPath,
              thumbnailPath: publicPath
            };
            await updateStageAssetIndex(server.config.root, { skies: [sky] });
            response.statusCode = 200;
            response.setHeader('Content-Type', 'application/json');
            response.end(JSON.stringify({ ok: true, kind, propId, sky }));
            return;
          }

          const floor = {
            id: assetId,
            name: propName,
            texturePath: publicPath,
            thumbnailPath: publicPath,
            repeat: [24, 24],
            sounds: {},
            effects: {}
          };
          await updateStageAssetIndex(server.config.root, { floors: [floor] });
          response.statusCode = 200;
          response.setHeader('Content-Type', 'application/json');
          response.end(JSON.stringify({ ok: true, kind, propId, floor }));
        } catch (error) {
          response.statusCode = 500;
          response.setHeader('Content-Type', 'application/json');
          response.end(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : 'Unknown error' }));
        }
      });

      server.middlewares.use('/__kore/dev/import-stage-floor-sound', async (request: IncomingMessage, response: ServerResponse) => {
        if (request.method !== 'POST') {
          response.statusCode = 405;
          response.setHeader('Content-Type', 'application/json');
          response.end(JSON.stringify({ ok: false, error: 'POST required' }));
          return;
        }

        try {
          const payload = JSON.parse(await readRequestBody(request)) as DevImportStageFloorSoundPayload;
          const floorId = sanitizeAssetId(payload.floorId ?? '');
          const soundKey = payload.soundKey;
          if (!floorId || !soundKey || !['run', 'jump', 'land', 'sprint'].includes(soundKey)) {
            response.statusCode = 400;
            response.setHeader('Content-Type', 'application/json');
            response.end(JSON.stringify({ ok: false, error: 'Invalid floor sound target' }));
            return;
          }
          const audio = dataUrlToAudioBuffer(payload.dataUrl, payload.fileName);
          const soundsDir = resolve(server.config.root, 'public', 'stage-assets', 'floors', floorId, 'sounds');
          await mkdir(soundsDir, { recursive: true });
          const fileName = `${soundKey}.${audio.extension}`;
          await writeFile(resolve(soundsDir, fileName), audio.buffer);
          const soundPath = `/stage-assets/floors/${floorId}/sounds/${fileName}`;
          const floor = await updateStageFloorSound(server.config.root, floorId, soundKey, soundPath);
          response.statusCode = 200;
          response.setHeader('Content-Type', 'application/json');
          response.end(JSON.stringify({ ok: true, floor, soundKey, soundPath }));
        } catch (error) {
          response.statusCode = 500;
          response.setHeader('Content-Type', 'application/json');
          response.end(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : 'Unknown error' }));
        }
      });

      server.middlewares.use('/__kore/dev/update-stage-floor-effects', async (request: IncomingMessage, response: ServerResponse) => {
        if (request.method !== 'POST') {
          response.statusCode = 405;
          response.setHeader('Content-Type', 'application/json');
          response.end(JSON.stringify({ ok: false, error: 'POST required' }));
          return;
        }

        try {
          const payload = JSON.parse(await readRequestBody(request)) as DevUpdateStageFloorEffectsPayload;
          const floorId = sanitizeAssetId(payload.floorId ?? '');
          if (!floorId) {
            response.statusCode = 400;
            response.setHeader('Content-Type', 'application/json');
            response.end(JSON.stringify({ ok: false, error: 'Invalid floor id' }));
            return;
          }
          const floor = await updateStageFloorEffects(server.config.root, floorId, sanitizeFloorEffects(payload.effects));
          response.statusCode = 200;
          response.setHeader('Content-Type', 'application/json');
          response.end(JSON.stringify({ ok: true, floor }));
        } catch (error) {
          response.statusCode = 500;
          response.setHeader('Content-Type', 'application/json');
          response.end(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : 'Unknown error' }));
        }
      });

      server.middlewares.use('/__kore/dev/import-mugen-stage', async (request: IncomingMessage, response: ServerResponse) => {
        if (request.method !== 'POST') {
          response.statusCode = 405;
          response.setHeader('Content-Type', 'application/json');
          response.end(JSON.stringify({ ok: false, error: 'POST required' }));
          return;
        }

        try {
          const payload = JSON.parse(await readRequestBody(request)) as DevImportMugenStagePayload;
          const folderPath = typeof payload.folderPath === 'string' ? payload.folderPath.trim() : '';
          const requestedStageId = typeof payload.stageId === 'string' && payload.stageId.trim()
            ? sanitizeAssetId(payload.stageId)
            : undefined;
          if (!folderPath) {
            response.statusCode = 400;
            response.setHeader('Content-Type', 'application/json');
            response.end(JSON.stringify({ ok: false, error: 'Missing folder path' }));
            return;
          }
          const result = await importMugenStageFolder({
            folderPath,
            stageId: requestedStageId,
            outputRoot: resolve(server.config.root, 'public', 'stage-props')
          });
          response.statusCode = 200;
          response.setHeader('Content-Type', 'application/json');
          response.end(JSON.stringify({ ok: true, ...result }));
        } catch (error) {
          response.statusCode = 500;
          response.setHeader('Content-Type', 'application/json');
          response.end(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : 'Unknown error' }));
        }
      });

      server.middlewares.use('/__kore/dev/import-mugen-stage-files', async (request: IncomingMessage, response: ServerResponse) => {
        if (request.method !== 'POST') {
          response.statusCode = 405;
          response.setHeader('Content-Type', 'application/json');
          response.end(JSON.stringify({ ok: false, error: 'POST required' }));
          return;
        }

        try {
          const payload = JSON.parse(await readRequestBody(request)) as DevImportMugenStageFilesPayload;
          const requestedStageId = typeof payload.stageId === 'string' && payload.stageId.trim()
            ? sanitizeAssetId(payload.stageId)
            : undefined;
          const files = Array.isArray(payload.files)
            ? payload.files
                .filter((file) => typeof file.relativePath === 'string' && typeof file.dataUrl === 'string')
                .map((file) => ({
                  relativePath: file.relativePath as string,
                  data: dataUrlToBuffer(file.dataUrl)
                }))
            : [];
          if (files.length === 0) {
            response.statusCode = 400;
            response.setHeader('Content-Type', 'application/json');
            response.end(JSON.stringify({ ok: false, error: 'No selected folder files received' }));
            return;
          }
          const result = await importMugenStageFiles({
            files,
            stageId: requestedStageId,
            outputRoot: resolve(server.config.root, 'public', 'stage-props')
          });
          response.statusCode = 200;
          response.setHeader('Content-Type', 'application/json');
          response.end(JSON.stringify({ ok: true, ...result }));
        } catch (error) {
          response.statusCode = 500;
          response.setHeader('Content-Type', 'application/json');
          response.end(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : 'Unknown error' }));
        }
      });

      const deleteStageMiddleware = async (request: IncomingMessage, response: ServerResponse) => {
        if (request.method !== 'POST') {
          response.statusCode = 405;
          response.setHeader('Content-Type', 'application/json');
          response.end(JSON.stringify({ ok: false, error: 'POST required' }));
          return;
        }

        try {
          const payload = JSON.parse(await readRequestBody(request)) as DevDeleteStagePayload;
          const stageId = payload.stageId ?? '';
          if (!isSafeId(stageId)) {
            response.statusCode = 400;
            response.setHeader('Content-Type', 'application/json');
            response.end(JSON.stringify({ ok: false, error: 'Invalid stage id' }));
            return;
          }

          await deleteLocalStage(server.config.root, stageId);
          response.statusCode = 200;
          response.setHeader('Content-Type', 'application/json');
          response.end(JSON.stringify({ ok: true, stageId }));
        } catch (error) {
          response.statusCode = 500;
          response.setHeader('Content-Type', 'application/json');
          response.end(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : 'Unknown error' }));
        }
      };

      server.middlewares.use('/__kore/dev/delete-stage', deleteStageMiddleware);
      server.middlewares.use('/__kore/dev/delete-mugen-stage', deleteStageMiddleware);

      server.middlewares.use('/__kore/dev/delete-stage-prop-asset', async (request: IncomingMessage, response: ServerResponse) => {
        if (request.method !== 'POST') {
          response.statusCode = 405;
          response.setHeader('Content-Type', 'application/json');
          response.end(JSON.stringify({ ok: false, error: 'POST required' }));
          return;
        }

        try {
          const payload = JSON.parse(await readRequestBody(request)) as DevDeleteStagePropPayload;
          const propId = typeof payload.propId === 'string' ? payload.propId.trim() : '';
          if (!propId) {
            response.statusCode = 400;
            response.setHeader('Content-Type', 'application/json');
            response.end(JSON.stringify({ ok: false, error: 'Missing prop id' }));
            return;
          }

          const indexPath = resolve(server.config.root, 'public', 'stage-props', 'index.json');
          const manifest = JSON.parse(await readFile(indexPath, 'utf8')) as { props?: Array<Record<string, unknown>> };
          const props = Array.isArray(manifest.props) ? manifest.props : [];
          const prop = props.find((entry) => entry.id === propId);
          if (!prop) {
            response.statusCode = 404;
            response.setHeader('Content-Type', 'application/json');
            response.end(JSON.stringify({ ok: false, error: 'Prop not found' }));
            return;
          }

          const imagePath = typeof prop.imagePath === 'string' ? prop.imagePath : '';
          if (imagePath.startsWith('/stage-props/')) {
            const publicRoot = resolve(server.config.root, 'public');
            const assetPath = resolve(publicRoot, imagePath.replace(/^\/+/, ''));
            const propRoot = resolve(publicRoot, 'stage-props');
            if (assetPath.startsWith(propRoot)) await rm(assetPath, { force: true });
          }
          const nextProps = props.filter((entry) => entry.id !== propId);
          await writeFile(indexPath, `${JSON.stringify({ props: nextProps }, null, 2)}\n`, 'utf8');

          response.statusCode = 200;
          response.setHeader('Content-Type', 'application/json');
          response.end(JSON.stringify({ ok: true, propId }));
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

function sanitizeGetupFrameOverrides(overrides: Record<string, unknown>) {
  const next: Record<string, number> = {};
  ['stand', 'rollUp', 'rollDown', 'rollBack'].forEach((action) => {
    const frames = Math.round(finiteOr(overrides[action], 0));
    if (frames > 0) next[action] = Math.max(12, Math.min(96, frames));
  });
  return next;
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
    'forwardForce',
    'forwardForceStartFrame',
    'forwardForceEndFrame',
    'jumpBeforeMove',
    'moveJumpForce',
    'moveJumpGravity',
    'homingSpeed',
    'pushback',
    'blockPushback',
    'launchHeight',
    'launchVelocity',
    'juggleRefloatVelocity',
    'juggleGravityScale',
    'tornado',
    'throwCapture',
    'endsInCrouch',
    'cancelable',
    'tracking',
    'armorStartFrame',
    'armorEndFrame',
    'usesKi',
    'kiCost',
    'healsHp',
    'healAmount',
    'knockdown',
    'cancelWindows',
    'soundCues'
  ]);
  const next = Object.fromEntries(
    Object.entries(override).filter(([key, value]) => {
      if (!allowed.has(key)) return false;
      if (key === 'label' || key === 'hitLevel' || key === 'tracking') return typeof value === 'string';
      if (key === 'knockdown' || key === 'tornado' || key === 'throwCapture' || key === 'endsInCrouch' || key === 'cancelable' || key === 'jumpBeforeMove' || key === 'usesKi' || key === 'healsHp') {
        return typeof value === 'boolean';
      }
      if (key === 'cancelWindows') return Array.isArray(value);
      if (key === 'soundCues') return Array.isArray(value);
      return Number.isFinite(value);
    })
    .map(([key, value]) => [key, key === 'soundCues' ? sanitizeEffectSoundCues(value) : value])
    .filter(([key, value]) => key !== 'soundCues' || (Array.isArray(value) && value.length > 0))
  );
  if (next.healsHp === true) next.usesKi = true;
  return next;
}

function sanitizeCharacterEffects(effects: Array<Record<string, unknown>>) {
  return effects
    .filter((effect) => effect && typeof effect === 'object')
    .map((effect, index) => sanitizeCharacterEffect(effect, index))
    .filter((effect) => effect.id);
}

function sanitizeCharacterEffect(effect: Record<string, unknown>, index: number) {
  const id = sanitizeAssetId(effect.id) || `effect-${index + 1}`;
  const frames = Array.isArray(effect.frames)
    ? effect.frames
        .filter((frame): frame is string => typeof frame === 'string' && frame.startsWith('/characters/') && /\.(png|webp|jpg|jpeg)$/i.test(frame))
        .slice(0, 1000)
    : [];
  return {
    id,
    name: typeof effect.name === 'string' && effect.name.trim() ? effect.name.trim().slice(0, 120) : id,
    spriteSheetPath: typeof effect.spriteSheetPath === 'string' && effect.spriteSheetPath.startsWith('/characters/') ? effect.spriteSheetPath : undefined,
    frames,
    effectFrameEdits: sanitizeSpriteFrameEditMap((effect.effectFrameEdits as Record<string, Record<string, unknown>> | undefined) ?? {}),
    fps: Math.max(1, Math.min(60, finiteOr(effect.fps, 12))),
    loop: Boolean(effect.loop),
    billboard: effect.billboard !== false,
    blendMode: safeBlendMode(effect.blendMode),
    anchor: safeEffectAnchor(effect.anchor),
    defaultTransform: sanitizeEffectTransform(effect.defaultTransform),
    proceduralLayers: sanitizeProceduralLayers(effect.proceduralLayers),
    soundCues: sanitizeEffectSoundCues(effect.soundCues)
  };
}

function sanitizeCharacterMoveEffects(moveEffects: Record<string, Array<Record<string, unknown>>>) {
  return Object.fromEntries(
    Object.entries(moveEffects)
      .filter(([key, value]) => key.length > 0 && Array.isArray(value))
      .map(([key, value]) => [key, value.map((instance, index) => sanitizeMoveEffectInstance(instance, index)).filter((instance) => instance.effectId)])
      .filter(([, value]) => value.length > 0)
  );
}

function sanitizeMoveEffectInstance(instance: Record<string, unknown>, index: number) {
  const keyframes = Array.isArray(instance.keyframes)
    ? instance.keyframes
        .filter((keyframe): keyframe is Record<string, unknown> => Boolean(keyframe) && typeof keyframe === 'object')
        .map((keyframe) => {
          const frame = Math.max(0, Math.round(finiteOr(keyframe.frame, 0)));
          const endFrame = keyframe.endFrame === undefined ? undefined : Math.max(frame, Math.round(finiteOr(keyframe.endFrame, frame)));
          return {
            frame,
            ...(endFrame === undefined ? {} : { endFrame }),
            ...sanitizeEffectTransform(keyframe)
          };
        })
        .sort((a, b) => a.frame - b.frame)
        .slice(0, 120)
    : [];
  return {
    id: sanitizeAssetId(instance.id) || `instance-${index + 1}`,
    effectId: sanitizeAssetId(instance.effectId),
    name: typeof instance.name === 'string' && instance.name.trim() ? instance.name.trim().slice(0, 120) : undefined,
    startFrame: Math.max(0, Math.round(finiteOr(instance.startFrame, 0))),
    endFrame: Math.max(0, Math.round(finiteOr(instance.endFrame, 30))),
    layer: Math.max(-50, Math.min(50, Math.round(finiteOr(instance.layer, index)))),
    anchor: safeEffectAnchor(instance.anchor),
    mirrorWithFacing: instance.mirrorWithFacing !== false,
    loop: Boolean(instance.loop),
    keyframes,
    soundCues: sanitizeEffectSoundCues(instance.soundCues)
  };
}

function sanitizeEffectSoundCues(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((cue): cue is Record<string, unknown> => Boolean(cue) && typeof cue === 'object')
    .map((cue, index) => ({
      id: sanitizeAssetId(cue.id) || `cue-${index + 1}`,
      name: typeof cue.name === 'string' && cue.name.trim() ? cue.name.trim().slice(0, 80) : undefined,
      path: typeof cue.path === 'string' && cue.path.startsWith('/characters/') && /\.(wav|mp3|ogg|webm)$/i.test(cue.path) ? cue.path : '',
      frame: Math.max(0, Math.round(finiteOr(cue.frame, 0))),
      volume: Math.max(0, Math.min(1, finiteOr(cue.volume, 0.8))),
      pitch: Math.max(0.25, Math.min(4, finiteOr(cue.pitch, 1))),
      pan: Math.max(-1, Math.min(1, finiteOr(cue.pan, 0))),
      retrigger: Boolean(cue.retrigger)
    }))
    .filter((cue) => cue.path)
    .slice(0, 80);
}

function sanitizeProceduralLayers(value: unknown) {
  if (!Array.isArray(value)) return [];
  const allowedKinds = new Set(['lightning', 'wind', 'ring', 'glow', 'trail', 'shards']);
  return value
    .filter((layer): layer is Record<string, unknown> => Boolean(layer) && typeof layer === 'object')
    .map((layer, index) => ({
      id: sanitizeAssetId(layer.id) || `layer-${index + 1}`,
      kind: typeof layer.kind === 'string' && allowedKinds.has(layer.kind) ? layer.kind : 'glow',
      color: sanitizeColor(layer.color, '#fff3a0'),
      secondaryColor: sanitizeColor(layer.secondaryColor, '#2ee6ff'),
      intensity: Math.max(0, Math.min(5, finiteOr(layer.intensity, 1))),
      count: Math.max(1, Math.min(80, Math.round(finiteOr(layer.count, 10)))),
      thickness: Math.max(0.005, Math.min(1, finiteOr(layer.thickness, 0.08))),
      length: Math.max(0.05, Math.min(12, finiteOr(layer.length, 1.2))),
      spin: finiteOr(layer.spin, 0)
    }))
    .slice(0, 24);
}

function sanitizeEffectTransform(value: unknown) {
  const transform = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  return {
    position: normalizeVec3(transform.position, [0, 1.2, 0]),
    scale: normalizeVec3(transform.scale, [1, 1, 1]),
    rotation: normalizeVec3(transform.rotation, [0, 0, 0]),
    opacity: Math.max(0, Math.min(1, finiteOr(transform.opacity, 1))),
    color: sanitizeColor(transform.color, '#ffffff')
  };
}

function safeEffectAnchor(value: unknown) {
  return typeof value === 'string' && ['root', 'body', 'head', 'hands', 'feet', 'hitbox', 'world'].includes(value) ? value : 'body';
}

function safeBlendMode(value: unknown) {
  return typeof value === 'string' && ['normal', 'additive', 'screen', 'multiply'].includes(value) ? value : 'additive';
}

function sanitizeColor(value: unknown, fallback: string) {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
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

function devSubmitLeaderboardResult(entries: Map<string, DevLeaderboardEntry>, payload: DevLeaderboardSubmitPayload) {
  const winner = sanitizeLeaderboardProfile(payload.winner);
  const loser = sanitizeLeaderboardProfile(payload.loser);
  if (!winner || !loser || winner.playerId === loser.playerId) throw new Error('Invalid leaderboard result');
  const now = Date.now();
  const winnerEntry = entries.get(winner.playerId) ?? { ...winner, points: 0, updatedAt: now };
  winnerEntry.displayName = winner.displayName;
  winnerEntry.points += DEV_LEADERBOARD_POINTS_PER_WIN;
  winnerEntry.updatedAt = now;
  entries.set(winner.playerId, winnerEntry);
  return { entries: sortDevLeaderboard([...entries.values()]).slice(0, 100) };
}

function sanitizeLeaderboardProfile(value: Partial<DevLeaderboardEntry> | undefined): Pick<DevLeaderboardEntry, 'playerId' | 'displayName'> | null {
  const playerId = typeof value?.playerId === 'string' ? value.playerId.replace(/[^a-zA-Z0-9-]/g, '').slice(0, 96) : '';
  const displayName = typeof value?.displayName === 'string'
    ? value.displayName.toUpperCase().replace(/[^A-Z0-9 _-]/g, '').replace(/\s+/g, ' ').trim().slice(0, 12)
    : '';
  return playerId && displayName ? { playerId, displayName } : null;
}

function sortDevLeaderboard(entries: DevLeaderboardEntry[]) {
  return [...entries].sort((a, b) => {
    return b.points - a.points || b.updatedAt - a.updatedAt || a.displayName.localeCompare(b.displayName);
  });
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

function dataUrlToBuffer(dataUrl: unknown) {
  if (typeof dataUrl !== 'string') throw new Error('Missing data URL');
  const match = dataUrl.match(/^data:[^;]+;base64,([a-z0-9+/=]+)$/i);
  if (!match) throw new Error('Invalid data URL');
  return Buffer.from(match[1], 'base64');
}

function dataUrlToImageBuffer(dataUrl: unknown) {
  if (typeof dataUrl !== 'string') throw new Error('Missing image data URL');
  const match = dataUrl.match(/^data:image\/(png|webp|jpe?g);base64,([a-z0-9+/=]+)$/i);
  if (!match) throw new Error('Invalid image data URL');
  const kind = match[1].toLowerCase();
  return {
    buffer: Buffer.from(match[2], 'base64'),
    extension: kind === 'jpeg' || kind === 'jpg' ? 'jpg' : kind
  };
}

function dataUrlToAudioBuffer(dataUrl: unknown, fileName: unknown) {
  if (typeof dataUrl !== 'string') throw new Error('Missing audio data URL');
  const match = dataUrl.match(/^data:audio\/([^;]+);base64,([a-z0-9+/=]+)$/i);
  if (!match) throw new Error('Invalid audio data URL');
  const mimeKind = match[1].toLowerCase();
  const nameExtension = typeof fileName === 'string' ? fileName.split('.').pop()?.toLowerCase() : '';
  const extension =
    nameExtension && ['mp3', 'wav', 'ogg', 'webm', 'm4a'].includes(nameExtension) ? nameExtension :
    mimeKind.includes('mpeg') || mimeKind.includes('mp3') ? 'mp3' :
    mimeKind.includes('wav') ? 'wav' :
    mimeKind.includes('ogg') ? 'ogg' :
    mimeKind.includes('webm') ? 'webm' :
    'mp3';
  return {
    extension,
    buffer: Buffer.from(match[2], 'base64')
  };
}

function dataUrlToMediaBuffer(dataUrl: unknown) {
  if (typeof dataUrl !== 'string') throw new Error('Missing media data URL');
  const match = dataUrl.match(/^data:(audio\/(?:wav|wave|mpeg|mp3|ogg|webm)|application\/octet-stream);base64,([a-z0-9+/=]+)$/i);
  if (!match) throw new Error('Invalid audio data URL');
  return Buffer.from(match[2], 'base64');
}

function sanitizeMediaFileName(value: unknown) {
  const raw = typeof value === 'string' && value.trim() ? value.trim() : 'sound.wav';
  const extensionMatch = raw.match(/\.(wav|mp3|ogg|webm)$/i);
  const extension = extensionMatch ? extensionMatch[1].toLowerCase() : 'wav';
  const stem = raw.replace(/\.[^.]+$/, '').toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'sound';
  return `${stem}.${extension}`;
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

function sanitizeAnimationScaleMap(scales: Record<string, Record<string, unknown>>) {
  return Object.fromEntries(
    Object.entries(scales)
      .filter(([key, value]) => key.length > 0 && value && typeof value === 'object')
      .map(([key, value]) => [
        key,
        {
          width: Number(Math.max(0.25, Math.min(2.5, finiteOr(value.width, 1))).toFixed(2)),
          height: Number(Math.max(0.25, Math.min(2.5, finiteOr(value.height, 1))).toFixed(2)),
          offsetX: Number(Math.max(-6, Math.min(6, finiteOr(value.offsetX, 0))).toFixed(2))
        }
      ])
      .filter(([, value]) => {
        const size = value as { width: number; height: number; offsetX: number };
        return size.width !== 1 || size.height !== 1 || size.offsetX !== 0;
      })
  );
}

function sanitizeCharacterModelScale(scale: Record<string, unknown> | undefined, legacyScale = 1) {
  const fallback = Number(Math.max(0.25, Math.min(2.5, finiteOr(legacyScale, 1))).toFixed(2));
  return {
    width: Number(Math.max(0.25, Math.min(2.5, finiteOr(scale?.width, fallback))).toFixed(2)),
    height: Number(Math.max(0.25, Math.min(2.5, finiteOr(scale?.height, fallback))).toFixed(2))
  };
}

function sanitizeAnimationFrameScaleMap(scales: Record<string, Record<string, Record<string, unknown>>>) {
  return Object.fromEntries(
    Object.entries(scales)
      .filter(([key, value]) => key.length > 0 && value && typeof value === 'object')
      .map(([key, value]) => [
        key,
        Object.fromEntries(
          Object.entries(value)
            .filter(([frameIndex, frameScale]) => /^\d+$/.test(frameIndex) && frameScale && typeof frameScale === 'object')
            .map(([frameIndex, frameScale]) => [
              frameIndex,
              {
                width: Number(Math.max(0.25, Math.min(2.5, finiteOr(frameScale.width, 1))).toFixed(2)),
                height: Number(Math.max(0.25, Math.min(2.5, finiteOr(frameScale.height, 1))).toFixed(2)),
                offsetX: Number(Math.max(-6, Math.min(6, finiteOr(frameScale.offsetX, 0))).toFixed(2))
              }
            ])
            .filter(([, value]) => {
              const size = value as { width: number; height: number; offsetX: number };
              return size.width !== 1 || size.height !== 1 || size.offsetX !== 0;
            })
        )
      ])
      .filter(([, value]) => Object.keys(value as Record<string, unknown>).length > 0)
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
    source: sanitizeHdVoxelSource(payload.source)
  };
}

function sanitizeHdVoxelSource(source: unknown) {
  if (!source || typeof source !== 'object') return undefined;
  const value = source as Record<string, unknown>;
  return {
    frame: typeof value.frame === 'string' ? value.frame.slice(0, 240) : undefined,
    width: Math.max(1, Math.round(finiteOr(value.width, 1))),
    height: Math.max(1, Math.round(finiteOr(value.height, 1))),
    sampleStep: Math.max(1, Math.round(finiteOr(value.sampleStep, 1))),
    foregroundWidth: Math.max(0, Math.round(finiteOr(value.foregroundWidth, 0))),
    foregroundHeight: Math.max(0, Math.round(finiteOr(value.foregroundHeight, 0))),
    baselineForegroundHeight: Math.max(0, Math.round(finiteOr(value.baselineForegroundHeight, 0))),
    modelHeight: Number(Math.max(0, finiteOr(value.modelHeight, 0)).toFixed(5)),
    modelHeightScale: Number(Math.max(1, finiteOr(value.modelHeightScale, 1)).toFixed(5))
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
    hidden: Boolean(edit.hidden),
    revision: Number.isFinite(edit.revision) ? Math.max(0, Math.round(Number(edit.revision))) : undefined
  };
}

function sanitizeAssetId(value: unknown) {
  return typeof value === 'string'
    ? value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48)
    : '';
}

function sanitizeCharacterReference(value: unknown, characterId: string) {
  const next = sanitizeAssetId(value);
  return next && next !== characterId ? next : '';
}

function sanitizeCharacterAssetPath(value: unknown, characterId: string) {
  if (typeof value !== 'string') return '';
  const allowedPrefix = `/characters/${characterId}/`;
  if (!value.startsWith(allowedPrefix)) return '';
  const fileName = value.slice(allowedPrefix.length);
  return /^[a-z0-9][a-z0-9._/-]*\.(png|webp|jpe?g)$/i.test(fileName) && !fileName.includes('..') ? value : '';
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

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
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

async function removeStageFromIndex(root: string, stageId: string) {
  const indexPath = resolve(root, 'public', 'stages', 'index.json');
  let ids: string[] = [];
  try {
    const index = JSON.parse(await readFile(indexPath, 'utf8')) as { stages?: string[] };
    ids = Array.isArray(index.stages) ? index.stages : [];
  } catch {
    ids = [];
  }
  await mkdir(dirname(indexPath), { recursive: true });
  await writeFile(indexPath, `${JSON.stringify({ stages: ids.filter((id) => id !== stageId) }, null, 2)}\n`, 'utf8');
}

async function deleteLocalStage(root: string, stageId: string) {
  const stagesRoot = resolve(root, 'public', 'stages');
  const stageDir = resolve(stagesRoot, stageId);
  if (!stageDir.startsWith(`${stagesRoot}/`)) {
    throw Object.assign(new Error('Unsafe stage path.'), { statusCode: 400 });
  }

  const manifestPath = resolve(stageDir, 'stage.json');
  try {
    JSON.parse(await readFile(manifestPath, 'utf8')) as Record<string, unknown>;
  } catch {
    throw Object.assign(new Error('Only local stages saved in public/stages can be deleted.'), { statusCode: 404 });
  }

  await rm(stageDir, { recursive: true, force: true });
  await removeStageFromIndex(root, stageId);
}

async function updateStagePropIndex(root: string, props: Array<Record<string, unknown>>) {
  const indexPath = resolve(root, 'public', 'stage-props', 'index.json');
  let existing: Array<Record<string, unknown>> = [];
  try {
    const manifest = JSON.parse(await readFile(indexPath, 'utf8')) as { props?: Array<Record<string, unknown>> };
    existing = Array.isArray(manifest.props) ? manifest.props : [];
  } catch {
    existing = [];
  }
  const next = new Map<string, Record<string, unknown>>();
  existing.forEach((prop) => {
    if (typeof prop.id === 'string') next.set(prop.id, prop);
  });
  props.forEach((prop) => {
    if (typeof prop.id === 'string') next.set(prop.id, prop);
  });
  await mkdir(dirname(indexPath), { recursive: true });
  await writeFile(indexPath, `${JSON.stringify({ props: [...next.values()] }, null, 2)}\n`, 'utf8');
}

async function updateStageAssetIndex(root: string, patch: { floors?: Array<Record<string, unknown>>; skies?: Array<Record<string, unknown>> }) {
  const indexPath = resolve(root, 'public', 'stage-assets', 'index.json');
  let floors: Array<Record<string, unknown>> = [];
  let skies: Array<Record<string, unknown>> = [];
  try {
    const manifest = JSON.parse(await readFile(indexPath, 'utf8')) as { floors?: Array<Record<string, unknown>>; skies?: Array<Record<string, unknown>> };
    floors = Array.isArray(manifest.floors) ? manifest.floors : [];
    skies = Array.isArray(manifest.skies) ? manifest.skies : [];
  } catch {
    floors = [];
    skies = [];
  }
  const floorMap = new Map<string, Record<string, unknown>>();
  const skyMap = new Map<string, Record<string, unknown>>();
  floors.forEach((floor) => {
    if (typeof floor.id === 'string') floorMap.set(floor.id, floor);
  });
  skies.forEach((sky) => {
    if (typeof sky.id === 'string') skyMap.set(sky.id, sky);
  });
  patch.floors?.forEach((floor) => {
    if (typeof floor.id === 'string') floorMap.set(floor.id, floor);
  });
  patch.skies?.forEach((sky) => {
    if (typeof sky.id === 'string') skyMap.set(sky.id, sky);
  });
  await mkdir(dirname(indexPath), { recursive: true });
  await writeFile(indexPath, `${JSON.stringify({ floors: [...floorMap.values()], skies: [...skyMap.values()] }, null, 2)}\n`, 'utf8');
}

async function updateStageFloorSound(root: string, floorId: string, soundKey: 'run' | 'jump' | 'land' | 'sprint', soundPath: string) {
  const indexPath = resolve(root, 'public', 'stage-assets', 'index.json');
  let manifest: { floors?: Array<Record<string, unknown>>; skies?: Array<Record<string, unknown>> } = {};
  try {
    manifest = JSON.parse(await readFile(indexPath, 'utf8')) as { floors?: Array<Record<string, unknown>>; skies?: Array<Record<string, unknown>> };
  } catch {
    manifest = { floors: [], skies: [] };
  }
  const floors = Array.isArray(manifest.floors) ? manifest.floors : [];
  const floor = floors.find((entry) => entry.id === floorId);
  if (!floor) throw new Error(`Floor asset not found: ${floorId}`);
  const sounds = floor.sounds && typeof floor.sounds === 'object' ? floor.sounds as Record<string, unknown> : {};
  floor.sounds = { ...sounds, [soundKey]: soundPath };
  await updateStageAssetIndex(root, { floors });
  return floor;
}

async function updateStageFloorEffects(root: string, floorId: string, effects: Record<string, unknown> | undefined) {
  const indexPath = resolve(root, 'public', 'stage-assets', 'index.json');
  let manifest: { floors?: Array<Record<string, unknown>>; skies?: Array<Record<string, unknown>> } = {};
  try {
    manifest = JSON.parse(await readFile(indexPath, 'utf8')) as { floors?: Array<Record<string, unknown>>; skies?: Array<Record<string, unknown>> };
  } catch {
    manifest = { floors: [], skies: [] };
  }
  const floors = Array.isArray(manifest.floors) ? manifest.floors : [];
  const floor = floors.find((entry) => entry.id === floorId);
  if (!floor) throw new Error(`Floor asset not found: ${floorId}`);
  floor.effects = effects;
  await updateStageAssetIndex(root, { floors });
  return floor;
}

export function sanitizeStageManifest(stage: Record<string, unknown>, stageId: string) {
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
    renderMode: sanitizeStageRenderMode(stage.renderMode),
    hidden: Boolean(stage.hidden),
    floor: colors.floor,
    floorAssetId: typeof stage.floorAssetId === 'string' ? stage.floorAssetId : undefined,
    floorTexturePath: typeof stage.floorTexturePath === 'string' ? stage.floorTexturePath : undefined,
    floorTextureRepeat: Array.isArray(stage.floorTextureRepeat)
      ? [finiteOr(stage.floorTextureRepeat[0], 24), finiteOr(stage.floorTextureRepeat[1], 24)]
      : undefined,
    floorSounds: sanitizeFloorSounds(stage.floorSounds),
    floorEffects: sanitizeFloorEffects(stage.floorEffects),
    rail: colors.rail,
    light: colors.light,
    skyboxAssetId: typeof stage.skyboxAssetId === 'string' ? stage.skyboxAssetId : undefined,
    skyboxPath: typeof stage.skyboxPath === 'string' ? stage.skyboxPath : undefined,
    sourcePath: typeof stage.sourcePath === 'string' ? stage.sourcePath : `/stages/${stageId}/source.png`,
    thumbnailPath: typeof stage.thumbnailPath === 'string' ? stage.thumbnailPath : undefined,
    world: sanitizeStageWorld(stage.world),
    camera: stage.camera && typeof stage.camera === 'object' ? stage.camera : undefined,
    lighting: stage.lighting && typeof stage.lighting === 'object' ? stage.lighting : undefined,
    type: stage.type === 'model-stage' ? 'model-stage' : undefined,
    fightPlane: sanitizeFightPlane(stage.fightPlane),
    spawns: sanitizeSpawns(stage.spawns),
    collision: sanitizeCollision(stage.collision),
    model: sanitizeStageModel(stage.model),
    backgroundLayers: sanitizeStageLayers(stage.backgroundLayers),
    props: sanitizeStageProps(stage.props)
  };
}

function sanitizeStageRenderMode(value: unknown) {
  return value === 'spriteCutout' || value === 'model' ? value : 'procedural';
}

function sanitizeStageModel(value: unknown) {
  if (!value || typeof value !== 'object') return undefined;
  const model = value as Record<string, unknown>;
  const path = typeof model.path === 'string' && model.path.trim()
    ? model.path
    : typeof model.url === 'string' && model.url.trim()
      ? model.url
      : '';
  if (!path) return undefined;
  const bounds = model.bounds && typeof model.bounds === 'object' ? model.bounds as Record<string, unknown> : undefined;
  return {
    path,
    url: typeof model.url === 'string' && model.url.trim() ? model.url : path,
    format: model.format === 'gltf' || model.format === 'fbx' ? model.format : 'glb',
    position: normalizeVec3(model.position, [0, 0, 0]),
    scale: normalizeVec3(model.scale, [1, 1, 1]),
    rotation: normalizeVec3(model.rotation, [0, 0, 0]),
    focus: normalizeVec3(model.focus, [0, 0.8, 0]),
    bounds: bounds
      ? {
          center: normalizeVec3(bounds.center, [0, 0, 0]),
          size: normalizeVec3(bounds.size, [1, 1, 1]),
          radius: Math.max(0, finiteOr(bounds.radius, 0))
        }
      : undefined,
    castShadow: model.castShadow !== false,
    receiveShadow: model.receiveShadow !== false,
    decorativeProps: sanitizeStageProps(model.decorativeProps)
  };
}

function sanitizeFightPlane(value: unknown) {
  if (!value || typeof value !== 'object') return undefined;
  const source = value as Record<string, unknown>;
  return {
    center: normalizeVec3(source.center, [0, 0, 0]),
    width: Math.max(4, finiteOr(source.width, 24)),
    depth: Math.max(4, finiteOr(source.depth, 16)),
    y: finiteOr(source.y, 0),
    rotationY: finiteOr(source.rotationY, 0)
  };
}

function sanitizeSpawns(value: unknown) {
  if (!value || typeof value !== 'object') return undefined;
  const source = value as Record<string, unknown>;
  return {
    p1: normalizeVec3(source.p1, [-2.2, 0, 0]),
    p2: normalizeVec3(source.p2, [2.2, 0, 0])
  };
}

function sanitizeCollision(value: unknown) {
  if (!value || typeof value !== 'object') return undefined;
  const mode = (value as Record<string, unknown>).mode;
  return { mode: mode === 'mesh' || mode === 'none' ? mode : 'box' };
}

function sanitizeFloorSounds(value: unknown) {
  if (!value || typeof value !== 'object') return undefined;
  const source = value as Record<string, unknown>;
  const sounds: Record<string, string> = {};
  ['run', 'jump', 'land', 'sprint'].forEach((key) => {
    if (typeof source[key] === 'string' && source[key]) sounds[key] = source[key] as string;
  });
  return Object.keys(sounds).length ? sounds : undefined;
}

function sanitizeFloorEffects(value: unknown) {
  if (!value || typeof value !== 'object') return undefined;
  const source = value as Record<string, unknown>;
  const grass = source.grass && typeof source.grass === 'object' ? source.grass as Record<string, unknown> : undefined;
  const effects: Record<string, unknown> = {};
  if (grass) {
    effects.grass = {
      enabled: grass.enabled === true,
      density: clamp(finiteOr(grass.density, 0.45), 0.05, 1),
      height: clamp(finiteOr(grass.height, 0.28), 0.04, 1.8),
      patchWidth: clamp(finiteOr(grass.patchWidth, 220), 4, 520),
      patchDepth: clamp(finiteOr(grass.patchDepth, 220), 4, 520),
      bladeCount: clamp(finiteOr(grass.bladeCount, 0), 0, 120000),
      bladeWidth: clamp(finiteOr(grass.bladeWidth, 0.075), 0.01, 0.4),
      segments: Math.round(clamp(finiteOr(grass.segments, 5), 2, 10)),
      coverageScale: clamp(finiteOr(grass.coverageScale, 1.08), 0.2, 2),
      colorVariation: clamp(finiteOr(grass.colorVariation, 0.18), 0, 1),
      windDirection: Array.isArray(grass.windDirection) ? [finiteOr(grass.windDirection[0], 1), finiteOr(grass.windDirection[1], 0.35)] : [1, 0.35],
      windNoiseScale: clamp(finiteOr(grass.windNoiseScale, 0.58), 0.02, 4),
      quality: grass.quality === 'low' || grass.quality === 'medium' || grass.quality === 'high' ? grass.quality : 'medium',
      windStrength: clamp(finiteOr(grass.windStrength, 0.14), 0, 0.8),
      windSpeed: clamp(finiteOr(grass.windSpeed, 1.1), 0, 4),
      colorBottom: typeof grass.colorBottom === 'string' && grass.colorBottom ? grass.colorBottom : '#174d25',
      colorTop: typeof grass.colorTop === 'string' && grass.colorTop ? grass.colorTop : '#7bd34d'
    };
  }
  [
    'dust',
    'footsteps',
    'impact',
    'petals',
    'snow',
    'rain',
    'rainPuddles',
    'ripples',
    'energy',
    'fog',
    'heat',
    'glowTrails',
    'windStreaks',
    'cherryBurst',
    'tileShimmer',
    'debris'
  ].forEach((key) => {
    const effect = source[key];
    if (effect && typeof effect === 'object') effects[key] = sanitizeSimpleFloorEffect(effect);
  });
  return Object.keys(effects).length ? effects : undefined;
}

function sanitizeSimpleFloorEffect(value: unknown) {
  const source = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  return {
    enabled: source.enabled === true,
    intensity: clamp(finiteOr(source.intensity, 0.6), 0, 2),
    density: clamp(finiteOr(source.density, 0.45), 0, 1),
    size: clamp(finiteOr(source.size, 1), 0.05, 12),
    speed: clamp(finiteOr(source.speed, 1), 0, 6),
    opacity: clamp(finiteOr(source.opacity, 0.55), 0, 1),
    radius: clamp(finiteOr(source.radius, 1.4), 0.05, 24),
    strength: clamp(finiteOr(source.strength, 0.35), 0, 2),
    lifetime: clamp(finiteOr(source.lifetime, 900), 100, 6000),
    amount: clamp(finiteOr(source.amount, 80), 0, 800),
    maxParticles: Math.round(clamp(finiteOr(source.maxParticles, 0), 0, 5000)),
    maxDecals: Math.round(clamp(finiteOr(source.maxDecals, 0), 0, 256)),
    spread: clamp(finiteOr(source.spread, 1), 0, 4),
    coverageScale: clamp(finiteOr(source.coverageScale, 1.08), 0.2, 2),
    decay: clamp(finiteOr(source.decay, 0.86), 0, 1),
    atlasPath: typeof source.atlasPath === 'string' && source.atlasPath ? source.atlasPath : undefined,
    frameCount: Math.round(clamp(finiteOr(source.frameCount, 1), 1, 64)),
    reactive: typeof source.reactive === 'boolean' ? source.reactive : undefined,
    quality: source.quality === 'low' || source.quality === 'medium' || source.quality === 'high' ? source.quality : undefined,
    windStrength: clamp(finiteOr(source.windStrength, 0.35), 0, 2),
    fallSpeed: clamp(finiteOr(source.fallSpeed, 0.8), 0, 4),
    pulseSpeed: clamp(finiteOr(source.pulseSpeed, 1.2), 0, 6),
    color: typeof source.color === 'string' && source.color ? source.color : undefined,
    colorA: typeof source.colorA === 'string' && source.colorA ? source.colorA : undefined,
    colorB: typeof source.colorB === 'string' && source.colorB ? source.colorB : undefined
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
        opacity: Math.max(0, Math.min(1, finiteOr(layer.opacity, 1))),
        followCamera: Boolean(layer.followCamera),
        parallax: normalizeVec2(layer.parallax, [1, 1]),
        tile: normalizeVec2(layer.tile, [0, 0]),
        tileSpacing: normalizeVec2(layer.tileSpacing, [0, 0]),
        sourceSprite: normalizeOptionalVec2(layer.sourceSprite)
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

function normalizeVec2(value: unknown, fallback: [number, number]): [number, number] {
  if (!Array.isArray(value) || value.length < 2) return fallback;
  return [finiteOr(value[0], fallback[0]), finiteOr(value[1], fallback[1])];
}

function normalizeOptionalVec2(value: unknown): [number, number] | undefined {
  if (!Array.isArray(value) || value.length < 2) return undefined;
  return [finiteOr(value[0], 0), finiteOr(value[1], 0)];
}

function sanitizeImportedManifest(manifest: Record<string, unknown>, characterId: string, frameCount: number) {
  const displayName = typeof manifest.displayName === 'string' && manifest.displayName.trim() ? manifest.displayName.trim() : characterId;
  const colors = manifest.colors && typeof manifest.colors === 'object' ? manifest.colors as Record<string, unknown> : {};
  const stats = manifest.stats && typeof manifest.stats === 'object' ? manifest.stats as Record<string, unknown> : {};
  const animationFrames = sanitizeFrameMap((manifest.animationFrames as Record<string, string[]> | undefined) ?? {});
  const animationFrameRates = sanitizeRateMap((manifest.animationFrameRates as Record<string, number> | undefined) ?? {});
  const animationScales = sanitizeAnimationScaleMap((manifest.animationScales as Record<string, Record<string, unknown>> | undefined) ?? {});
  const animationFrameScales = sanitizeAnimationFrameScaleMap((manifest.animationFrameScales as Record<string, Record<string, Record<string, unknown>>> | undefined) ?? {});
  const moves = Array.isArray(manifest.moves) ? manifest.moves : [];
  return {
    ...manifest,
    id: characterId,
    displayName,
    locked: Boolean(manifest.locked),
    unplayable: Boolean(manifest.unplayable),
    variant: Boolean(manifest.variant),
    variantOf: Boolean(manifest.variant) ? sanitizeCharacterReference(manifest.variantOf, characterId) || undefined : undefined,
    hasTransform: Boolean(manifest.hasTransform),
    transformCharacterId: Boolean(manifest.hasTransform) ? sanitizeCharacterReference(manifest.transformCharacterId, characterId) || undefined : undefined,
    faceCardPath: sanitizeCharacterAssetPath(manifest.faceCardPath, characterId) || undefined,
    renderMode: 'spriteVoxel',
    modelPath: `spritevoxel://${characterId}`,
    spriteSheetPath: `/characters/${characterId}/animation-sheet.png`,
    spriteSheets: sanitizeSpriteSheets(manifest.spriteSheets, manifest.spriteSheetPath, characterId, frameCount),
    spriteFrameCount: frameCount,
    voxelProfile: 'image-source',
    animationFrames,
    animationFrameRates,
    animationScales,
    animationFrameScales,
    animationFps: Math.max(1, finiteOr(manifest.animationFps, 6)),
    scale: Math.max(0.25, finiteOr(manifest.scale, 1.08)),
    modelScale: sanitizeCharacterModelScale(manifest.modelScale as Record<string, unknown> | undefined, Math.max(0.25, finiteOr(manifest.scale, 1.08))),
    cameraOffset: Array.isArray(manifest.cameraOffset) && manifest.cameraOffset.length >= 3 ? manifest.cameraOffset : [0, 1.22, 0],
    stats: {
      health: Math.max(1, Math.round(finiteOr(stats.health, 100))),
      speed: Math.max(1, finiteOr(stats.speed, 5)),
      sidestepSpeed: Math.max(1, finiteOr(stats.sidestepSpeed, 4.35)),
      dashDistance: Math.min(2.4, Math.max(0, finiteOr(stats.dashDistance, 0.78))),
      jumpForce: Math.max(1, finiteOr(stats.jumpForce, 8)),
      gravity: Math.max(1, finiteOr(stats.gravity, 18))
    },
    moves,
    moveOverrides: sanitizeMoveOverrideMap((manifest.moveOverrides as Record<string, Record<string, unknown>> | undefined) ?? {}),
    getupFrameOverrides: sanitizeGetupFrameOverrides((manifest.getupFrameOverrides as Record<string, unknown> | undefined) ?? {}),
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
