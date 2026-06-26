import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, extname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const input = process.argv[2];
const outputDir = resolve(process.argv[3] ?? 'public/sounds/hits/generated');
const sourceDir = resolve('public/sounds/hits/source');
const silenceDb = process.env.SILENCE_DB ?? '-34dB';
const silenceDuration = Number(process.env.SILENCE_DURATION ?? 0.1);
const minClipDuration = Number(process.env.MIN_CLIP_DURATION ?? 0.045);
const edgePad = Number(process.env.CLIP_EDGE_PAD ?? 0.025);
const maxClipDuration = Number(process.env.MAX_CLIP_DURATION ?? 2.4);

if (!input) {
  console.error('Usage: node scripts/split-hit-sfx.mjs <youtube-url-or-local-file> [output-dir]');
  process.exit(1);
}

mkdirSync(outputDir, { recursive: true });
mkdirSync(sourceDir, { recursive: true });

const sourcePath = input.startsWith('http://') || input.startsWith('https://')
  ? downloadOwnedYoutubeMp3(input)
  : resolve(input);

if (!existsSync(sourcePath)) {
  console.error(`Input not found: ${sourcePath}`);
  process.exit(1);
}

const workWav = join(sourceDir, `${stripExtension(basename(sourcePath))}-analysis.wav`);
run('ffmpeg', [
  '-y',
  '-hide_banner',
  '-i',
  sourcePath,
  '-vn',
  '-ac',
  '1',
  '-ar',
  '48000',
  '-sample_fmt',
  's16',
  workWav
]);

const duration = probeDuration(workWav);
const silence = detectSilence(workWav);
const segments = nonSilentSegments(silence, duration)
  .map((segment) => ({
    start: Math.max(0, segment.start - edgePad),
    end: Math.min(duration, segment.end + edgePad)
  }))
  .filter((segment) => segment.end - segment.start >= minClipDuration)
  .flatMap((segment) => splitLongSegment(segment, maxClipDuration));

if (segments.length === 0) {
  console.error('No hit clips detected. Try SILENCE_DB=-40dB or SILENCE_DURATION=0.06.');
  process.exit(1);
}

cleanGenerated(outputDir);

const clips = segments.map((segment, index) => {
  const clipNumber = String(index + 1).padStart(3, '0');
  const fileName = `hit-${clipNumber}.wav`;
  const filePath = join(outputDir, fileName);
  const duration = segment.end - segment.start;
  run('ffmpeg', [
    '-y',
    '-hide_banner',
    '-ss',
    segment.start.toFixed(4),
    '-to',
    segment.end.toFixed(4),
    '-i',
    workWav,
    '-af',
    'highpass=f=80,alimiter=limit=0.92',
    '-ac',
    '1',
    '-ar',
    '48000',
    filePath
  ]);
  return {
    id: `hit-${clipNumber}`,
    path: `/sounds/hits/generated/${fileName}`,
    start: Number(segment.start.toFixed(4)),
    end: Number(segment.end.toFixed(4)),
    duration: Number(duration.toFixed(4)),
    suggestedUse: suggestUse(duration, index)
  };
});

const manifest = {
  source: input,
  sourcePath: relativePublicPath(sourcePath),
  generatedAt: new Date().toISOString(),
  settings: {
    silenceDb,
    silenceDuration,
    minClipDuration,
    edgePad,
    maxClipDuration
  },
  clips
};

