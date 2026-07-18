import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(process.cwd());

function runPython(lines: string[]) {
  return spawnSync('python3', ['-c', lines.join('\n')], { cwd: root, encoding: 'utf8' });
}

describe('Story actor alpha cleanup', () => {
  it('exports every registered NPC and enemy frame with binary transparency', () => {
    const validation = runPython([
      'import json',
      'from pathlib import Path',
      'from PIL import Image',
      "root=Path('public')",
      "npc=json.loads(Path('src/story/storyNpcManifest.json').read_text())",
      "enemy=json.loads(Path('src/story/storyEnemyManifest.json').read_text())",
      "paths=[frame for entry in npc['npcs'] for action in entry['actions'].values() for frame in action['frames']]",
      "paths += [frame['path'] for entry in enemy['enemies'] for animation in entry['animations'] for frame in animation['frames']]",
      'assert paths, "No Story actor frames were registered"',
      'for public_path in paths:',
      " image=Image.open(root/public_path.lstrip('/')).convert('RGBA')",
      " assert set(image.getchannel('A').get_flattened_data()) <= {0,255}, public_path",
      " assert image.getchannel('A').getbbox(), public_path",
      " assert all(image.getpixel(point)[3] == 0 for point in ((0,0),(image.width-1,0),(0,image.height-1),(image.width-1,image.height-1))), public_path"
    ]);
    expect(validation.status, validation.stderr).toBe(0);
  });

  it('removes the neutral exterior halo shown around Mina Quill', () => {
    const validation = runPython([
      'from PIL import Image',
      "image=Image.open('public/story/npcs/characters/mina-quill/idle/01.png').convert('RGBA')",
      'pixels=image.load()',
      'boundary_fuzz=[]',
      'for y in range(image.height):',
      ' for x in range(image.width):',
      '  red,green,blue,alpha=pixels[x,y]',
      '  value=max(red,green,blue)',
      '  chroma=value-min(red,green,blue)',
      '  exposed=alpha and any(pixels[nx,ny][3] == 0 for ny in range(max(0,y-1),min(image.height,y+2)) for nx in range(max(0,x-1),min(image.width,x+2)))',
      '  if exposed and 72 <= value <= 214 and chroma <= 30: boundary_fuzz.append((x,y))',
      'assert len(boundary_fuzz) <= 16, boundary_fuzz[:24]'
    ]);
    expect(validation.status, validation.stderr).toBe(0);
  });

  it('ships mount and wildlife atlases with transparent actor mattes', () => {
    const validation = runPython([
      'from pathlib import Path',
      'from PIL import Image',
      "paths=list(Path('public/story/exploration/mounts').glob('*.png'))+list(Path('public/story/exploration/wildlife').glob('*.png'))",
      'assert len(paths) == 8, len(paths)',
      'for path in paths:',
      " image=Image.open(path).convert('RGBA')",
      " alpha=image.getchannel('A')",
      " assert set(alpha.get_flattened_data()) <= {0,255}, path",
      ' assert alpha.histogram()[0] > 0, path',
      " assert all(image.getpixel(point)[3] == 0 for point in ((0,0),(image.width-1,0),(0,image.height-1),(image.width-1,image.height-1))), path"
    ]);
    expect(validation.status, validation.stderr).toBe(0);
  });
});
