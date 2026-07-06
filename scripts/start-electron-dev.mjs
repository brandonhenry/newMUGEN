import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const electron = require('electron');

const env = {
  ...process.env,
  KORE_DESKTOP_URL: process.env.KORE_DESKTOP_URL || 'http://127.0.0.1:4177'
};

const child = spawn(electron, ['electron/main.cjs', ...process.argv.slice(2)], {
  env,
  stdio: 'inherit'
});

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 0);
});
