import { sessionSecret } from './runtime-secrets.js';
import crypto from 'crypto';
import { eventScope } from './event-scope.js';

export type EventzSession = {
  v: number;
  userId: string;
  email: string;
  role: 'admin' | 'gate_officer' | 'member';
  name: string;
  iat: number;
  exp: number;
};

function sign(body: string) {
  return crypto.createHmac('sha256', sessionSecret()).update(body).digest('base64url');
}

export function createSessionToken(user: any, lifetimeSeconds = 12 * 60 * 60) {
  const now = Math.floor(Date.now() / 1000);
  const payload: EventzSession = {
    v: 1,
    userId: String(user.id),
    email: String(user.email || ''),
    role: user.role,
    name: String(user.name || 'EVENTZ User'),
    iat: now,
    exp: now + lifetimeSeconds
  };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${body}.${sign(body)}`;
}

export function verifySessionToken(token: string): { valid: boolean; session?: EventzSession; error?: string } {
  try {
    const [body, signature] = String(token || '').split('.');
    if (!body || !signature) return { valid: false, error: 'Missing or malformed EVENTZ session.' };

    const expected = sign(body);
    const suppliedBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expected);
    if (suppliedBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(suppliedBuffer, expectedBuffer)) {
      return { valid: false, error: 'EVENTZ session signature is invalid.' };
    }

    const session = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as EventzSession;
    if (!session?.userId || !session?.role || !session?.exp) return { valid: false, error: 'EVENTZ session is incomplete.' };
    if (session.exp <= Math.floor(Date.now() / 1000)) return { valid: false, error: 'EVENTZ session has expired.' };
    if (!['admin', 'gate_officer', 'member'].includes(session.role)) return { valid: false, error: 'EVENTZ session role is invalid.' };

    return { valid: true, session };
  } catch (error: any) {
    return { valid: false, error: error?.message || 'EVENTZ session could not be verified.' };
  }
}

export function getBearerToken(req: any) {
  const header = String(req?.headers?.authorization || req?.headers?.Authorization || '');
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || '';
}

export function requireSession(req: any, roles: Array<EventzSession['role']> = ['admin', 'gate_officer', 'member']) {
  const result = verifySessionToken(getBearerToken(req));
  if (!result.valid || !result.session) return { ok: false as const, status: 401, error: result.error || 'Authentication required.' };
  const effectiveRole = eventScope.getStore()?.role || result.session.role;
  if (!roles.includes(effectiveRole)) return { ok: false as const, status: 403, error: 'This EVENTZ account does not have permission for this operation.' };
  return { ok: true as const, session: result.session };
}
