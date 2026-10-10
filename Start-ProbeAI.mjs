import { spawn, spawnSync } from 'node:child_process';
import { openSync, mkdirSync, existsSync, copyFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const appRoot = path.dirname(fileURLToPath(import.meta.url));
const logRoot = path.join(appRoot, '.sites-runtime', 'launcher');
mkdirSync(logRoot, { recursive: true });

async function responds(url) {
  try { return (await fetch(url, { signal: AbortSignal.timeout(3000) })).ok; }
  catch { return false; }
}
function background(executable, args, label, options = {}) {
  const log = openSync(path.join(logRoot, `${label}.log`), 'a');
  const child = spawn(executable, args, {
    cwd: appRoot, detached: true, windowsHide: true,
    stdio: ['ignore', log, log], ...options,
  });
  child.on('error', (error) => console.error(`Could not start ${label}: ${error.message}`));
  child.unref();
}
async function waitUntilReady(url, seconds = 90) {
  const deadline = Date.now() + seconds * 1000;
  while (Date.now() < deadline) {
    if (await responds(url)) return true;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  return false;
}

function findOllama() {
  if (process.env.OLLAMA_EXE && existsSync(process.env.OLLAMA_EXE)) return process.env.OLLAMA_EXE;
  for (let directory = appRoot; directory !== path.dirname(directory); directory = path.dirname(directory)) {
    const candidate = path.join(directory, 'local-tools', 'ollama', 'ollama.exe');
    if (existsSync(candidate)) return candidate;
  }
  const fromPath = spawnSync('where.exe', ['ollama'], { encoding: 'utf8', windowsHide: true });
  return fromPath.status === 0 ? fromPath.stdout.split(/\r?\n/)[0].trim() : null;
}

console.log('Starting ProbeAI...');
if (!existsSync(path.join(appRoot, 'node_modules')))
  throw new Error('Install dependencies first with npm ci. Follow the README for first-time database setup.');
if (!existsSync(path.join(appRoot, '.env.local')))
  copyFileSync(path.join(appRoot, '.env.example'), path.join(appRoot, '.env.local'));
if (!await responds('http://127.0.0.1:11434/api/version')) {
  const ollama = findOllama();
  if (ollama) {
    const modelsDirectory = path.join(path.dirname(path.dirname(ollama)), 'ollama-models');
    background(ollama, ['serve'], 'ollama', {
      env: { ...process.env, ...(existsSync(modelsDirectory) ? { OLLAMA_MODELS: modelsDirectory } : {}), OLLAMA_NO_CLOUD: '1' },
    });
    if (!await waitUntilReady('http://127.0.0.1:11434/api/version', 15))
      console.warn('Ollama did not start. The built-in demo remains available.');
  } else console.warn('Ollama is not installed. The built-in demo remains available.');
}
if (await responds('http://127.0.0.1:11434/api/tags')) {
  const modelList = await (await fetch('http://127.0.0.1:11434/api/tags')).json();
  if (!modelList.models?.some((model) => model.name === 'qwen3:1.7b'))
    console.warn('Download qwen3:1.7b with ollama pull qwen3:1.7b to enable Local AI.');
}

if (!await responds('http://127.0.0.1:5173/')) {
  background(process.execPath, ['scripts/run-framework.mjs', 'dev'], 'probeai');
  if (!await waitUntilReady('http://127.0.0.1:5173/'))
    throw new Error('ProbeAI could not start. Check .sites-runtime/launcher/probeai.log.');
}
console.log('ProbeAI is ready: http://127.0.0.1:5173/');
if (!process.argv.includes('--no-browser')) {
  const browser = spawn('cmd.exe', ['/c', 'start', '', 'http://127.0.0.1:5173/'], { windowsHide: true, detached: true, stdio: 'ignore' });
  browser.unref();
}
