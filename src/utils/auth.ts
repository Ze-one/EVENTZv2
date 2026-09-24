export const EVENTZ_SESSION_TOKEN_KEY = 'eventz_session_token';

export function getEventzSessionToken() {
  try {
    return localStorage.getItem(EVENTZ_SESSION_TOKEN_KEY) || '';
  } catch {
    return '';
  }
}

export function eventzAuthHeaders(extra: Record<string, string> = {}) {
  const token = getEventzSessionToken();
  return {
    ...extra,
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  };
}
