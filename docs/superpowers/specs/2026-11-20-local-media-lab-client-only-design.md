# Local Media Lab Client-Only Conversion Design

## Goal and approved architecture

Complete the existing Next.js App Router proof of concept so media decoding, conversion, and compression occur in the browser before upload. The Next.js API persists the exact original and browser-generated output byte streams plus metadata on the local filesystem; it never transcodes or optimizes media. Use Canvas/createImageBitmap for common images and the locally shipped FFmpeg/WASM runtime, loaded lazily in the browser, for video and native-image decode fallback. Keep the existing Media Lab design direction and make targeted behavior and clarity changes.

No server-side FFmpeg, Sharp, subprocess codec, Supabase, S3, cloud object storage, or remote media-processing service is permitted in the active application path.

## Classification and formats

Recognized video extension mappings are `.mov` → `video/quicktime` / `MOV`, `.mp4` → `video/mp4` / `MP4`, `.m4v` → `video/x-m4v` / `M4V`, `.webm` → `video/webm` / `WEBM`, `.mkv` → `video/x-matroska` / `MKV`, and `.avi` → `video/x-msvideo` / `AVI`.

Recognized image mappings are `.jpg`, `.jpeg`, and `.jfif` → `image/jpeg`; `.png` → `image/png`; `.webp` → `image/webp`; `.avif` → `image/avif`; `.heic` → `image/heic`; `.heif` → `image/heif`; `.gif` → `image/gif`; `.bmp` → `image/bmp`; `.tif` and `.tiff` → `image/tiff`. Source format is the uppercase extension without the dot. For a recognized extension, that mapping determines media kind and source MIME even if the reported MIME conflicts or is generic. With an unknown extension, a specific `image/*` or `video/*` MIME determines kind and source MIME/format; otherwise reject as unsupported. The browser then validates the file contents through actual decoding and reports a visible error without upload if decoding fails.

## Browser conversion

For browser-decodable images, use Canvas/createImageBitmap to produce `.webp` / `image/webp`, preserve transparency, apply browser image orientation, preserve aspect ratio, and resize only when the source long edge exceeds 1600px (never upscale). The FFmpeg/WASM image fallback must also produce WebP with the same naming/MIME contract. Animated GIF/WebP inputs may be flattened to their first frame; animation preservation is out of scope and must be disclosed in documentation/UI if relevant.

For video, use browser FFmpeg/WASM to produce `.mp4` / `video/mp4`, H.264/AAC where codecs permit, a maximum 1920px long edge without upscaling, CRF near 28, `veryfast`, AAC near 128 kb/s when an audio stream exists, and fast-start metadata. Best-effort inputs include MOV/QuickTime, MP4, M4V, WebM, MKV, AVI, and common Apple/iPhone-origin files. The local core is `@ffmpeg/core` 0.12.10 and must be served from `/ffmpeg/ffmpeg-core.js` and `/ffmpeg/ffmpeg-core.wasm`.

Load the encoder only on first conversion, reuse one instance, and register a single progress handler that updates mutable callback state. Report initialization/codec errors and do not call the storage API if conversion fails. Measure input/output dimensions and video duration in the browser where feasible; record client conversion engine and elapsed milliseconds. Revoke temporary object URLs and release image resources. The API does not independently decode output bytes: output validity means the client converter successfully decoded/converted the source and produced a nonempty file with the contract MIME/extension; the server performs only structural metadata/file checks.

## API and local persistence

`POST /api/media` requires nonempty `original` and `compressed` file parts. It classifies the original using the rules above; requires image output `.webp` / `image/webp` or video output `.mp4` / `video/mp4`; writes the original and compressed buffers exactly as received; and never substitutes bytes, transforms, decodes, optimizes, or starts a codec. If a request is malformed or the conversion/output contract is not met, return a visible client-handled error and persist nothing.

