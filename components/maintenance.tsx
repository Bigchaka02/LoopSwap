'use client';

import { useEffect, useState } from 'react';
import { api, useApp } from './loopswap-app';

type Readiness = { stateBytes: number; ordinaryLimit: number; recoveryLimit: number; tradeHolds: number; loanHolds: number; reviewCases: number; photos: boolean; jobSecretConfigured: boolean; unusedUploads: number };

export function Maintenance() {
  const { data } = useApp();
  const [status, setStatus] = useState<Readiness | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('');
  useEffect(() => {
    let active = true;
    api<Readiness>('maintenance').then(value => { if (active) setStatus(value); }).catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, []);
  async function cleanup() {
    setBusy(true); setError(''); setMessage('');
    try {
      const result = await api<{ removedPhotos: number }>('maintenance/photos', {});
      setMessage(`${result.removedPhotos} photo cleanup ${result.removedPhotos === 1 ? 'record processed' : 'records processed'}. Photos used by listings and agreements are retained.`);
      setStatus(await api<Readiness>('maintenance'));
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  return <div className="form-panel settings-panel"><h2>Campus service readiness</h2><p>Private operational checks for campus moderators.</p>
    {status ? <><dl className="maintenance-stats"><div><dt>Community record size</dt><dd>{Math.round(status.stateBytes / 1000)} KB / {status.ordinaryLimit / 1000} KB for new activity</dd></div><div><dt>Reserved recovery capacity</dt><dd>{status.recoveryLimit / 1000} KB for handoffs and review</dd></div><div><dt>Held items</dt><dd>{status.tradeHolds} in trades · {status.loanHolds} in loans</dd></div><div><dt>Open custody reviews</dt><dd>{status.reviewCases}</dd></div><div><dt>Private photo storage</dt><dd>{status.photos ? 'Available' : 'Unavailable'}</dd></div><div><dt>Background reconciliation</dt><dd>{status.jobSecretConfigured ? 'Authentication configured; external scheduler must be connected and monitored' : 'Runs when members open or use the app; scheduler authentication is not configured'}</dd></div></dl>
      {status.stateBytes >= status.ordinaryLimit * 0.8 && <p role="alert" className="form-error">History is approaching the capacity limit. Contact the service operator to archive records before admitting more activity. Keep all unresolved custody records.</p>}
      {status.photos && <><h3>Unused photo uploads</h3><p>{status.unusedUploads} uploads may be eligible for cleanup. Uploads unattached for 24 hours can be removed; photos referenced by item or agreement history stay protected.</p><button className="secondary" disabled={busy} onClick={cleanup}>{busy ? 'Cleaning unused uploads…' : 'Clean unused uploads'}</button></>}
    </> : <p role="status">Checking the campus service…</p>}
    {message && <p role="status">{message}</p>}{error && <p role="alert" className="form-error">{error}</p>}
    <p className="small-note">{data.mode === 'demo' ? 'This remains an isolated synthetic demo. ' : ''}A real pilot also needs provisioned members, a monitored scheduler, history archival, tested backups, and accountable moderation operations.</p>
  </div>;
}
