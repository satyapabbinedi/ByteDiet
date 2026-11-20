# Client-only media contract

The browser converts the selected file before POST `/api/media`:

- Video containers/codecs: browser FFmpeg/WASM → H.264/AAC MP4.
- Images: Canvas/WebP first; HEIC/HEIF (sniffed from bytes) falls back to libheif WASM → Canvas/WebP; FFmpeg/WASM is the fallback for other formats the browser cannot decode.
- FFmpeg exit codes are checked; a failed run is an error, never an empty/partial upload.
- The API only stores `original` and `compressed`; it never invokes a codec.
- Unsupported/corrupt codecs surface an error in the UI instead of silently storing an unchanged video.
