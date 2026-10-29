import express from "express";
import * as XLSX from "xlsx";
import { db } from "./db.js";
import { currentEventId, eventScope } from "./event-scope.js";
import {
  asyncRoute,
  account,
  fail,
  safeUser,
  profileImage,
} from "./platform-router.js";
import { UserRole, PassStatus } from "../types.js";
import passQr from "../../api/pass-qr.js";
import claimPass from "../../api/claim-pass.js";
import regeneratePass from "../../api/regenerate-pass.js";
import participantEmail from "../../api/participant-email.js";
import bulkEmail from "../../api/bulk-email.js";

export const workspaceRouter = express.Router();
workspaceRouter.get(
  "/pass-qr/:passId",
  asyncRoute((req, res) => {
    req.query.passId = req.params.passId;
    return passQr(req, res);
  }),
);
workspaceRouter.post(
  "/verify/:passId/claim",
  asyncRoute((req, res) => {
    req.query.passId = req.params.passId;
    return claimPass(req, res);
  }),
);
workspaceRouter.post(
  "/participants/:id/regenerate",
  asyncRoute((req, res) => {
    req.query.id = req.params.id;
    return regeneratePass(req, res);
  }),
);
workspaceRouter.post("/participants/bulk-email", asyncRoute(bulkEmail));
workspaceRouter.post(
  "/participants/:id/email",
  asyncRoute((req, res) => {
    req.query.id = req.params.id;
    return participantEmail(req, res);
  }),
);
workspaceRouter.get(
  "/attendee-requests",
  asyncRoute(async (req, res) => {
    const participants = await db.getParticipants();
    res.json(
      participants
        .filter((p) => p.userId)
        .map((p) => ({
          ...p,
          status: p.status === PassStatus.CANCELLED ? "cancelled" : "approved",
          categoryName: p.category,
        })),
    );
  }),
);
workspaceRouter.get(
  "/account-management",
  asyncRoute(async (req, res) => {
    const event = await db.getEvent();
    const user = await account(req);
    const ids = new Set([event!.ownerId, ...(event!.gateOfficerIds || [])]);
    const users = (await db.getUsers()).filter(
      (other) =>
        ids.has(other.id) &&
        (eventScope.getStore()?.role === "admin" || other.id === user.id),
    );
    res.json(
      users.map((other) => ({
        id: other.id,
        name: other.name,
        email: other.email,
        profileImage: other.profileImage,
        createdAt: other.createdAt,
        role:
          other.id === event!.ownerId ? UserRole.ADMIN : UserRole.GATE_OFFICER,
      })),
    );
  }),
);
workspaceRouter.put(
  "/account-management",
  asyncRoute(async (req, res) => {
    const user = await account(req);
    if (req.body.id !== user.id)
      fail(403, "You can only update your own profile.");
    if (
      req.body.password ||
      (req.body.email && req.body.email.toLowerCase() !== user.email)
    )
      fail(
        400,
        "Email and password changes are not available in this workspace.",
      );
    const updated = await db.updateUser(user.id, {
      name: String(req.body.name || user.name)
        .trim()
        .slice(0, 100),
      profileImage: profileImage(req.body.profileImage || req.body.avatarUrl),
    });
    res.json({ ...safeUser(updated), role: eventScope.getStore()!.role });
  }),
);
workspaceRouter.post(
  "/account-management",
  asyncRoute(async (req, res) => {
    const event = await db.getEvent();
    const email = String(req.body.email || "")
        .trim()
        .toLowerCase(),
      name = String(req.body.name || "")
        .trim()
        .slice(0, 100);
    if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      fail(400, "Enter a name and valid email.");
    let user = await db.getUserByEmail(email);
    if (!user) {
      if (
        typeof req.body.password !== "string" ||
        req.body.password.length < 10 ||
        req.body.password.length > 128
      )
        fail(
          400,
          "Use a password of 10–128 characters for a new gate account.",
        );
      user = await db.createUser(
        { name, email, role: UserRole.GATE_OFFICER },
        req.body.password,
      );
    }
    if (user.id === event!.ownerId)
      fail(400, "The organizer already has gate access.");
    await db.updateEvent(event!.id, {
      gateOfficerIds: [...new Set([...(event!.gateOfficerIds || []), user.id])],
    });
    res.status(201).json({ ...safeUser(user), role: UserRole.GATE_OFFICER });
  }),
);
workspaceRouter.delete(
  "/account-management",
  asyncRoute(async (req, res) => {
    const event = await db.getEvent();
    await db.updateEvent(event!.id, {
      gateOfficerIds: (event!.gateOfficerIds || []).filter(
        (id) => id !== req.query.id,
      ),
    });
    res.json({ success: true });
  }),
);
const escape = (value: unknown) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (value) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        value
      ]!,
  );
for (const kind of ["export-registry", "export-report"]) {
  workspaceRouter.get(
    `/${kind}`,
    asyncRoute(async (req, res) => {
      const event = await db.getEvent();
      const rows =
        kind === "export-registry" ||
        req.query.kind === "roster" ||
        req.query.kind === "checked-in"
          ? (await db.getParticipants())
              .filter(
                (p) =>
                  req.query.kind !== "checked-in" ||
                  p.status === PassStatus.USED,
              )
              .map((p) => ({
                Name: p.fullName,
                Email: p.email,
                Category: p.category,
                Pass: p.passId,
                Status: p.status,
              }))
          : req.query.kind === "email-logs"
            ? (await db.getEmailLogs()).map((log) => ({
                Name: log.participantName,
                Email: log.recipientEmail,
                Subject: log.subject,
                Status: log.status,
                Time: log.sentAt,
              }))
            : (await db.getScanLogs()).map((log) => ({
                Name: log.participantName,
                Pass: log.passId,
                Result: log.scanResult,
                Gate: log.scannedBy,
                Time: log.createdAt,
              }));
      const safeRows = rows.map((row) =>
        Object.fromEntries(
          Object.entries(row).map(([key, value]) => [
            key,
            /^[=+@\-\t\r]/.test(String(value)) ? `'${value}` : value,
          ]),
        ),
      );
      const sheet = XLSX.utils.json_to_sheet(safeRows);
      if (req.query.format === "pdf") {
        const table = `<table><tr>${Object.keys(safeRows[0] || {})
          .map((key) => `<th>${escape(key)}</th>`)
          .join("")}</tr>${safeRows
          .map(
            (row) =>
              `<tr>${Object.values(row)
                .map((value) => `<td>${escape(value)}</td>`)
                .join("")}</tr>`,
          )
          .join("")}</table>`;
        res
          .type("html")
          .send(
            `<!doctype html><html><head><meta charset="utf-8"><title>${escape(event!.eventName)}</title><style>body{font:14px system-ui;padding:32px}table{border-collapse:collapse;width:100%}td,th{padding:10px;border:1px solid #ddd;text-align:left}@media print{button{display:none}}</style></head><body><h1>${escape(event!.eventName)}</h1><p>EVENTZ · ${escape(kind)}</p><button onclick="window.print()">Print / Save as PDF</button>${table}</body></html>`,
          );
      } else if (req.query.format === "xlsx") {
        const book = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(book, sheet, "Event");
        res
          .attachment(`${kind}.xlsx`)
          .send(XLSX.write(book, { type: "buffer", bookType: "xlsx" }));
      } else
        res
          .attachment(`${kind}.csv`)
          .type("text/csv")
          .send(XLSX.utils.sheet_to_csv(sheet));
    }),
  );
}
