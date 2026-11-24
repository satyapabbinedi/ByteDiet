import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { SiteHeader } from '../site-header';

export const metadata: Metadata = {
  title: 'System design / Media Lab',
  description: 'Architecture, conversion engines, browser support, benchmarks, data model, API and trade-offs of the Media Lab proof of concept.',
};

const toc = [
  ['overview', 'Overview'], ['architecture', 'Architecture'], ['flow', 'End-to-end flow'], ['pipeline', 'Conversion pipeline'],
  ['browsers', 'Browser & OS support'], ['benchmarks', 'Benchmarks'], ['formats', 'Format support'], ['data', 'Data model'],
  ['storage', 'Storage & git'], ['api', 'API reference'], ['security', 'Trust & validation'], ['limits', 'Performance & limits'],
  ['errors', 'Failure handling'], ['testing', 'Testing & CI'], ['platforms', 'macOS / Windows / Linux'], ['decisions', 'Design decisions'],
  ['roadmap', 'Production path'], ['sourcemap', 'Source map'],
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
  ['conversionEngine', 'string | null', 'webcodecs, webcodecs-remux, ffmpeg.wasm (video); canvas-webp, libheif-wasm+canvas-webp, canvas+libwebp-wasm, libheif-wasm+libwebp-wasm (images). Client-reported, informational.'],
  ['conversionMs / clientProcessingStatus', 'number | string | null', 'Client-reported timing and status (informational, not trusted).'],
  ['createdAt', 'ISO 8601', 'Server timestamp.'],
];

const formatRows: [string, string, string][] = [
  ['JPEG, PNG, WebP, GIF, BMP, AVIF', 'createImageBitmap → canvas → WebP', 'Anything the browser can decode. Animated GIF/WebP are flattened to the first frame.'],
  ['HEIC / HEIF (iPhone photos)', 'Native decode if available, otherwise libheif (WASM) → canvas → WebP', 'Detected from the file bytes (ISO-BMFF “ftyp” brands), so a wrong extension or empty MIME still works. Primary image only; images over 120 MP are rejected.'],
  ['TIFF and other still formats', 'FFmpeg (WASM) → libwebp', 'Best effort: only what the bundled FFmpeg core can decode. The only image case that downloads the 32 MB core.'],
  ['MP4, M4V, MOV with H.264', 'Small enough: stream copy into MP4 (remux). Otherwise WebCodecs → H.264 + AAC MP4', 'Remux needs no codec at all, so it works even where encoding is unavailable.'],
  ['MOV / MP4 with HEVC (iPhone), incl. HDR', 'WebCodecs → H.264 + AAC MP4 where the browser can decode HEVC, otherwise FFmpeg (WASM)', 'HEVC decoding depends on browser, OS and GPU. HDR frames the encoder rejects are re-rendered through a canvas; the FFmpeg path forces yuv420p.'],
  ['WebM, MKV (VP8/VP9/AV1, Opus/Vorbis)', 'WebCodecs → H.264 + AAC MP4; audio is re-encoded to AAC', 'Needs a WebCodecs audio decoder for the audio; without one the file goes to FFmpeg so audio is never dropped.'],
  ['AVI and other containers', 'FFmpeg (WASM) → H.264 + AAC MP4 (same size/frame-rate caps)', 'Mediabunny does not read AVI, so these always take the fallback.'],
];

