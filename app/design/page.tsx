import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { SiteHeader } from '../site-header';

export const metadata: Metadata = {
  title: 'System design / Media Lab',
  description: 'Architecture, data model, API and implementation details of the Media Lab proof of concept.',
};

const toc = [
  ['overview', 'Overview'], ['architecture', 'Architecture'], ['flow', 'End-to-end flow'], ['pipeline', 'Conversion pipeline'],
  ['formats', 'Format support'], ['data', 'Data model'], ['storage', 'Storage & git'], ['api', 'API reference'],
  ['security', 'Trust & validation'], ['limits', 'Performance & limits'], ['errors', 'Failure handling'], ['testing', 'Testing & CI'],
  ['platforms', 'macOS / Windows / Linux'], ['decisions', 'Design decisions'], ['roadmap', 'Production path'], ['sourcemap', 'Source map'],
] as const;

const recordFields: [string, string, string][] = [
  ['id', 'string (UUID)', 'Server-generated. The only input to blob file names.'],
  ['name', 'string', 'Original file name, display only.'],
  ['kind', '"image" | "video"', 'Derived from the original extension (MIME only if the extension is unknown).'],
  ['sourceFormat / outputFormat', 'string', 'Upper-case extension, e.g. HEIC → WEBP, MOV → MP4.'],
  ['originalMime / outputMime', 'string', 'Persisted and replayed as Content-Type. Output is always image/webp or video/mp4.'],
  ['originalBytes / compressedBytes', 'number', 'Measured by the server from the received bytes.'],
  ['savingsPercent', 'number', 'max(0, (1 − compressed / original) × 100), unrounded.'],
  ['compressionStatus', '"compressed" | "passthrough"', 'passthrough = output was not smaller; the converted bytes are still stored, never swapped for the original.'],
  ['width / height', 'number | null', 'Input dimensions (browser metadata, or the HEIC decoder when the browser cannot read HEIC).'],
  ['outputWidth / outputHeight', 'number | null', 'Output dimensions measured in the browser.'],
  ['duration', 'number | null', 'Video seconds when the browser could read it.'],
  ['originalPath / compressedPath', 'string', 'Root-relative, forward slashes: media/<id>-original. Never an absolute, machine-specific path.'],
  ['conversionEngine', 'string | null', 'canvas-webp, libheif-wasm+canvas-webp or ffmpeg.wasm (client-reported, informational).'],
  ['conversionMs / clientProcessingStatus', 'number | string | null', 'Client-reported timing and status (informational, not trusted).'],
  ['createdAt', 'ISO 8601', 'Server timestamp.'],
];

const formatRows: [string, string, string][] = [
  ['JPEG, PNG, WebP, GIF, BMP, AVIF', 'createImageBitmap → canvas → WebP', 'Anything the browser can decode. Animated GIF/WebP are flattened to the first frame.'],
  ['HEIC / HEIF (iPhone photos)', 'Native decode if available, otherwise libheif (WASM) → canvas → WebP', 'Detected from the file bytes (ISO-BMFF “ftyp” brands), so a wrong extension or empty MIME still works. Primary image only; images over 120 MP are rejected.'],
  ['TIFF and other still formats', 'FFmpeg (WASM) → libwebp', 'Best effort: only what the bundled FFmpeg core can decode.'],
  ['MP4, MOV, M4V, WebM, MKV, AVI', 'FFmpeg (WASM) → H.264 + AAC MP4', 'Includes iPhone HEVC .mov. Output is yuv420p so 10-bit / 4:2:2 sources stay playable.'],
];

