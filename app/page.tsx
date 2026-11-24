'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { classifyMedia, type MediaKind } from '@/lib/media-formats';
import { formatProcessingDuration } from '@/lib/format-duration';
import { mediaPreviewKey } from '@/lib/media-preview-key';
import { SiteHeader } from './site-header';

type RecordItem = {
  id: string; name: string; kind: MediaKind; sourceFormat: string; outputFormat: string;
  originalMime: string; outputMime: string; compressionStatus: 'compressed' | 'passthrough';
  originalBytes: number; compressedBytes: number; savingsPercent: number;
  width: number | null; height: number | null; outputWidth: number | null; outputHeight: number | null;
  duration: number | null; createdAt: string; originalPath: string; compressedPath: string;
  conversionEngine: string | null; conversionMs: number | null; clientProcessingStatus: string | null;
};
type Phase = 'idle' | 'reading' | 'loading' | 'converting' | 'storing' | 'complete' | 'error';
const fmt = (n: number) => n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${(n / 1024).toFixed(1)} KB`;
const pct = (n: number) => `${n.toFixed(2)}%`;
const phaseText: Record<Phase, string> = {
  idle: 'Ready', reading: 'Reading and inspecting file…', loading: 'Loading the fallback browser encoder…',
  converting: 'Converting in your browser…', storing: 'Storing original and converted files locally…',
  complete: 'Conversion and local storage complete.', error: 'Could not process this file.',
};

export default function Home() {
  const [records, setRecords] = useState<RecordItem[]>([]);
  const [selected, setSelected] = useState<RecordItem | null>(null);
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<'visual' | 'metrics'>('visual');
  const [phase, setPhase] = useState<Phase>('idle');
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    fetch('/api/media').then(async response => {
      if (!response.ok) throw new Error('Could not load local media records.');
      return response.json();
    }).then(data => {
      if (active) { setRecords(data.records ?? []); setSelected(data.records?.[0] ?? null); }
    }).catch(reason => { if (active) setLoadError(reason instanceof Error ? reason.message : 'Could not load local media records.'); });
    return () => { active = false; };
  }, []);

  const totals = useMemo(() => records.reduce((sum, record) => ({
    original: sum.original + record.originalBytes, output: sum.output + record.compressedBytes,
  }), { original: 0, output: 0 }), [records]);
  const averageSavings = records.length ? records.reduce((sum, record) => sum + record.savingsPercent, 0) / records.length : 0;

  async function ingest(file: File) {
    if (busy) return;
    setBusy(true); setError(''); setProgress(null); setPhase('reading');
    try {
      const classification = classifyMedia(file.name, file.type);
      if (!classification) throw new Error('Choose a supported image or video file.');
      const converter = await import('../lib/client-media');
      let inputInfo = { width: null as number | null, height: null as number | null, duration: null as number | null };
      try { inputInfo = await converter.readMediaInfo(file); } catch {}
      setPhase('converting');
      const startedAt = performance.now();
      let converted: File;
      let conversionEngine: string;
      if (classification.kind === 'video') {
        // WebCodecs first; the FFmpeg core is only downloaded ('loading' phase) if this browser needs the fallback.
        const videoResult = await converter.compressVideoClient(file, value => setProgress(value), stage => { setPhase(stage); setProgress(null); });
        converted = videoResult.file;
        conversionEngine = videoResult.engine;
      } else {
        const imageResult = await converter.compressImageClient(file, value => setProgress(value));
        converted = imageResult.file;
        conversionEngine = imageResult.engine;
        // Browsers other than Safari cannot read HEIC, so take the input size from the decoder instead.
        inputInfo = { ...inputInfo, width: inputInfo.width ?? imageResult.inputWidth, height: inputInfo.height ?? imageResult.inputHeight };
      }
      const conversionMs = Math.max(0, Math.round(performance.now() - startedAt));
      let outputInfo = { width: null as number | null, height: null as number | null, duration: null as number | null };
      try { outputInfo = await converter.readMediaInfo(converted); } catch {}
      setPhase('storing'); setProgress(null);
      const form = new FormData();
      form.append('original', file);
      form.append('compressed', converted);
      form.set('width', String(inputInfo.width ?? ''));
      form.set('height', String(inputInfo.height ?? ''));
      form.set('outputWidth', String(outputInfo.width ?? ''));
      form.set('outputHeight', String(outputInfo.height ?? ''));
      form.set('duration', String(inputInfo.duration ?? outputInfo.duration ?? ''));
      form.set('conversionEngine', conversionEngine);
      form.set('conversionMs', String(conversionMs));
      form.set('clientProcessingStatus', 'completed');
      const response = await fetch('/api/media', { method: 'POST', body: form });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.record) throw new Error(result.error || `Local storage failed (${response.status}).`);
      setRecords(previous => [result.record, ...previous]);
      setSelected(result.record);
      setView('visual');
      setPhase('complete');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'An unexpected processing error occurred.');
      setPhase('error');
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  }

  return <main className="app-shell">
    <SiteHeader />
    <section className="hero"><div><p className="eyebrow">COMPRESS / COMPARE / KEEP CONTROL</p><h1>Every byte has a story.<br /><em>See the difference.</em></h1><p className="lede">Conversion happens in your browser. Only the original and finished output are stored locally on this machine. <Link href="/design" className="inline-link">Read the system design →</Link></p></div><div className="hero-stamp"><span>NO CLOUD</span><strong>100%</strong><small>LOCAL STORAGE</small></div></section>
    <section className="metric-strip"><Metric label="ASSETS PROCESSED" value={records.length.toString().padStart(2, '0')} note="local library" /><Metric label="ORIGINAL VOLUME" value={fmt(totals.original)} note="source files" /><Metric label="OUTPUT VOLUME" value={fmt(totals.output)} note="converted files" /><Metric label="AVG. SAVINGS" value={pct(averageSavings)} note="byte-derived" /></section>
    <section className="workspace">
      <aside className="library panel"><div className="panel-head"><div><span className="kicker">01 / LIBRARY</span><h2>Test inventory</h2></div><span className="count">{records.length} ITEMS</span></div>
        <label className={`dropzone ${busy ? 'is-busy' : ''}`} onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); const file = event.dataTransfer.files?.[0]; if (file) void ingest(file); }}><input ref={input} type="file" accept="image/*,video/*,.jpg,.jpeg,.jfif,.png,.webp,.avif,.heic,.heif,.gif,.bmp,.tif,.tiff,.mov,.mp4,.m4v,.webm,.mkv,.avi" disabled={busy} onChange={event => { const file = event.currentTarget.files?.[0]; if (file) void ingest(file); }} /><span className="drop-icon" aria-hidden="true">＋</span><strong>{busy ? phaseText[phase] : 'Add media to lab'}</strong><small>Images, HEIC & video · in-browser</small></label>
        <div className="processing-status" role="status" aria-live="polite"><span>{phaseText[phase]}</span>{progress !== null && <><progress max="1" value={progress} aria-label="Conversion progress" /><small>{Math.round(progress * 100)}%</small></>}{error && <p className="error-message" role="alert">{error}</p>}{loadError && <p className="error-message" role="alert">{loadError}</p>}</div>
        <div className="asset-list">{records.map((record, index) => <button key={record.id} className={`asset-row ${selected?.id === record.id ? 'selected' : ''}`} onClick={() => setSelected(record)}><span className={`asset-index ${record.kind}`}>{String(index + 1).padStart(2, '0')}</span><span className="asset-copy"><strong>{record.name}</strong><small>{record.sourceFormat} → {record.outputFormat}</small></span><span className="asset-saving">-{Math.round(record.savingsPercent)}%</span></button>)}{!records.length && <p className="empty-state">Your local media library is empty. Add an image or video to begin.</p>}</div>
        <div className="fixture-note"><span aria-hidden="true">↳</span><p><strong>Optional sample files</strong><br />Run <code>npm run fixtures</code> to download public format fixtures.</p></div>
      </aside>
      <div className="comparison panel"><div className="panel-head"><div><span className="kicker">02 / COMPARISON</span><h2>{view === 'visual' ? 'Before / after' : 'Pipeline metrics'}</h2></div><div className="segmented" role="tablist" aria-label="Comparison view"><button type="button" role="tab" aria-selected={view === 'visual'} aria-pressed={view === 'visual'} className={view === 'visual' ? 'active' : ''} onClick={() => setView('visual')}>VISUAL</button><button type="button" role="tab" aria-selected={view === 'metrics'} aria-pressed={view === 'metrics'} className={view === 'metrics' ? 'active' : ''} onClick={() => setView('metrics')}>METRICS</button></div></div>
        {selected ? view === 'visual' ? <><div className="compare-stage"><MediaPreview key={`${selected.id}-original`} record={selected} variant="original" label="ORIGINAL" /><div className="compare-arrow" aria-hidden="true">→</div><MediaPreview key={`${selected.id}-compressed`} record={selected} variant="compressed" label="CONVERTED OUTPUT" /></div><p className="preview-note">Some browsers cannot preview original MOV/HEIC files. This is a browser preview limitation, not a conversion failure.</p><div className="detail-grid"><Detail label="FILE" value={selected.name} /><Detail label="INPUT DIMENSIONS" value={dimensions(selected.width, selected.height)} /><Detail label="FORMATS" value={`${selected.sourceFormat} → ${selected.outputFormat}`} /><Detail label="SAVED" value={`${fmt(Math.max(0, selected.originalBytes - selected.compressedBytes))} / ${pct(selected.savingsPercent)}`} /></div><div className="bar-wrap"><div className="bar-label"><span>OUTPUT SIZE</span><strong>{selected.originalBytes ? `${((selected.compressedBytes / selected.originalBytes) * 100).toFixed(1)}% of original` : 'Unavailable'}</strong></div><div className="bar"><span style={{ width: `${Math.max(0, Math.min(100, selected.originalBytes ? selected.compressedBytes / selected.originalBytes * 100 : 0))}%` }} /></div></div></> : <MetricsView record={selected} /> : <div className="empty-comparison"><span aria-hidden="true">◈</span><h3>Nothing selected yet</h3><p>Add a file to see the original and converted output side by side.</p></div>}
      </div>
    </section>
    <footer><span>LOCAL MEDIA LAB</span><span>ORIGINAL + OUTPUT + METRICS → <strong>./data/</strong></span><Link href="/design">SYSTEM DESIGN →</Link></footer>
  </main>;
}

function dimensions(width: number | null, height: number | null) { return width && height ? `${width} × ${height}` : 'Unavailable'; }
function byteLabel(bytes: number) { return `${bytes.toLocaleString()} bytes (${fmt(bytes)})`; }
function Metric({ label, value, note }: { label: string; value: string; note: string }) { return <div className="metric"><span>{label}</span><strong>{value}</strong><small>{note}</small></div>; }
function Detail({ label, value }: { label: string; value: string }) { return <div className="detail"><span>{label}</span><strong>{value}</strong></div>; }
function MetricsView({ record }: { record: RecordItem }) {
  const saved = record.compressionStatus === 'compressed';
  return <div className="metrics-view"><div className="metric-hero"><span className="kicker">SELECTED ASSET</span><strong>{saved ? 'Smaller output' : 'Converted output is not smaller'}</strong><p>{saved ? 'The converted bytes are smaller than the original.' : 'The converted file is preserved exactly; passthrough means no byte savings, not that the original was substituted.'}</p></div><div className="metric-cards"><Detail label="ORIGINAL SIZE" value={byteLabel(record.originalBytes)} /><Detail label="OUTPUT SIZE" value={byteLabel(record.compressedBytes)} /><Detail label="SAVINGS" value={pct(record.savingsPercent)} /><Detail label="INPUT MIME / FORMAT" value={`${record.originalMime} / ${record.sourceFormat}`} /><Detail label="OUTPUT MIME / FORMAT" value={`${record.outputMime} / ${record.outputFormat}`} /><Detail label="INPUT DIMENSIONS" value={dimensions(record.width, record.height)} /><Detail label="OUTPUT DIMENSIONS" value={dimensions(record.outputWidth, record.outputHeight)} /><Detail label="VIDEO DURATION" value={record.duration ? `${record.duration.toFixed(2)} s` : 'Unavailable'} /><Detail label="PROCESSING" value={`${record.conversionEngine ?? 'Unavailable'} · ${record.clientProcessingStatus ?? 'Unavailable'} · ${formatProcessingDuration(record.conversionMs)}`} /><Detail label="OUTPUT PATH (IN DATA DIR)" value={record.compressedPath || `media/${record.id}-compressed`} /></div></div>;
}
function MediaPreview({ record, variant, label }: { record: RecordItem; variant: 'original' | 'compressed'; label: string }) {
  const mime = variant === 'original' ? record.originalMime : record.outputMime;
  const bytes = variant === 'original' ? record.originalBytes : record.compressedBytes;
  const src = `/api/media/${record.id}/${variant}`;
  const [failed, setFailed] = useState(false);
  return <div className="preview"><div className="preview-top"><span>{label}</span><span>{fmt(bytes)}</span></div><div className={`media-box ${variant}`}>
    {failed ? <div className="placeholder" role="img" aria-label="Preview unavailable"><span aria-hidden="true">◈</span><small>This browser cannot preview {mime}.<br />The stored file is intact.</small></div>
      : record.kind === 'video' ? <video key={mediaPreviewKey(record.id, variant)} controls preload="metadata" onError={() => setFailed(true)}><source src={src} type={mime} onError={() => setFailed(true)} /></video>
      : <img src={src} alt={`${record.name} (${label.toLowerCase()})`} onError={() => setFailed(true)} />}
  </div><small className="preview-meta">{mime} · {variant === 'original' ? dimensions(record.width, record.height) : dimensions(record.outputWidth, record.outputHeight)}</small></div>;
}
