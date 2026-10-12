'use client';
import React, { useState } from 'react';
import { ArrowRight, CalendarDays, CheckCircle2, ClipboardCheck, Clock3 } from 'lucide-react';
import { activityTasks, meetupReadiness, type ActivityKind, type ActivityPhase } from '@/domain/activity';
import { setAppQuery, useAppQuery } from '@/lib/app-query';
import Link from './app-link';
import { dateTime, EmptyState, Pick, useApp } from './loopswap-app';

const phases: Record<ActivityPhase, { title: string; description: string }> = {
  now: { title: 'Action needed', description: 'Review these next. Approvals and receipts always need your explicit action.' },
  upcoming: { title: 'Coming up', description: 'Your agreed plans, with the latest accepted return appointments.' },
  waiting: { title: 'Waiting on others', description: 'Follow progress while the other participant or moderator responds.' },
};
const kinds: Record<ActivityKind, string> = { trade: 'Trade', loan: 'Loan', listing: 'My item', account: 'My account', feedback: 'Feedback' };

export function ActivitySummary({ kind }: { kind?: 'trade' | 'loan' }) {
  const { data } = useApp();
  if (!data.actor) return null;
  const tasks = activityTasks(data).filter(t => t.phase === 'now' && (!kind || t.kind === kind));
  if (!tasks.length) return null;
  return <Link className="activity-summary" href={`/activity${kind ? `?kind=${kind}` : ''}`}><ClipboardCheck size={21} /><span><strong>{tasks.length} {tasks.length === 1 ? 'thing needs' : 'things need'} your attention</strong><small>{kind ? 'Review requests and the next step for each agreement.' : 'Approvals, handoffs, feedback, and your item shelf in one place.'}</small></span><ArrowRight size={20} /></Link>;
}

export function MeetupReadiness() {
  const { data } = useApp();
  if (!data.actor) return null;
  const ready = meetupReadiness(data.actor, data.venues, data.serverTime);
  return <section className={`meetup-readiness ${ready.ready ? 'ready' : ''}`} aria-label="Your meetup readiness"><div><CalendarDays size={21} /><h2>Your meetup preferences</h2></div><ul><li><CheckCircle2 size={16} /><span>{ready.hasVenue ? 'An active public venue is selected.' : 'Choose an active approved public venue.'}</span></li><li><Clock3 size={16} /><span>{ready.hasAvailability ? 'You have future availability for new offers.' : 'Add a window ending at least 2½ hours from now.'}</span></li></ul><p>Shared meetups also depend on your partner&apos;s availability and approved venue hours. Pause offers you cannot currently fulfill.</p><Link href="/settings?tab=meetups" className="text-button">Review venues & availability <ArrowRight size={15} /></Link></section>;
}

export function Activity() {
  const { data } = useApp(), query = useAppQuery();
  const tasks = activityTasks(data);
  const view = ['now', 'upcoming', 'waiting'].includes(query.get('view') ?? '') ? query.get('view')! : 'all';
  const kind = ['trade', 'loan', 'items', 'feedback'].includes(query.get('kind') ?? '') ? query.get('kind')! : 'all';
  const signature = `${view}:${kind}`;
  const [pagination, setPagination] = useState({ signature: '', limit: 24 });
  const limit = pagination.signature === signature ? pagination.limit : 24;
  const scope = tasks.filter(t => kind === 'all' || (kind === 'items' ? ['listing', 'account'].includes(t.kind) : t.kind === kind));
  const filtered = scope.filter(t => view === 'all' || t.phase === view), visible = filtered.slice(0, limit);
  return <><div className="page-heading"><div><span className="eyebrow">YOUR NEXT USEFUL STEP</span><h1>Keep your circle moving.</h1><p>What needs you, what&apos;s coming up, and what&apos;s waiting on someone else.</p></div><Link href="/browse" className="secondary">Browse items</Link></div><div className="activity-toolbar"><div className="mode-switch activity-views" aria-label="Activity view">{['all', 'now', 'upcoming', 'waiting'].map(phase => <button key={phase} aria-pressed={view === phase} className={view === phase ? 'selected' : ''} onClick={() => setAppQuery({ view: phase === 'all' ? null : phase })}>{phase === 'all' ? 'All' : phase === 'now' ? 'Action needed' : phase === 'upcoming' ? 'Coming up' : 'Waiting'}<span>{scope.filter(t => phase === 'all' || t.phase === phase).length}</span></button>)}</div><Pick label="Activity type" value={kind} onChange={value => setAppQuery({ kind: value === 'all' ? null : value })} options={[{ value: 'all', label: 'All activity' }, { value: 'trade', label: 'Trading' }, { value: 'loan', label: 'Lending & borrowing' }, { value: 'items', label: 'Items & meetup preferences' }, { value: 'feedback', label: 'Participant feedback' }]} /></div>{filtered.length ? <>{(Object.keys(phases) as ActivityPhase[]).map(phase => {
    const group = visible.filter(t => t.phase === phase);
    if (!group.length) return null;
    return <section key={phase} className="activity-section" aria-labelledby={`activity-${phase}`}><div className="section-heading"><div><h2 id={`activity-${phase}`}>{phases[phase].title}</h2><p>{phases[phase].description}</p></div><span>{filtered.filter(t => t.phase === phase).length}</span></div><div className="activity-grid">{group.map(task => <article key={task.id} className={`activity-card activity-${phase}`}><div className="activity-card-label"><span className="tiny-label">{kinds[task.kind]}</span>{task.overdue && <span className="activity-window-ended">Window ended</span>}</div><h3>{task.title}</h3>{task.itemTitle && <strong className="activity-item">{task.itemTitle}</strong>}<p>{task.detail}</p>{task.at !== undefined && <div className="activity-time"><Clock3 size={16} /><span>{task.timeLabel}<time dateTime={new Date(task.at * 1000).toISOString()}>{dateTime(task.at, data.actor!.timezone)}</time></span></div>}<Link href={task.href} className="secondary">{task.cta}<ArrowRight size={16} /></Link></article>)}</div></section>;
  })}{visible.length < filtered.length && <button className="secondary full-width" onClick={() => setPagination({ signature, limit: limit + 24 })}>Show more activity ({filtered.length - visible.length} remaining)</button>}</> : <EmptyState title={view === 'now' ? 'You’re caught up here.' : 'No activity in this view.'} description={tasks.length ? 'Try another view or activity type to see your other plans.' : 'New requests, agreed meetups, and item reviews will appear here.'}>{tasks.length ? <button className="secondary" onClick={() => setAppQuery({ view: null, kind: null })}>See all activity</button> : <Link href="/browse" className="primary">Find something useful</Link>}</EmptyState>}<p className="activity-footnote">Times use {data.actor!.timezone}. These reminders follow recorded agreements; a receipt requires your own physical observation.</p></>;
}