const files: [string, string][] = [
  ['app/page.tsx', 'Lab UI: file picker/drop zone, phase + progress state, library list, before/after and metrics views.'],
  ['app/design/page.tsx', 'This page (static server component).'],
  ['app/site-header.tsx', 'Shared header and navigation.'],
  ['lib/client-media.ts', 'Browser conversion orchestrator: decode, resize, encode WebP, FFmpeg video/fallback, engine lifecycle, exit-code checks.'],
  ['lib/heic.ts', 'HEIF sniffing from bytes and libheif (WASM) decoding to a canvas.'],
  ['lib/media-formats.ts', 'Shared classification: extension/MIME → kind, source MIME/format, output contract, savings maths.'],
  ['lib/local-media.ts', 'Storage layer: JSON DB with serialised updates and atomic replace, blob read/write, legacy-record normalisation.'],
  ['app/api/media/route.ts', 'GET list and POST ingest (validation only; never touches a codec).'],
  ['app/api/media/[id]/[variant]/route.ts', 'Streams a stored variant with single byte-range support.'],
  ['scripts/sync-ffmpeg-core.mjs', 'Copies the FFmpeg WASM core from node_modules to public/ffmpeg (postinstall/predev/prebuild).'],
  ['scripts/db-tool.mjs', 'db:verify integrity check and db:reset back to the seed data.'],
  ['scripts/*.test.mjs', 'node:test contract tests (API, ranges, paths, HEIC sniffing, formatting).'],
  ['data/', 'The committed database: metrics/media.json, media/<uuid>-original|compressed, seed-manifest.json.'],
  ['.github/workflows/ci.yml', 'Type-check, tests, DB verify and production build on Ubuntu, macOS and Windows.'],
];

function Section({ id, kicker, title, children }: { id: string; kicker: string; title: string; children: ReactNode }) {
  return <section id={id} className="doc-section"><span className="kicker">{kicker}</span><h2>{title}</h2>{children}</section>;
}

function Table({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  return <div className="doc-table-wrap"><table className="doc-table"><thead><tr>{head.map(cell => <th key={cell} scope="col">{cell}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={index}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}</tr>)}</tbody></table></div>;
}

function Note({ title, children }: { title: string; children: ReactNode }) {
  return <aside className="doc-note"><strong>{title}</strong><p>{children}</p></aside>;
}

