import crypto from "node:crypto";
import type { ErrorRequestHandler } from "express";

export class AppError extends Error {
  constructor(
    public status: number,
    message: string,
    public code: string,
    public context: Record<string, string> = {},
  ) {
    super(message);
    this.name = "AppError";
  }
}

export function databaseFailure(
  error: { code?: string; message?: string },
  operation = "database_request",
) {
  const providerCode = String(error.code || "UNKNOWN")
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .slice(0, 50);
  const context = { operation, providerCode };
  if (
    ["42703", "42P01", "42883", "PGRST202", "PGRST204", "PGRST205"].includes(
      providerCode,
    )
  ) {
    return new AppError(
      503,
      "The platform database needs the event-platform update before this can be saved. Ask the site administrator to apply the EVENTZ database migration, then try again.",
      "DATABASE_SCHEMA_OUTDATED",
      context,
    );
  }
  if (
    ["42501", "PGRST301", "PGRST302", "PGRST303", "28000", "28P01"].includes(
      providerCode,
    )
  ) {
    return new AppError(
      503,
      "The platform cannot access its database. The site administrator needs to check the server database credentials and permissions.",
      "DATABASE_ACCESS_DENIED",
      context,
    );
  }
  if (providerCode === "23505")
    return new AppError(
      409,
      "This record already exists. Refresh the page before trying again.",
      "DUPLICATE_RECORD",
      context,
    );
  if (providerCode === "23503")
    return new AppError(
      409,
      "A related record has changed. Refresh the page and try again.",
      "RELATED_RECORD_CHANGED",
      context,
    );
  if (
    providerCode === "P0001" &&
    [
      "Registration is closed.",
      "This event has reached capacity.",
      "Account not found.",
    ].includes(error.message || "")
  )
    return new AppError(409, error.message!, "EVENT_UNAVAILABLE", context);
  if (["23502", "23514", "22P02", "42804"].includes(providerCode))
    return new AppError(
      503,
      "The database could not accept the event details. The site administrator needs to check the event-platform database update.",
      "DATABASE_SCHEMA_INCOMPATIBLE",
      context,
    );
  return new AppError(
    503,
    "The database is temporarily unavailable. Your changes have not been confirmed saved; please try again shortly.",
    "DATABASE_UNAVAILABLE",
    context,
  );
}

export const apiErrorHandler: ErrorRequestHandler = (
  error,
  _req,
  res,
  next,
) => {
  if (res.headersSent) {
    next(error);
    return;
  }
  const requestId = crypto.randomUUID();
  const status =
    Number.isInteger(error.status) && error.status >= 400 && error.status < 600
      ? error.status
      : 500;
  const code =
    error instanceof AppError
      ? error.code
      : status === 413
        ? "REQUEST_TOO_LARGE"
        : "REQUEST_FAILED";
  // Provider diagnostics must never include SQL row contents, tokens or request bodies.
  if (status >= 500)
    console.error(
      "[API]",
      JSON.stringify({
        requestId,
        code,
        ...(error instanceof AppError
          ? error.context
          : { exception: error.name || "Error" }),
      }),
    );
  const message =
    error instanceof AppError
      ? error.message
      : status === 413
        ? "That upload is too large. Choose an image smaller than 3 MB."
        : status >= 500
          ? "The request could not be completed. Please try again and share the reference code with the site administrator if it continues."
          : error.message;
  res.status(status).json({ error: message, code, requestId });
};
