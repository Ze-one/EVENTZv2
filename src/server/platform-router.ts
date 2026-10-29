import express from "express";
import crypto from "node:crypto";
import QRCode from "qrcode";
import { db } from "./db.js";
import { createSessionToken, requireSession } from "./session-auth.js";
import { withEventLock } from "./event-scope.js";
import {
  buildSignedVerifyUrl,
  verifySignedPassToken,
} from "./pass-security.js";
import {
  PassStatus,
  UserRole,
  type EventDetails,
  type User,
} from "../types.js";
import type { PublicEvent, Organizer } from "../platform/types.js";

export const asyncRoute =
  (handler: any): express.RequestHandler =>
  (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
export const fail = (status: number, message: string): never => {
  throw Object.assign(new Error(message), { status });
};
export const safeUser = ({ passwordHash, ...user }: User) => user;
export async function account(req: express.Request) {
  const auth = requireSession(req);
  if (!auth.ok) return fail(auth.status, auth.error);
  return (
    (await db.getUserById(auth.session.userId)) ||
    fail(401, "Your account is no longer available. Sign in again.")
  );
}
export async function ownedEvent(
  req: express.Request,
  user: User,
  eventId: string,
) {
  const event = await db.getEvent(eventId);
  if (!event || event.ownerId !== user.id) return fail(404, "Event not found.");
  return event;
}
const text = (value: unknown, max = 200) =>
  typeof value === "string" ? value.trim().slice(0, max) : "";
const today = () => new Date().toISOString().slice(0, 10);
function validDate(value: string) {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value
  );
}
export function imageUrl(value: unknown) {
  const url = text(value, 2000);
  if (!url || /^\/assets\/[\w./-]+$/.test(url)) return url;
  try {
    if (new URL(url).protocol === "https:") return url;
  } catch {}
  return fail(400, "Use an HTTPS image URL or leave the image empty.");
}
export function profileImage(value: unknown) {
  if (
    typeof value === "string" &&
    value.length <= 900000 &&
    /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/.test(value)
  )
    return value;
  return imageUrl(value);
}
export async function publicOrganizer(user: User): Promise<Organizer> {
  const users = await db.getUsers();
  return {
    id: user.id,
    name: user.name,
    bio: user.bio || "",
    profileImage: user.profileImage || "",
    followerCount: users.filter((other) =>
      other.followedOrganizerIds?.includes(user.id),
    ).length,
  };
}
export async function publicEvent(
  event: EventDetails,
  includeOnlineLink = false,
): Promise<PublicEvent> {
  const owner = event.ownerId ? await db.getUserById(event.ownerId) : undefined;
  const count = (await db.getParticipants()).filter(
    (p) => p.eventId === event.id && p.status !== PassStatus.CANCELLED,
  ).length;
  return {
    id: event.id,
    eventName: event.eventName,
    eventDate: event.eventDate,
    eventTime: event.eventTime,
    venue:
      event.locationType === "online" && !includeOnlineLink
        ? "Online event"
        : event.venue,
    description: event.description,
    organizerName: owner?.name || event.organizerName,
    category: event.category || "Community",
    city: event.city || "",
    coverImage: event.coverImage || "",
    locationType: event.locationType || "in_person",
    timezone: event.timezone || "UTC",
    publicationStatus: event.publicationStatus || "draft",
    eventCapacity: event.eventCapacity || null,
    registrationEnabled: event.registrationEnabled !== false,
    registrationDeadline: event.registrationDeadline || null,
    createdAt: event.createdAt,
    attendeeCount: count,
    availableSpots: event.eventCapacity
      ? Math.max(0, event.eventCapacity - count)
      : null,
    organizer: owner
      ? await publicOrganizer(owner)
      : {
          id: "",
          name: event.organizerName,
          bio: "",
          profileImage: "",
          followerCount: 0,
        },
  };
}
const categories = [
  "Technology",
  "Music",
  "Business",
  "Arts & Culture",
  "Food & Drink",
  "Sports & Wellness",
  "Community",
  "Education",
];
export function eventInput(body: any, previous?: EventDetails) {
  const input = { ...previous, ...body };
  const eventName = text(input.eventName, 140);
  const eventDate = text(input.eventDate, 10);
  const eventTime = text(input.eventTime, 5);
  const locationType = input.locationType === "online" ? "online" : "in_person";
  const venue = text(input.venue, 300);
  const city = text(input.city, 100);
  const description = text(input.description, 10000);
  const publicationStatus = input.publicationStatus || "draft";
  if (!eventName) fail(400, "Give your event a name.");
  if (!["draft", "published", "cancelled"].includes(publicationStatus))
    fail(400, "Invalid event status.");
  if (eventDate && !validDate(eventDate))
    fail(400, "Choose a valid event date.");
  if (eventTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(eventTime))
    fail(400, "Choose a valid start time.");
  if (
    publicationStatus === "published" &&
    (!eventDate ||
      !eventTime ||
      !venue ||
      !description ||
      (locationType === "in_person" && !city))
  )
    fail(
      400,
      "Add a date, start time, description, and location before publishing.",
    );
  if (publicationStatus === "published" && eventDate < today())
    fail(400, "Choose today or a future date before publishing.");
  const capacity =
    input.eventCapacity == null || input.eventCapacity === ""
      ? null
      : Number(input.eventCapacity);
  if (
    capacity !== null &&
    (!Number.isSafeInteger(capacity) || capacity < 1 || capacity > 1000000)
  )
    fail(400, "Capacity must be a whole number between 1 and 1,000,000.");
  const deadline = text(input.registrationDeadline, 10) || null;
  if (deadline && (!validDate(deadline) || (eventDate && deadline > eventDate)))
    fail(400, "Registration deadline must be on or before the event date.");
  const timezone = text(input.timezone, 80) || "UTC";
  try {
    new Intl.DateTimeFormat("en", { timeZone: timezone });
  } catch {
    fail(400, "Choose a valid timezone.");
  }
  if (locationType === "online" && venue && !/^https:\/\//i.test(venue))
    fail(400, "Use an HTTPS meeting link for an online event.");
  return {
    eventName,
    eventDate,
    eventTime,
    venue,
    city,
    description,
    locationType,
    publicationStatus,
    eventCapacity: capacity,
    registrationDeadline: deadline,
    timezone,
    category: categories.includes(input.category)
      ? input.category
      : "Community",
    coverImage: imageUrl(input.coverImage),
    registrationEnabled: input.registrationEnabled !== false,
  } as const;
}
function origin(req: express.Request) {
  return (
    process.env.APP_BASE_URL || `${req.protocol}://${req.get("host")}`
  ).replace(/\/$/, "");
}
// A bounded in-process guard complements deployment-level rate limiting.
const attempts = new Map<string, { count: number; until: number }>();
function authLimit(req: express.Request) {
  const key = `${req.ip}:${text(req.body?.email).toLowerCase()}`;
  const now = Date.now();
  for (const [key, value] of attempts)
    if (value.until < now) attempts.delete(key);
  const entry = attempts.get(key) || { count: 0, until: now + 15 * 60 * 1000 };
  if (++entry.count > 20)
    fail(429, "Too many attempts. Please try again in 15 minutes.");
  if (attempts.size > 10000) attempts.delete(attempts.keys().next().value!);
  attempts.set(key, entry);
}
export const platformRouter = express.Router();
const get = (path: string, handler: any) =>
  platformRouter.get(path, asyncRoute(handler));
const post = (path: string, handler: any) =>
  platformRouter.post(path, asyncRoute(handler));
const put = (path: string, handler: any) =>
  platformRouter.put(path, asyncRoute(handler));

post("/auth/register", async (req, res) => {
  authLimit(req);
  const name = text(req.body?.name, 100),
    email = text(req.body?.email, 254).toLowerCase();
  const password = req.body?.password;
  if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    fail(400, "Enter your name and a valid email address.");
  if (
    typeof password !== "string" ||
    password.length < 10 ||
    password.length > 128
  )
    fail(400, "Use a password between 10 and 128 characters.");
  const user = await withEventLock(`account:${email}`, async () => {
    if (await db.getUserByEmail(email))
      fail(409, "An account with this email already exists. Sign in instead.");
    return db.createUser({ name, email, role: UserRole.MEMBER }, password);
  });
  res
    .status(201)
    .json({ user: safeUser(user), sessionToken: createSessionToken(user) });
});
post("/auth/login", async (req, res) => {
  authLimit(req);
  if (typeof req.body?.password !== "string" || req.body.password.length > 128)
    fail(400, "Enter your email and password.");
  const user = await db.verifyUser(
    text(req.body.email, 254).toLowerCase(),
    req.body.password,
  );
  if (!user) fail(401, "Invalid email or password.");
  res.json({ user: safeUser(user), sessionToken: createSessionToken(user) });
});
get("/me", async (req, res) => res.json(safeUser(await account(req))));
platformRouter.patch(
  "/me",
  asyncRoute(async (req, res) => {
    const user = await account(req);
    const name = text(req.body?.name, 100);
    if (!name) fail(400, "Your name is required.");
    res.json(
      safeUser(
        await db.updateUser(user.id, {
          name,
          bio: text(req.body.bio, 600),
          profileImage: profileImage(req.body.profileImage),
        }),
      ),
    );
  }),
);
get("/events", async (req, res) => {
  const q = text(req.query.q).toLowerCase(),
    category = text(req.query.category),
    city = text(req.query.city).toLowerCase(),
    date = text(req.query.date, 10);
  const events = (await db.getEvents())
    .filter(
      (event) =>
        event.publicationStatus === "published" &&
        (!date ? event.eventDate >= today() : event.eventDate === date) &&
        (!category || event.category === category) &&
        (!city || event.city?.toLowerCase().includes(city)) &&
        (!q ||
          [
            event.eventName,
            event.description,
            event.city,
            event.organizerName,
          ].some((value) =>
            String(value || "")
              .toLowerCase()
              .includes(q),
          )),
    )
    .sort((a, b) =>
      `${a.eventDate}T${a.eventTime}`.localeCompare(
        `${b.eventDate}T${b.eventTime}`,
      ),
    );
  res.json(await Promise.all(events.map((event) => publicEvent(event))));
});
get("/events/:eventId", async (req, res) => {
  const event = await db.getEvent(req.params.eventId);
  if (!event) fail(404, "Event not found.");
  if (event.publicationStatus !== "published") {
    const user = await account(req);
    if (
      event.ownerId !== user.id &&
      !(
        event.publicationStatus === "cancelled" &&
        (await db.getParticipants()).some(
          (p) => p.eventId === event.id && p.userId === user.id,
        )
      )
    )
      fail(404, "Event not found.");
  }
  res.json(await publicEvent(event));
});
post("/events", async (req, res) => {
  const user = await account(req),
    now = new Date().toISOString();
  const fields = eventInput(req.body);
  const event = await db.createEvent({
    ...fields,
    id: `event-${crypto.randomUUID()}`,
    ownerId: user.id,
    organizerName: user.name,
    gateOfficerIds: [],
    passTitle: "EVENT PASS",
    accessInstruction: "Present this QR pass at the entrance.",
    footerNote: "See you there. Powered by EVENTZ.",
    logoPath: "",
    primaryColor: "#102f2a",
    accentColor: "#d7ff6b",
    showPhone: false,
    showEmail: false,
    showCategory: true,
    showOrganization: false,
    createdAt: now,
    updatedAt: now,
  });
  res.status(201).json(await publicEvent(event));
});
platformRouter.patch(
  "/events/:eventId",
  asyncRoute(async (req, res) => {
    const user = await account(req);
    const updated = await withEventLock(req.params.eventId, async () => {
      const event = await ownedEvent(req, user, req.params.eventId);
      const fields = eventInput(req.body, event);
      const count = (await db.getParticipants()).filter(
        (p) => p.eventId === event.id && p.status !== PassStatus.CANCELLED,
      ).length;
      if (fields.eventCapacity && fields.eventCapacity < count)
        fail(
          409,
          "Capacity cannot be below the number of registered attendees.",
        );
      return db.updateEvent(event.id, { ...fields, organizerName: user.name });
    });
    res.json(await publicEvent(updated));
  }),
);
get("/me/events/:eventId", async (req, res) => {
  const user = await account(req);
  res.json(
    await publicEvent(await ownedEvent(req, user, req.params.eventId), true),
  );
});
get("/me/events", async (req, res) => {
  const user = await account(req);
  const events = (await db.getEvents()).filter(
    (event) =>
      event.ownerId === user.id || event.gateOfficerIds?.includes(user.id),
  );
  res.json(
    await Promise.all(
      events.map(async (event) => ({
        ...(await publicEvent(event)),
        accessRole: event.ownerId === user.id ? "admin" : "gate_officer",
      })),
    ),
  );
});
get("/me/registrations", async (req, res) => {
  const user = await account(req),
    allEvents = await db.getEvents();
  const registrations = (await db.getParticipants()).filter(
    (p) => p.userId === user.id,
  );
  res.json(
    await Promise.all(
      registrations.map(async (participant) => ({
        participant,
        event: await publicEvent(
          allEvents.find((event) => event.id === participant.eventId)!,
          true,
        ),
        verifyUrl: buildSignedVerifyUrl(origin(req), participant),
      })),
    ),
  );
});
post("/events/:eventId/register", async (req, res) => {
  const user = await account(req);
  const result = await withEventLock(req.params.eventId, async () => {
    const event = await db.getEvent(req.params.eventId);
    if (!event || event.publicationStatus !== "published")
      fail(404, "Event not found.");
    if (
      event.eventDate < today() ||
      (event.registrationDeadline && event.registrationDeadline < today())
    )
      fail(409, "Registration has closed for this event.");
    const participant = await db.registerForEvent(event, user);
    return {
      participant,
      event: await publicEvent(event, true),
      verifyUrl: buildSignedVerifyUrl(origin(req), participant),
    };
  });
  res.status(201).json(result);
});
platformRouter.delete(
  "/registrations/:id",
  asyncRoute(async (req, res) => {
    const user = await account(req);
    const participant = await db.getParticipantById(req.params.id);
    if (!participant || participant.userId !== user.id)
      fail(404, "Registration not found.");
    await withEventLock(participant.eventId, async () => {
      const fresh = await db.getParticipantById(participant.id);
      if (
        fresh?.status === PassStatus.USED ||
        Number(fresh?.accessCount || 0) > 0
      )
        fail(409, "A pass that has been used cannot be cancelled.");
      if (
        !fresh ||
        !(await db.transitionParticipant(
          { ...fresh },
          {
            status: PassStatus.CANCELLED,
            passVersion: (fresh.passVersion || 1) + 1,
          },
        ))
      )
        fail(
          409,
          "This pass changed while you were cancelling. Refresh and try again.",
        );
    });
    res.json({ success: true });
  }),
);
put("/me/saved/:eventId", async (req, res) => {
  if (typeof req.body?.saved !== "boolean")
    fail(400, "Specify whether to save this event.");
  await withEventLock(`user:${(await account(req)).id}`, async () => {
    const user = await account(req),
      event = await db.getEvent(req.params.eventId);
    if (req.body.saved && (!event || event.publicationStatus !== "published"))
      fail(404, "Event not found.");
    const ids = new Set(user.savedEventIds || []);
    req.body.saved
      ? ids.add(req.params.eventId)
      : ids.delete(req.params.eventId);
    res.json(
      safeUser(await db.updateUser(user.id, { savedEventIds: [...ids] })),
    );
  });
});
get("/me/saved", async (req, res) => {
  const user = await account(req);
  res.json(
    await Promise.all(
      (await db.getEvents())
        .filter(
          (event) =>
            event.publicationStatus === "published" &&
            user.savedEventIds?.includes(event.id),
        )
        .map((event) => publicEvent(event)),
    ),
  );
});
get("/organizers/:id", async (req, res) => {
  const user = await db.getUserById(req.params.id);
  if (!user) fail(404, "Organizer not found.");
  const events = (await db.getEvents()).filter(
    (event) =>
      event.ownerId === user.id && event.publicationStatus === "published",
  );
  res.json({
    organizer: await publicOrganizer(user),
    events: await Promise.all(events.map((event) => publicEvent(event))),
  });
});
put("/organizers/:id/follow", async (req, res) => {
  if (typeof req.body?.following !== "boolean")
    fail(400, "Specify whether to follow this organizer.");
  const initial = await account(req);
  await withEventLock(`user:${initial.id}`, async () => {
    const user = await account(req);
    if (!(await db.getUserById(req.params.id)) || req.params.id === user.id)
      fail(400, "Choose another organizer to follow.");
    const ids = new Set(user.followedOrganizerIds || []);
    req.body.following ? ids.add(req.params.id) : ids.delete(req.params.id);
    res.json(
      safeUser(
        await db.updateUser(user.id, { followedOrganizerIds: [...ids] }),
      ),
    );
  });
});
get("/passes/:id/qr", async (req, res) => {
  const user = await account(req),
    participant = await db.getParticipantById(req.params.id);
  if (!participant || participant.userId !== user.id)
    fail(404, "Pass not found.");
  if (participant.status === PassStatus.CANCELLED)
    fail(409, "This pass has been cancelled.");
  res.type("png").send(
    await QRCode.toBuffer(buildSignedVerifyUrl(origin(req), participant), {
      width: 420,
      margin: 2,
    }),
  );
});
get("/verify/:passId", async (req, res) => {
  const token = text(req.query.t, 2000),
    verified = verifySignedPassToken(token);
  if (!verified.valid)
    fail(403, "This QR signature is invalid or has expired.");
  const participant = await db.getParticipantByPassId(req.params.passId);
  if (
    !participant ||
    verified.payload?.participantId !== participant.id ||
    verified.payload.eventId !== participant.eventId ||
    verified.payload.passId !== participant.passId ||
    verified.payload.passVersion !== (participant.passVersion || 1)
  )
    fail(403, "This pass is no longer valid.");
  const event = await db.getEvent(participant.eventId);
  res.json({
    name: participant.fullName,
    eventName: event?.eventName,
    status:
      event?.publicationStatus === "cancelled"
        ? PassStatus.CANCELLED
        : participant.status,
    message:
      "Gate staff must scan this pass in the event workspace to record entry.",
  });
});
