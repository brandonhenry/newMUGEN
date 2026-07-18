import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { getStorySpriteAnimationDurationMs, getStorySpriteProjectile, STORY_SPRITE_MANIFEST, validateStorySpriteManifest } from './streetAvatarCatalog';

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

  it('retains authored slash and aura pixels in their original basic-attack frames', () => {
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

  it('ships body-free projectile PNGs as separate special-move entities', () => {
    const projectileSetIds = STORY_SPRITE_MANIFEST.sets.filter((set) => set.projectile).map((set) => set.id);
    expect(projectileSetIds).toEqual([
      'solar-runner', 'crimson-ranger', 'neon-courier', 'synth-drifter',
      'solar-brawler', 'void-operative', 'circuit-mage', 'tech-nomad'
    ]);
    const avatarPaths = new Set(STORY_SPRITE_MANIFEST.sets.flatMap((set) => set.animations.flatMap((animation) => animation.frames.map((frame) => frame.path))));
    const projectilePaths = new Set(STORY_SPRITE_MANIFEST.sets.flatMap((set) => set.projectile?.frames.map((frame) => frame.path) ?? []));
    expect(projectilePaths.size).toBe(48);
    projectilePaths.forEach((path) => {
      expect(path).toContain('/projectiles/special/');
      expect(avatarPaths.has(path)).toBe(false);
    });
    projectileSetIds.forEach((setId) => {
      const set = STORY_SPRITE_MANIFEST.sets.find((candidate) => candidate.id === setId)!;
      const projectile = getStorySpriteProjectile(setId)!;
      const bodySpecial = set.animations.find((animation) => animation.id === 'attack-special')!;
      expect(projectile.source).toMatchObject({ kind: 'openai-image-generation-projectile-strip', originalFile: 'projectile-special-source.png' });
      expect(projectile.frames).toHaveLength(6);
      expect(projectile.releaseDelayMs).toBe(375);
      expect(projectile.lifetimeMs).toBeLessThanOrEqual(850);
      expect(bodySpecial.frames.every((frame) => frame.contentBounds[3] - frame.contentBounds[1] >= 100), `${setId} special must retain a human body in every avatar frame`).toBe(true);
      expect(existsSync(resolve(ASSET_ROOT, `sets/${setId}/projectile-special-source.png`))).toBe(true);
    });

    const validation = spawnSync('python3', ['-c', [
      'from pathlib import Path',
      'from PIL import Image',
      `root=Path(${JSON.stringify(resolve(ASSET_ROOT, 'sets'))})`,
      "paths=list(root.glob('*/projectiles/special/*.png'))",
      'assert len(paths)==48, len(paths)',
      'for path in paths:',
      " im=Image.open(path).convert('RGBA')",
      ' assert im.size==(192,96), (path, im.size)',
      ' alpha=im.getchannel("A")',
      ' assert alpha.getbbox(), path',
      ' assert all(im.getpixel(point)[3] == 0 for point in ((0,0),(191,0),(0,95),(191,95))), path',
      ' assert sum(1 for value in alpha.getdata() if value) < 9000, f"{path}: projectile art covers a body-sized canvas area"'
    ].join('\n')], { encoding: 'utf8' });
    expect(validation.status, validation.stderr).toBe(0);

    const humanSpecialPaths = projectileSetIds.flatMap((setId) => STORY_SPRITE_MANIFEST.sets
      .find((set) => set.id === setId)!
      .animations.find((animation) => animation.id === 'attack-special')!
      .frames.map((frame) => resolve(PUBLIC_ROOT, frame.path.replace(/^\//, ''))));
    const humanValidation = spawnSync('python3', ['-c', [
      'from PIL import Image',
      `paths=${JSON.stringify(humanSpecialPaths)}`,
      'for path in paths:',
      " pixels=Image.open(path).convert('RGBA').get_flattened_data()",
      ' dark=sum(1 for r,g,b,a in pixels if a and max(r,g,b)<110 and max(r,g,b)-min(r,g,b)>4)',
      ' assert dark>=1200, f"{path}: projectile effect replaced the human silhouette ({dark} dark body pixels)"'
    ].join('\n')], { encoding: 'utf8' });
    expect(humanValidation.status, humanValidation.stderr).toBe(0);
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
    expect(existsSync(resolve(ASSET_ROOT, 'special-body-contact-sheet.png'))).toBe(true);
    expect(existsSync(resolve(ASSET_ROOT, 'projectile-contact-sheet.png'))).toBe(true);
  });
});