const files: [string, string][] = [
  ['app/page.tsx', 'Lab UI: file picker/drop zone, phase + progress state, library list, before/after and metrics views.'],
  ['app/design/page.tsx', 'This page (static server component).'],
  ['app/site-header.tsx', 'Shared header and navigation.'],
  ['lib/client-media.ts', 'Browser conversion orchestrator: decode, resize, encode WebP, WebCodecs-first video with FFmpeg fallback, engine lifecycle, exit-code checks.'],
  ['lib/webcodecs-video.ts', 'Fast video path: Mediabunny demux/mux + WebCodecs decode/encode, stream-copy for small H.264, never drops audio silently.'],
  ['lib/video-encoding.ts', 'Pure video output policy (720p / 30 fps caps, bitrate ladder, remux rule), shared by both encoders and unit-tested.'],
  ['lib/webp-encoder.ts', 'libwebp (WASM) encoder for browsers whose canvas cannot produce WebP (Safari).'],
  ['lib/heic.ts', 'HEIF sniffing from bytes and libheif (WASM) decoding to a canvas.'],
  ['lib/media-formats.ts', 'Shared classification: extension/MIME → kind, source MIME/format, output contract, savings maths.'],
  ['lib/local-media.ts', 'Storage layer: JSON DB with serialised updates and atomic replace, blob read/write, legacy-record normalisation.'],
  ['app/api/media/route.ts', 'GET list and POST ingest (validation only; never touches a codec).'],
  ['app/api/media/[id]/[variant]/route.ts', 'Streams a stored variant with single byte-range support.'],
  ['scripts/sync-ffmpeg-core.mjs', 'Copies the FFmpeg WASM core from node_modules to public/ffmpeg (postinstall/predev/prebuild).'],
  ['scripts/db-tool.mjs', 'db:verify integrity check and db:reset back to the seed data.'],
  ['scripts/*.test.mjs', 'node:test contract tests (API, ranges, paths, HEIC sniffing, formatting) and video-encoding.test.mjs (size/fps caps, bitrate ladder, remux rule).'],
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
  const fast = { fill: '#e6eefc', stroke: 'var(--ink)', strokeWidth: 1 } as const;
  const text = { fontFamily: "'DM Mono', monospace", fontSize: 11, fill: 'var(--ink)' } as const;
  const muted = { ...text, fill: 'var(--muted)', fontSize: 10 } as const;
  const title = { ...text, fontWeight: 600, letterSpacing: '.08em', fontSize: 11 } as const;
  return <figure className="doc-figure">
    <svg viewBox="0 0 1000 560" role="img" aria-labelledby="arch-title arch-desc">
      <title id="arch-title">Media Lab architecture</title>
      <desc id="arch-desc">The browser converts media: images through canvas, libheif or libwebp; video through WebCodecs with Mediabunny, falling back to FFmpeg WASM only when needed. It then uploads the original and converted files to a storage-only Next.js API that writes a JSON database and blobs into the data folder, which is committed to git.</desc>
      <defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="var(--ink)" /></marker></defs>

      <rect x="10" y="10" width="440" height="540" rx="4" {...soft} /><text x="26" y="34" {...title}>BROWSER (all media processing)</text>
      <rect x="30" y="50" width="400" height="66" rx="3" {...box} /><text x="46" y="74" {...title}>React UI · app/page.tsx</text><text x="46" y="93" {...muted}>phases, progress, library, before/after,</text><text x="46" y="107" {...muted}>metrics (shows which engine ran)</text>
      <rect x="30" y="136" width="400" height="400" rx="3" {...box} /><text x="46" y="160" {...title}>Converter · lib/client-media.ts</text>

      <rect x="46" y="174" width="368" height="84" rx="3" {...soft} /><text x="60" y="195" {...text}>Images → WebP (≤1600 px, q 0.78)</text><text x="60" y="212" {...muted}>createImageBitmap + canvas · EXIF orientation</text><text x="60" y="227" {...muted}>libheif WASM for HEIC (lazy, ~2 MB)</text><text x="60" y="242" {...muted}>libwebp WASM if canvas cannot encode WebP (Safari)</text>

      <rect x="46" y="270" width="368" height="118" rx="3" {...fast} /><text x="60" y="291" {...text}>Video fast path · lib/webcodecs-video.ts</text><text x="60" y="309" {...muted}>Mediabunny demux/mux · lazy input reads</text><text x="60" y="324" {...muted}>1. remux small H.264 + AAC (no codec)</text><text x="60" y="339" {...muted}>2. WebCodecs decode → resize → H.264 encode</text><text x="60" y="354" {...muted}>≤720p · ≤30 fps · ~1.9 Mbps · AAC copied</text><text x="60" y="369" {...muted}>WASM AAC encoder only if re-encoding needs it</text>

      <rect x="46" y="420" width="368" height="102" rx="3" {...soft} /><text x="60" y="441" {...text}>Fallback · FFmpeg WASM core 0.12.10</text><text x="60" y="459" {...muted}>downloaded (32 MB) only when the fast path fails</text><text x="60" y="474" {...muted}>same caps · first audio track · exit codes checked</text><text x="60" y="489" {...muted}>also decodes stills the browser cannot (TIFF)</text><text x="60" y="504" {...muted}>served same-origin from /ffmpeg/</text>
      <path d="M230 388 V420" fill="none" stroke="var(--ink)" strokeWidth="1.4" strokeDasharray="4 3" markerEnd="url(#arrow)" /><text x="240" y="409" {...muted}>on any failure</text>

      <rect x="540" y="10" width="270" height="250" rx="4" {...soft} /><text x="556" y="34" {...title}>NEXT.JS · STORAGE ONLY</text>
      <rect x="556" y="50" width="238" height="56" rx="3" {...box} /><text x="570" y="73" {...text}>POST /api/media</text><text x="570" y="90" {...muted}>validate · assign UUID · persist</text>
      <rect x="556" y="116" width="238" height="56" rx="3" {...box} /><text x="570" y="139" {...text}>GET /api/media</text><text x="570" y="156" {...muted}>list records (newest first)</text>
      <rect x="556" y="182" width="238" height="64" rx="3" {...box} /><text x="570" y="205" {...text}>GET /api/media/:id/:variant</text><text x="570" y="222" {...muted}>stream blob · single Range · 206/416</text><text x="570" y="237" {...muted}>no decode, no transcode, no codecs</text>

      <rect x="540" y="290" width="270" height="170" rx="4" {...soft} /><text x="556" y="314" {...title}>data/ (LOCAL_MEDIA_STORAGE_DIR)</text>
      <rect x="556" y="328" width="238" height="52" rx="3" {...box} /><text x="570" y="350" {...text}>metrics/media.json</text><text x="570" y="367" {...muted}>the DB · JSON array · atomic rename</text>
      <rect x="556" y="390" width="238" height="56" rx="3" {...box} /><text x="570" y="410" {...text}>media/&lt;uuid&gt;-original</text><text x="570" y="426" {...text}>media/&lt;uuid&gt;-compressed</text><text x="570" y="440" {...muted}>exact bytes as received</text>

      <rect x="880" y="290" width="110" height="170" rx="4" {...box} /><text x="935" y="364" textAnchor="middle" {...title}>GIT</text><text x="935" y="384" textAnchor="middle" {...muted}>data/ is</text><text x="935" y="399" textAnchor="middle" {...muted}>tracked →</text><text x="935" y="414" textAnchor="middle" {...muted}>push / clone</text>

      <path d="M430 88 H540 V78 H556" fill="none" stroke="var(--ink)" strokeWidth="1.4" markerEnd="url(#arrow)" /><text x="448" y="76" {...muted}>multipart</text>
      <path d="M556 146 H470 V110 H430" fill="none" stroke="var(--ink)" strokeWidth="1.4" strokeDasharray="4 3" markerEnd="url(#arrow)" /><text x="470" y="164" {...muted}>JSON / bytes</text>
      <path d="M810 354 H880" fill="none" stroke="var(--ink)" strokeWidth="1.4" markerStart="url(#arrow)" markerEnd="url(#arrow)" />
      <path d="M675 260 V328" fill="none" stroke="var(--ink)" strokeWidth="1.4" markerStart="url(#arrow)" markerEnd="url(#arrow)" /><text x="684" y="300" {...muted}>fs read / write</text>
    </svg>
    <figcaption>All decoding, resizing and encoding happens before the upload. Video tries the browser’s own (usually hardware) codecs first and only falls back to FFmpeg WASM when it must. The server validates structure and stores bytes; it never runs a codec.</figcaption>
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
              <li>Convert images to WebP and video to H.264/AAC MP4 in the browser, with video taking seconds rather than minutes by using the device’s own media hardware.</li>
              <li>Work on every mainstream browser and OS: use the fastest engine available and fall back automatically, never fail just because a feature is missing.</li>
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
            ['Browser codecs', 'WebCodecs via mediabunny (+ @mediabunny/aac-encoder where AAC encoding is missing), Canvas/createImageBitmap, libheif-js (WASM), @jsquash/webp (WASM), @ffmpeg/ffmpeg + @ffmpeg/core 0.12.10 (WASM fallback).'],
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
            <li><strong>Convert.</strong> The converter chunk is imported dynamically, and each codec library inside it is imported only when that path runs: Mediabunny for video, libheif for HEIC, libwebp on Safari, and the 32 MB FFmpeg core only if the fast video path fails (the UI then shows a short <em>loading the fallback encoder</em> phase). See the pipeline below. A failure surfaces in the UI and the API is never called.</li>
            <li><strong>Measure.</strong> The output is inspected again for its dimensions; elapsed time (including any fallback download) and the engine that actually produced the file are recorded.</li>
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
            <li>If the returned blob is not actually <code>image/webp</code> (Safari silently returns PNG), encode the canvas pixels with libwebp WASM (~280 KB, FFmpeg only if that fails) so a mislabelled file is never stored.</li>
          </ol>
          <h3>Video: output policy</h3>
          <p>The target follows how messaging apps send video, WhatsApp’s HD option in particular: small, universally playable files rather than archival quality. Every engine produces the same target, defined once in <code>lib/video-encoding.ts</code>.</p>
          <Table head={['Parameter', 'Media Lab', 'WhatsApp (reported)', 'Why']} rows={[
            ['Resolution', 'Long edge ≤ 1280 px (720p), aspect kept, even dimensions, never upscaled', 'HD ≈ 720p, standard ≈ 480p', 'A 1080p source has 2.25× the pixels of 720p; on a phone screen the difference is small.'],
            ['Frame rate', '≤ 30 fps (60/120 fps sources are halved or more)', '≈ 30 fps', 'Halves the frames to encode for iPhone 60 fps video.'],
            ['Video codec', 'H.264 (AVC), yuv420p', 'H.264', 'Plays everywhere and has hardware encoders on virtually every device.'],
            ['Bitrate', '0.07 bits/pixel/frame ≈ 1.9 Mbps at 720p30; never above 90% of the source bitrate', '≈ 1.5–2.5 Mbps at 720p', 'Predictable size across hardware encoders, which do not all support constant-quality (CRF) modes.'],
            ['Audio', 'First decodable track; AAC copied, anything else → AAC 128 kbps, ≤ 2 channels', 'AAC', 'Phones add extra tracks (spatial audio) that most decoders cannot read.'],
            ['Container', 'MP4 with fast start (index at the front)', 'MP4', 'Starts playing before the whole file has downloaded.'],
            ['Metadata', 'Container tags dropped (e.g. phone GPS location)', 'Stripped', 'Privacy; rotation is kept because it is stream data, not a tag.'],
            ['Already small?', 'Copied without re-encoding (remux)', 'Not recompressed', 'Lossless and near-instant.'],
          ]} />
          <p>WhatsApp figures come from third-party measurements; WhatsApp publishes no specification. To change the target (for example back to 1080p), edit <code>VIDEO_POLICY</code>; both engines and the unit tests follow it.</p>
          <h3>Video: engine selection</h3>
          <Table head={['Step', 'Runs when', 'What happens', 'Typical time *']} rows={[
            ['1. Remux', 'Source is H.264, ≤ 1280 px, ≤ 30 fps, within 1.25× the bitrate budget, with AAC or no audio', 'Mediabunny copies the compressed streams into a new MP4. No decoder or encoder is involved.', '< 1 s'],
            ['2. WebCodecs', 'The browser has VideoEncoder/VideoDecoder, can decode this video codec, can encode H.264 at the target size, and can carry the audio over', 'Mediabunny reads the file lazily; the browser decodes (often in hardware), resizes and encodes H.264. AAC audio is copied; other audio is decoded and re-encoded to AAC.', '≈ 1× real time without a GPU, faster with one'],
            ['3. FFmpeg WASM', 'Anything step 2 cannot do, or any error during it', <>Downloads the 32 MB core, then runs <code>-map 0:v:0 -map 0:a:0? -map_metadata -1</code>, the same 1280 px box, <code>-fpsmax 30</code>, <code>libx264 -preset superfast -crf 28 -maxrate 4M -pix_fmt yuv420p</code>, <code>aac -b:a 128k</code>, <code>+faststart</code>. Single-threaded, so no cross-origin isolation headers are needed.</>, '≈ 4× real time'],
          ]} />
          <p className="preview-note">* For a 1080p60 phone clip on the reference machine in the benchmarks section.</p>
          <ul>
            <li><strong>Detection, not sniffing.</strong> Capabilities are tested at runtime (<code>VideoEncoder</code> exists, <code>canDecode()</code>, <code>canEncodeVideo()</code>, <code>canEncodeAudio()</code>); the user-agent string is never consulted.</li>
            <li><strong>Only video classes are required for step 2.</strong> WebCodecs audio arrived years later in some browsers (Safari), yet phone video almost always carries AAC, which is copied and never decoded. If audio does need decoding and the browser cannot, step 2 declines and step 3 runs.</li>
            <li><strong>Audio is never silently dropped.</strong> If the chosen audio track would be discarded for any reason, step 2 is abandoned in favour of FFmpeg rather than storing a silent video.</li>
            <li><strong>Missing AAC encoder.</strong> Firefox and some Chrome builds on Linux have no native AAC encoder; a ~1 MB WASM encoder (<code>@mediabunny/aac-encoder</code>) is registered on demand, only when audio is actually re-encoded.</li>
            <li><strong>HDR.</strong> 10-bit HLG/PQ iPhone frames that an encoder rejects are re-rendered through a canvas (8-bit) before encoding; the FFmpeg path forces <code>yuv420p</code>.</li>
          </ul>
          <Note title="Engine lifecycle">One FFmpeg instance is created lazily and reused, with a single progress handler pointing at mutable callback state. <code>exec()</code> resolves with an exit code instead of throwing, so the code is checked explicitly; a thrown error (for example out-of-memory) discards the instance so the next job starts clean.</Note>
          <p><strong>Outcome rule.</strong> Whatever the converter produces is stored, even if it is larger than the original. <code>compressionStatus</code> becomes <code>passthrough</code> and savings are 0; the original is never substituted for the output.</p>
        </Section>

        <Section id="browsers" kicker="05 / BROWSERS" title="Browser and OS support">
          <p>Users arrive on many browser and OS combinations, so conversion is built as a ladder rather than a single dependency: every rung is optional except the last, and the last (FFmpeg WASM) runs anywhere WebAssembly runs, which is every current browser. A missing feature changes <em>speed</em>, not <em>whether</em> the upload works.</p>
          <Table head={['Browser / OS', 'Video path', 'Audio', 'Images', 'Notes']} rows={[
            ['Chrome, Edge, Opera, Brave · Windows, macOS', 'Remux or WebCodecs (hardware encode)', 'Native AAC', 'Canvas WebP; HEIC via libheif', 'HEVC (iPhone) decodes where the OS/GPU supports it; otherwise FFmpeg.'],
            ['Chrome and Chromium browsers · Linux, ChromeOS', 'Remux or WebCodecs', 'WASM AAC encoder if the build lacks AAC', 'Canvas WebP; HEIC via libheif', 'HEVC decoding is usually unavailable on Linux, so iPhone HEVC goes to FFmpeg.'],
            ['Chrome · Android', 'Remux or WebCodecs', 'Native AAC on most devices', 'Canvas WebP; HEIC via libheif', 'Mid-range phones are much slower on the FFmpeg path; WebCodecs avoids it for common files.'],
            ['Safari 26+ · macOS, iOS, iPadOS', 'Remux or WebCodecs (hardware encode)', 'Native', 'Native HEIC decode; WebP via libwebp WASM', 'Safari’s canvas cannot encode WebP, hence libwebp.'],
            ['Older Safari with WebCodecs video only', 'Remux or WebCodecs for AAC-audio video; FFmpeg if audio needs decoding', 'AAC copied', 'Native HEIC; libwebp WASM', 'Typical iPhone/Android clips still take the fast path.'],
            ['Firefox · Windows, macOS, Linux', 'Remux or WebCodecs', 'WASM AAC encoder when re-encoding', 'Canvas WebP; HEIC via libheif', 'HEVC usually not decodable, so iPhone HEVC goes to FFmpeg.'],
            ['Any browser without WebCodecs', 'FFmpeg WASM', 'FFmpeg', 'As above', 'Works, at fallback speed; very large files can exhaust memory on phones.'],
          ]} />
          <Note title="Verification status">Verified in a real browser (Google Chrome on Linux, through the actual app): remux, WebCodecs, FFmpeg fallback, HEIC, WebP, corrupt input. Simulated in Chrome by removing APIs: a browser without WebCodecs, an older Safari without WebCodecs audio, Safari’s PNG-instead-of-WebP canvas, and a missing native AAC encoder (which this Chrome build genuinely lacks). Not yet run on real Safari, Firefox or Android devices. Browser versions above are indicative; the code relies on runtime detection, not version numbers.</Note>
        </Section>

        <Section id="benchmarks" kicker="06 / BENCHMARKS" title="Measured performance">
          <p>Measured through the real app (file picker → conversion → upload to the local API), headless Google Chrome on Linux, 8 CPU cores, <strong>no GPU</strong>, so H.264 was encoded in software. On machines with a hardware encoder (most Macs, Windows PCs and phones) the WebCodecs numbers should be lower still. Wall time includes the local upload.</p>
          <Table head={['Input', 'Engine', 'Time', 'Output']} rows={[
            ['1080p60, 20 s, 40.0 MB (H.264 16 Mbps + AAC)', 'Before: FFmpeg WASM, 1920 px cap, veryfast', '224.6 s', '19.0 MB · 1920×1080 @ 60 fps'],
            ['same', <strong key="wc">WebCodecs (current)</strong>, <strong key="t">21.5 s</strong>, '5.1 MB · 1280×720 @ 30 fps · 1.9 Mbps'],
            ['same', 'FFmpeg WASM fallback (current settings)', '78.7 s', '10.1 MB · 1280×720 @ 30 fps'],
            ['same, simulated older Safari (no WebCodecs audio)', 'WebCodecs, AAC copied', '21.6 s', '5.1 MB, audio intact'],
            ['720p30, 10 s, 1.7 MB H.264 + AAC', 'Remux', '0.6–0.8 s', 'Same streams in a fresh MP4'],
            ['1080p30 MOV, 8 s, 10.2 MB, two AAC tracks', 'WebCodecs', '5.3–5.8 s', '2.0 MB · 720p · exactly one audio track'],
            ['Portrait 1080×1920, 6 s, 6.1 MB', 'WebCodecs', '4.8 s', '1.5 MB · 720×1280'],
            ['WebM 1080p30 VP9 + Opus, 5.8 s, 6.7 MB', 'WebCodecs (Opus → AAC via WASM encoder)', '5.7–6.3 s', '1.5 MB · 720p'],
            ['same, simulated older Safari', 'FFmpeg fallback (Opus needs a decoder)', '23.5 s', '1.0 MB · 720p'],
            ['HEIC photo, 0.7–0.9 MB', 'libheif WASM + canvas WebP', '1.1 s', '91–255 KB'],
            ['WebP/HEIC, simulated Safari canvas', 'libwebp WASM', '0.3–1.4 s', 'Verified WebP bytes (RIFF/WEBP)'],
            ['Corrupt “.mp4” (random bytes)', 'WebCodecs declines → FFmpeg fails', '≈ 3 s', 'Visible error, nothing stored'],
          ]} />
          <p>On the 20 s clip the current pipeline is about <strong>10× faster</strong> than the original FFmpeg-only design and the file is <strong>about 4× smaller</strong>; the fallback alone is about 3× faster than before, mostly from the 720p / 30 fps caps. Outputs were checked for codec, dimensions, frame rate, bitrate, audio tracks and duration, and decoded frames were compared with the source at the same timestamp.</p>
        </Section>

        <Section id="formats" kicker="07 / FORMATS" title="Format support">
          <Table head={['Input', 'Path', 'Notes']} rows={formatRows.map(([a, b, c]) => [a, b, c])} />
          <p>Which path a file takes also depends on the browser; see <a className="inline-link" href="#browsers">browser and OS support</a>. Support is best effort and depends on browser codecs, the bundled FFmpeg build and available memory.</p>
        </Section>

        <Section id="data" kicker="08 / DATA MODEL" title="Media record">
          <p>One record per upload, stored as an element of the JSON array in <code>data/metrics/media.json</code>. New records are prepended, so the list is newest-first.</p>
          <Table head={['Field', 'Type', 'Meaning']} rows={recordFields.map(([a, b, c]) => [<code key="a">{a}</code>, b, c])} />
          <p>Records written by earlier versions remain readable: missing fields get compatibility defaults and absolute paths are re-derived from the id on read. Nothing is rewritten by a GET.</p>
        </Section>

        <Section id="storage" kicker="09 / STORAGE" title="A database you can commit">
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

        <Section id="api" kicker="10 / API" title="HTTP contract">
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

        <Section id="security" kicker="11 / TRUST" title="Validation and trust model">
          <ul>
            <li><strong>Untrusted input.</strong> Everything from the client is untrusted: file names, MIME types, dimensions, engine name and timings. Dimensions and timings are stored as informational metadata only; byte counts and savings are computed by the server from the received bytes.</li>
            <li><strong>No path injection.</strong> Blob paths are built only from a server-generated UUID plus a fixed suffix. Route ids must match <code>{'^[A-Za-z0-9_-]{1,128}$'}</code> before touching the filesystem. Client file names never reach a path.</li>
            <li><strong>Output contract.</strong> The server enforces the output type by extension and MIME, but it does not decode the bytes; “valid output” means the browser converter succeeded and produced a non-empty file.</li>
            <li><strong>Local only.</strong> There is no authentication or rate limiting. The dev and start scripts bind to <code>127.0.0.1</code> so the upload endpoint is not exposed on your network. Do not deploy this as-is.</li>
            <li><strong>Same-origin WASM.</strong> The FFmpeg core is served from <code>/ffmpeg/</code> and the other WASM modules (libheif, libwebp, the AAC encoder) are bundled by webpack. No third-party CDN is contacted at runtime.</li>
            <li><strong>Privacy.</strong> Converted video carries no container metadata, so phone GPS location tags are not stored in the output. Originals are stored byte-for-byte, as the lab requires.</li>
            <li><strong>Pinned codec libraries.</strong> <code>mediabunny</code>, <code>@mediabunny/aac-encoder</code> and <code>@jsquash/webp</code> are pinned to exact versions, chosen at least two weeks after release.</li>
          </ul>
        </Section>

        <Section id="limits" kicker="12 / LIMITS" title="Performance, memory and known limits">
          <Table head={['Area', 'Behaviour', 'Mitigation / next step']} rows={[
            ['Video speed', 'WebCodecs runs at roughly real time even in software and faster on hardware encoders. The FFmpeg fallback is single-threaded, about 4× real time for 1080p60 input, plus a one-off 32 MB download.', 'Server-side fallback for weak devices (see the production path); the multi-thread FFmpeg core needs COOP/COEP headers and is less stable.'],
            ['Output quality', 'Capped at 720p / 30 fps / ~1.9 Mbps by design.', 'Raise VIDEO_POLICY.maxEdge (e.g. 1920) or add an SD/HD choice in the UI like WhatsApp.'],
            ['Codec availability', 'HEVC decoding and AAC encoding vary by browser, OS and GPU.', 'Detected at runtime; files the browser cannot handle take the FFmpeg path.'],
            ['Browser memory', 'WebCodecs reads the input lazily and keeps only the (small) output in memory. The FFmpeg fallback holds the whole input and output in WASM memory (a few GB ceiling, less on phones).', 'Surfaced as a visible error and the engine is reset; a server-side fallback would remove this limit.'],
            ['HEIC decode', 'Runs on the main thread, so large photos can briefly freeze the UI. Cap: 120 megapixels.', 'Move libheif and canvas work into a Web Worker with OffscreenCanvas.'],
            ['Server upload', 'The route reads both files fully into memory before writing (about 2× the upload size) and has no application size cap.', 'Stream to disk or use presigned object-storage uploads.'],
            ['DB scale', 'Every read parses the whole JSON file; writes rewrite it. Fine for hundreds of records.', 'SQLite or Postgres behind the same storage module.'],
            ['Concurrency', 'Safe within one Node process only.', 'A database with real transactions for multi-process or multi-host.'],
          ]} />
        </Section>

        <Section id="errors" kicker="13 / FAILURES" title="Failure handling">
          <Table head={['Failure', 'Result']} rows={[
            ['Unsupported or corrupt media', 'Visible error in the status area; nothing is uploaded or stored.'],
            ['FFmpeg returns a non-zero exit code', 'Error naming the exit code and a probable unsupported codec; no empty output is read.'],
            ['FFmpeg crashes or runs out of memory', 'Error shown; the instance is terminated and recreated on the next job.'],
            ['Canvas cannot encode WebP', 'Encoded via libwebp WASM (FFmpeg as a last resort) instead of storing a PNG labelled WebP.'],
            ['Browser has no WebCodecs at all', 'FFmpeg fallback runs directly; the UI shows the loading-fallback phase.'],
            ['WebCodecs cannot decode the codec, cannot encode H.264 at the target size, or would drop the audio', 'Console warning naming the reason; the FFmpeg fallback runs automatically.'],
            ['WebCodecs fails part-way (decoder error, crash)', 'Same: caught, logged, FFmpeg fallback.'],
            ['Remux candidate cannot be stream-copied (unusual timestamps)', 'Re-encoded with WebCodecs instead.'],
            ['No native AAC encoder', 'WASM AAC encoder registered on demand.'],
            ['Browser cannot preview a stored original (HEIC, some MOV)', 'The preview shows a placeholder explaining it is a preview limit; the stored file is intact.'],
            ['Server write fails', 'HTTP 500 with a message; blobs already written for that request are deleted.'],
          ]} />
        </Section>

        <Section id="testing" kicker="14 / TESTING" title="Tests, CI and manual checks">
          <ul>
            <li><strong>Contract tests (node:test).</strong> Missing parts rejected with nothing written; byte-for-byte persistence; MOV original and MP4 output MIME; extension-over-MIME classification; empty-MIME AVI; invalid output rejected; byte-derived savings and passthrough; valid, open-ended, suffix, unsatisfiable, malformed and multi-range requests; portable paths and legacy-path normalisation; HEIF brand sniffing. Tests run against a temporary storage root and never touch <code>data/</code>.</li>
            <li><strong>Video policy unit tests.</strong> <code>scripts/video-encoding.test.mjs</code> covers the 720p cap for landscape and portrait, never upscaling, even dimensions, the 30 fps cap with variable-rate tolerance, the bitrate ladder and its 90%-of-source ceiling, and every remux rule.</li>
            <li><strong>Pipeline of checks.</strong> <code>npm run check</code> runs the type-check, the tests and <code>db:verify</code>. GitHub Actions runs it plus a production build on Ubuntu, macOS and Windows.</li>
            <li><strong>Manual browser checks.</strong> Add a JPEG/PNG, a HEIC, an MP4 and a MOV; confirm the output formats, savings and the Visual/Metrics toggle; add a corrupt file and confirm an error with nothing stored. <code>npm run fixtures</code> downloads public samples.</li>
            <li><strong>Browser runs.</strong> The engines were exercised end to end in Chrome via the DevTools protocol, including simulated browsers with WebCodecs, WebCodecs audio or canvas WebP removed. Results are in the benchmarks section.</li>
            <li><strong>Gap.</strong> Those runs are not automated in CI, and real Safari, Firefox and Android devices have not been tested. Playwright on Chromium, Firefox and WebKit is the first thing to add (see the production path).</li>
          </ul>
        </Section>

        <Section id="platforms" kicker="15 / PLATFORMS" title="macOS, Windows and Linux">
          <ul>
            <li>No native dependencies: the codecs are the browser’s own (WebCodecs) or WASM, and Next.js ships prebuilt compilers for Apple Silicon, Intel macs, Windows and Linux. The lockfile contains all of them.</li>
            <li>Install Node 22.15 or newer (<code>.nvmrc</code> pins 22; <code>engine-strict</code> makes an older Node fail loudly instead of breaking later).</li>
            <li><code>npm install</code> copies the FFmpeg core into <code>public/ffmpeg</code> (it is not committed); <code>npm run dev</code> and <code>npm run build</code> re-check it.</li>
            <li>All paths use <code>path.join</code> in code and forward slashes in the DB; <code>.gitattributes</code> normalises line endings so a Windows checkout and a macOS checkout produce identical bytes.</li>
            <li>What end users get on each browser and OS is covered in <a className="inline-link" href="#browsers">browser and OS support</a>; this section is about running the project itself.</li>
          </ul>
        </Section>

        <Section id="decisions" kicker="16 / DECISIONS" title="Design decisions and trade-offs">
          <Table head={['Decision', 'Why', 'Cost / alternative']} rows={[
            ['Convert in the browser', 'No media server to run, scale or secure; user data never leaves the machine before conversion.', 'Depends on the user’s device and browser. Alternative or complement: server-side FFmpeg as a fallback.'],
            ['WebCodecs first, FFmpeg WASM as fallback', 'Hardware codecs make video about 10× faster here (more with a GPU); lazy input reads remove the WASM memory ceiling; FFmpeg keeps every browser working.', 'Two video engines to keep consistent, mitigated by one shared output policy. Output size/quality differ slightly between engines (bitrate vs CRF).'],
            ['Mediabunny for containers', 'Pure TypeScript, no dependencies, reads MP4/MOV/WebM/MKV and writes MP4, handles rotation, HDR fallbacks, stream copy and progress.', 'Another dependency (MPL-2.0). Alternatives: mp4box.js + hand-written muxing, or Remotion’s WebCodecs package.'],
            ['WhatsApp-style 720p / 30 fps / bitrate target', 'Phone video is watched on phones; this is the size messaging apps settled on, and it is the biggest single speed lever for both engines.', 'Lower fidelity than the source. Tunable in one place (VIDEO_POLICY).'],
            ['Bitrate target instead of CRF on WebCodecs', 'Hardware encoders do not all support constant-quality modes; a bitrate gives predictable sizes everywhere.', 'Simple scenes get more bits than they need. A quantizer mode could be used where supported.'],
            ['Remux already-small H.264', 'Lossless and near-instant; avoids a needless generation loss.', 'Output may be a few KB larger than the input (container overhead) and shows as passthrough.'],
            ['libwebp WASM for Safari', '~280 KB instead of downloading the 32 MB FFmpeg core for one photo.', 'One more dependency (Apache-2.0).'],
            ['Single-threaded FFmpeg core kept', 'Stable and needs no COOP/COEP headers; it is now only the fallback.', 'The fallback could be about 2× faster with the multi-thread core.'],
            ['libheif-js for HEIC', 'Works in every browser; the WASM is inlined in a ~2 MB chunk that is only fetched for HEIC.', 'Main-thread decode; libheif is LGPL-licensed (check this suits your distribution). Alternatives: heic-to, or native decode on Safari only.'],
            ['Native decode first', 'Honours EXIF orientation and colour profiles better than a generic decoder.', 'Two code paths to keep consistent.'],
            ['WebP + H.264/AAC outputs', 'Broad playback support and large savings for photos and phone video.', 'AVIF/AV1 compress more but encode far more slowly in WASM.'],
            ['Store both original and output', 'Lets the lab compare before/after and audit savings.', 'Doubles storage per item.'],
            ['JSON file DB in git', 'Zero install, diffable, portable, shareable.', 'Not for scale or concurrency; blobs bloat git history. Alternative: SQLite + object storage.'],
            ['Server never decodes', 'Keeps the API tiny and the trust boundary simple.', 'Cannot independently verify that the output is a valid image/video.'],
          ]} />
        </Section>

        <Section id="roadmap" kicker="17 / ROADMAP" title="From PoC to production">
          <ol className="doc-steps">
            <li><strong>Storage.</strong> Replace <code>lib/local-media.ts</code> with SQLite/Postgres for metadata and S3-compatible storage for blobs, uploading directly from the browser with presigned URLs.</li>
            <li><strong>Guaranteed conversion.</strong> Add a server-side fallback (native FFmpeg in a job queue, same <code>VIDEO_POLICY</code>) for browsers that only have the slow path, weak phones and very large files. Native FFmpeg is fast, so this removes the worst-case client times.</li>
            <li><strong>Real-device coverage.</strong> Playwright end-to-end runs on Chromium, Firefox and WebKit in CI, plus a manual pass on an iPhone and an Android phone with their own camera files.</li>
            <li><strong>Responsiveness.</strong> Run HEIC decoding and image resizing in a Web Worker (OffscreenCanvas), and add cancel and queueing for multiple files.</li>
            <li><strong>Choice.</strong> An SD/HD toggle like WhatsApp’s (480p / 720p, or 1080p for archival use), driven by <code>VIDEO_POLICY</code>.</li>
            <li><strong>Trust.</strong> Authentication, per-user quotas, server-side signature checks on outputs, content hashing for de-duplication.</li>
            <li><strong>Quality.</strong> A visual quality score (SSIM/VMAF) per conversion to tune the bitrate ladder against real phone footage.</li>
          </ol>
        </Section>

        <Section id="sourcemap" kicker="18 / SOURCE MAP" title="Where to look in the code">
          <Table head={['Path', 'Responsibility']} rows={files.map(([a, b]) => [<code key="a">{a}</code>, b])} />
        </Section>
      </article>
    </div>

    <footer><span>LOCAL MEDIA LAB</span><span>SYSTEM DESIGN</span><Link href="/">← BACK TO THE LAB</Link></footer>
  </main>;
}
