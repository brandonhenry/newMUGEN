import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadStageRoster, normalizeStage } from './stageLoader';
import { convertMugenDefToPropAssets, convertMugenDefToStage, parseMugenDef, referencedMugenSprites } from './mugenStage';
import { sanitizeStageManifest } from './stageManifestSanitizer';

const cherryBlossomsDef = `
[Info]
name = "Cherry Blossoms - Angry Birds Seasons"
displayname = "Cherry Blossoms"

[Camera]
boundleft = -650
boundright = 650

[PlayerInfo]
leftbound = -1600
rightbound = 1600

[StageInfo]
zoffset = 380
localcoord = 640,480

[Music]
bgmusic = sound/Cherry Blossoms.mp3

[BGdef]
spr = Cherry_Blossom.sff

[BG Background]
type = normal
spriteno = 0,0
start = 0, 0
delta = 1.04,1
tile = 1,0

[BG Mountain]
type = normal
spriteno = 0,1
start = 0, 0
delta = 1,1
mask = 1

[BG Ground]
type = normal
spriteno = 0,5
start = 0, 0
delta = 1.18,1
tile = 1,0
mask = 1
`;

describe('MUGEN stage parsing', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('parses DEF stage metadata and BG layers', () => {
    const parsed = parseMugenDef(cherryBlossomsDef);
    expect(parsed.info.displayname).toBe('"Cherry Blossoms"');
    expect(parsed.bgDef.spr).toBe('Cherry_Blossom.sff');
    expect(parsed.bgLayers).toHaveLength(3);
    expect(parsed.bgLayers[0]).toMatchObject({
      name: 'Background',
      sprite: [0, 0],
      delta: [1.04, 1],
      tile: [1, 0]
    });
    expect(referencedMugenSprites(parsed)).toEqual([[0, 0], [0, 1], [0, 5]]);
  });

  it('converts parsed MUGEN sprites into KORE floor texture and editable voxel props', () => {
    const parsed = parseMugenDef(cherryBlossomsDef);
    const stage = convertMugenDefToStage(parsed, {
      stageId: 'cherry-blossoms',
      sourceDef: 'Cherry_Blossom.def',
      sourceSff: 'Cherry_Blossom.sff',
      musicPath: '/stages/cherry-blossoms/music/Cherry Blossoms.mp3',
      spriteAssets: [
        { sprite: [0, 0], imagePath: '/stages/cherry-blossoms/mugen/sprites/0-0.png', width: 1024, height: 512 },
        { sprite: [0, 1], imagePath: '/stages/cherry-blossoms/mugen/sprites/0-1.png', width: 532, height: 177 },
        { sprite: [0, 5], imagePath: '/stages/cherry-blossoms/mugen/sprites/0-5.png', width: 1020, height: 186 }
      ],
      spritePathFor: ([group, image]) => `/stages/cherry-blossoms/mugen/sprites/${group}-${image}.png`
    });

    expect(stage.renderMode).toBe('spriteCutout');
    expect(stage.hidden).toBe(true);
    expect(stage.name).toBe('Cherry Blossoms');
    expect(stage.music?.path).toBe('/stages/cherry-blossoms/music/Cherry Blossoms.mp3');
    expect(stage.floorTexturePath).toBe('/stages/cherry-blossoms/mugen/sprites/0-5.png');
    expect(stage.backgroundLayers).toHaveLength(0);
    expect(stage.props).toHaveLength(2);
    expect(stage.props?.[0]).toMatchObject({
      id: 'mugen-sprite-0-0',
      name: 'Background',
      imagePath: '/stages/cherry-blossoms/mugen/sprites/0-0.png',
      renderMode: 'voxel',
      hidden: false,
      locked: false
    });
    expect(stage.props?.[1]).toMatchObject({ name: 'Mountain', renderMode: 'voxel' });
    expect(stage.world?.width).toBeGreaterThan(100);
    expect(stage.mugen?.sourceSff).toBe('Cherry_Blossom.sff');
  });

  it('converts parsed MUGEN sprites into reusable stage prop assets', () => {
    const parsed = parseMugenDef(cherryBlossomsDef);
    const props = convertMugenDefToPropAssets(parsed, {
      packId: 'cherry-blossoms',
      sourceName: 'Cherry Blossoms',
      spriteAssets: [
        { sprite: [0, 0], imagePath: '/stage-props/cherry-blossoms/sprites/0-0.png', width: 1024, height: 512 },
        { sprite: [0, 1], imagePath: '/stage-props/cherry-blossoms/sprites/0-1.png', width: 532, height: 177 },
        { sprite: [0, 5], imagePath: '/stage-props/cherry-blossoms/sprites/0-5.png', width: 1020, height: 186 }
      ]
    });

    expect(props).toHaveLength(3);
    expect(props[0]).toMatchObject({
      id: 'cherry-blossoms-0-0',
      name: 'Background',
      imagePath: '/stage-props/cherry-blossoms/sprites/0-0.png',
      sourceKind: 'mugen',
      sourcePackId: 'cherry-blossoms',
      sourceSprite: [0, 0],
      defaultRenderMode: 'voxel'
    });
    expect(props[2]).toMatchObject({ name: 'Ground', sourceSprite: [0, 5] });
  });

  it('normalizes stage manifests without dropping imported layer metadata', () => {
    const normalized = normalizeStage({
      id: 'mugen',
      name: 'MUGEN',
      subtitle: 'Imported',
      renderMode: 'spriteCutout',
      floor: '#000000',
      rail: '#ffffff',
      light: '#ffffff',
      backgroundLayers: [{
        id: 'bg',
        imagePath: '/stages/mugen/mugen/sprites/0-0.png',
        position: [0, 2, -18],
        scale: [24, 12, 1],
        followCamera: true,
        parallax: [1.04, 1],
        tile: [1, 0],
        tileSpacing: [0, 0],
        sourceSprite: [0, 0]
      }]
    });

    expect(normalized.backgroundLayers?.[0]).toMatchObject({
      followCamera: true,
      parallax: [1.04, 1],
      tile: [1, 0],
      sourceSprite: [0, 0]
    });
  });

  it('normalizes model-backed stages without dropping model metadata', () => {
    const normalized = normalizeStage({
      id: 'hidden-leaf-village',
      name: 'Hidden Leaf Village',
      subtitle: 'Model stage',
      renderMode: 'model',
      floor: '#547a42',
      rail: '#f0b35a',
      light: '#fff1d0',
      model: {
        path: '/stages/hidden-leaf-village/stage.glb',
        position: [0, -0.05, -7],
        scale: [0.075, 0.075, 0.075],
        rotation: [0, Math.PI, 0],
        focus: [0, 1.2, -4],
        castShadow: true,
        receiveShadow: true,
        decorativeProps: [{
          id: 'gate-banner',
          name: 'Gate Banner',
          imagePath: '/stages/hidden-leaf-village/props/banner.png',
          position: [0, 2.5, -7],
          scale: [4, 2, 1],
          renderMode: 'plane'
        }]
      }
    });

    expect(normalized.renderMode).toBe('model');
    expect(normalized.model).toMatchObject({
      path: '/stages/hidden-leaf-village/stage.glb',
      position: [0, -0.05, -7],
      scale: [0.075, 0.075, 0.075],
      rotation: [0, Math.PI, 0],
      focus: [0, 1.2, -4],
      castShadow: true,
      receiveShadow: true
    });
    expect(normalized.model?.decorativeProps?.[0]).toMatchObject({ id: 'gate-banner' });
  });

  it('sanitizes saved model stage manifests without coercing them to procedural', () => {
    const sanitized = sanitizeStageManifest({
      name: 'Hidden Leaf Village',
      subtitle: 'Complete 3D arena',
      renderMode: 'model',
      floor: '#547a42',
      rail: '#f0b35a',
      light: '#fff1d0',
      model: {
        path: '/stages/hidden-leaf-village/stage.glb',
        position: [0, 0, -6],
        scale: [0.08, 0.08, 0.08],
        rotation: [0, 3.14, 0],
        focus: [0, 1.2, -4],
        castShadow: true,
        receiveShadow: false
      }
    }, 'hidden-leaf-village');

    expect(sanitized.renderMode).toBe('model');
    expect(sanitized.model).toMatchObject({
      path: '/stages/hidden-leaf-village/stage.glb',
      position: [0, 0, -6],
      scale: [0.08, 0.08, 0.08],
      rotation: [0, 3.14, 0],
      focus: [0, 1.2, -4],
      castShadow: true,
      receiveShadow: false
    });
  });

  it('normalizes stage floor effect advanced metadata', () => {
    const normalized = normalizeStage({
      id: 'fx-stage',
      name: 'FX Stage',
      subtitle: 'Effects',
      renderMode: 'procedural',
      floor: '#000000',
      rail: '#ffffff',
      light: '#ffffff',
      safePlatform: {
        enabled: true,
        shape: 'octagon',
        texturePath: '/stages/shared/handpainted-stone-platform.png',
        textureRepeat: [14, 14],
        radius: 38,
        height: 0.18,
        yOffset: 0.08,
        color: '#777777',
        edgeColor: '#ff7a2f',
        edgeOpacity: 0.94
      },
      floorEffects: {
        grass: {
          enabled: true,
          density: 0.8,
          height: 0.22,
          bladeCount: 12000,
          bladeWidth: 0.07,
          segments: 6,
          coverageScale: 1.15,
          colorVariation: 0.25,
          windDirection: [1, 0.25],
          windNoiseScale: 0.5,
          quality: 'high'
        },
        rain: {
          enabled: true,
          maxParticles: 900,
          coverageScale: 1.2,
          decay: 0.8,
          reactive: false,
          quality: 'medium'
        },
        impact: {
          enabled: true,
          maxDecals: 32,
          reactive: true,
          quality: 'low'
        }
      }
    });

    expect(normalized.floorEffects?.grass).toMatchObject({
      bladeCount: 12000,
      bladeWidth: 0.07,
      segments: 6,
      coverageScale: 1.15,
      colorVariation: 0.25,
      windDirection: [1, 0.25],
      windNoiseScale: 0.5,
      quality: 'high'
    });
    expect(normalized.floorEffects?.rain).toMatchObject({
      maxParticles: 900,
      coverageScale: 1.2,
      decay: 0.8,
      reactive: false,
      quality: 'medium'
    });
    expect(normalized.floorEffects?.impact).toMatchObject({
      maxDecals: 32,
      reactive: true,
      quality: 'low'
    });
    expect(normalized.safePlatform).toMatchObject({
      enabled: true,
      shape: 'octagon',
      texturePath: '/stages/shared/handpainted-stone-platform.png',
      textureRepeat: [14, 14],
      radius: 38,
      height: 0.18,
      yOffset: 0.08,
      color: '#777777',
      edgeColor: '#ff7a2f',
      edgeOpacity: 0.94
    });
  });

  it('keeps valid indexed stages when another indexed stage fails to load', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/stages/index.json') {
        return new Response(JSON.stringify({ stages: ['bad-stage', 'good-stage'] }), {
          headers: { 'content-type': 'application/json' }
        });
      }
      if (url === '/stages/bad-stage/stage.json') {
        return new Response('<!doctype html>', {
          headers: { 'content-type': 'text/html' }
        });
      }
      if (url === '/stages/good-stage/stage.json') {
        return new Response(JSON.stringify({
          id: 'good-stage',
          name: 'Good Stage',
          subtitle: 'Loaded',
          renderMode: 'spriteCutout',
          floor: '#000000',
          rail: '#ffffff',
          light: '#ffffff',
          backgroundLayers: [{
            id: 'bg',
            imagePath: '/stages/good-stage/bg.png',
            position: [0, 1, -10],
            scale: [10, 5, 1]
          }]
        }), {
          headers: { 'content-type': 'application/json' }
        });
      }
      return new Response('', { status: 404 });
    }));

    const result = await loadStageRoster();
    expect(result.stages.some((stage) => stage.id === 'good-stage')).toBe(true);
    expect(result.stages.some((stage) => stage.id === 'the-chamber')).toBe(true);
  });
});
