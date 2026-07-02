import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const repoRoot = process.argv.includes('--repo')
  ? path.resolve(process.argv[process.argv.indexOf('--repo') + 1])
  : process.cwd();
const baseUrl = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:4177';
const outRoot = path.join(repoRoot, 'tmp/voxel-visual-proof');
const maxCharacters = process.argv.includes('--limit')
  ? Number(process.argv[process.argv.indexOf('--limit') + 1])
  : Infinity;
const samplesPerMove = process.argv.includes('--samples')
  ? Math.max(1, Number(process.argv[process.argv.indexOf('--samples') + 1]))
  : 2;
const holdMsPerMove = process.argv.includes('--hold-ms')
  ? Math.max(120, Number(process.argv[process.argv.indexOf('--hold-ms') + 1]))
  : 650;
const recordingFps = process.argv.includes('--fps')
  ? Math.max(6, Number(process.argv[process.argv.indexOf('--fps') + 1]))
  : 12;
const resume = process.argv.includes('--resume');
const characterFilterArg = process.argv.includes('--characters')
  ? process.argv[process.argv.indexOf('--characters') + 1]
  : '';
const characterFilter = new Set(
  characterFilterArg
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
);

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function canReach(url) {
  return new Promise((resolve) => {
    const request = http.get(url, (response) => {
      response.resume();
      resolve(true);
    });
    request.on('error', () => resolve(false));
    request.setTimeout(1000, () => {
      request.destroy();
      resolve(false);
    });
  });
}

async function ensureServer() {
  if (await canReach(baseUrl)) return null;
  const server = spawn('npx', ['vite', '--host', '127.0.0.1', '--port', '4177'], {
    cwd: repoRoot,
    stdio: ['ignore', 'pipe', 'pipe']
  });
  const timeoutAt = Date.now() + 45_000;
  while (Date.now() < timeoutAt) {
    if (await canReach(baseUrl)) return server;
    await wait(500);
  }
  server.kill();
  throw new Error(`Timed out waiting for ${baseUrl}`);
}

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, 'utf8'));
}

function safeName(value) {
  return value.replace(/[^a-z0-9._-]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase();
}

async function runFfmpeg(frameDir, outFile) {
  return new Promise((resolve) => {
    const child = spawn(
      'ffmpeg',
      [
        '-y',
        '-framerate',
        '6',
        '-pattern_type',
        'glob',
        '-i',
        path.join(frameDir, '*.png'),
        '-vf',
        'pad=ceil(iw/2)*2:ceil(ih/2)*2',
        '-pix_fmt',
        'yuv420p',
        outFile
      ],
      { cwd: repoRoot, stdio: 'ignore' }
    );
    child.on('close', (code) => resolve(code === 0));
    child.on('error', () => resolve(false));
  });
}

async function startCanvasRecording(page) {
  return page.evaluate((fps) => {
    const existing = window.__koreCanvasRecorder;
    if (existing?.recorder?.state === 'recording') existing.recorder.stop();
    existing?.stream?.getTracks?.().forEach((track) => track.stop());
    const target = document.querySelector('[data-testid="character-viewer-canvas"]');
    const canvas = target instanceof HTMLCanvasElement
      ? target
      : target?.querySelector?.('canvas') ?? document.querySelector('canvas');
    if (!canvas || typeof canvas.captureStream !== 'function') throw new Error('Character viewer canvas captureStream is unavailable');
    const stream = canvas.captureStream(fps);
    const chunks = [];
    const mimeCandidates = [
      'video/webm;codecs=vp9',
      'video/webm;codecs=vp8',
      'video/webm'
    ];
    const mimeType = mimeCandidates.find((candidate) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(candidate)) ?? '';
    const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) chunks.push(event.data);
    };
    window.__koreCanvasRecorder = { recorder, stream, chunks, mimeType: recorder.mimeType || mimeType || 'video/webm' };
    recorder.start(250);
    return window.__koreCanvasRecorder.mimeType;
  }, recordingFps);
}

async function stopCanvasRecording(page) {
  const dataUrl = await page.evaluate(async () => {
    const active = window.__koreCanvasRecorder;
    if (!active?.recorder) throw new Error('No active canvas recorder');
    const { recorder, stream, chunks, mimeType } = active;
    await new Promise((resolve) => {
      recorder.onstop = resolve;
      if (recorder.state === 'recording') recorder.stop();
      else resolve();
    });
    stream?.getTracks?.().forEach((track) => track.stop());
    const blob = new Blob(chunks, { type: mimeType || 'video/webm' });
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  });
  const base64 = String(dataUrl).split(',')[1] ?? '';
  return Buffer.from(base64, 'base64');
}

