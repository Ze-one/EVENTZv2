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

export const WORKSPACE_EVENT_KEY = 'eventz_workspace_event';
export function workspaceFetch(input: RequestInfo | URL, options: RequestInit = {}) {
  const eventId = sessionStorage.getItem(WORKSPACE_EVENT_KEY);
  if (typeof input !== 'string' || !input.startsWith('/api/')) return fetch(input, options);
  const url = `/api/workspace/${encodeURIComponent(eventId || '')}/${input.slice(5)}`;
  return fetch(url, { ...options, headers: eventzAuthHeaders(Object.fromEntries(new Headers(options.headers).entries())) });
}
export async function workspaceDownload(path: string) {
  const response = await workspaceFetch(path);
  if (!response.ok) throw new Error('Unable to export this event. Please try again.');
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement('a');
  link.href = url;
  link.download = path.includes('format=xlsx') ? 'event-report.xlsx' : path.includes('format=pdf') ? 'event-report.html' : 'event-report.csv';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