The fixed record schema for new uploads is: `id`, `name`, `kind`, `sourceFormat`, `outputFormat`, `originalMime`, `outputMime`, `compressionStatus`, `originalBytes`, `compressedBytes`, `savingsPercent`, `width`, `height`, `outputWidth`, `outputHeight`, `duration`, `createdAt`, `originalPath`, `compressedPath`, `conversionEngine`, `conversionMs`, and `clientProcessingStatus`. Dimension/duration fields are nullable when not detected. Existing records remain readable with compatibility defaults; do not migrate or rewrite them as part of startup or GET requests. `conversionEngine`, `conversionMs`, and `clientProcessingStatus` are client-reported informational metadata, not trusted server measurements.

Always persist and serve the exact browser-generated output bytes, whether smaller, equal, or larger than the original. `compressionStatus` is `compressed` when the output byte count is lower and `passthrough` when it is equal or larger after successful conversion. `passthrough` means no byte savings; it never means original bytes were substituted. Compute savings as `0` if the original is empty (though empty uploads are rejected), otherwise `max(0, (1 - compressedBytes / originalBytes) * 100)` from received bytes. Preserve the unrounded calculated number; the UI may format it to two decimal places.

Storage paths use a server-generated UUID and fixed `-original` / `-compressed` suffixes only; never derive a path from a client filename. Validate route IDs against a safe identifier allowlist before constructing a path. Keep local blobs in `storage/media/` and records in `storage/metrics/media.json`. Preserve all existing files and records. Serialize in-process record updates and atomically replace the JSON file so concurrent uploads within the running app do not overwrite each other. This local PoC has no extra application upload-size cap; real request and memory limits of the browser, Node.js, and local machine apply, and very large files may fail visibly.

The variant GET route looks up the record and uses its persisted original/output MIME, with correct `Content-Length`. Implement single byte-range requests: valid ranges return 206 and exact `Content-Range`; unsatisfiable ranges return 416 with `Content-Range: bytes */<length>`; malformed or multi-range requests are ignored and return the full 200 response. Only advertise `Accept-Ranges: bytes` when this behavior is implemented.

## UI and metrics

Keep the existing Media Lab identity and side-by-side Visual/Metrics layout. Use accessible buttons for the view toggle. Accept `image/*`, `video/*`, and all recognized extensions above. Disable selection while processing and reset the input after completion so the same file can be selected again.

Show encoder-loading, reading/inspection, conversion/compression, local-storage, complete, and error phases with meaningful FFmpeg progress where available. Upload the original and output in one FormData request only after conversion succeeds. The upload copy must say conversion/compression runs in the browser, not on the server.

The Visual view shows stored original/output variants with their persisted MIME types, sizes, dimensions, formats, and savings. If the browser cannot preview an original MOV, identify that as an original-preview limitation—not a conversion error. The Metrics view shows original/output byte counts, exact byte-derived savings, MIME/formats, compression status (including a clear explanation when `passthrough` means no savings), local output path, detected input/output dimensions, video duration when known, client conversion engine/status, and elapsed conversion time. Unknown dimensions/duration are shown as unavailable, never invented.

## Testing, documentation, and scope

Add executable contract checks for missing upload parts, byte-for-byte output persistence, MOV original MIME, MP4 output MIME, video extension classification with empty MIME, correct byte-derived savings, and valid/unsatisfiable/malformed range behavior. Tests use an isolated temporary storage root and do not modify `storage/`; never execute the old video repair script. Verify TypeScript/build, that browser conversion is loaded lazily and completes before POST, no active server path imports a transcoder, and local JS/WASM assets exist and are served with correct content types. If a local browser is available, test an MP4, MOV, PNG/JPEG, and Visual/Metrics toggles; report results honestly, otherwise mark those checks unverified.

README must explain that conversion is browser-only, core assets are loaded on demand, format support depends on the local WASM build/browser codecs/memory and is best-effort, and local filesystem storage is for a desktop PoC—not durable production object storage. Include:

```powershell
cd <project-folder>
npm install --cache .npm-cache
npm run dev
```

Production mode:

```powershell
npm run build
npm start
```

No deployment, cloud storage, server transcoding, remote media conversion, unrelated redesign, or destructive migration of existing media is in scope.