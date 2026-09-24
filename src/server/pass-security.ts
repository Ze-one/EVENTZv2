import crypto from 'crypto';

export type SignedPassPayload = {
  v: number;
  participantId: string;
  passId: string;
  eventId: string;
  passVersion: number;
  issuedAt: number;
};

function getSigningSecret() {
  const secret =
    process.env.PASS_QR_SIGNING_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.EVENTZ_LOCAL_SIGNING_KEY ||
    '';

  if (!secret) {
    throw new Error('Pass QR signing is not configured. Set PASS_QR_SIGNING_SECRET.');
  }
  return secret;
}

function base64url(value: string | Buffer) {
  return Buffer.from(value).toString('base64url');
}

function signBody(body: string) {
  return crypto.createHmac('sha256', getSigningSecret()).update(body).digest('base64url');
}

export function createSignedPassToken(participant: any) {
  const payload: SignedPassPayload = {
    v: 1,
    participantId: String(participant.id),
    passId: String(participant.passId).trim().toUpperCase(),
    eventId: String(participant.eventId || 'event-1'),
    passVersion: Number(participant.passVersion || 1),
    issuedAt: Math.floor(Date.now() / 1000)
  };

  const body = base64url(JSON.stringify(payload));
  return `${body}.${signBody(body)}`;
}

export function verifySignedPassToken(token: string): {
  valid: boolean;
  payload?: SignedPassPayload;
  error?: string;
} {
  try {
    const [body, signature] = String(token || '').split('.');
    if (!body || !signature) return { valid: false, error: 'Malformed signed QR payload.' };

    const expected = signBody(body);
    const a = Buffer.from(signature);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return { valid: false, error: 'QR signature is invalid.' };
    }

    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as SignedPassPayload;
    if (!payload?.participantId || !payload?.passId || !payload?.eventId || !payload?.passVersion) {
      return { valid: false, error: 'Signed QR payload is incomplete.' };
    }

    return { valid: true, payload };
  } catch (error: any) {
    return { valid: false, error: error?.message || 'Unable to verify signed QR payload.' };
  }
}

export function buildSignedVerifyUrl(origin: string, participant: any) {
  const token = createSignedPassToken(participant);
  const passId = encodeURIComponent(String(participant.passId).trim().toUpperCase());
  return `${origin.replace(/\/$/, '')}/verify/${passId}?t=${encodeURIComponent(token)}`;
}
