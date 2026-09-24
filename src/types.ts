/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export enum UserRole {
  ADMIN = 'admin',
  GATE_OFFICER = 'gate_officer'
}

export enum PassStatus {
  NOT_USED = 'Not Used',
  USED = 'Used',
  CANCELLED = 'Cancelled',
  INVALID = 'Invalid'
}

export enum ScanResult {
  VALID = 'Valid',
  USED = 'Used',
  INVALID = 'Invalid',
  CANCELLED = 'Cancelled'
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  passwordHash: string;
  profileImage?: string;
  avatarUrl?: string;
  createdAt: string;
}

export interface EventDetails {
  id: string;
  eventName: string;
  eventDate: string;
  eventTime: string;
  venue: string;
  organizerName: string;
  description: string;
  passTitle: string;
  accessInstruction: string;
  footerNote: string;
  logoPath: string;
  primaryColor: string;
  accentColor: string;
  showPhone: boolean;
  showEmail: boolean;
  showCategory: boolean;
  showOrganization: boolean;
  registrationEnabled?: boolean;
  registrationMode?: 'public' | 'invitation_only';
  registrationDeadline?: string | null;
  eventCapacity?: number | null;
  waitlistEnabled?: boolean;
  allowGuests?: boolean;
  maxGuestsPerRegistration?: number;
  customRegistrationFields?: Array<{
    id: string;
    label: string;
    type: 'text' | 'textarea' | 'select' | 'checkbox';
    required?: boolean;
    placeholder?: string;
    options?: string[];
  }>;
  dashboardMediaUrl?: string | null;
  dashboardMediaPath?: string | null;
  dashboardMediaType?: 'image' | 'gif' | 'video' | null;
  dashboardMediaName?: string | null;
  dashboardMediaEnabled?: boolean;
  dashboardMediaFit?: 'cover' | 'contain';
  dashboardMediaPosition?: 'center' | 'top' | 'bottom' | 'left' | 'right';
  dashboardMediaOverlay?: number;
  dashboardMediaAutoplay?: boolean;
  dashboardMediaLoop?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Participant {
  id: string;
  eventId: string;
  fullName: string;
  phone: string;
  email: string;
  organization: string;
  category: string;
  passId: string;
  status: PassStatus;
  checkedInAt?: string;
  checkedInBy?: string;
  createdAt: string;
  updatedAt: string;
  lastEmailStatus?: 'Queued' | 'Sending' | 'Delivered' | 'Failed';
  lastEmailError?: string | null;
  rsvpToken?: string;
  rsvpStatus?: 'pending' | 'yes' | 'maybe' | 'declined';
  rsvpUpdatedAt?: string;
  rsvpDeclinedAt?: string;
  passCancelledByRsvp?: boolean;
  registrationId?: string;
  isGuest?: boolean;
  guestOfParticipantId?: string;
  passVersion?: number;
  passRevokedAt?: string | null;
  passRevokedBy?: string | null;
  passRevocationReason?: string | null;
  entryMode?: 'single' | 'multiple' | 'reentry';
  allowedDays?: string[];
  presenceState?: 'outside' | 'inside';
  accessCount?: number;
  lastAccessAt?: string | null;
  lastAccessGate?: string | null;
  lastExitAt?: string | null;
  lastExitGate?: string | null;
}

export interface ScanLog {
  id: string;
  eventId: string;
  participantId?: string;
  passId: string;
  scanResult: ScanResult;
  scannedBy: string;
  deviceInfo: string;
  ipAddress: string;
  createdAt: string;
  participantName?: string;
}

export interface EmailLog {
  id: string;
  eventId: string;
  participantId: string;
  participantName: string;
  recipientEmail: string;
  subject: string;
  status: 'Queued' | 'Sending' | 'Delivered' | 'Failed';
  sentAt: string;
  errorMessage?: string;
}
