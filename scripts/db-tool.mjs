// Maintenance tool for the git-friendly local DB (data/metrics/media.json + data/media/*).
//   node scripts/db-tool.mjs verify          integrity check (exit 1 on problems)
//   node scripts/db-tool.mjs reset [--yes]   remove everything that is not listed in data/seed-manifest.json
// Honors LOCAL_MEDIA_STORAGE_DIR like the app does.
import { readFile, readdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(process.env.LOCAL_MEDIA_STORAGE_DIR || path.join(process.cwd(), 'data'));
const dbPath = path.join(root, 'metrics', 'media.json');
const mediaDir = path.join(root, 'media');
const manifestPath = path.join(root, 'seed-manifest.json');
const WARN_BYTES = 50 * 1024 * 1024;   // GitHub warns above 50 MB
const FAIL_BYTES = 100 * 1024 * 1024;  // GitHub rejects above 100 MB
const SAFE_ID = /^[A-Za-z0-9_-]{1,128}$/;

async function readJson(file, fallback) {
  try { return JSON.parse(await readFile(file, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT' && fallback !== undefined) return fallback; throw error; }
}
const listBlobs = async () => (await readdir(mediaDir).catch(() => [])).filter(name => /-(original|compressed)$/.test(name));
const mb = bytes => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

async function verify() {
  const records = await readJson(dbPath, []);
  if (!Array.isArray(records)) throw new Error(`${dbPath} must contain a JSON array`);
  const problems = [];
  const warnings = [];
  const seen = new Set();
  const expected = new Set();
  let totalBytes = 0;

  for (const record of records) {
    const id = record?.id;
    if (typeof id !== 'string' || !SAFE_ID.test(id)) { problems.push(`record with invalid id: ${JSON.stringify(id)}`); continue; }
    if (seen.has(id)) problems.push(`${id}: duplicate id`);
    seen.add(id);
    for (const [suffix, expectedBytes] of [['original', record.originalBytes], ['compressed', record.compressedBytes]]) {
      const name = `${id}-${suffix}`;
      expected.add(name);
      let info;
      try { info = await stat(path.join(mediaDir, name)); } catch { problems.push(`${id}: missing blob media/${name}`); continue; }
      totalBytes += info.size;
      if (info.size !== expectedBytes) problems.push(`${id}: ${suffix} is ${info.size} bytes on disk but the DB says ${expectedBytes}`);
      if (info.size >= FAIL_BYTES) problems.push(`${id}: ${suffix} is ${mb(info.size)} - GitHub rejects files over 100 MB`);
      else if (info.size >= WARN_BYTES) warnings.push(`${id}: ${suffix} is ${mb(info.size)} - GitHub warns above 50 MB`);
    }
    if (record.outputMime !== 'image/webp' && record.outputMime !== 'video/mp4') problems.push(`${id}: unexpected output MIME ${record.outputMime}`);
  }
  for (const name of await listBlobs()) if (!expected.has(name)) warnings.push(`orphan blob media/${name} is not referenced by the DB`);

  console.log(`DB: ${records.length} record(s), ${mb(totalBytes)} of media in ${path.relative(process.cwd(), root) || '.'}`);
  warnings.forEach(message => console.warn(`warning: ${message}`));
  problems.forEach(message => console.error(`error: ${message}`));
  if (problems.length) process.exitCode = 1; else console.log('DB OK');
}

async function reset(confirmed) {
  const manifest = await readJson(manifestPath, null);
  if (!manifest || !Array.isArray(manifest.ids)) throw new Error(`${manifestPath} is missing or invalid; nothing to reset to.`);
  const keep = new Set(manifest.ids);
  const records = await readJson(dbPath, []);
  const kept = records.filter(record => keep.has(record.id));
  const dropped = records.filter(record => !keep.has(record.id));
  const keepBlobs = new Set(manifest.ids.flatMap(id => [`${id}-original`, `${id}-compressed`]));
  const strayBlobs = (await listBlobs()).filter(name => !keepBlobs.has(name));
  console.log(`Seed records kept: ${kept.length}. Uploaded records to remove: ${dropped.length}. Blobs to delete: ${strayBlobs.length}.`);
  if (!confirmed) { console.log('Dry run. Re-run with --yes to delete.'); return; }
  const { writeFile } = await import('node:fs/promises');
  await writeFile(dbPath, `${JSON.stringify(kept, null, 2)}\n`, 'utf8');
  await Promise.all(strayBlobs.map(name => rm(path.join(mediaDir, name), { force: true })));
  console.log('Reset to seed data.');
}

const [command, flag] = process.argv.slice(2);
try {
  if (command === 'verify') await verify();
  else if (command === 'reset') await reset(flag === '--yes');
  else { console.error('Usage: db-tool.mjs verify | reset [--yes]'); process.exitCode = 2; }
} catch (error) {
  console.error(`error: ${error.message}`);
  process.exitCode = 1;
}
