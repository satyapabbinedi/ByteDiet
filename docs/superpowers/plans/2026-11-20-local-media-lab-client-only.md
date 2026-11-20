# Local Media Lab Client-Only Conversion Implementation Plan

> **For agentic workers:** Execute the plan task-by-task using the approved inline or subagent-driven workflow. Each step is a checkbox to track.

**Goal:** Finish the existing Next.js Media Lab so all conversion occurs client-side and Next.js only persists exact input/output bytes and accurate metadata locally.

**Architecture:** Preserve original bytes and convert in the browser: Canvas to WebP for common images, lazy local FFmpeg/WASM for video and unsupported-image fallback. Keep storage APIs codec-free; validate metadata, save bytes and records locally, and stream each variant with persisted MIME/range support.

**Tech Stack:** Next.js 16 App Router, React, TypeScript, Node.js built-in test runner and filesystem, `@ffmpeg/ffmpeg` 0.12.15, `@ffmpeg/util` 0.12.2, local `@ffmpeg/core` 0.12.10 assets.

---

## File map

- `lib/media-formats.ts`: shared MIME/extension classification, output contracts, and byte-derived metrics.
- `lib/local-media.ts`: local storage root, backward-compatible record reads, safe paths, serialized atomic metrics updates.
- `app/api/media/route.ts`: storage-only list/upload handlers.
- `app/api/media/[id]/[variant]/route.ts`: persisted-MIME streaming and real single-range handling.
- `lib/client-media.ts`: browser conversion, lazy FFmpeg instance, single progress callback, dimensions/duration readers.
- `app/page.tsx` and `app/globals.css`: processing phases, progress, upload guard, comparison, accessible Visual/Metrics controls.
- `scripts/media-api.test.mjs` and `scripts/ts-alias-loader.mjs`: isolated direct route-handler contract tests using a temporary storage root.
- `package.json`: `test` command using Node's built-in test runner.
- `README.md` and optionally `scripts/download-fixtures.mjs`: accurate client-only architecture, codec limitations, exact commands and best-effort fixtures.
- Remove only confirmed-dead server transcoding artifacts (`lib/video-compress.ts`, `lib/ffmpeg-static.d.ts`, `scripts/repair-video-records.mjs`); never remove or rewrite `storage/media` or `storage/metrics/media.json`.

## Task 1: Add isolated API contract tests (RED)

**Files:** Create `scripts/media-api.test.mjs`, create `scripts/ts-alias-loader.mjs`; modify `package.json` only to add a test script after the test harness is in place.

- [ ] Write tests that dynamically import the actual App Router `POST` and variant `GET` handlers after setting `LOCAL_MEDIA_STORAGE_DIR` to a unique OS temporary directory. Register a Node ESM resolver hook mapping `@/...` aliases to project files. Ensure tests clean only their own temp directory.
- [ ] Assert missing `original` or `compressed` returns HTTP 400 and writes no record/blob.
- [ ] Assert a request containing known binary output bytes returns HTTP 201 and the compressed endpoint returns byte-for-byte identical data.
- [ ] Assert `.mov` with `video/quicktime` streams original MIME; `.mp4` output streams `video/mp4`; an empty File MIME plus `.avi` classifies as video; and a recognized extension wins a conflicting generic/inaccurate MIME.
- [ ] Assert sizes 1000 → 250 produce 75% savings. For equal/larger converted candidates, assert zero savings, `passthrough`, and that stored/output bytes equal the converted candidate (different from the original), not a substitute copy of the original.
- [ ] Assert a valid single range returns 206 with correct content/range; an unsatisfiable range returns 416; malformed/multi-range requests are ignored with full 200.
- [ ] Run `node --test scripts/media-api.test.mjs` and confirm failures are expected contract gaps (not loader/import/test errors). Record the red output before production changes.

## Task 2: Implement shared classification and local metadata contracts (GREEN)

**Files:** Create `lib/media-formats.ts`; modify `lib/local-media.ts`; add temporary-root injection without changing the default `storage/` path.