function Architecture() {
  const box = { fill: 'var(--white)', stroke: 'var(--ink)', strokeWidth: 1.2 } as const;
  const soft = { fill: '#eef2e4', stroke: 'var(--line)', strokeWidth: 1 } as const;
  const text = { fontFamily: "'DM Mono', monospace", fontSize: 11, fill: 'var(--ink)' } as const;
  const muted = { ...text, fill: 'var(--muted)', fontSize: 10 } as const;
  const title = { ...text, fontWeight: 600, letterSpacing: '.08em', fontSize: 11 } as const;
  return <figure className="doc-figure">
    <svg viewBox="0 0 1000 470" role="img" aria-labelledby="arch-title arch-desc">
      <title id="arch-title">Media Lab architecture</title>
      <desc id="arch-desc">The browser decodes and converts media, then uploads the original and converted files to a storage-only Next.js API that writes a JSON database and blobs into the data folder, which is committed to git.</desc>
      <defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="var(--ink)" /></marker></defs>

      <rect x="10" y="10" width="440" height="450" rx="4" {...soft} /><text x="26" y="34" {...title}>BROWSER (all media processing)</text>
      <rect x="30" y="50" width="400" height="76" rx="3" {...box} /><text x="46" y="74" {...title}>React UI</text><text x="46" y="93" {...muted}>app/page.tsx · phases, progress, library,</text><text x="46" y="109" {...muted}>before/after + metrics views</text>
      <rect x="30" y="150" width="400" height="290" rx="3" {...box} /><text x="46" y="174" {...title}>Converter · lib/client-media.ts</text>
      <rect x="46" y="188" width="368" height="56" rx="3" {...soft} /><text x="60" y="210" {...text}>Canvas + createImageBitmap → WebP</text><text x="60" y="227" {...muted}>JPEG PNG WebP GIF AVIF · EXIF orientation · ≤1600px</text>
      <rect x="46" y="254" width="368" height="56" rx="3" {...soft} /><text x="60" y="276" {...text}>libheif (WASM) → canvas → WebP</text><text x="60" y="293" {...muted}>HEIC/HEIF sniffed from bytes · lazy-loaded</text>
      <rect x="46" y="320" width="368" height="106" rx="3" {...soft} /><text x="60" y="342" {...text}>FFmpeg (WASM) core 0.12.10 · lazy-loaded</text><text x="60" y="359" {...muted}>video → H.264/AAC MP4 (≤1920px, CRF 28, +faststart)</text><text x="60" y="375" {...muted}>fallback for still formats the browser cannot decode</text><text x="60" y="391" {...muted}>exit codes checked · crashed instance discarded</text><text x="60" y="410" {...muted}>served same-origin from /ffmpeg/ (synced from npm)</text>

      <rect x="540" y="10" width="270" height="250" rx="4" {...soft} /><text x="556" y="34" {...title}>NEXT.JS · STORAGE ONLY</text>
      <rect x="556" y="50" width="238" height="56" rx="3" {...box} /><text x="570" y="73" {...text}>POST /api/media</text><text x="570" y="90" {...muted}>validate · assign UUID · persist</text>
      <rect x="556" y="116" width="238" height="56" rx="3" {...box} /><text x="570" y="139" {...text}>GET /api/media</text><text x="570" y="156" {...muted}>list records (newest first)</text>
      <rect x="556" y="182" width="238" height="64" rx="3" {...box} /><text x="570" y="205" {...text}>GET /api/media/:id/:variant</text><text x="570" y="222" {...muted}>stream blob · single Range · 206/416</text><text x="570" y="237" {...muted}>no decode, no transcode, no codecs</text>

      <rect x="540" y="290" width="270" height="170" rx="4" {...soft} /><text x="556" y="314" {...title}>data/ (LOCAL_MEDIA_STORAGE_DIR)</text>
      <rect x="556" y="328" width="238" height="52" rx="3" {...box} /><text x="570" y="350" {...text}>metrics/media.json</text><text x="570" y="367" {...muted}>the DB · JSON array · atomic rename</text>
      <rect x="556" y="390" width="238" height="56" rx="3" {...box} /><text x="570" y="410" {...text}>media/&lt;uuid&gt;-original</text><text x="570" y="426" {...text}>media/&lt;uuid&gt;-compressed</text><text x="570" y="440" {...muted}>exact bytes as received</text>

      <rect x="880" y="290" width="110" height="170" rx="4" {...box} /><text x="935" y="364" textAnchor="middle" {...title}>GIT</text><text x="935" y="384" textAnchor="middle" {...muted}>data/ is</text><text x="935" y="399" textAnchor="middle" {...muted}>tracked →</text><text x="935" y="414" textAnchor="middle" {...muted}>push / clone</text>

      <path d="M430 88 H540 V78 H556" fill="none" stroke="var(--ink)" strokeWidth="1.4" markerEnd="url(#arrow)" /><text x="448" y="76" {...muted}>multipart</text>
      <path d="M556 146 H470 V120 H430" fill="none" stroke="var(--ink)" strokeWidth="1.4" strokeDasharray="4 3" markerEnd="url(#arrow)" /><text x="470" y="164" {...muted}>JSON / bytes</text>
      <path d="M675 106 V116" stroke="none" />
      <path d="M810 354 H880" fill="none" stroke="var(--ink)" strokeWidth="1.4" markerStart="url(#arrow)" markerEnd="url(#arrow)" />
      <path d="M675 260 V328" fill="none" stroke="var(--ink)" strokeWidth="1.4" markerStart="url(#arrow)" markerEnd="url(#arrow)" /><text x="684" y="300" {...muted}>fs read / write</text>
    </svg>
    <figcaption>All decoding, resizing and encoding happens before the upload. The server validates structure and stores bytes; it never runs a codec.</figcaption>
  </figure>;
}

