import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { deflateSync } from 'node:zlib';
import type { StagePropAssetDefinition, StagePropLibraryManifest } from './src/types';
import { convertMugenDefToPropAssets, parseMugenDef, referencedMugenSprites, slugifyMugenId, type MugenSpriteAsset } from './src/lib/mugenStage';

export type ImportMugenStageOptions = {
  folderPath: string;
  outputRoot: string;
  stageId?: string;
};

export type ImportMugenStageFilesOptions = {
  files: Array<{
    relativePath: string;
    data: Buffer;
  }>;
  outputRoot: string;
  stageId?: string;
};

export type ImportMugenStageResult = {
  packId: string;
  props: StagePropAssetDefinition[];
  defFile: string;
  sffFile?: string;
  spriteCount: number;
  warnings: string[];
};

type SffSprite = {
  group: number;
  image: number;
  width: number;
  height: number;
  x: number;
  y: number;
  link: number;
  format: number;
  depth: number;
  offset: number;
  length: number;
  palette: number;
};

type SffPalette = {
  colors: number;
  link: number;
  offset: number;
  length: number;
};

type SffFile = {
  version: 'v1' | 'v2';
  buffer: Buffer;
  sprites: SffSprite[];
  palettes: SffPalette[];
};

export async function importMugenStageFolder(options: ImportMugenStageOptions): Promise<ImportMugenStageResult> {
  const sourceDir = resolve(options.folderPath);
  const sourceStat = await stat(sourceDir);
  if (!sourceStat.isDirectory()) throw new Error('MUGEN stage import expects a folder path.');

  const entries = await readdir(sourceDir, { withFileTypes: true });
  const defEntry = entries.find((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.def'));
  if (!defEntry) throw new Error('No .def file found in stage folder.');

  const defFile = defEntry.name;
  const defText = await readFile(join(sourceDir, defFile), 'utf8');
  const parsed = parseMugenDef(defText);
  const packId = slugifyMugenId(options.stageId || parsed.info.displayname || parsed.info.name || defFile.replace(/\.def$/i, ''));
  const packDir = resolve(options.outputRoot, packId);
  const mugenDir = join(packDir, 'mugen');
  const spriteDir = join(packDir, 'sprites');
  const warnings: string[] = [];

  await mkdir(spriteDir, { recursive: true });
  await mkdir(mugenDir, { recursive: true });
  await writeFile(join(mugenDir, defFile), defText, 'utf8');

  const sffFile = await findReferencedFile(sourceDir, parsed.bgDef.spr, '.sff');
  let sff: SffFile | null = null;
  if (sffFile) {
    const sffBuffer = await readFile(join(sourceDir, sffFile));
    await writeFile(join(mugenDir, sffFile), sffBuffer);
    sff = parseSff(sffBuffer);
  } else {
    warnings.push('No referenced .sff file found.');
  }

  const spritePaths = new Map<string, string>();
  const spriteMetadata: MugenSpriteAsset[] = [];
  for (const spriteRef of referencedMugenSprites(parsed)) {
    const key = spriteKey(spriteRef);
    const fileName = `${spriteRef[0]}-${spriteRef[1]}.png`;
    const outputPath = join(spriteDir, fileName);
    const publicPath = `/stage-props/${packId}/sprites/${fileName}`;
    let extracted = false;
    if (sff) {
      try {
        const decoded = decodeSffSprite(sff, spriteRef);
        await writeFile(outputPath, encodePng(decoded.width, decoded.height, decoded.rgba));
        spriteMetadata.push({
          sprite: spriteRef,
          imagePath: publicPath,
          width: decoded.width,
          height: decoded.height,
          axis: decoded.axis,
          format: decoded.format
        });
        spritePaths.set(key, publicPath);
        extracted = true;
      } catch (error) {
        warnings.push(error instanceof Error ? error.message : `Could not extract sprite ${key}.`);
      }
    }
    if (!extracted) {
      const fallback = await findFallbackSprite(sourceDir, spriteRef);
      if (fallback) {
        await writeFile(outputPath, await readFile(fallback));
        spritePaths.set(key, publicPath);
        spriteMetadata.push({ sprite: spriteRef, imagePath: publicPath });
      } else {
        warnings.push(`No PNG fallback found for sprite ${key}.`);
      }
    }
  }

  await writeFile(join(mugenDir, 'sprites.json'), `${JSON.stringify({ sprites: spriteMetadata }, null, 2)}\n`, 'utf8');

  const props = convertMugenDefToPropAssets(parsed, {
    packId,
    sourceName: unquote(parsed.info.displayname || parsed.info.name || defFile.replace(/\.def$/i, '')),
    spriteAssets: spriteMetadata
  });

  await updatePropLibraryIndex(options.outputRoot, props);

  return {
    packId,
    props,
    defFile,
    sffFile,
    spriteCount: spritePaths.size,
    warnings
  };
}

export async function importMugenStageFiles(options: ImportMugenStageFilesOptions): Promise<ImportMugenStageResult> {
  const files = options.files
    .filter((file) => file.relativePath && Buffer.isBuffer(file.data))
    .map((file) => ({
      ...file,
      relativePath: normalizeRelativePath(file.relativePath)
    }));
  const defFile = files.find((file) => file.relativePath.toLowerCase().endsWith('.def'));
  if (!defFile) throw new Error('No .def file selected in MUGEN stage folder.');

  const defText = defFile.data.toString('utf8');
  const parsed = parseMugenDef(defText);
  const packId = slugifyMugenId(options.stageId || parsed.info.displayname || parsed.info.name || basename(defFile.relativePath).replace(/\.def$/i, ''));
  const packDir = resolve(options.outputRoot, packId);
  const mugenDir = join(packDir, 'mugen');
  const spriteDir = join(packDir, 'sprites');
  const warnings: string[] = [];

  await mkdir(spriteDir, { recursive: true });
  await mkdir(mugenDir, { recursive: true });
  await writeFile(join(mugenDir, basename(defFile.relativePath)), defText, 'utf8');

  const sffEntry = findVirtualReferencedFile(files, parsed.bgDef.spr, '.sff');
  let sff: SffFile | null = null;
  if (sffEntry) {
    await writeFile(join(mugenDir, basename(sffEntry.relativePath)), sffEntry.data);
    sff = parseSff(sffEntry.data);
  } else {
    warnings.push('No referenced .sff file found in selected folder.');
  }

  const spritePaths = new Map<string, string>();
  const spriteMetadata: MugenSpriteAsset[] = [];
  for (const spriteRef of referencedMugenSprites(parsed)) {
    const key = spriteKey(spriteRef);
    const fileName = `${spriteRef[0]}-${spriteRef[1]}.png`;
    const outputPath = join(spriteDir, fileName);
    const publicPath = `/stage-props/${packId}/sprites/${fileName}`;
    let extracted = false;
    if (sff) {
      try {
        const decoded = decodeSffSprite(sff, spriteRef);
        await writeFile(outputPath, encodePng(decoded.width, decoded.height, decoded.rgba));
        spriteMetadata.push({
          sprite: spriteRef,
          imagePath: publicPath,
          width: decoded.width,
          height: decoded.height,
          axis: decoded.axis,
          format: decoded.format
        });
        spritePaths.set(key, publicPath);
        extracted = true;
      } catch (error) {
        warnings.push(error instanceof Error ? error.message : `Could not extract sprite ${key}.`);
      }
    }
    if (!extracted) {
      const fallback = findVirtualFallbackSprite(files, spriteRef);
      if (fallback) {
        await writeFile(outputPath, fallback.data);
        spritePaths.set(key, publicPath);
        spriteMetadata.push({ sprite: spriteRef, imagePath: publicPath });
      } else {
        warnings.push(`No PNG fallback found for sprite ${key}.`);
      }
    }
  }

  await writeFile(join(mugenDir, 'sprites.json'), `${JSON.stringify({ sprites: spriteMetadata }, null, 2)}\n`, 'utf8');

  const sourceDef = basename(defFile.relativePath);
  const sourceSff = sffEntry ? basename(sffEntry.relativePath) : undefined;
  const props = convertMugenDefToPropAssets(parsed, {
    packId,
    sourceName: unquote(parsed.info.displayname || parsed.info.name || sourceDef.replace(/\.def$/i, '')),
    spriteAssets: spriteMetadata
  });

  await updatePropLibraryIndex(options.outputRoot, props);

  return {
    packId,
    props,
    defFile: sourceDef,
    sffFile: sourceSff,
    spriteCount: spritePaths.size,
    warnings
  };
}

async function updatePropLibraryIndex(outputRoot: string, props: StagePropAssetDefinition[]) {
  const indexPath = resolve(outputRoot, 'index.json');
  let existing: StagePropLibraryManifest = { props: [] };
  try {
    existing = JSON.parse(await readFile(indexPath, 'utf8')) as StagePropLibraryManifest;
  } catch {
    existing = { props: [] };
  }
  const next = new Map<string, StagePropAssetDefinition>();
  (Array.isArray(existing.props) ? existing.props : []).forEach((prop) => next.set(prop.id, prop));
  props.forEach((prop) => next.set(prop.id, prop));
  await mkdir(dirname(indexPath), { recursive: true });
  await writeFile(indexPath, `${JSON.stringify({ props: [...next.values()] }, null, 2)}\n`, 'utf8');
}

function parseSff(buffer: Buffer): SffFile {
  if (buffer.subarray(0, 12).toString('latin1') !== 'ElecbyteSpr\0') throw new Error('Invalid SFF signature.');
  const version = Array.from(buffer.subarray(12, 16)).join('.');
  if (version === '0.0.0.2' || version === '0.1.0.2') return parseSffV2(buffer);
  throw new Error(`Unsupported SFF version bytes: ${version}.`);
}

function parseSffV2(buffer: Buffer): SffFile {
  const spriteOffset = buffer.readUInt32LE(36);
  const spriteCount = buffer.readUInt32LE(40);
  const paletteOffset = buffer.readUInt32LE(44);
  const paletteCount = buffer.readUInt32LE(48);
  const ldataOffset = buffer.readUInt32LE(52);
  const tdataOffset = buffer.readUInt32LE(60);
  const palettes: SffPalette[] = [];
  const sprites: SffSprite[] = [];

  for (let index = 0; index < paletteCount; index += 1) {
    const offset = paletteOffset + index * 16;
    palettes.push({
      colors: buffer.readUInt16LE(offset + 4),
      link: buffer.readUInt16LE(offset + 6),
      offset: ldataOffset + buffer.readUInt32LE(offset + 8),
      length: buffer.readUInt32LE(offset + 12)
    });
  }

  for (let index = 0; index < spriteCount; index += 1) {
    const offset = spriteOffset + index * 28;
    const flags = buffer.readUInt16LE(offset + 26);
    sprites.push({
      group: buffer.readUInt16LE(offset),
      image: buffer.readUInt16LE(offset + 2),
      width: buffer.readUInt16LE(offset + 4),
      height: buffer.readUInt16LE(offset + 6),
      x: buffer.readInt16LE(offset + 8),
      y: buffer.readInt16LE(offset + 10),
      link: buffer.readUInt16LE(offset + 12),
      format: buffer.readUInt8(offset + 14),
      depth: buffer.readUInt8(offset + 15),
      offset: (flags === 0 ? ldataOffset : tdataOffset) + buffer.readUInt32LE(offset + 16),
      length: buffer.readUInt32LE(offset + 20),
      palette: buffer.readUInt16LE(offset + 24)
    });
  }

  return { version: 'v2', buffer, sprites, palettes };
}

function decodeSffSprite(sff: SffFile, ref: [number, number]) {
  const spriteIndex = sff.sprites.findIndex((sprite) => sprite.group === ref[0] && sprite.image === ref[1]);
  if (spriteIndex === -1) throw new Error(`Sprite ${spriteKey(ref)} was not found in SFF.`);
  const sprite = resolveLinkedSprite(sff, spriteIndex);
  const data = sff.buffer.subarray(sprite.offset, sprite.offset + sprite.length);
  const palette = sprite.depth === 8 ? readPalette(sff, sprite.palette) : undefined;
  let rgba: Buffer;

  if (sprite.format === 0) rgba = decodeRaw(data, sprite.width, sprite.height, sprite.depth, palette);
  else if (sprite.format === 2 && sprite.depth === 8 && palette) rgba = decodeRle8(data, sprite.width, sprite.height, palette);
  else if (sprite.format >= 10 && sprite.format <= 12) throw new Error(`Sprite ${spriteKey(ref)} is PNG encoded; PNG passthrough is not enabled for palette replacement yet.`);
  else throw new Error(`Sprite ${spriteKey(ref)} uses unsupported SFF image format ${sprite.format}.`);

  return {
    width: sprite.width,
    height: sprite.height,
    rgba,
    axis: [sprite.x, sprite.y] as [number, number],
    format: sprite.format
  };
}

function resolveLinkedSprite(sff: SffFile, index: number): SffSprite {
  const sprite = sff.sprites[index];
  if (!sprite) throw new Error(`Invalid linked SFF sprite index ${index}.`);
  if (sprite.length > 0) return sprite;
  if (sprite.link === index) throw new Error(`SFF sprite ${index} links to itself.`);
  return resolveLinkedSprite(sff, sprite.link);
}

function readPalette(sff: SffFile, paletteIndex: number): number[] {
  const palette = sff.palettes[paletteIndex];
  if (!palette) throw new Error(`Invalid SFF palette index ${paletteIndex}.`);
  const linked = palette.length === 0 ? sff.palettes[palette.link] : palette;
  if (!linked) throw new Error(`Invalid linked SFF palette index ${palette.link}.`);
  const data = sff.buffer.subarray(linked.offset, linked.offset + linked.length);
  return Array.from({ length: linked.colors }, (_, index) => {
    const offset = index * 4;
    const red = data[offset] ?? 0;
    const green = data[offset + 1] ?? 0;
    const blue = data[offset + 2] ?? 0;
    const alpha = index === 0 ? 0 : 255;
    return (alpha << 24) | (red << 16) | (green << 8) | blue;
  });
}

function decodeRle8(data: Buffer, width: number, height: number, palette: number[]) {
  const rawSize = data.readUInt32LE(0);
  if (rawSize !== width * height) throw new Error(`RLE8 size mismatch: expected ${width * height}, got ${rawSize}.`);
  const rgba = Buffer.alloc(width * height * 4);
  let pixel = 0;
  let runLength = -1;
  for (let index = 4; index < data.length && pixel < width * height; index += 1) {
    const value = data[index];
    if ((value & 0xc0) !== 0x40 || runLength !== -1) {
      const count = runLength === -1 ? 1 : runLength;
      for (let run = 0; run < count && pixel < width * height; run += 1) {
        writePalettePixel(rgba, pixel, palette[value] ?? 0);
        pixel += 1;
      }
      runLength = -1;
    } else {
      runLength = value - 0x40;
    }
  }
  return rgba;
}

function decodeRaw(data: Buffer, width: number, height: number, depth: number, palette?: number[]) {
  const rgba = Buffer.alloc(width * height * 4);
  if (depth === 8 && palette) {
    for (let pixel = 0; pixel < width * height && pixel < data.length; pixel += 1) {
      writePalettePixel(rgba, pixel, palette[data[pixel]] ?? 0);
    }
    return rgba;
  }
  if (depth === 24 || depth === 32) {
    const stride = depth / 8;
    for (let pixel = 0; pixel < width * height && pixel * stride < data.length; pixel += 1) {
      const input = pixel * stride;
      const output = pixel * 4;
      rgba[output] = data[input];
      rgba[output + 1] = data[input + 1];
      rgba[output + 2] = data[input + 2];
      rgba[output + 3] = depth === 32 ? data[input + 3] : 255;
    }
    return rgba;
  }
  throw new Error(`Unsupported raw SFF color depth ${depth}.`);
}

function writePalettePixel(rgba: Buffer, pixel: number, color: number) {
  const offset = pixel * 4;
  rgba[offset] = (color >> 16) & 0xff;
  rgba[offset + 1] = (color >> 8) & 0xff;
  rgba[offset + 2] = color & 0xff;
  rgba[offset + 3] = (color >>> 24) & 0xff;
}

function encodePng(width: number, height: number, rgba: Buffer) {
  const scanlineLength = width * 4 + 1;
  const scanlines = Buffer.alloc(scanlineLength * height);
  for (let y = 0; y < height; y += 1) {
    scanlines[y * scanlineLength] = 0;
    rgba.copy(scanlines, y * scanlineLength + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', Buffer.concat([uint32be(width), uint32be(height), Buffer.from([8, 6, 0, 0, 0])])),
    pngChunk('IDAT', deflateSync(scanlines)),
    pngChunk('IEND', Buffer.alloc(0))
  ]);
}

function pngChunk(type: string, data: Buffer) {
  const typeBuffer = Buffer.from(type, 'ascii');
  return Buffer.concat([uint32be(data.length), typeBuffer, data, uint32be(crc32(Buffer.concat([typeBuffer, data])))]);
}

function uint32be(value: number) {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32BE(value >>> 0);
  return buffer;
}

const crcTable = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});