- [ ] Implement the spec’s explicit video/image extension MIME maps, MIME-first behavior for unknown extensions, extension precedence when a recognized extension conflicts, expected WebP/MP4 output checks, and the savings formula including the zero-original guard.
- [ ] Update the record type with nullable original/output dimensions and duration plus `conversionEngine`, `conversionMs`, and `clientProcessingStatus`; keep compatibility defaults for existing records without rewriting the JSON on GET/startup.
- [ ] Ensure path generation uses a server-created UUID and fixed suffixes only; validate IDs before any path construction. Resolve `LOCAL_MEDIA_STORAGE_DIR` for tests and default to the project’s existing `storage/` folder.
- [ ] Serialize in-process updates and atomically replace the JSON metrics file (temporary sibling file plus rename), preserving all existing records and records’ unknown legacy fields as appropriate.
- [ ] Run the tests again; correct the helper/persistence implementation until the relevant contracts pass.

## Task 3: Make the upload route storage-only (GREEN)

**Files:** Modify `app/api/media/route.ts` and shared helpers if needed.

- [ ] Validate multipart request has both nonempty File parts; classify original by shared rules; require image output `.webp` / `image/webp` or video output `.mp4` / `video/mp4`. Return a clear 400 response before writing if invalid.
- [ ] Persist `Buffer.from(await file.arrayBuffer())` exactly as received. Do not call any decoder, transcoder, Sharp, child process, or media processor.
- [ ] Calculate bytes/savings/status on the server from received bytes. Keep generated output bytes even when size is equal/larger; `passthrough` means no size reduction only.
- [ ] Persist name/kind/formats/MIMEs, input/output dimensions, duration, server timestamp, paths, and client-reported engine/time/completed status. Keep client metrics informational, not server measurements.
- [ ] Verify the contract tests for validation, exact bytes, MIME fallback, and savings pass.

## Task 4: Implement correct variant streaming and ranges

**Files:** Modify `app/api/media/[id]/[variant]/route.ts`; extend `scripts/media-api.test.mjs` if necessary.

- [ ] Look up record and allow only `original` or `compressed`; validate the identifier before filesystem access.
- [ ] Stream full responses and bounded partial responses from disk using a file read stream; do not load the entire media blob into memory to serve it. Set `Content-Type` from the selected persisted MIME and `Content-Length` from actual saved bytes. Add immutable caching only where it does not obscure persisted-record behavior.
- [ ] Implement single `bytes=start-end`, open-ended, and suffix ranges. Return 206 with correct inclusive byte slice and `Content-Range`; return 416 plus `bytes */length` for unsatisfiable ranges; ignore malformed/multiple ranges and return full 200. Advertise `Accept-Ranges` only with working implementation.
- [ ] Run all streaming tests and verify `.mov` remains `video/quicktime`, generated MP4 is `video/mp4`, and bytes exactly match files on disk.

## Task 5: Harden browser-only conversion

**Files:** Modify `lib/client-media.ts`; confirm local assets under `public/ffmpeg/` and installed package versions.

- [ ] Keep this module out of server components/API routes; page code must load it only through dynamic `import()` after file selection.
- [ ] Reuse one lazy FFmpeg instance. Attach one progress listener that reads/writes the current callback; reset the cached promise after initialization failure so retry is possible.
- [ ] Normalize extensions safely for FFmpeg’s virtual filesystem, run H.264/AAC MP4 conversion with optional audio mapping, dimensions cap, fast-start, and clear errors. Delete virtual input/output files in `finally`.
- [ ] Use Canvas/createImageBitmap for native image decode, resize only above 1600px, preserve alpha/orientation, output WebP; attempt the WASM WebP path after native failure. Reject unsupported decode rather than silently returning the original.
- [ ] Extract image/video dimensions and duration in the browser; revoke temporary object URLs and close ImageBitmap resources. Report engine and elapsed conversion time.
- [ ] Run TypeScript checks/build after conversion code is in place; browser codec execution still requires a real browser test.

## Task 6: Wire the UI to convert before upload

**Files:** Modify `app/page.tsx` and targeted CSS in `app/globals.css`.

