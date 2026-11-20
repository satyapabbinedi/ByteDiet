// Optional: downloads public sample files into inputs/fixtures/ (git-ignored) for manual testing.
// Sources are third-party and may be unavailable; failures are skipped and never fatal.
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const dir = path.join(process.cwd(), 'inputs', 'fixtures');
await mkdir(dir, { recursive: true });
const fixtures = [
  ['sample-heic.heic', 'https://raw.githubusercontent.com/strukturag/libheif/master/examples/example.heic'],
  ['sample-heic-sequence.heic', 'https://raw.githubusercontent.com/nokiatech/heif_conformance/master/conformance_files/C001.heic'],
  ['sample-webp.webp', 'https://www.gstatic.com/webp/gallery/1.webp'],
  ['sample-png.png', 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/47/PNG_transparency_demonstration_1.png/640px-PNG_transparency_demonstration_1.png'],
  ['sample-mp4.mp4', 'https://samplelib.com/lib/preview/mp4/sample-5s.mp4'],
  ['sample-mov.mov', 'https://filesamples.com/samples/video/mov/sample_640x360.mov'],
  ['sample-m4v.m4v', 'https://filesamples.com/samples/video/m4v/sample_640x360.m4v'],
  ['sample-webm.webm', 'https://samplelib.com/lib/preview/webm/sample-5s.webm'],
  ['sample-mkv.mkv', 'https://filesamples.com/samples/video/mkv/sample_640x360.mkv'],
];

let saved = 0;
for (const [name, url] of fixtures) {
  try {
    const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; media-lab-fixtures)' }, signal: AbortSignal.timeout(60_000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    await writeFile(path.join(dir, name), Buffer.from(await response.arrayBuffer()));
    console.log(`saved   ${name}`);
    saved += 1;
  } catch (error) {
    console.warn(`skipped ${name}: ${error.message}`);
  }
}
console.log(`${saved}/${fixtures.length} fixtures saved to ${dir}`);
