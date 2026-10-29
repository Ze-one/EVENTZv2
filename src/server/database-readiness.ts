import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { AppError, databaseFailure } from './errors.js';

// Zero-row projections validate columns used by both the platform and the
// original organizer workspace without retrieving any account or attendee data.
const columns = {
  users: 'id,name,email,role,passwordHash,createdAt,profileImage,bio,savedEventIds,followedOrganizerIds',
  events: 'id,eventName,eventDate,eventTime,venue,organizerName,description,passTitle,accessInstruction,footerNote,logoPath,primaryColor,accentColor,showPhone,showEmail,showCategory,showOrganization,createdAt,updatedAt,ownerId,publicationStatus,category,city,coverImage,locationType,timezone,gateOfficerIds,registrationEnabled,registrationMode,registrationDeadline,eventCapacity,waitlistEnabled,allowGuests,maxGuestsPerRegistration,customRegistrationFields,dashboardMediaUrl,dashboardMediaPath,dashboardMediaType,dashboardMediaName,dashboardMediaEnabled,dashboardMediaFit,dashboardMediaPosition,dashboardMediaOverlay,dashboardMediaAutoplay,dashboardMediaLoop',
  participants: 'id,eventId,fullName,phone,email,organization,category,passId,status,checkedInAt,checkedInBy,createdAt,updatedAt,userId,lastEmailStatus,lastEmailError,rsvpToken,rsvpStatus,rsvpUpdatedAt,rsvpDeclinedAt,passCancelledByRsvp,registrationId,isGuest,guestOfParticipantId,passVersion,passRevokedAt,passRevokedBy,passRevocationReason,entryMode,allowedDays,presenceState,accessCount,lastAccessAt,lastAccessGate,lastExitAt,lastExitGate',
  scanLogs: 'id,eventId,participantId,passId,scanResult,scannedBy,deviceInfo,ipAddress,createdAt,direction,offline,syncId,riskLevel,riskReason,qrVerified',
  emailLogs: 'id,eventId,participantId,participantName,recipientEmail,subject,status,sentAt,errorMessage,createdAt',
  passHistory: 'id,eventId,participantId,action,oldPassId,newPassId,passVersion,performedBy,reason,metadata,createdAt',
  passSecurityAlerts: 'id,eventId,participantId,passId,type,severity,message,gates,scanLogIds,resolved,resolvedAt,resolvedBy,createdAt',
};

export class DatabaseReadiness {
  private cached?: { expires: number; error?: unknown };
  private pending?: Promise<void>;

  constructor(private client: SupabaseClient | null, private cacheMs = 15_000) {}

  async check(): Promise<void> {
    if (!this.client) return;
    if (this.cached && this.cached.expires > Date.now()) {
      if (this.cached.error) throw this.cached.error;
      return;
    }
    // Bound provider traffic from public uptime probes, including failures, and
    // share an in-flight probe across concurrent requests in the same instance.
    if (!this.pending) this.pending = this.probe().then(
      () => { this.cached = { expires: Date.now() + this.cacheMs }; },
      error => { this.cached = { expires: Date.now() + this.cacheMs, error }; throw error; },
    ).finally(() => { this.pending = undefined; });
    return this.pending;
  }

  private async probe() {
    const results = await Promise.all(Object.entries(columns).map(async ([table, select]) => {
      const { error } = await this.client!.from(table).select(select).limit(0)
        .abortSignal(AbortSignal.timeout(4_000));
      return { table, error };
    }));
    for (const { table, error } of results)
      if (error) throw databaseFailure(error, `readiness.${table}`);

    // A fresh, nonexistent event ID reaches the function's first guard and
    // performs no writes. This also detects a missing/stale PostgREST RPC cache.
    const { error } = await this.client!.rpc('register_event', {
      event_id: `eventz-readiness-${randomUUID()}`, attendee_id: 'eventz-readiness',
    }).abortSignal(AbortSignal.timeout(4_000));
    if (error?.code === 'P0001' && error.message === 'Registration is closed.') return;
    if (error) throw databaseFailure(error, 'readiness.register_event');
    throw new AppError(503, 'The database registration check needs administrator review.', 'DATABASE_SCHEMA_INCOMPATIBLE');
  }
}
