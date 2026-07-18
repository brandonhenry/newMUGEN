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
        expect(attack.frames.every((frame) => Number.isFinite(frame.visualScale) && frame.visualScale! >= 1), `${set.id}/${animationId}`).toBe(true);
        const [activeStart, activeEnd] = attack.activeFrameRange!;
        for (const frame of attack.frames.slice(activeStart, activeEnd + 1)) {
          const rearExtent = frame.bodyAnchorX - frame.contentBounds[0];
          const forwardExtent = frame.contentBounds[2] - frame.bodyAnchorX;
          expect(rearExtent, `${set.id}/${frame.id} puts its primary active effect behind the right-facing body`)
            .toBeLessThanOrEqual(Math.max(48, forwardExtent * 4));
        }
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
    expect(Object.fromEntries(projectileSetIds.map((setId) => [setId, getStorySpriteProjectile(setId)!.launchPoint]))).toEqual({
      'solar-runner': [185, 108],
      'crimson-ranger': [203, 109],
      'neon-courier': [218, 121],
      'synth-drifter': [194, 126],
      'solar-brawler': [198, 119],
      'void-operative': [194, 123],
      'circuit-mage': [238, 121],
      'tech-nomad': [198, 123]
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

  it('does not restore gray sheet matte inside the Street Shadow silhouette', () => {
    const validation = spawnSync('python3', ['-c', [
      'from PIL import Image',
      `path=${JSON.stringify(resolve(ASSET_ROOT, 'sets/street-shadow/frames/idle/00.png'))}`,
      "image=Image.open(path).convert('RGBA')",
      '# This column was a fully opaque gray matte streak between the hair and coat.',
      'points=((135,113),(135,120),(135,130),(135,137))',
      'assert all(image.getpixel(point)[3] == 0 for point in points), [(point,image.getpixel(point)) for point in points]'
    ].join('\n')], { encoding: 'utf8' });
    expect(validation.status, validation.stderr).toBe(0);
  });

  it('restores dense interior sprite gaps without growing the exterior silhouette', () => {
    const validation = spawnSync('python3', ['-c', [
      'from pathlib import Path',
      'from PIL import Image',
      `root=Path(${JSON.stringify(resolve(ASSET_ROOT, 'sets'))})`,
      "solar=Image.open(root/'solar-runner/frames/sprint/00.png').convert('RGBA')",
      "rose=Image.open(root/'rose-blade/frames/sprint/01.png').convert('RGBA')",
      'solar_repairs=((172,143),(173,144),(175,146),(144,153))',
      'rose_repairs=((125,116),(143,140),(144,141))',
      'assert all(solar.getpixel(point)[3] == 255 for point in solar_repairs), [(point,solar.getpixel(point)) for point in solar_repairs]',
      'assert all(rose.getpixel(point)[3] == 255 for point in rose_repairs), [(point,rose.getpixel(point)) for point in rose_repairs]'
    ].join('\n')], { encoding: 'utf8' });
    expect(validation.status, validation.stderr).toBe(0);
  });

  it('retains small source-authored silhouette components beside ranged attack bodies', () => {
    const minimumOpaquePixels = {
      'solar-brawler/01': 11925,
      'circuit-mage/02': 11855,
      'circuit-mage/03': 11932,
      'circuit-mage/06': 8605,
      'tech-nomad/01': 10107,
      'tech-nomad/02': 10905,
      'void-operative/06': 7965,
      'solar-runner/03': 16387
    };
    const validation = spawnSync('python3', ['-c', [
      'from pathlib import Path',
      'from PIL import Image',
      `root=Path(${JSON.stringify(resolve(ASSET_ROOT, 'sets'))})`,
      `minimums=${JSON.stringify(minimumOpaquePixels)}`,
      'for key,minimum in minimums.items():',
      " set_id,frame=key.split('/')",
      " path=root/set_id/'frames/attack-special'/f'{frame}.png'",
      " opaque=sum(1 for value in Image.open(path).convert('RGBA').getchannel('A').getdata() if value)",
      ' assert opaque>=minimum, f"{path}: silhouette pixels regressed ({opaque} < {minimum})"'
    ].join('\n')], { encoding: 'utf8' });
    expect(validation.status, validation.stderr).toBe(0);
  });

  it('does not ship the removed multipart body library', () => {
    expect(existsSync(resolve(PUBLIC_ROOT, 'story/avatars/kore-multipart-v1'))).toBe(false);
    expect(existsSync(resolve(ASSET_ROOT, 'contact-sheet.png'))).toBe(true);
    expect(existsSync(resolve(ASSET_ROOT, 'attack-contact-sheet.png'))).toBe(true);
    expect(existsSync(resolve(ASSET_ROOT, 'special-body-contact-sheet.png'))).toBe(true);
    expect(existsSync(resolve(ASSET_ROOT, 'projectile-contact-sheet.png'))).toBe(true);
    expect(existsSync(resolve(ASSET_ROOT, 'projectile-origin-contact-sheet.png'))).toBe(true);
    expect(existsSync(resolve(ASSET_ROOT, 'silhouette-contact-sheet.png'))).toBe(true);
  });
});