- [ ] Add processing phase/progress/error state. Keep one-file selection disabled while busy and reset the input in `finally` to allow selecting the same file again.
- [ ] Detect kind with shared MIME/extension rules. Dynamically load and call the correct image/video conversion function before constructing FormData. On conversion error, show the error and do not make a POST.
- [ ] Append `original`, `compressed`, dimensions, duration, conversion engine, elapsed time and completed status only after successful conversion; check API response status and show server/storage errors.
- [ ] Replace stale “server compresses video” messaging with an explicit “conversion happens in your browser; only the finished pair is stored locally” explanation. Show encoder loading, reading/inspection, converting, storing, complete, and error; show percent only when meaningful.
- [ ] Make Visual/Metrics actual accessible buttons with `aria-pressed`/tab semantics. Both original and output image/video previews must be served with their persisted MIME; video uses controls/preload and one source declaration. Show side-by-side previews and a separate original preview compatibility note. Metrics lists bytes, MIME/formats, precise savings, status, local path, dimensions/duration, client engine, and time. Show unavailable values honestly.
- [ ] Confirm existing asset-library selection, aggregate metrics, empty state, responsive layout, and prior stored records still render.

## Task 7: Documentation and obsolete-path cleanup

**Files:** Modify `README.md`, optionally `scripts/download-fixtures.mjs`; remove only audited obsolete files.

- [ ] Replace server-compression wording with client-only conversion plus local persistence; document best-effort codec/browser/memory limits and animated-image behavior.
- [ ] Add exact commands: `cd <project-folder>`, `npm install --cache .npm-cache`, `npm run dev`; production `npm run build`, `npm start`.
- [ ] Document that the large local core loads on demand and that filesystem persistence is desktop-PoC storage, not durable production object storage. Keep fixture downloads optional and accurately labeled.
- [ ] Remove the inactive server `ffmpeg-static` implementation/declaration/repair script only after confirming no imports or user data dependencies; never execute the repair script. Ensure the test command no longer imports the old transcoder.

## Task 8: Full verification and preservation audit

**Files:** No further changes unless a test reveals a defect.

- [ ] Run the focused Node contract suite and `npx tsc --noEmit` (or equivalent project TypeScript check).
- [ ] Run `npm run build` fresh and inspect complete output/exit code.
- [ ] Verify static import graph: no server/API module imports conversion modules, `ffmpeg-static`, Sharp, or child-process codec; page uses dynamic import before POST.
- [ ] Start/reuse a local server without disrupting a user-owned listener. Verify `/ffmpeg/ffmpeg-core.js` serves JavaScript and `/ffmpeg/ffmpeg-core.wasm` serves WebAssembly bytes/content type.
- [ ] If the connected browser can reach the app, manually test a short MP4, a MOV, PNG/JPEG, and both view buttons. Otherwise label browser conversion as not manually verified; do not claim container coverage not tested.
- [ ] Recompute the existing `storage/metrics/media.json` and `storage/media` hashes/count/sizes and confirm original records/blobs are unchanged; ensure tests wrote only to their temporary directory.
- [ ] Inspect changed-file status via directory comparison (the project has no `.git` metadata); do not create a Git repo or commit.

## Execution checkpoint (2026-11-20)

- Implemented the storage-only API contracts, atomic local metadata persistence, exact-byte upload handling, persisted MIME streaming, and full/open-ended/suffix/single-range behavior. The isolated contract suite passes: 11 tests.
- Implemented lazy client-only conversion, retryable FFmpeg initialization, one progress listener, virtual-file cleanup, metadata inspection, responsive processing/error UI, accessible view controls, and exact byte metrics.
- Removed the audited inactive server-transcoder/repair artifacts without running the repair script. Updated README and selected Webpack for Next dev/build because the verified Turbopack build fails on the FFmpeg worker URL.
- Verified `npm test`, `npx tsc --noEmit`, and `npm run build` successfully. Local FFmpeg JS/WASM assets exist; the WASM signature is `00-61-73-6D`. Contract tests use an isolated temporary storage directory; the storage snapshot remained unchanged during the local-server smoke-test attempt.
- **Not manually verified:** browser codec conversions and HTTP-served asset MIME/content types. The local dev process reported ready, but loopback requests were denied by the environment. No connected browser is available here.
- This project folder has no Git metadata. No repository was initialized and no commit was created, as required by the plan.
