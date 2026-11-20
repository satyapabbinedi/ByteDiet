// Copies the FFmpeg/WASM core from node_modules into public/ffmpeg so Next.js serves it same-origin.
// Runs on postinstall / predev / prebuild, so the 32 MB .wasm never has to be committed to git.
import { copyFile, mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(root, 'node_modules', '@ffmpeg', 'core', 'dist', 'umd');
const target = path.join(root, 'public', 'ffmpeg');

async function size(file) {
  try { return (await stat(file)).size; } catch { return -1; }
}

try {
  await mkdir(target, { recursive: true });
  let copied = 0;
  for (const name of ['ffmpeg-core.js', 'ffmpeg-core.wasm']) {
    const from = path.join(source, name);
    const sourceSize = await size(from);
    if (sourceSize < 0) throw new Error(`${from} not found - run "npm install" first.`);
    if (sourceSize !== await size(path.join(target, name))) {
      await copyFile(from, path.join(target, name));
      copied += 1;
    }
  }
  console.log(copied ? `ffmpeg core synced to public/ffmpeg (${copied} file${copied > 1 ? 's' : ''})` : 'ffmpeg core already in place');
} catch (error) {
  // Never break "npm install" itself; the app reports a clear error if the core is genuinely missing.
  console.warn(`ffmpeg core sync skipped: ${error.message}`);
}
