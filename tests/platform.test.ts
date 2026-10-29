import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, isAbsolute } from "node:path";
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

test("cover images upload from a device, persist on events, and remain publicly readable", async () => {
  const image = await readFile(
    join(process.cwd(), "public/assets/eventz-official-logo.png"),
  );
  const upload = await fetch(base + "/api/platform/uploads/cover", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${owner.sessionToken}`,
      "Content-Type": "image/png",
    },
    body: new Uint8Array(image),
  });
  assert.equal(upload.status, 201, await upload.clone().text());
  const cover = await upload.json();
  const { CoverStorage } = await import("../src/server/cover-storage.js");
  const { db } = await import("../src/server/db.js");
  const relativeStorage = new CoverStorage(
    null,
    relative(process.cwd(), db.uploadDirectory),
  );
  assert.ok(
    isAbsolute(await relativeStorage.localFile(cover.url.split("/").pop())),
  );
  assert.equal(cover.width, 1663);
  assert.equal(cover.height, 488);
  assert.match(
    cover.url,
    /^\/api\/platform\/media\/covers\/[a-f0-9-]{36}\.png$/,
  );
  const downloaded = await fetch(base + cover.url);
  assert.equal(downloaded.status, 200);
  assert.match(downloaded.headers.get("content-type")!, /image\/png/);
  assert.match(downloaded.headers.get("cache-control")!, /immutable/);
  assert.equal(downloaded.headers.get("x-content-type-options"), "nosniff");
  assert.deepEqual(Buffer.from(await downloaded.arrayBuffer()), image);
  const created = await api("/events", owner, {
    ...eventBody,
    coverImage: cover.url,
    publicationStatus: "published",
  });
  assert.equal(created.status, 201);
  assert.equal(created.data.coverImage, cover.url);
  assert.equal(
    (await api(`/events/${created.data.id}`)).data.coverImage,
    cover.url,
  );
});

test("cover uploads reject unauthenticated, oversized and disguised non-image files", async () => {
  const raw = async (image: Uint8Array, signedIn = true) =>
    fetch(base + "/api/platform/uploads/cover", {
      method: "POST",
      headers: {
        "Content-Type": "image/png",
        ...(signedIn ? { Authorization: `Bearer ${owner.sessionToken}` } : {}),
      },
      body: image,
    });
  assert.equal((await raw(new Uint8Array([1, 2, 3]), false)).status, 401);
  const disguised = await raw(
    new TextEncoder().encode(
      '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><script>alert(1)</script></svg>',
    ),
  );
  assert.equal(disguised.status, 415);
  assert.equal((await raw(new Uint8Array(3 * 1024 * 1024 + 1))).status, 413);
  assert.equal(
    (await request("/api/platform/media/covers/not-an-image")).status,
    404,
  );
});

test("database readiness returns 503 for an outdated schema while liveness stays available", async (t) => {
  const { db } = await import("../src/server/db.js");
  const { databaseFailure } = await import("../src/server/errors.js");
  assert.equal((await request('/api/ready')).data.database, 'ready');
  t.mock.method(console, 'error', () => {});
  const failure = t.mock.method(db, 'checkReadiness', async () => {
    throw databaseFailure({ code: 'PGRST204', message: 'Private provider diagnostic' }, 'readiness.events');
  });
  const result = await request('/api/ready');
  assert.equal(result.status, 503);
  assert.equal(result.data.code, 'DATABASE_SCHEMA_OUTDATED');
  assert.doesNotMatch(JSON.stringify(result.data), /Private provider/);
  assert.equal((await request('/api/health')).data.ok, true);
  failure.mock.restore();
  assert.equal((await request('/api/ready')).status, 200);
});

test("publishing returns a specific database-migration error without leaking provider details", async (t) => {
  const { db } = await import("../src/server/db.js");
  const { databaseFailure } = await import("../src/server/errors.js");
  const logs: unknown[] = [];
  t.mock.method(console, "error", (...args: unknown[]) => logs.push(args));
  const beforeCount = (await db.getEvents()).length;
  const failure = t.mock.method(db, "createEvent", async () => {
    throw databaseFailure(
      {
        code: "PGRST204",
        message:
          "A private diagnostic containing a token must never be returned",
      },
      "createEvent",
    );
  });
  const response = await api("/events", owner, {
    ...eventBody,
    publicationStatus: "published",
  });
  failure.mock.restore();
  assert.equal(response.status, 503);
  assert.equal(response.data.code, "DATABASE_SCHEMA_OUTDATED");
  assert.match(response.data.error, /database migration/i);
  assert.ok(response.data.requestId);
  assert.doesNotMatch(
    JSON.stringify(response.data) + JSON.stringify(logs),
    /private diagnostic|containing a token/,
  );
  assert.equal((await db.getEvents()).length, beforeCount);
});

test("a metadata failure happens before event persistence rather than creating an event and reporting failure", async (t) => {
  const { db } = await import("../src/server/db.js");
  t.mock.method(console, "error", () => {});
  const beforeCount = (await db.getEvents()).length;
  const failure = t.mock.method(db, "getParticipants", async () => {
    throw new Error("Simulated read failure");
  });
  const response = await api("/events", owner, {
    ...eventBody,
    publicationStatus: "published",
  });
  failure.mock.restore();
  assert.equal(response.status, 500);
  assert.equal(response.data.code, "REQUEST_FAILED");
  assert.equal((await db.getEvents()).length, beforeCount);
});

test("Supabase provider errors retain their codes through the real database adapter", async () => {
  const { createClient } = await import("@supabase/supabase-js");
  const { DB, db } = await import("../src/server/db.js");
  const { AppError } = await import("../src/server/errors.js");
  const fixture = (await db.getEvents())[0];
  for (const [providerCode, expectedCode] of [
    ["PGRST204", "DATABASE_SCHEMA_OUTDATED"],
    ["42501", "DATABASE_ACCESS_DENIED"],
  ]) {
    const client = createClient(
      "https://database.example.test",
      "test-only-key",
      {
        global: {
          fetch: async () =>
            new Response(
              JSON.stringify({
                code: providerCode,
                message: "Provider-only diagnostic",
              }),
              { status: 400, headers: { "Content-Type": "application/json" } },
            ),
        },
      },
    );
    const isolated = new DB({ client });
    await assert.rejects(
      isolated.createEvent(fixture),
      (error) =>
        error instanceof AppError &&
        error.status === 503 &&
        error.code === expectedCode,
    );
  }
});

test("Supabase covers prepare a dedicated public bucket and use unique owner-scoped objects", async () => {
  const { createClient } = await import("@supabase/supabase-js");
  const { CoverStorage } = await import("../src/server/cover-storage.js");
  const image = await readFile(
    join(process.cwd(), "public/assets/eventz-official-logo.png"),
  );
  const requests: { method: string; path: string }[] = [];
  let bucketExists = false;
  const client = createClient("https://storage.example.test", "test-only-key", {
    global: {
      fetch: async (input, options) => {
        const url = new URL(String(input)),
          method = options?.method || "GET";
        requests.push({ method, path: url.pathname });
        if (url.pathname.endsWith("/bucket/eventz-covers"))
          return new Response(
            JSON.stringify(
              bucketExists
                ? { id: "eventz-covers", name: "eventz-covers", public: true }
                : {
                    message: "Bucket not found",
                    statusCode: "404",
                    error: "NotFound",
                  },
            ),
            {
              status: bucketExists ? 200 : 404,
              headers: { "Content-Type": "application/json" },
            },
          );
        if (url.pathname.endsWith("/bucket") && method === "POST") {
          bucketExists = true;
          return new Response(JSON.stringify({ name: "eventz-covers" }), {
            headers: { "Content-Type": "application/json" },
          });
        }
        if (url.pathname.includes("/object/"))
          return new Response(
            JSON.stringify({ Key: url.pathname.split("/object/")[1] }),
            { headers: { "Content-Type": "application/json" } },
          );
        throw new Error("Unexpected storage request");
      },
    },
  });
  const storage = new CoverStorage(client, join(directory, "unused"));
  const first = await storage.upload(owner.user.id, image),
    second = await storage.upload(owner.user.id, image);
  assert.match(
    first.url,
    new RegExp(`/storage/v1/object/public/eventz-covers/${owner.user.id}/`),
  );
  assert.notEqual(first.url, second.url);
  assert.equal(
    requests.filter(
      (request) =>
        request.path.endsWith("/bucket") && request.method === "POST",
    ).length,
    1,
  );
});

test("cover upload never makes an existing private storage bucket public", async () => {
  const { createClient } = await import("@supabase/supabase-js");
  const { CoverStorage } = await import("../src/server/cover-storage.js");
  const { AppError } = await import("../src/server/errors.js");
  const image = await readFile(
    join(process.cwd(), "public/assets/eventz-official-logo.png"),
  );
  const client = createClient("https://storage.example.test", "test-only-key", {
    global: {
      fetch: async (_input, options) => {
        assert.equal(options?.method || "GET", "GET");
        return new Response(
          JSON.stringify({ id: "eventz-covers", public: false }),
          { headers: { "Content-Type": "application/json" } },
        );
      },
    },
  });
  await assert.rejects(
    new CoverStorage(client, join(directory, "unused")).upload(
      owner.user.id,
      image,
    ),
    (error) =>
      error instanceof AppError && error.code === "COVER_STORAGE_CONFIGURATION",
  );
});
