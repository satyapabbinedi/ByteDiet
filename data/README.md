# data/ — the committed local database

This folder **is** the database of the proof of concept, and it is meant to be committed to git.

| Path | Contents |
| --- | --- |
| `metrics/media.json` | One JSON array of media records (schema: see `/design` page or `lib/local-media.ts`). Plain text, so it diffs and merges. |
| `media/<uuid>-original` | Exact bytes of the file the user selected. |
| `media/<uuid>-compressed` | Exact bytes of the browser-converted output (`.webp` or `.mp4`). |
| `seed-manifest.json` | IDs of the sample records that ship with the repo. |

The shipped records were produced by the real browser pipeline from synthetic, copyright-free sources.

```bash
npm run db:verify          # integrity check: blobs exist, sizes match the DB, no orphans, no >50 MB files
npm run db:reset           # dry run: shows what would be removed to get back to the seed data
npm run db:reset -- --yes  # really remove uploaded records/blobs that are not in seed-manifest.json
```

Point the app at a different folder with `LOCAL_MEDIA_STORAGE_DIR=/some/path npm run dev`.
Keep files small: GitHub warns above 50 MB and rejects above 100 MB (use Git LFS or an object store for big media).
