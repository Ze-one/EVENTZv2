import React, { useState } from 'react';
import { ArrowUpRight, CalendarDays, CheckCircle2, ClipboardList, Eye, FileSpreadsheet, Palette, QrCode, ShieldCheck, Ticket, Users } from 'lucide-react';
import type { EventDetails, Participant } from '../types.js';
import { PassStatus } from '../types.js';
import { platformRequest, body } from '../platform/api.js';
import type { PublicEvent } from '../platform/types.js';
import './organizer.css';

export default function OrganizerHub({ event, participants, onNavigate, onChanged }: {
  event: EventDetails; participants: Participant[]; onNavigate: (page: string) => void; onChanged: (event: PublicEvent) => void;
}) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const missing = [!event.eventDate && 'date', !event.eventTime && 'start time', !event.description && 'description', !event.venue && 'venue / meeting link', event.locationType !== 'online' && !event.city && 'city'].filter(Boolean);
  const occupied = participants.filter(p => p.status !== PassStatus.CANCELLED).length;
  const published = event.publicationStatus === 'published';
  const cancelled = event.publicationStatus === 'cancelled';
  async function update(fields: object) {
    if (busy) return;
    setBusy(true); setError('');
    try { onChanged(await platformRequest<PublicEvent>(`/events/${event.id}`, body(fields, 'PATCH'))); }
    catch (error: any) { setError(error.message); }
    finally { setBusy(false); }
  }
  const tools = [
    { page: 'listing', title: 'Event listing', text: 'Details, cover image, capacity and publication.', Icon: CalendarDays },
    { page: 'event-settings', title: 'Pass designer', text: 'Your branding, layout and credential details.', Icon: Palette },
    { page: 'upload', title: 'Import roster', text: 'CSV, Excel, PDF, Google Forms exports and pasted lists.', Icon: FileSpreadsheet },
    { page: 'participants', title: 'Manage passes', text: 'Add guests, print, email, revoke and regenerate passes.', Icon: Ticket },
    { page: 'registrations', title: 'Online registrations', text: 'See the people joining through your event page.', Icon: Users },
    { page: 'scanner', title: 'Gate scanner', text: 'Scan QR passes, check guests in and record exits.', Icon: QrCode },
    { page: 'team', title: 'Gate team', text: 'Assign and remove staff access for this event.', Icon: ShieldCheck },
    { page: 'reports', title: 'Reports & exports', text: 'Attendance, scan history and email delivery records.', Icon: ClipboardList },
  ];
  return <section className="organizer-hub">
    <div className="organizer-launch">
      <div className="organizer-heading"><div><span className="organizer-eyebrow">FROM FIRST IDEA TO FINAL CHECK-IN</span><h2>Your event, under one roof.</h2><p>{cancelled ? 'This event is cancelled. Your roster, designs and reports remain available.' : published ? 'Your event is live. Keep preparing, welcome your guests, and manage everything here.' : 'Your draft is private. Prepare the roster, design passes and set up your team before publishing.'}</p></div><span className={`organizer-status organizer-status-${event.publicationStatus || 'draft'}`}>{event.publicationStatus || 'draft'}</span></div>
      <div className="organizer-readiness"><span><Ticket size={17} />{occupied} active passes{event.eventCapacity ? ` / ${event.eventCapacity} capacity` : ''}</span><span><ShieldCheck size={17} />{event.gateOfficerIds?.length || 0} gate staff</span><span><CheckCircle2 size={17} />{participants.filter(p => p.status === PassStatus.USED).length} checked in</span></div>
      {!published && !cancelled && <p className="roster-note">{missing.length ? `Before publishing, add: ${missing.join(', ')}.` : 'Your listing has the essential details. Publish when you are ready for online registrations.'}</p>}
      <div className="organizer-actions">
        {!published && !cancelled && <button className="organizer-primary" disabled={busy || !!missing.length} onClick={() => void update({ publicationStatus: 'published' })}>{busy ? 'Publishing…' : 'Publish event'}<ArrowUpRight size={16} /></button>}
        <button className="organizer-secondary" onClick={() => onNavigate('listing')}>Edit listing</button>
        <a className="organizer-secondary" href={`/events/${event.id}`}><Eye size={16} />{published ? 'View public page' : 'Preview listing'}</a>
        {published && <button className="organizer-secondary" disabled={busy} onClick={() => void update({ registrationEnabled: !event.registrationEnabled })}>{event.registrationEnabled ? 'Pause online registration' : 'Open online registration'}</button>}
      </div>
      {error && <p role="alert" className="organizer-error">{error}</p>}
    </div>
    <div className="organizer-tools">{tools.map(({ page, title, text, Icon }) => <button key={page} onClick={() => onNavigate(page)}><Icon size={23} /><h3>{title}<ArrowUpRight size={16} /></h3><p>{text}</p></button>)}</div>
  </section>;
}
