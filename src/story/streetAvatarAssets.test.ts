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
    expect(STORY_SPRITE_MANIFEST.sets.map((set) => [set.id, set.frameCount])).toEqual([
      ['solar-runner', 38],
      ['street-shadow', 37],
      ['crimson-ranger', 38],
      ['rose-blade', 27],
      ['neon-courier', 38],
      ['ember-scout', 38],
      ['synth-drifter', 38],
      ['forest-warden', 37],
      ['solar-brawler', 38],
      ['void-operative', 38],
      ['circuit-mage', 38],
      ['street-medic', 38],
      ['arena-rebel', 38],
      ['tech-nomad', 38]
    ]);
    const uniquePaths = new Set(STORY_SPRITE_MANIFEST.sets.flatMap((set) => set.animations.flatMap((animation) => animation.frames.map((frame) => frame.path))));
    expect(uniquePaths.size).toBe(519);
    uniquePaths.forEach(inspectFrame);
    STORY_SPRITE_MANIFEST.sets.forEach((set) => {
      expect(set.animations.map((animation) => animation.id)).toEqual(['idle', 'walk', 'sprint', 'jump', 'attack']);
      expect(existsSync(resolve(ASSET_ROOT, `sets/${set.id}/source.png`))).toBe(true);
    });
  });

  it('plays every authored attack frame before returning to idle', () => {
    STORY_SPRITE_MANIFEST.sets.forEach((set) => {
      const attack = set.animations.find((animation) => animation.id === 'attack');
      expect(attack?.loop, set.id).toBe(false);
      expect(attack?.frames.length, set.id).toBeGreaterThanOrEqual(6);
      expect(attack?.frames.every((frame) => frame.bodyAnchorX === 160), set.id).toBe(true);
      expect(getStorySpriteAnimationDurationMs(set.id, 'attack'), set.id)
        .toBe(attack!.frames.reduce((total, frame) => total + frame.durationMs, 0));
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
      "assert len(paths)==519, len(paths)",
      'for path in paths:',
      " im=Image.open(path).convert('RGBA')",
      ' alpha=im.getchannel("A")',
      ' assert set(alpha.getdata()) <= {0,255}, path',
      " if '/attack/' in path.as_posix(): assert sum(alpha.getdata()) // 255 > 4000, f'{path}: attack frame is missing its character body'",
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
  });
});