async function clickCharacter(page, displayName) {
  const labelCard = page.getByLabel(displayName).first();
  await labelCard.scrollIntoViewIfNeeded();
  await labelCard.click({ timeout: 8000 });
  await page.waitForTimeout(250);
}

function parseCsvLine(line) {
  const cells = [];
  let value = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (quoted) {
      if (char === '"' && line[i + 1] === '"') {
        value += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        value += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      cells.push(value);
      value = '';
    } else {
      value += char;
    }
  }
  cells.push(value);
  return cells;
}

async function setAllCategory(page) {
  const trigger = page.getByRole('button', { name: 'Move slot category' });
  await trigger.click();
  await page.getByRole('option', { name: 'All', exact: true }).click();
  await page.waitForTimeout(200);
}

async function main() {
  const server = await ensureServer();
  if (!resume && characterFilter.size === 0) await fs.rm(path.join(outRoot, 'viewer-videos'), { recursive: true, force: true });
  await fs.mkdir(path.join(outRoot, 'viewer-videos'), { recursive: true });
  await fs.mkdir(path.join(outRoot, 'viewer-frames'), { recursive: true });
  const included = await readJson(path.join(outRoot, 'metrics/included-characters.json'));
  const frameMetricsCsv = await fs.readFile(path.join(outRoot, 'metrics/frame-metrics.csv'), 'utf8');
  const keysByCharacter = new Map();
  for (const line of frameMetricsCsv.split('\n').slice(1)) {
    if (!line.trim()) continue;
    const columns = parseCsvLine(line);
    const [characterId, , animation] = columns;
    if (!characterId || !animation) continue;
    if (!keysByCharacter.has(characterId)) keysByCharacter.set(characterId, new Set());
    keysByCharacter.get(characterId).add(animation);
  }
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const results = [];
  try {
    await page.goto(baseUrl, { waitUntil: 'networkidle' });
    await page.locator('.title-screen').click({ timeout: 15000 });
    await page.getByRole('button', { name: 'Characters' }).click();
    await page.getByTestId('character-viewer-canvas').waitFor({ timeout: 15000 });
    const hdToggle = page.getByTestId('toggle-hd-voxel-preview');
    if (await hdToggle.isVisible().catch(() => false)) {
      const text = await hdToggle.textContent();
      if (!/on/i.test(text ?? '')) {
        await hdToggle.click();
        await page.waitForTimeout(750);
      }
    }
    await setAllCategory(page);
    const selected = included
      .filter((character) => characterFilter.size === 0 || characterFilter.has(character.id))
      .slice(0, maxCharacters);
    for (const character of selected) {
      console.log(`recording viewer ${character.displayName} (${character.id})`);
      const videoPath = path.join(outRoot, 'viewer-videos', `${character.id}.webm`);
      const keys = Array.from(keysByCharacter.get(character.id) ?? []).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
      if (resume) {
        const existing = await fs.stat(videoPath).catch(() => null);
        if (existing?.size > 0) {
          results.push({
            id: character.id,
            displayName: character.displayName,
            captured: keys,
            skipped: [],
            mimeType: 'video/webm',
            videoBytes: existing.size,
            video: path.relative(repoRoot, videoPath),
            resumed: true
          });
          continue;
        }
      }
      await clickCharacter(page, character.displayName);
      await setAllCategory(page);
      const captured = [];
      const skipped = [];
      const mimeType = await startCanvasRecording(page);
      for (const key of keys) {
        const button = page.getByTestId(`viewer-pose-${key}`);
        if (!(await button.isVisible().catch(() => false))) {
          skipped.push(key);
          continue;
        }
        await button.scrollIntoViewIfNeeded();
        await button.click();
        await page.waitForTimeout(holdMsPerMove);
        captured.push(key);
      }
      const videoBuffer = await stopCanvasRecording(page);
      if (captured.length > 0 && videoBuffer.length > 0) await fs.writeFile(videoPath, videoBuffer);
      results.push({
        id: character.id,
        displayName: character.displayName,
        captured,
        skipped,
        mimeType,
        videoBytes: videoBuffer.length,
        video: captured.length > 0 && videoBuffer.length > 0 ? path.relative(repoRoot, videoPath) : null
      });
    }
  } finally {
    await context.close();
    await browser.close();
    if (server) server.kill();
  }
  await fs.writeFile(path.join(outRoot, 'viewer-recordings-summary.json'), JSON.stringify(results, null, 2));
  console.log(JSON.stringify({
    characters: results.length,
    capturedMoves: results.reduce((sum, result) => sum + result.captured.length, 0),
    holdMsPerMove,
    recordingFps,
    skippedSlots: results.reduce((sum, result) => sum + result.skipped.length, 0),
    videos: results.filter((result) => result.video).length
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
