import { EVENTZ_SESSION_TOKEN_KEY } from "../utils/auth.js";

export async function platformRequest<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = localStorage.getItem(EVENTZ_SESSION_TOKEN_KEY);
  const headers = new Headers(options.headers);
  if (options.body) headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const response = await fetch(`/api/platform${path}`, { ...options, headers });
  const data = await response.json();
  if (!response.ok)
    throw Object.assign(
      new Error(data.error || "Something went wrong. Please try again."),
      { status: response.status },
    );
  return data;
}
export const body = (value: unknown, method = "POST"): RequestInit => ({
  method,
  body: JSON.stringify(value),
});