function crc32(buffer: Buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

async function findReferencedFile(folder: string, reference: string | undefined, extension: string) {
  const entries = await listFilesDeep(folder);
  if (reference) {
    const normalized = reference.replace(/\\/g, '/').replace(/^\.?\//, '').toLowerCase();
    const exact = entries.find((entry) => entry.relative.replace(/\\/g, '/').toLowerCase() === normalized);
    if (exact) return exact.relative;
    const base = basename(normalized);
    const byBase = entries.find((entry) => basename(entry.relative).toLowerCase() === base);
    if (byBase) return byBase.relative;
  }
  return entries.find((entry) => entry.relative.toLowerCase().endsWith(extension))?.relative;
}

function findVirtualReferencedFile(
  files: Array<{ relativePath: string; data: Buffer }>,
  reference: string | undefined,
  extension: string
) {
  if (reference) {
    const normalized = normalizeRelativePath(reference).toLowerCase();
    const exact = files.find((file) => file.relativePath.toLowerCase() === normalized);
    if (exact) return exact;
    const base = basename(normalized);
    const byBase = files.find((file) => basename(file.relativePath).toLowerCase() === base);
    if (byBase) return byBase;
  }
  return files.find((file) => file.relativePath.toLowerCase().endsWith(extension));
}

async function listFilesDeep(folder: string, root = folder): Promise<Array<{ path: string; relative: string }>> {
  const entries = await readdir(folder, { withFileTypes: true });
  const files: Array<{ path: string; relative: string }> = [];
  for (const entry of entries) {
    const path = join(folder, entry.name);
    if (entry.isDirectory()) files.push(...await listFilesDeep(path, root));
    else files.push({ path, relative: path.slice(root.length + 1) });
  }
  return files;
}

async function findFallbackSprite(sourceDir: string, ref: [number, number]) {
  const names = new Set([
    `${ref[0]}-${ref[1]}.png`,
    `${ref[0]}_${ref[1]}.png`,
    `${ref[0]},${ref[1]}.png`
  ]);
  const files = await listFilesDeep(sourceDir);
  return files.find((file) => extname(file.path).toLowerCase() === '.png' && names.has(basename(file.path).toLowerCase()))?.path;
}

function findVirtualFallbackSprite(files: Array<{ relativePath: string; data: Buffer }>, ref: [number, number]) {
  const names = new Set([
    `${ref[0]}-${ref[1]}.png`,
    `${ref[0]}_${ref[1]}.png`,
    `${ref[0]},${ref[1]}.png`
  ]);
  return files.find((file) => extname(file.relativePath).toLowerCase() === '.png' && names.has(basename(file.relativePath).toLowerCase()));
}

function normalizeRelativePath(value: string) {
  return value.replace(/\\/g, '/').replace(/^\.?\//, '').replace(/^\/+/, '');
}

function spriteKey(sprite: [number, number]) {
  return `${sprite[0]},${sprite[1]}`;
}

function unquote(value: string) {
  return value.trim().replace(/^["']|["']$/g, '');
}
