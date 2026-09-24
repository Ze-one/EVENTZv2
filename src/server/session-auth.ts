import crypto from 'crypto';

export type EventzSession = {
  v: number;
  userId: string;
  email: string;
  role: 'admin' | 'gate_officer';
  name: string;
  iat: number;
  exp: number;
};

function secret() {
  const value =
    process.env.EVENTZ_SESSION_SECRET ||
    process.env.PASS_QR_SIGNING_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    '';
  if (!value) throw new Error('EVENTZ session signing is not configured.');
  return value;
}

function sign(body: string) {
  return crypto.createHmac('sha256', secret()).update(body).digest('base64url');
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
    if (!['admin', 'gate_officer'].includes(session.role)) return { valid: false, error: 'EVENTZ session role is invalid.' };

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

export function requireSession(req: any, roles: Array<'admin' | 'gate_officer'> = ['admin', 'gate_officer']) {
  const result = verifySessionToken(getBearerToken(req));
  if (!result.valid || !result.session) return { ok: false as const, status: 401, error: result.error || 'Authentication required.' };
  if (!roles.includes(result.session.role)) return { ok: false as const, status: 403, error: 'This EVENTZ account does not have permission for this operation.' };
  return { ok: true as const, session: result.session };
}
