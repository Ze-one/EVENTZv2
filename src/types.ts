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
