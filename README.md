# Media Lab — local-first media conversion PoC

Media Lab converts and compresses images and video **in your browser** (including iPhone HEIC photos and MOV video), then stores the exact original and converted bytes plus metrics in a small database that lives in this repository (`data/`). The Next.js API only validates and stores; it never decodes or transcodes media.

- **Images** → WebP (canvas; HEIC via libheif WASM; FFmpeg WASM fallback)
- **Video** → H.264/AAC MP4 (FFmpeg WASM)
- **Database** → `data/metrics/media.json` + `data/media/*`, committed to git, with sample records included
- **Docs** → open **/design** in the running app for the full system design, data model, API and trade-offs

## Quick start

Requires **Node.js 22.15 or newer** (`node -v`). No other tools, accounts or native builds are needed.

### macOS / Linux

```bash
git clone https://github.com/satyapabbinedi/ByteDiet.git
cd ByteDiet
npm install
npm run dev
```

Install Node on macOS with `brew install node` or `nvm install` (the repo has an `.nvmrc`).

### Windows (PowerShell)

```powershell
git clone https://github.com/satyapabbinedi/ByteDiet.git
cd ByteDiet
npm install
npm run dev
```

Open <http://localhost:3000>. The library already contains sample records; drop in your own files to add more. The system design page is at <http://localhost:3000/design>.

`npm install` copies the FFmpeg WASM core from `node_modules` into `public/ffmpeg/` (it is intentionally not committed). The ~32 MB core and the ~2 MB HEIC decoder are only downloaded by the browser when a video or HEIC file is converted.

### Production mode

```bash
npm run build
npm start
```

Both scripts bind to `127.0.0.1` because the upload endpoint has no authentication.

## Try it

1. Add a JPEG or PNG → output is WebP, resized to at most 1600 px.
2. Add a **HEIC** photo (any iPhone photo, or run `npm run fixtures`) → decoded in the browser and converted to WebP. Browsers other than Safari cannot preview the HEIC original; the UI says so and the stored file is intact.
3. Add an MP4/MOV/WebM → converted to H.264/AAC MP4 (a few seconds for a short clip; FFmpeg WASM is single-threaded).
4. Switch between **Visual** and **Metrics** to compare sizes, savings, dimensions, engine and timing.
5. Add a corrupt file → a visible error appears and nothing is stored.

`npm run fixtures` downloads optional public sample files into `inputs/fixtures/` (git-ignored). Downloads may fail if a source is unavailable; failures are skipped.

## The database (and git)

| Path | What it is |
| --- | --- |
| `data/metrics/media.json` | The DB: a JSON array of records (newest first). Text, so it diffs and merges. |
| `data/media/<uuid>-original` | Exact bytes of the selected file. |
| `data/media/<uuid>-compressed` | Exact bytes of the browser-converted output. |
| `data/seed-manifest.json` | IDs of the sample records shipped with the repo. |

Paths inside the DB are root-relative with forward slashes, so a committed `data/` works on any OS. Everything you upload lands here, so you can commit and push your test results:

```bash
git add data && git commit -m "Add test media" && git push
```

```bash
npm run db:verify            # integrity: blobs exist, sizes match, no orphans, warns before GitHub's 50 MB limit
npm run db:reset             # dry run: what would be removed to get back to the seed data
npm run db:reset -- --yes    # remove uploaded records/blobs that are not in seed-manifest.json
```

Use another folder (for example one you never commit) with `LOCAL_MEDIA_STORAGE_DIR=/some/path npm run dev`. Keep media small: GitHub rejects files over 100 MB. Large media belongs in Git LFS or an object store (see the roadmap on `/design`).

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Development server (webpack) on 127.0.0.1:3000 |
| `npm run build` / `npm start` | Production build and server |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Contract tests (API, byte ranges, paths, HEIC sniffing) using a temporary storage root |
| `npm run check` | Type-check + tests + `db:verify` |
| `npm run db:verify` / `npm run db:reset` | DB integrity / reset to seed data |
| `npm run fixtures` | Download optional sample media |

GitHub Actions (`.github/workflows/ci.yml`) runs `npm run check` and a production build on Ubuntu, macOS and Windows for every push and pull request.

## Platform notes

- **macOS (Apple Silicon and Intel), Linux, Windows**: no native dependencies. Codecs are WASM, and the lockfile includes Next.js's prebuilt compilers for every platform.
- **Safari**: decodes HEIC natively. Safari cannot encode WebP from a canvas, so those images are re-encoded with FFmpeg WASM. This path is implemented but was not run in CI (there is no browser stage yet).
- **Verified**: HEIC/HEIC-sequence, MOV, WebM, PNG, JPEG, corrupt-file handling and both pages were exercised in Chromium during development. macOS itself is covered by CI (type-check, tests, build), not by an interactive browser run.

## Limits

Conversion is best effort and depends on the browser, the bundled FFmpeg build, available memory and file size. Unsupported or corrupt media produces a visible error and is not uploaded. Animated GIF/WebP are flattened to the first frame. HEIC decoding runs on the main thread (large photos may briefly freeze the page) and images over 120 megapixels are rejected. Very large videos can exhaust browser memory. The server reads uploads fully into memory and has no size cap. This is a desktop proof of concept, not production storage: there is no authentication.

## Licenses of bundled components

The app code is yours to license as you wish (no `LICENSE` file is included yet). Be aware of third-party terms when distributing: `libheif-js` is **LGPL-3.0** and the `@ffmpeg/core` WASM build includes **GPL** components (x264). Check these against your intended distribution.

## Project layout

```
app/                 Next.js App Router: lab UI (page.tsx), /design page, API routes
lib/                 client-media.ts (conversion), heic.ts, media-formats.ts, local-media.ts (storage)
scripts/             tests, db-tool, ffmpeg core sync, fixture downloader
data/                the committed database + seed samples
docs/superpowers/    original design spec and implementation plan
```
