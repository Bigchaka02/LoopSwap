'use client';

import { useEffect, useRef, useState } from 'react';
import { ImagePlus, X } from 'lucide-react';
import { preparePhoto } from '../lib/prepare-photo';

export function ListingPhoto({ enabled, photo, alt, onPhoto, onAlt, onBusy }: {
  enabled: boolean; photo: string | null; alt: string;
  onPhoto: (photo: string | null) => void; onAlt: (alt: string) => void; onBusy: (busy: boolean) => void;
}) {
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [canRetry, setCanRetry] = useState(false);
  const pending = useRef<{ blob: Blob; key: string } | null>(null), generation = useRef(0);
  useEffect(() => () => { generation.current++; }, []);
  async function upload(file?: File) {
    const sequence = ++generation.current;
    setBusy(true); onBusy(true); setError(''); setCanRetry(false);
    try {
      if (file) { pending.current = null; pending.current = { blob: await preparePhoto(file), key: crypto.randomUUID() }; }
      if (!pending.current) throw new Error('Choose an item photo first.');
      const response = await fetch('/api/photos', { method: 'POST', headers: { 'Content-Type': 'image/jpeg', 'Idempotency-Key': pending.current.key }, body: pending.current.blob, credentials: 'same-origin' });
      const result = await response.json().catch(() => null) as { data?: { photo: string }; error?: { message: string } } | null;
      if (!response.ok || !result?.data) throw Object.assign(new Error(result?.error?.message ?? 'The photo did not upload. Retry or publish without a photo.'), { status: response.ok ? undefined : response.status });
      if (sequence === generation.current) { onPhoto(result.data.photo); pending.current = null; }
    } catch (e) { if (sequence === generation.current) { const failure = e as Error & { status?: number }; setError(failure.message); setCanRetry(!!pending.current && (!failure.status || failure.status >= 500 || failure.status === 429)); } }
    finally { if (sequence === generation.current) { setBusy(false); onBusy(false); } }
  }
  return <section className="form-panel photo-editor">
    <div className="form-section-title"><ImagePlus size={21} /><div><h2>An honest item photo</h2><p>Optional. Show the actual item, including visible wear.</p></div></div>
    {photo && <div className="photo-preview">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={photo} alt={alt || 'Your selected item photo'} width={240} height={240} /><button type="button" className="secondary" disabled={busy} onClick={() => { onPhoto(null); onAlt(''); }}><X size={16} />Remove photo</button></div>}
    {enabled ? <><label htmlFor="item-photo">{photo ? 'Replace photo' : 'Choose an item photo'}</label><input id="item-photo" type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={e => { const file = e.target.files?.[0]; if (file) void upload(file); e.target.value = ''; }} /><p className="small-note">JPG, PNG, or WebP, up to 8 MB. Photos are resized and location metadata is removed. Members see a photo after publication; moderators can review uploads.</p></> : <p className="small-note">Photo storage is temporarily unavailable. A clear description is enough to list your item.</p>}
    {photo && <><label htmlFor="item-photo-alt">Describe the photo for people using a screen reader</label><input id="item-photo-alt" value={alt} maxLength={160} placeholder="Blue bike lock with two keys and minor surface scratches" onChange={e => onAlt(e.target.value)} /></>}
    {busy && <p role="status">Preparing and uploading your photo…</p>}
    {error && <div role="alert" className="form-error">{error} {canRetry && <button type="button" className="text-button" disabled={busy} onClick={() => void upload()}>Retry upload</button>}</div>}
  </section>;
}