writeFileSync(join(outputDir, 'hit-sfx-index.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

console.log(`Split ${clips.length} clips into ${outputDir}`);
console.log(`Manifest: ${join(outputDir, 'hit-sfx-index.json')}`);
clips.forEach((clip) => {
  console.log(`${clip.id}\t${clip.duration.toFixed(3)}s\t${clip.path}\t${clip.suggestedUse}`);
});

function downloadOwnedYoutubeMp3(url) {
  const before = new Set(listFiles(sourceDir));
  const outputTemplate = join(sourceDir, 'youtube-%(id)s.%(ext)s');
  run('yt-dlp', [
    '--no-playlist',
    '-x',
    '--audio-format',
    'mp3',
    '--audio-quality',
    '0',
    '-o',
    outputTemplate,
    url
  ]);
  const after = listFiles(sourceDir)
    .filter((file) => file.endsWith('.mp3') && !before.has(file))
    .map((file) => join(sourceDir, file))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  if (after[0]) return after[0];
  const fallback = listFiles(sourceDir)
    .filter((file) => file.startsWith('youtube-') && file.endsWith('.mp3'))
    .map((file) => join(sourceDir, file))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0];
  if (fallback) return fallback;
  throw new Error('yt-dlp completed but no MP3 source file was found.');
}

function detectSilence(filePath) {
  const result = spawnSync('ffmpeg', [
    '-hide_banner',
    '-nostats',
    '-i',
    filePath,
    '-af',
    `silencedetect=noise=${silenceDb}:d=${silenceDuration}`,
    '-f',
    'null',
    '-'
  ], { encoding: 'utf8' });
  const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  if (result.status !== 0) {
    console.error(output);
    process.exit(result.status ?? 1);
  }
  const events = [];
  output.split(/\r?\n/).forEach((line) => {
    const start = line.match(/silence_start:\s*([0-9.]+)/);
    if (start) events.push({ type: 'start', time: Number(start[1]) });
    const end = line.match(/silence_end:\s*([0-9.]+)/);
    if (end) events.push({ type: 'end', time: Number(end[1]) });
  });
  return events.sort((a, b) => a.time - b.time);
}

function nonSilentSegments(events, duration) {
  const segments = [];
  let cursor = 0;
  let inSilence = false;
  for (const event of events) {
    if (event.type === 'start' && !inSilence) {
      if (event.time > cursor) segments.push({ start: cursor, end: event.time });
      inSilence = true;
    } else if (event.type === 'end' && inSilence) {
      cursor = event.time;
      inSilence = false;
    }
  }
  if (!inSilence && cursor < duration) segments.push({ start: cursor, end: duration });
  return mergeCloseSegments(segments);
}

function mergeCloseSegments(segments) {
  const merged = [];
  for (const segment of segments) {
    const previous = merged[merged.length - 1];
    if (previous && segment.start - previous.end < 0.035) {
      previous.end = segment.end;
    } else {
      merged.push({ ...segment });
    }
  }
  return merged;
}

function splitLongSegment(segment, maxDuration) {
  const duration = segment.end - segment.start;
  if (duration <= maxDuration) return [segment];
  const count = Math.ceil(duration / maxDuration);
  const slice = duration / count;
  return Array.from({ length: count }, (_, index) => ({
    start: segment.start + slice * index,
    end: index === count - 1 ? segment.end : segment.start + slice * (index + 1)
  }));
}

function probeDuration(filePath) {
  const result = spawnSync('ffprobe', [
    '-v',
    'error',
    '-show_entries',
    'format=duration',
    '-of',
    'default=noprint_wrappers=1:nokey=1',
    filePath
  ], { encoding: 'utf8' });
  const duration = Number(String(result.stdout).trim());
  if (!Number.isFinite(duration) || duration <= 0) throw new Error('Could not read audio duration.');
  return duration;
}

function cleanGenerated(dir) {
  readdirSync(dir)
    .filter((file) => /^hit-\d+\.wav$/.test(file) || file === 'hit-sfx-index.json')
    .forEach((file) => rmSync(join(dir, file), { force: true }));
}

function suggestUse(duration, index) {
  if (duration < 0.12) return index % 2 === 0 ? 'quick-hit' : 'block-tick';
  if (duration < 0.28) return index % 3 === 0 ? 'punch-hit' : 'kick-hit';
  if (duration < 0.55) return 'heavy-hit';
  return 'launcher-or-special';
}

function run(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  if (result.status !== 0) {
    console.error(result.stdout ?? '');
    console.error(result.stderr ?? '');
    process.exit(result.status ?? 1);
  }
  return result;
}

function listFiles(dir) {
  return existsSync(dir) ? readdirSync(dir) : [];
}

function stripExtension(fileName) {
  return fileName.slice(0, fileName.length - extname(fileName).length);
}

function relativePublicPath(filePath) {
  const normalized = filePath.replaceAll('\\', '/');
  const publicIndex = normalized.lastIndexOf('/public/');
  return publicIndex >= 0 ? normalized.slice(publicIndex + '/public'.length) : normalized;
}
