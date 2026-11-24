# Client-only media contract

The browser converts the selected file before POST `/api/media`:

- Video: WebCodecs (browser hardware codecs, via Mediabunny) → H.264/AAC MP4, ≤ 1280 px long edge, ≤ 30 fps, bitrate from the pixel rate. Small H.264/AAC sources are stream-copied (remuxed) without re-encoding. If WebCodecs cannot decode/encode the file, FFmpeg/WASM produces the same target (`-map 0:v:0 -map 0:a:0?`).
- Audio is never silently dropped: if the chosen audio track cannot be carried over by WebCodecs, the FFmpeg fallback runs instead.
- Images: Canvas/WebP first; HEIC/HEIF (sniffed from bytes) falls back to libheif WASM → Canvas/WebP; when the canvas cannot encode WebP (Safari) libwebp WASM (@jsquash/webp) encodes it; FFmpeg/WASM is the fallback for other formats the browser cannot decode.
- Container metadata (e.g. phone GPS location) is not copied into converted video.
- FFmpeg exit codes are checked; a failed run is an error, never an empty/partial upload.
- The API only stores `original` and `compressed`; it never invokes a codec.
- Unsupported/corrupt codecs surface an error in the UI instead of silently storing an unchanged video.
