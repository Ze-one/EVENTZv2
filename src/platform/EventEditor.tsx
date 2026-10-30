import React, { useState } from "react";
import { ArrowLeft, ArrowUpRight, Eye, Save } from "lucide-react";
import { platformRequest, body } from "./api.js";
import { categories, EventArtwork, Link, navigate, PageTitle } from "./ui.js";
import type { PublicEvent } from "./types.js";
import type { EventDetails } from "../types.js";
import CoverImagePicker from "./CoverImagePicker.js";
import "../components/organizer.css";

export default function EventEditor({
  event,
  notify,
  onSaved,
}: {
  event?: PublicEvent | EventDetails;
  notify: (message: string) => void;
  onSaved?: (event: PublicEvent) => void;
}) {
  const [form, setForm] = useState({
    eventName: event?.eventName || "",
    description: event?.description || "",
    category: event?.category || "Community",
    eventDate: event?.eventDate || "",
    eventTime: event?.eventTime || "18:00",
    locationType: event?.locationType || "in_person",
    city: event?.city || "",
    venue: event?.venue || "",
    timezone:
      event?.timezone ||
      Intl.DateTimeFormat().resolvedOptions().timeZone ||
      "UTC",
    coverImage: event?.coverImage || "",
    eventCapacity: String(event?.eventCapacity || ""),
    registrationDeadline: event?.registrationDeadline || "",
    registrationEnabled: event?.registrationEnabled !== false,
  });
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [uploading, setUploading] = useState(false),
    [errorCode, setErrorCode] = useState("");
  const [errorReference, setErrorReference] = useState("");
  const change = (key: keyof typeof form, value: any) =>
    setForm((previous) => ({ ...previous, [key]: value }));
  const save = async (publicationStatus: string) => {
    if (busy || uploading) return;
    setBusy(true);
    setError("");
    setErrorCode("");
    setErrorReference("");
    try {
      const result = await platformRequest<PublicEvent>(
        event ? `/events/${event.id}` : "/events",
        body({ ...form, publicationStatus }, event ? "PATCH" : "POST"),
      );
      notify(
        publicationStatus === "published"
          ? "Your event is live. Let’s bring people together."
          : publicationStatus === "cancelled"
            ? "Event cancelled. It is no longer accepting registrations."
            : "Draft saved. Keep making it yours.",
      );
      if (onSaved) onSaved(result);
      else navigate(`/organizer/${result.id}`);
    } catch (error: any) {
      setError(error.message);
      setErrorCode(error.code || "");
      setErrorReference(error.requestId || "");
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      {!onSaved && <Link to="/organizer" className="p-back">
        <ArrowLeft size={16} /> Your organizer space
      </Link>}
      <PageTitle
        eyebrow="Make something happen"
        title={event ? "Make it yours." : "Good things start with an idea."}
        description={event ? "Keep your event details and registration settings up to date." : "Give your event a name to open your full organizer workspace. Add the remaining details whenever you’re ready."}
      />
      {!event && <section className="p-workspace-intro"><h2>Create privately. Prepare everything. Publish when ready.</h2><p>Your workspace includes the pass designer, roster imports, pass management, online registrations, gate staff, QR check-in and reports. All management tools are available while your event is a draft and after it is published.</p></section>}
      <form
        className="p-editor-layout"
        onSubmit={(e) => {
          e.preventDefault();
          save(event?.publicationStatus || "draft");
        }}
      >
        <div className="p-form-panel">
          <section>
            <span className="p-step">01 / THE IDEA</span>
            <h2>Tell your story</h2>
            <label>
              Event name
              <input
                name="eventName"
                required
                maxLength={140}
                value={form.eventName}
                onChange={(e) => change("eventName", e.target.value)}
                placeholder="Give your gathering a memorable name"
              />
            </label>
            <label>
              What’s the event about?
              <textarea
                name="description"
                rows={5}
                maxLength={10000}
                value={form.description}
                onChange={(e) => change("description", e.target.value)}
                placeholder="The experience, the people, and why someone should be there."
              />
            </label>
            <label>
              Category
              <select
                aria-label="Category"
                value={form.category}
                onChange={(e) => change("category", e.target.value)}
              >
                {categories.map((category) => (
                  <option key={category}>{category}</option>
                ))}
              </select>
            </label>
          </section>
          <section>
            <span className="p-step">02 / THE WHEN & WHERE</span>
            <h2>Set the scene</h2>
            <div className="p-form-row">
              <label>
                Date
                <input
                  name="eventDate"
                  type="date"
                  value={form.eventDate}
                  onChange={(e) => change("eventDate", e.target.value)}
                />
              </label>
              <label>
                Start time
                <input
                  name="eventTime"
                  type="time"
                  value={form.eventTime}
                  onChange={(e) => change("eventTime", e.target.value)}
                />
              </label>
            </div>
            <label>
              Timezone
              <input
                value={form.timezone}
                onChange={(e) => change("timezone", e.target.value)}
                placeholder="e.g. Africa/Douala"
              />
            </label>
            <label>
              Event format
              <select
                aria-label="Event format"
                value={form.locationType}
                onChange={(e) => change("locationType", e.target.value)}
              >
                <option value="in_person">In person</option>
                <option value="online">Online</option>
              </select>
            </label>
            {form.locationType === "in_person" && (
              <label>
                City
                <input
                  name="city"
                  maxLength={100}
                  value={form.city}
                  onChange={(e) => change("city", e.target.value)}
                  placeholder="Where are we meeting?"
                />
              </label>
            )}
            <label>
              {form.locationType === "online"
                ? "Meeting link (HTTPS)"
                : "Venue and address"}
              <input
                name="venue"
                maxLength={300}
                value={form.venue}
                onChange={(e) => change("venue", e.target.value)}
                placeholder={
                  form.locationType === "online"
                    ? "https://…"
                    : "Venue name and street address"
                }
              />
            </label>
          </section>
          <section>
            <span className="p-step">03 / THE DETAILS</span>
            <h2>Open the doors</h2>
            <CoverImagePicker
              value={form.coverImage}
              onChange={(value) => change("coverImage", value)}
              onBusyChange={setUploading}
              disabled={busy || uploading}
            />
            <div className="p-form-row">
              <label>
                Capacity <small>Optional</small>
                <input
                  name="eventCapacity"
                  type="number"
                  min={1}
                  max={1000000}
                  value={form.eventCapacity}
                  onChange={(e) => change("eventCapacity", e.target.value)}
                  placeholder="Unlimited"
                />
              </label>
              <label>
                Registration deadline
                <input
                  type="date"
                  value={form.registrationDeadline.slice(0, 10)}
                  onChange={(e) =>
                    change("registrationDeadline", e.target.value)
                  }
                />
              </label>
            </div>
            <label className="p-checkbox">
              <input
                type="checkbox"
                checked={form.registrationEnabled}
                onChange={(e) =>
                  change("registrationEnabled", e.target.checked)
                }
              />
              Accept registrations when published
            </label>
            <p className="p-form-note">
              Events are free to attend in this first version. Every
              registration includes a personal QR pass.
            </p>
          </section>
          {error && (
            <div role="alert" className="p-error">
              {error}
              {errorReference && (
                <small className="p-save-error-reference">
                  Reference: {errorReference}
                </small>
              )}
              {errorCode === "DATABASE_SCHEMA_OUTDATED" && (
                <p className="p-save-error-help">
                  Your form is still here. The site administrator needs to run
                  the event-platform database migration in Supabase before you
                  retry.
                </p>
              )}
            </div>
          )}
          <div className="p-editor-actions">
            <button
              className="p-button"
              disabled={busy || uploading}
              type="submit"
            >
              <Save size={16} />{busy ? "Saving…" : event ? "Save changes" : "Create draft & open workspace"}
            </button>
            {event?.publicationStatus !== "published" && event?.publicationStatus !== "cancelled" && <button
              className="p-button p-button-outline"
              type="button"
              onClick={() => save("published")}
              disabled={busy || uploading}
            >
              Publish event
              <ArrowUpRight size={17} />
            </button>}
            {event && event.publicationStatus !== "draft" && <button type="button" className="p-button p-button-outline" disabled={busy || uploading} onClick={() => {
              if (window.confirm("Move this event to a private draft? It will leave discovery and stop accepting online registrations. Your roster and passes will be retained.")) save("draft");
            }}>Move to draft</button>}
          </div>
          {event?.publicationStatus === "published" && (
            <button
              type="button"
              className="p-danger-link"
              disabled={busy || uploading}
              onClick={() => {
                if (
                  window.confirm(
                    "Cancel this event? It will be removed from discovery and stop accepting registrations.",
                  )
                )
                  save("cancelled");
              }}
            >
              Cancel event
            </button>
          )}
        </div>
        <aside className="p-editor-preview">
          <div className="p-preview-label">
            <Eye size={16} /> YOUR EVENT, AT A GLANCE
          </div>
          <EventArtwork event={form} large />
          <div>
            <span className="p-eyebrow">{form.category}</span>
            <h2>{form.eventName || "Your next great event"}</h2>
            <p>
              {form.eventDate || "Pick your date"} · {form.eventTime}
            </p>
            <p>
              {form.locationType === "online"
                ? "Online event"
                : form.city || "Somewhere wonderful"}
            </p>
            <span className="p-tag">Free entry</span>
          </div>
          <p className="p-form-note">
            Save a draft to open your organizer workspace. Prepare your roster,
            design passes, and set up check-in before publishing.
          </p>
        </aside>
      </form>
    </>
  );
}