export default function DesignPage() {
  return <main className="app-shell">
    <SiteHeader />
    <section className="doc-hero">
      <p className="eyebrow">SYSTEM DESIGN / IMPLEMENTATION NOTES</p>
      <h1>How Media Lab works,<br /><em>end to end.</em></h1>
      <p className="lede">A local-first proof of concept: media is decoded, compressed and converted <strong>in the browser</strong>, then the exact original and converted bytes plus metrics are stored in a small, git-friendly database. This page documents the architecture, the data model, the API contract and the trade-offs behind each choice.</p>
    </section>

    <div className="doc-layout">
      <nav className="doc-toc" aria-label="On this page"><span className="kicker">ON THIS PAGE</span><ol>{toc.map(([id, label]) => <li key={id}><a href={`#${id}`}>{label}</a></li>)}</ol></nav>

      <article className="doc">
        <Section id="overview" kicker="01 / OVERVIEW" title="Goals, non-goals and constraints">
          <p>The question this PoC answers: <em>can a plain web app compress and normalise user media (including iPhone HEIC photos and MOV video) entirely on the client, and persist the result with its evidence, without any media server?</em></p>
          <div className="doc-cols">
            <div><h3>Goals</h3><ul>
              <li>Convert images to WebP and video to H.264/AAC MP4 in the browser.</li>
              <li>Handle HEIC/HEIF on browsers that cannot decode it natively.</li>
              <li>Store original and converted bytes exactly, with byte-derived savings and timing.</li>
              <li>Clone, install and run with zero external services on macOS, Windows and Linux.</li>
              <li>Make the database itself shareable through git.</li>
            </ul></div>
            <div><h3>Non-goals</h3><ul>
              <li>No server-side transcoding (no ffmpeg binary, no sharp, no cloud media APIs).</li>
              <li>No authentication, multi-user tenancy or public deployment.</li>
              <li>No animation-preserving conversion (GIF/WebP are flattened).</li>
              <li>Not durable object storage: this is a desktop PoC.</li>
            </ul></div>
          </div>
          <Table head={['Concern', 'Choice']} rows={[
            ['Framework', 'Next.js 16 App Router, React 19, TypeScript (webpack build).'],
            ['Runtime', 'Node.js 22.15+ (the tests use the module hooks API). No native add-ons, so Apple Silicon needs nothing special.'],
            ['Browser codecs', 'Canvas/createImageBitmap, libheif-js (WASM), @ffmpeg/ffmpeg + @ffmpeg/core 0.12.10 (WASM).'],
            ['Persistence', 'JSON file DB + blob files under data/, committed to git.'],
          ]} />
        </Section>

        <Section id="architecture" kicker="02 / ARCHITECTURE" title="Components and trust boundary">
          <Architecture />
          <p>The browser is the only place media is interpreted. The API accepts a multipart request with two files and a handful of numbers, checks that they obey the contract, and writes them. Because the server holds no codec, its attack surface and cost are tiny, and conversion cost scales with the number of users’ devices rather than with a server fleet.</p>
        </Section>

        <Section id="flow" kicker="03 / FLOW" title="What happens when a file is added">
          <ol className="doc-steps">
            <li><strong>Select.</strong> The input (or drop target) accepts <code>image/*</code>, <code>video/*</code> and all recognised extensions. Selection is disabled while a job runs and the input is reset afterwards so the same file can be chosen again.</li>
            <li><strong>Classify.</strong> <code>classifyMedia()</code> maps the extension to kind and MIME (extension wins over a wrong or empty browser MIME). Unknown extensions fall back to a specific <code>image/*</code> or <code>video/*</code> MIME; otherwise the file is rejected before any work.</li>
            <li><strong>Inspect.</strong> Dimensions (and video duration) are read in the browser. Failure here is non-fatal; HEIC dimensions come from the decoder instead.</li>
            <li><strong>Convert.</strong> The converter chunk is imported dynamically, so none of the WASM is downloaded until needed. See the pipeline below. A failure surfaces in the UI and the API is never called.</li>
            <li><strong>Measure.</strong> The output is inspected again for its dimensions; elapsed time is recorded.</li>
            <li><strong>Upload.</strong> One <code>multipart/form-data</code> POST carries <code>original</code>, <code>compressed</code> and metadata.</li>
            <li><strong>Persist.</strong> The server validates, writes both blobs (exclusive create), appends the record to the DB under a write queue, and returns it. Any failure removes the blobs it wrote.</li>
            <li><strong>Render.</strong> The record is prepended to the library and the before/after view streams both variants back from the API with their persisted MIME types.</li>
          </ol>
        </Section>

        <Section id="pipeline" kicker="04 / CONVERSION" title="Client-side conversion pipeline">
          <h3>Images</h3>
          <ol className="doc-steps">
            <li>Sniff the first bytes for a HEIF brand (<code>heic heix hevc hevx heim heis mif1 msf1 …</code>, excluding AVIF).</li>
            <li>Try <code>createImageBitmap(file)</code>. It applies EXIF orientation and is the right path for every format the browser supports (Safari decodes HEIC natively and keeps wide-gamut colour handling).</li>
            <li>If that fails and the file is HEIF: load libheif (WASM) lazily, pick the primary image, and paint it to a canvas.</li>
            <li>If that fails and the file is <em>not</em> HEIF: ask FFmpeg to decode the first frame to WebP.</li>
            <li>Scale so the long edge is at most 1600 px (never upscale, smoothing set to high), then <code>canvas.toBlob(&apos;image/webp&apos;, 0.78)</code>. Transparency is preserved.</li>
            <li>If the returned blob is not actually <code>image/webp</code> (Safari silently returns PNG), re-encode that PNG with FFmpeg’s libwebp so a mislabelled file is never stored.</li>
          </ol>
          <h3>Video</h3>
          <p>FFmpeg (WASM) runs <code>-map 0:v:0 -map 0:a?</code> with a scale filter capping each side at 1920 px (aspect preserved, even dimensions), <code>libx264 -preset veryfast -crf 28 -pix_fmt yuv420p</code>, <code>aac -b:a 128k</code> and <code>+faststart</code>. The core is a single-threaded build, so it needs no cross-origin isolation headers.</p>
          <Note title="Engine lifecycle">One FFmpeg instance is created lazily and reused, with a single progress handler pointing at mutable callback state. <code>exec()</code> resolves with an exit code instead of throwing, so the code is checked explicitly; a thrown error (for example out-of-memory) discards the instance so the next job starts clean.</Note>
          <p><strong>Outcome rule.</strong> Whatever the converter produces is stored, even if it is larger than the original. <code>compressionStatus</code> becomes <code>passthrough</code> and savings are 0; the original is never substituted for the output.</p>
        </Section>

        <Section id="formats" kicker="05 / FORMATS" title="Format support">
          <Table head={['Input', 'Path', 'Notes']} rows={formatRows.map(([a, b, c]) => [a, b, c])} />
          <Note title="Verification status">The Chromium paths (canvas WebP, libheif HEIC, FFmpeg video) were exercised in a real browser during development. The Safari and Firefox branches are implemented and unit-level reasoned about but were not run in this repository’s CI, which has no browser stage. Support is best effort and depends on browser codecs, the bundled FFmpeg build and available memory.</Note>
        </Section>

        <Section id="data" kicker="06 / DATA MODEL" title="Media record">
          <p>One record per upload, stored as an element of the JSON array in <code>data/metrics/media.json</code>. New records are prepended, so the list is newest-first.</p>
          <Table head={['Field', 'Type', 'Meaning']} rows={recordFields.map(([a, b, c]) => [<code key="a">{a}</code>, b, c])} />
          <p>Records written by earlier versions remain readable: missing fields get compatibility defaults and absolute paths are re-derived from the id on read. Nothing is rewritten by a GET.</p>
        </Section>

        <Section id="storage" kicker="07 / STORAGE" title="A database you can commit">
          <pre className="doc-code">{`data/
├── metrics/media.json            # the DB: JSON array, 2-space indent, LF line endings
├── media/<uuid>-original         # exact bytes the user selected
├── media/<uuid>-compressed       # exact bytes the browser produced (.webp or .mp4)
└── seed-manifest.json            # ids of the sample records that ship with the repo`}</pre>
          <ul>
            <li><strong>Why a JSON file.</strong> It is text, so it diffs, merges and reviews in a pull request; it needs no install on any OS; and the whole storage surface is one module (<code>lib/local-media.ts</code>) that can be swapped for SQLite/Postgres later.</li>
            <li><strong>Portable.</strong> Paths are root-relative with forward slashes. Nothing in the DB names a drive letter, a home directory or a user.</li>
            <li><strong>Write safety.</strong> Updates are serialised through an in-process queue (read → modify → write) and the file is replaced by writing a temp file then renaming it, so a crash never leaves half a JSON document. Blobs are created exclusively and cleaned up if the DB update fails.</li>
            <li><strong>Git hygiene.</strong> <code>.gitattributes</code> marks blobs as binary and pins LF on the DB. <code>npm run db:verify</code> checks that every record has both blobs with matching sizes, flags orphans, and warns before GitHub’s 50 MB limit.</li>
            <li><strong>Reset.</strong> <code>npm run db:reset -- --yes</code> deletes uploaded records and blobs that are not in <code>seed-manifest.json</code>, returning to the shipped sample data.</li>
            <li><strong>Relocate.</strong> Set <code>LOCAL_MEDIA_STORAGE_DIR</code> to use another folder (for example a private one you do not commit).</li>
          </ul>
        </Section>

        <Section id="api" kicker="08 / API" title="HTTP contract">
          <Table head={['Endpoint', 'Behaviour']} rows={[
            [<code key="g">GET /api/media</code>, <>Returns <code>{'{ records: MediaRecord[] }'}</code>, newest first.</>],
            [<code key="p">POST /api/media</code>, <>Multipart form. Required, non-empty files: <code>original</code>, <code>compressed</code>. Optional text fields: <code>width</code>, <code>height</code>, <code>outputWidth</code>, <code>outputHeight</code> (positive integers), <code>duration</code> (positive number), <code>conversionEngine</code> (≤160 chars), <code>conversionMs</code> (≥0), <code>clientProcessingStatus</code> (≤48 chars). <strong>201</strong> returns <code>{'{ record }'}</code>.</>],
            [<code key="v">GET /api/media/:id/:variant</code>, <><code>variant</code> is <code>original</code> or <code>compressed</code>. Replays the persisted MIME type with <code>Content-Length</code> and <code>Accept-Ranges: bytes</code>. One valid range → <strong>206</strong> with exact <code>Content-Range</code>; unsatisfiable → <strong>416</strong> with <code>bytes */length</code>; malformed or multi-range headers are ignored and the full body is returned.</>],
          ]} />
          <Table head={['Status', 'Cause']} rows={[
            ['400', 'Not a multipart form; missing or empty part; original is not a recognised image/video; output is not .webp/image/webp (images) or .mp4/video/mp4 (video).'],
            ['404', 'Unknown id or variant, invalid id, or missing blob.'],
            ['416', 'Range starts beyond the end of the file.'],
            ['500', 'Filesystem failure while persisting; partial blobs are removed first.'],
          ]} />
        </Section>

        <Section id="security" kicker="09 / TRUST" title="Validation and trust model">
          <ul>
            <li><strong>Untrusted input.</strong> Everything from the client is untrusted: file names, MIME types, dimensions, engine name and timings. Dimensions and timings are stored as informational metadata only; byte counts and savings are computed by the server from the received bytes.</li>
            <li><strong>No path injection.</strong> Blob paths are built only from a server-generated UUID plus a fixed suffix. Route ids must match <code>{'^[A-Za-z0-9_-]{1,128}$'}</code> before touching the filesystem. Client file names never reach a path.</li>
            <li><strong>Output contract.</strong> The server enforces the output type by extension and MIME, but it does not decode the bytes; “valid output” means the browser converter succeeded and produced a non-empty file.</li>
            <li><strong>Local only.</strong> There is no authentication or rate limiting. The dev and start scripts bind to <code>127.0.0.1</code> so the upload endpoint is not exposed on your network. Do not deploy this as-is.</li>
            <li><strong>Same-origin WASM.</strong> The FFmpeg core is served from <code>/ffmpeg/</code> (no third-party CDN at runtime) and wrapped in blob URLs by the loader.</li>
          </ul>
        </Section>

        <Section id="limits" kicker="10 / LIMITS" title="Performance, memory and known limits">
          <Table head={['Area', 'Behaviour', 'Mitigation / next step']} rows={[
            ['FFmpeg WASM', 'Single-threaded and much slower than native FFmpeg; 32 MB download, loaded only for video and fallbacks.', 'WebCodecs for hardware encode, or the multi-thread core with COOP/COEP headers.'],
            ['Browser memory', 'The whole input and output sit in WASM memory (a few GB ceiling, less on phones). Very large videos can fail.', 'Surfaced as a visible error and the engine is reset; chunked/segmented processing is future work.'],
            ['HEIC decode', 'Runs on the main thread, so large photos can briefly freeze the UI. Cap: 120 megapixels.', 'Move libheif and canvas work into a Web Worker with OffscreenCanvas.'],
            ['Server upload', 'The route reads both files fully into memory before writing (about 2× the upload size) and has no application size cap.', 'Stream to disk or use presigned object-storage uploads.'],
            ['DB scale', 'Every read parses the whole JSON file; writes rewrite it. Fine for hundreds of records.', 'SQLite or Postgres behind the same storage module.'],
            ['Concurrency', 'Safe within one Node process only.', 'A database with real transactions for multi-process or multi-host.'],
          ]} />
        </Section>

        <Section id="errors" kicker="11 / FAILURES" title="Failure handling">
          <Table head={['Failure', 'Result']} rows={[
            ['Unsupported or corrupt media', 'Visible error in the status area; nothing is uploaded or stored.'],
            ['FFmpeg returns a non-zero exit code', 'Error naming the exit code and a probable unsupported codec; no empty output is read.'],
            ['FFmpeg crashes or runs out of memory', 'Error shown; the instance is terminated and recreated on the next job.'],
            ['Canvas cannot encode WebP', 'Re-encoded via FFmpeg libwebp instead of storing a PNG labelled WebP.'],
            ['Browser cannot preview a stored original (HEIC, some MOV)', 'The preview shows a placeholder explaining it is a preview limit; the stored file is intact.'],
            ['Server write fails', 'HTTP 500 with a message; blobs already written for that request are deleted.'],
          ]} />
        </Section>

        <Section id="testing" kicker="12 / TESTING" title="Tests, CI and manual checks">
          <ul>
            <li><strong>Contract tests (node:test).</strong> Missing parts rejected with nothing written; byte-for-byte persistence; MOV original and MP4 output MIME; extension-over-MIME classification; empty-MIME AVI; invalid output rejected; byte-derived savings and passthrough; valid, open-ended, suffix, unsatisfiable, malformed and multi-range requests; portable paths and legacy-path normalisation; HEIF brand sniffing. Tests run against a temporary storage root and never touch <code>data/</code>.</li>
            <li><strong>Pipeline of checks.</strong> <code>npm run check</code> runs the type-check, the tests and <code>db:verify</code>. GitHub Actions runs it plus a production build on Ubuntu, macOS and Windows.</li>
            <li><strong>Manual browser checks.</strong> Add a JPEG/PNG, a HEIC, an MP4 and a MOV; confirm the output formats, savings and the Visual/Metrics toggle; add a corrupt file and confirm an error with nothing stored. <code>npm run fixtures</code> downloads public samples.</li>
            <li><strong>Gap.</strong> There is no automated browser end-to-end test yet; it is the first thing to add (see the production path).</li>
          </ul>
        </Section>

        <Section id="platforms" kicker="13 / PLATFORMS" title="macOS, Windows and Linux">
          <ul>
            <li>No native dependencies: the codecs are WASM and Next.js ships prebuilt compilers for Apple Silicon, Intel macs, Windows and Linux. The lockfile contains all of them.</li>
            <li>Install Node 22.15 or newer (<code>.nvmrc</code> pins 22; <code>engine-strict</code> makes an older Node fail loudly instead of breaking later).</li>
            <li><code>npm install</code> copies the FFmpeg core into <code>public/ffmpeg</code> (it is not committed); <code>npm run dev</code> and <code>npm run build</code> re-check it.</li>
            <li>All paths use <code>path.join</code> in code and forward slashes in the DB; <code>.gitattributes</code> normalises line endings so a Windows checkout and a macOS checkout produce identical bytes.</li>
            <li>Safari on macOS decodes HEIC natively and falls back to FFmpeg for WebP encoding, as described above.</li>
          </ul>
        </Section>

        <Section id="decisions" kicker="14 / DECISIONS" title="Design decisions and trade-offs">
          <Table head={['Decision', 'Why', 'Cost / alternative']} rows={[
            ['Convert in the browser', 'No media server to run, scale or secure; user data never leaves the machine before conversion.', 'Slower on weak devices; limited to what WASM and the browser can do. Alternative: server FFmpeg/sharp.'],
            ['libheif-js for HEIC', 'Works in every browser; the WASM is inlined in a ~2 MB chunk that is only fetched for HEIC.', 'Main-thread decode; libheif is LGPL-licensed (check this suits your distribution). Alternatives: heic-to, or native decode on Safari only.'],
            ['Native decode first', 'Honours EXIF orientation and colour profiles better than a generic decoder.', 'Two code paths to keep consistent.'],
            ['WebP + H.264/AAC outputs', 'Broad playback support and large savings for photos and phone video.', 'AVIF/AV1 compress more but encode far more slowly in WASM.'],
            ['Store both original and output', 'Lets the lab compare before/after and audit savings.', 'Doubles storage per item.'],
            ['JSON file DB in git', 'Zero install, diffable, portable, shareable.', 'Not for scale or concurrency; blobs bloat git history. Alternative: SQLite + object storage.'],
            ['Server never decodes', 'Keeps the API tiny and the trust boundary simple.', 'Cannot independently verify that the output is a valid image/video.'],
          ]} />
        </Section>

        <Section id="roadmap" kicker="15 / ROADMAP" title="From PoC to production">
          <ol className="doc-steps">
            <li><strong>Storage.</strong> Replace <code>lib/local-media.ts</code> with SQLite/Postgres for metadata and S3-compatible storage for blobs, uploading directly from the browser with presigned URLs.</li>
            <li><strong>Responsiveness.</strong> Run conversion in Web Workers (OffscreenCanvas, libheif, FFmpeg) and add cancel and queueing for multiple files.</li>
            <li><strong>Speed.</strong> Use WebCodecs for hardware video encoding and the multi-threaded FFmpeg core where cross-origin isolation is available.</li>
            <li><strong>Trust.</strong> Authentication, per-user quotas, server-side signature checks on outputs, content hashing for de-duplication.</li>
            <li><strong>Quality.</strong> Automated Playwright end-to-end tests on Chromium, Firefox and WebKit, a visual quality score (SSIM) per conversion, and an adjustable quality preset in the UI.</li>
          </ol>
        </Section>

        <Section id="sourcemap" kicker="16 / SOURCE MAP" title="Where to look in the code">
          <Table head={['Path', 'Responsibility']} rows={files.map(([a, b]) => [<code key="a">{a}</code>, b])} />
        </Section>
      </article>
    </div>

    <footer><span>LOCAL MEDIA LAB</span><span>SYSTEM DESIGN</span><Link href="/">← BACK TO THE LAB</Link></footer>
  </main>;
}
