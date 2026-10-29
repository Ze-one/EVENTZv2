import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import type { Server } from "node:http";

let server: Server, base: string, directory: string;
let owner: any, other: any, attendee: any, gate: any;
let eventA: any, eventB: any, registration: any;
const future = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
async function request(
  path: string,
  user?: any,
  value?: any,
  method = value === undefined ? "GET" : "POST",
) {
  const response = await fetch(base + path, {
    method,
    headers: {
      ...(user ? { authorization: `Bearer ${user.sessionToken}` } : {}),
      ...(value !== undefined ? { "content-type": "application/json" } : {}),
    },
    body: value === undefined ? undefined : JSON.stringify(value),
  });
  const type = response.headers.get("content-type") || "";
  const data = type.includes("json")
    ? await response.json()
    : type.includes("image")
      ? Buffer.from(await response.arrayBuffer())
      : await response.text();
  return { status: response.status, data, type };
}
const api = (path: string, ...rest: any[]) =>
  request("/api/platform" + path, ...rest);
const workspace = (event: any, path: string, ...rest: any[]) =>
  request(`/api/workspace/${event.id}${path}`, ...rest);
async function signup(name: string) {
  const response = await api("/auth/register", undefined, {
    name,
    email: `${name.toLowerCase()}@example.test`,
    password: "a-long-test-password",
    role: "admin",
  });
  assert.equal(response.status, 201, JSON.stringify(response.data));
  assert.equal(response.data.user.role, "member");
  assert.equal(response.data.user.passwordHash, undefined);
  return response.data;
}
const eventBody = {
  eventName: "Meet your community",
  eventDate: future,
  eventTime: "18:00",
  venue: "Community Hall, Main Street",
  city: "Douala",
  description: "An evening to meet the people building our community.",
  timezone: "Africa/Douala",
  category: "Community",
  eventCapacity: 1,
};
before(async () => {
  directory = await mkdtemp(join(tmpdir(), "eventz-platform-test-"));
  process.env.EVENTZ_DB_FILE = join(directory, "db.json");
  process.env.SUPABASE_URL = "";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "";
  process.env.NODE_ENV = "test";
  process.env.VERCEL = "1";
  process.env.EVENTZ_SESSION_SECRET = randomBytes(32).toString("hex");
  process.env.PASS_QR_SIGNING_SECRET = randomBytes(32).toString("hex");
  const { app } = await import("../server.js");
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as any).port}`;
});
after(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  await rm(directory, { recursive: true, force: true });
});

test("accounts have salted passwords, normalized unique email, and no caller-selected privileges", async () => {
  owner = await signup("Owner");
  other = await signup("Other");
  attendee = await signup("Attendee");
  gate = await signup("Gate");
  assert.equal(
    (
      await api("/auth/register", undefined, {
        name: "Duplicate",
        email: "OWNER@EXAMPLE.TEST",
        password: "a-long-test-password",
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await api("/auth/register", undefined, {
        name: "Short",
        email: "short@example.test",
        password: "short",
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await api("/auth/login", undefined, {
        email: "owner@example.test",
        password: "wrong",
      })
    ).status,
    401,
  );
  assert.equal(
    (
      await api("/auth/login", undefined, {
        email: "OWNER@EXAMPLE.TEST",
        password: "a-long-test-password",
      })
    ).status,
    200,
  );
  const stored = JSON.parse(
    await readFile(process.env.EVENTZ_DB_FILE!, "utf8"),
  );
  const hashes = stored.users
    .filter((u: any) => u.role === "member")
    .map((u: any) => u.passwordHash);
  assert.ok(hashes.every((h: string) => h.startsWith("scrypt:")));
  assert.equal(new Set(hashes).size, 4);
});
test("drafts are private; ownership cannot be supplied or transferred by the caller", async () => {
  assert.equal((await api("/events", undefined, eventBody)).status, 401);
  const created = await api("/events", owner, {
    ...eventBody,
    ownerId: other.user.id,
    gateOfficerIds: [other.user.id],
  });
  assert.equal(created.status, 201);
  eventA = created.data;
  assert.equal(eventA.organizer.id, owner.user.id);
  assert.equal(eventA.publicationStatus, "draft");
  assert.ok(
    !(await api("/events")).data.some((event: any) => event.id === eventA.id),
  );
  assert.equal((await api(`/events/${eventA.id}`, other)).status, 404);
  assert.equal((await api(`/events/${eventA.id}`, owner)).status, 200);
  assert.equal(
    (
      await api(
        `/events/${eventA.id}`,
        other,
        { publicationStatus: "published" },
        "PATCH",
      )
    ).status,
    404,
  );
  const published = await api(
    `/events/${eventA.id}`,
    owner,
    { publicationStatus: "published", ownerId: other.user.id },
    "PATCH",
  );
  assert.equal(published.status, 200);
  assert.equal(published.data.organizer.id, owner.user.id);
  const list = await api("/events?q=community&city=douala&category=Community");
  assert.equal(list.status, 200);
  assert.ok(list.data.some((event: any) => event.id === eventA.id));
  assert.equal(
    list.data.find((event: any) => event.id === eventA.id).gateOfficerIds,
    undefined,
  );
  const privateWorkspace = await workspace(eventA, "/event", other);
  assert.equal(privateWorkspace.status, 403);
  const ownWorkspace = await workspace(eventA, "/event", owner);
  assert.equal(ownWorkspace.status, 200, JSON.stringify(ownWorkspace.data));
  assert.equal(ownWorkspace.data.id, eventA.id);
});
test("publishing rejects invalid input, unsafe image URLs, and past events", async () => {
  assert.equal(
    (
      await api("/events", owner, {
        ...eventBody,
        publicationStatus: "published",
        eventDate: "2020-01-01",
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await api("/events", owner, {
        ...eventBody,
        publicationStatus: "published",
        venue: "",
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await api("/events", owner, {
        ...eventBody,
        coverImage: "javascript:alert(1)",
      })
    ).status,
    400,
  );
  assert.equal(
    (await api("/events", owner, { ...eventBody, eventCapacity: 1.2 })).status,
    400,
  );
});
test("unscoped legacy and Vercel-style API paths cannot expose global data", async () => {
  for (const path of [
    "/api/participants",
    "/api/account-management",
    "/api/attendee-requests",
    "/api/export-registry",
    "/api/pass-qr/ETSN-2026-0001-X7K9",
    "/api/account-management.ts",
  ]) {
    assert.equal((await request(path, owner)).status, 404, path);
  }
  assert.equal((await workspace(eventA, "/participants")).status, 401);
});
test("registration is idempotent, capacity is enforced under concurrent requests, and attendee lists are private", async () => {
  const results = await Promise.all(
    Array.from({ length: 4 }, () =>
      api(`/events/${eventA.id}/register`, attendee, {}),
    ),
  );
  assert.ok(
    results.every((result) => result.status === 201),
    JSON.stringify(results),
  );
  assert.equal(
    new Set(results.map((result) => result.data.participant.id)).size,
    1,
  );
  registration = results[0].data;
  assert.equal(
    (await api(`/events/${eventA.id}/register`, other, {})).status,
    409,
  );
  const list = await workspace(eventA, "/participants", owner);
  assert.equal(list.status, 200);
  assert.equal(list.data.length, 1);
  assert.equal(list.data[0].userId, attendee.user.id);
  assert.equal(
    (await workspace(eventA, "/participants", attendee)).status,
    403,
  );
  assert.equal((await api(`/events/${eventA.id}`)).data.attendeeCount, 1);
});
test("two organizer workspaces isolate lists, mutations, pass lookup, exports, and scan logs", async () => {
  const result = await api("/events", other, {
    ...eventBody,
    eventName: "A different gathering",
    publicationStatus: "published",
    eventCapacity: 5,
  });
  assert.equal(result.status, 201);
  eventB = result.data;
  assert.deepEqual((await workspace(eventB, "/participants", other)).data, []);
  const wrongUpdate = await workspace(
    eventB,
    `/participants/${registration.participant.id}`,
    other,
    { fullName: "Hijacked", eventId: eventB.id },
    "PUT",
  );
  assert.equal(wrongUpdate.status, 404);
  assert.equal(
    (
      await workspace(
        eventB,
        `/participants/${registration.participant.id}`,
        other,
        undefined,
        "DELETE",
      )
    ).status,
    404,
  );
  assert.equal(
    (
      await workspace(
        eventB,
        `/pass-qr/${registration.participant.passId}`,
        other,
      )
    ).status,
    404,
  );
  const exportB = await workspace(eventB, "/export-registry?format=csv", other);
  assert.equal(exportB.status, 200);
  assert.ok(!exportB.data.includes("attendee@example.test"));
  const exportA = await workspace(eventA, "/export-registry?format=csv", owner);
  assert.ok(exportA.data.includes("attendee@example.test"));
  assert.equal(
    (
      await workspace(eventB, "/event", other, {
        ownerId: owner.user.id,
        id: eventA.id,
        eventName: "Updated B",
      })
    ).status,
    200,
  );
  assert.equal(
    (await workspace(eventB, "/event", other)).data.ownerId,
    other.user.id,
  );
  assert.equal(
    (await workspace(eventA, "/event", owner)).data.eventName,
    eventBody.eventName,
  );
});
test("saved events and follows persist privately, and organizer profiles do not expose email or hashes", async () => {
  const saved = await api(
    `/me/saved/${eventA.id}`,
    attendee,
    { saved: true },
    "PUT",
  );
  assert.equal(saved.status, 200);
  assert.ok(saved.data.savedEventIds.includes(eventA.id));
  assert.equal((await api("/me/saved", attendee)).data.length, 1);
  assert.equal((await api("/me/saved", other)).data.length, 0);
  assert.equal(
    (
      await api(
        `/organizers/${owner.user.id}/follow`,
        attendee,
        { following: true },
        "PUT",
      )
    ).status,
    200,
  );
  const profile = (await api(`/organizers/${owner.user.id}`)).data.organizer;
  assert.equal(profile.followerCount, 1);
  assert.equal(profile.email, undefined);
  assert.equal(profile.passwordHash, undefined);
});
test("QR passes require ownership and valid signatures; cancellation invalidates existing QR tokens and releases capacity", async () => {
  const id = registration.participant.id;
  const qr = await api(`/passes/${id}/qr`, attendee);
  assert.equal(qr.status, 200);
  assert.match(qr.type, /image\/png/);
  assert.ok(qr.data.length > 100);
  assert.equal((await api(`/passes/${id}/qr`, other)).status, 404);
  const url = new URL(registration.verifyUrl);
  assert.equal(
    (await api(`/verify/${registration.participant.passId}${url.search}`))
      .status,
    200,
  );
  assert.equal(
    (await api(`/verify/${registration.participant.passId}?t=tampered`)).status,
    403,
  );
  assert.equal(
    (await api(`/registrations/${id}`, other, undefined, "DELETE")).status,
    404,
  );
  assert.equal(
    (await api(`/registrations/${id}`, attendee, undefined, "DELETE")).status,
    200,
  );
  assert.equal(
    (await api(`/verify/${registration.participant.passId}${url.search}`))
      .status,
    403,
  );
  assert.equal((await api(`/passes/${id}/qr`, attendee)).status, 409);
  assert.equal((await api(`/events/${eventA.id}`)).data.availableSpots, 1);
  registration = (await api(`/events/${eventA.id}/register`, attendee, {}))
    .data;
  assert.equal(registration.participant.status, "Not Used");
  assert.equal((await api("/me/registrations", attendee)).data.length, 1);
});
test("regenerated passes invalidate old QR tokens while the wallet receives the current pass", async () => {
  const oldUrl = new URL(registration.verifyUrl);
  const regenerated = await workspace(
    eventA,
    `/participants/${registration.participant.id}/regenerate`,
    owner,
    {},
  );
  assert.equal(regenerated.status, 200, JSON.stringify(regenerated.data));
  assert.equal(
    (await api(`/verify/${registration.participant.passId}${oldUrl.search}`))
      .status,
    403,
  );
  const tickets = await api("/me/registrations", attendee);
  registration = tickets.data.find(
    (ticket: any) => ticket.event.id === eventA.id,
  );
  const nextUrl = new URL(registration.verifyUrl);
  assert.equal(
    (await api(`/verify/${registration.participant.passId}${nextUrl.search}`))
      .status,
    200,
  );
});

test("gate assignments are event-specific; gate staff cannot manage events; concurrent claims accept a pass once", async () => {
  const assigned = await workspace(eventA, "/account-management", owner, {
    name: "Gate",
    email: "gate@example.test",
  });
  assert.equal(assigned.status, 201);
  assert.equal((await workspace(eventA, "/event", gate)).status, 200);
  assert.equal((await workspace(eventB, "/event", gate)).status, 403);
  assert.equal(
    (
      await workspace(eventA, "/participants", gate, {
        fullName: "Unauthorized",
      })
    ).status,
    403,
  );
  const token = new URL(registration.verifyUrl).searchParams.get("t");
  const claim = () =>
    workspace(
      eventA,
      `/verify/${registration.participant.passId}/claim`,
      gate,
      { token, checkedInBy: "Gate", localDate: future, direction: "entry" },
    );
  const results = await Promise.all([claim(), claim()]);
  assert.deepEqual(
    results.map((result) => result.status).sort(),
    [200, 409],
    JSON.stringify(results),
  );
  assert.ok((await workspace(eventA, "/scan-logs", owner)).data.length >= 1);
  assert.deepEqual((await workspace(eventB, "/scan-logs", other)).data, []);
  assert.ok(
    (
      await workspace(
        eventA,
        "/export-report?kind=checked-in&format=csv",
        owner,
      )
    ).data.includes("Attendee"),
  );
  assert.ok(
    !(
      await workspace(
        eventA,
        "/export-report?kind=email-logs&format=csv",
        owner,
      )
    ).data.includes("Attendee"),
  );
  assert.equal(
    (
      await api(
        `/registrations/${registration.participant.id}`,
        attendee,
        undefined,
        "DELETE",
      )
    ).status,
    409,
  );
  await workspace(
    eventA,
    "/account-management?id=" + gate.user.id,
    owner,
    undefined,
    "DELETE",
  );
  assert.equal((await workspace(eventA, "/event", gate)).status, 403);
});
test("a cancelled event disappears from discovery and rejects new registrations and gate claims", async () => {
  assert.equal(
    (
      await api(
        `/events/${eventA.id}`,
        owner,
        { publicationStatus: "cancelled" },
        "PATCH",
      )
    ).status,
    200,
  );
  assert.equal(
    (await api(`/events/${eventA.id}/register`, other, {})).status,
    404,
  );
  assert.ok(
    !(await api("/events")).data.some((event: any) => event.id === eventA.id),
  );
  const token = new URL(registration.verifyUrl).searchParams.get("t");
  assert.equal(
    (
      await workspace(
        eventA,
        `/verify/${registration.participant.passId}/claim`,
        owner,
        { token },
      )
    ).status,
    409,
  );
  assert.equal(
    (
      await api(
        `/verify/${registration.participant.passId}?t=${encodeURIComponent(token!)}`,
      )
    ).data.status,
    "Cancelled",
  );
});
test("accounts, ownership, registrations, saves and follows survive a database reload", async () => {
  const { DB } = await import("../src/server/db.js");
  const reloaded = new DB();
  assert.equal((await reloaded.getEvent(eventA.id))?.ownerId, owner.user.id);
  assert.ok(
    (await reloaded.getParticipants()).some(
      (p) => p.userId === attendee.user.id,
    ),
  );
  assert.ok(
    (await reloaded.getUserById(attendee.user.id))?.savedEventIds?.includes(
      eventA.id,
    ),
  );
  assert.ok(
    (
      await reloaded.getUserById(attendee.user.id)
    )?.followedOrganizerIds?.includes(owner.user.id),
  );
});

test("different accounts competing for the last place cannot overbook, including manual additions", async () => {
  const created = await api("/events", owner, {
    ...eventBody,
    publicationStatus: "published",
  });
  assert.equal(created.status, 201);
  const event = created.data;
  const result = await Promise.all([
    api(`/events/${event.id}/register`, owner, {}),
    api(`/events/${event.id}/register`, other, {}),
  ]);
  assert.deepEqual(result.map((item) => item.status).sort(), [201, 409]);
  assert.equal(
    (
      await workspace(event, "/participants", owner, {
        fullName: "One too many",
      })
    ).status,
    409,
  );
  assert.equal(
    (await api(`/events/${event.id}`, owner, { eventCapacity: 0 }, "PATCH"))
      .status,
    400,
  );
});

test("online meeting links are private to the organizer and registered attendees", async () => {
  const created = await api("/events", owner, {
    ...eventBody,
    locationType: "online",
    venue: "https://example.test/private-meeting",
    publicationStatus: "published",
  });
  assert.equal(created.status, 201);
  const id = created.data.id;
  assert.equal((await api(`/events/${id}`)).data.venue, "Online event");
  assert.equal(
    (await api(`/me/events/${id}`, owner)).data.venue,
    "https://example.test/private-meeting",
  );
  const registered = await api(`/events/${id}/register`, other, {});
  assert.equal(registered.status, 201);
  assert.equal(
    registered.data.event.venue,
    "https://example.test/private-meeting",
  );
  assert.equal((await api(`/me/events/${id}`, other)).status, 404);
});

test("legacy Vercel function entrypoints also reject direct calls without an event scope", async () => {
  const { default: legacyHandler } = await import(
    "../api/account-management.js"
  );
  let code = 0,
    data: any;
  const response = {
    status(value: number) {
      code = value;
      return this;
    },
    json(value: any) {
      data = value;
    },
  };
  await legacyHandler({ method: "GET" }, response);
  assert.equal(code, 404);
  assert.equal(data.error, "Use the authenticated event workspace API.");
});
