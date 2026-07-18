import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { getStorySpriteAnimationDurationMs, STORY_SPRITE_MANIFEST, validateStorySpriteManifest } from './streetAvatarCatalog';

const PUBLIC_ROOT = resolve(process.cwd(), 'public');
const ASSET_ROOT = resolve(PUBLIC_ROOT, 'story/avatars/kore-street-v1');
const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

function inspectFrame(publicPath: string) {
  const path = resolve(PUBLIC_ROOT, publicPath.replace(/^\//, ''));
  expect(existsSync(path), path).toBe(true);
  const bytes = readFileSync(path);
  expect([...bytes.subarray(0, 8)]).toEqual(PNG_SIGNATURE);
  expect(bytes.readUInt32BE(16)).toBe(320);
  expect(bytes.readUInt32BE(20)).toBe(192);
  expect(bytes[25]).toBe(6);
}

describe('K.O.R.E. full-frame street avatar assets', () => {
  it('contains the four supplied and ten generated aligned motion sets', () => {
    expect(validateStorySpriteManifest(STORY_SPRITE_MANIFEST)).toEqual([]);
    expect(STORY_SPRITE_MANIFEST.version).toBe(3);
    expect(STORY_SPRITE_MANIFEST.sets.map((set) => [set.id, set.frameCount])).toEqual([
      ['solar-runner', 62],
      ['street-shadow', 61],
      ['crimson-ranger', 62],
      ['rose-blade', 51],
      ['neon-courier', 62],
      ['ember-scout', 62],
      ['synth-drifter', 62],
      ['forest-warden', 61],
      ['solar-brawler', 62],
      ['void-operative', 62],
      ['circuit-mage', 62],
      ['street-medic', 62],
      ['arena-rebel', 62],
      ['tech-nomad', 62]
    ]);
    const uniquePaths = new Set(STORY_SPRITE_MANIFEST.sets.flatMap((set) => set.animations.flatMap((animation) => animation.frames.map((frame) => frame.path))));
    expect(uniquePaths.size).toBe(855);
    uniquePaths.forEach(inspectFrame);
    STORY_SPRITE_MANIFEST.sets.forEach((set) => {
      expect(set.animations.map((animation) => animation.id)).toEqual(['idle', 'walk', 'sprint', 'jump', 'attack', 'attack-heavy', 'attack-kick', 'attack-special']);
      expect(existsSync(resolve(ASSET_ROOT, `sets/${set.id}/source.png`))).toBe(true);
      expect(existsSync(resolve(ASSET_ROOT, `sets/${set.id}/attacks-v2-source.png`))).toBe(true);
      expect(set.attackSource).toMatchObject({ kind: 'openai-image-generation-supplemental-attack-sheet', originalFile: 'attacks-v2-source.png' });
    });
  });

  it('plays every authored attack frame before returning to idle', () => {
    STORY_SPRITE_MANIFEST.sets.forEach((set) => {
      for (const animationId of ['attack', 'attack-heavy', 'attack-kick', 'attack-special']) {
        const attack = set.animations.find((animation) => animation.id === animationId)!;
        expect(attack.loop, `${set.id}/${animationId}`).toBe(false);
        if (animationId !== 'attack') expect(attack.frames.length, `${set.id}/${animationId}`).toBe(8);
        expect(attack.frames.length, `${set.id}/${animationId}`).toBeGreaterThanOrEqual(6);
        expect(attack.frames.every((frame) => frame.bodyAnchorX === 160), `${set.id}/${animationId}`).toBe(true);
        expect(attack.activeFrameRange, `${set.id}/${animationId}`).toBeDefined();
        expect(getStorySpriteAnimationDurationMs(set.id, animationId), `${set.id}/${animationId}`)
          .toBe(attack.frames.reduce((total, frame) => total + frame.durationMs, 0));
      }
    });
  });

  it('retains detached slash and projectile pixels in their character frames', () => {
    const attackFor = (setId: string) => STORY_SPRITE_MANIFEST.sets
      .find((set) => set.id === setId)!
      .animations.find((animation) => animation.id === 'attack')!;
    const contentWidth = (bounds: [number, number, number, number]) => bounds[2] - bounds[0];

    expect(contentWidth(attackFor('solar-runner').frames[4].contentBounds)).toBeGreaterThan(160);
    expect(contentWidth(attackFor('street-shadow').frames[6].contentBounds)).toBeGreaterThan(170);
    expect(contentWidth(attackFor('street-shadow').frames[7].contentBounds)).toBeGreaterThan(170);
    expect(attackFor('forest-warden').frames).toHaveLength(7);
    expect(contentWidth(attackFor('forest-warden').frames[6].contentBounds)).toBeGreaterThan(180);
  });

  it('exports a strict binary transparent matte with transparent canvas corners', () => {
    const validation = spawnSync('python3', ['-c', [
      'from pathlib import Path',
      'from PIL import Image',
      `root=Path(${JSON.stringify(resolve(ASSET_ROOT, 'sets'))})`,
      "paths=list(root.glob('*/frames/*/*.png'))",
      "assert len(paths)==855, len(paths)",
      'for path in paths:',
      " im=Image.open(path).convert('RGBA')",
      ' alpha=im.getchannel("A")',
      ' assert set(alpha.getdata()) <= {0,255}, path',
      " if '/attack' in path.as_posix(): assert sum(alpha.getdata()) // 255 > 700, f'{path}: attack frame is missing visible content'",
      ' assert all(im.getpixel(point)[3] == 0 for point in ((0,0),(319,0),(0,191),(319,191))), path',
      ' pixels=alpha.load()',
      ' pinholes=[(x,y) for y in range(1,191) for x in range(1,319) if pixels[x,y] == 0 and all(pixels[nx,ny] for nx,ny in ((x-1,y),(x+1,y),(x,y-1),(x,y+1)))]',
      ' assert not pinholes, f"{path}: enclosed alpha pinholes at {pinholes[:8]}"'
    ].join('\n')], { encoding: 'utf8' });
    expect(validation.status, validation.stderr).toBe(0);
  });

  it('does not ship the removed multipart body library', () => {
    expect(existsSync(resolve(PUBLIC_ROOT, 'story/avatars/kore-multipart-v1'))).toBe(false);
    expect(existsSync(resolve(ASSET_ROOT, 'contact-sheet.png'))).toBe(true);
    expect(existsSync(resolve(ASSET_ROOT, 'attack-contact-sheet.png'))).toBe(true);
  });
});
