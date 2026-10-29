import React, { useEffect, useState } from "react";
import {
  ArrowUpRight,
  Bookmark,
  CalendarDays,
  MapPin,
  Sparkles,
  Ticket,
  Users,
} from "lucide-react";
import type { PublicEvent } from "./types.js";

export const categories = [
  "Technology",
  "Music",
  "Business",
  "Arts & Culture",
  "Food & Drink",
  "Sports & Wellness",
  "Community",
  "Education",
];
export function navigate(path: string) {
  window.history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
  window.scrollTo({ top: 0, behavior: "instant" });
}
export function Link({
  to,
  children,
  ...props
}: React.AnchorHTMLAttributes<HTMLAnchorElement> & { to: string }) {
  return (
    <a
      href={to}
      {...props}
      onClick={(event) => {
        props.onClick?.(event);
        if (
          !event.defaultPrevented &&
          !event.metaKey &&
          !event.ctrlKey &&
          !event.shiftKey &&
          event.button === 0
        ) {
          event.preventDefault();
          navigate(to);
        }
      }}
    >
      {children}
    </a>
  );
}
export function useResource<T>(key: string, load: () => Promise<T>) {
  const [state, setState] = useState<{
    data: T | null;
    loading: boolean;
    error: string;
  }>({ data: null, loading: true, error: "" });
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let current = true;
    setState({ data: null, loading: true, error: "" });
    load()
      .then((data) => {
        if (current) setState({ data, loading: false, error: "" });
      })
      .catch((error) => {
        if (current)
          setState({
            data: null,
            loading: false,
            error: error.message || "Could not load this page.",
          });
      });
    return () => {
      current = false;
    };
  }, [key, revision]);
  return { ...state, refresh: () => setRevision((value) => value + 1) };
}
export function Loading() {
  return (
    <div className="p-loading" role="status">
      <span className="p-spinner" /> Finding the good stuff…
    </div>
  );
}
export function ErrorState({
  message,
  retry,
}: {
  message: string;
  retry?: () => void;
}) {
  return (
    <div className="p-empty" role="alert">
      <h2>Let’s try that again</h2>
      <p>{message}</p>
      {retry && (
        <button className="p-button" onClick={retry}>
          Try again
        </button>
      )}
    </div>
  );
}
export function Empty({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="p-empty">
      <div className="p-empty-icon">
        <Sparkles size={30} />
      </div>
      <h2>{title}</h2>
      <p>{description}</p>
      {children}
    </div>
  );
}
export function Avatar({
  name,
  image,
  size = "",
}: {
  name: string;
  image?: string;
  size?: string;
}) {
  return (
    <span className={`p-avatar ${size}`}>
      {name
        .split(" ")
        .map((word) => word[0])
        .slice(0, 2)
        .join("")
        .toUpperCase()}
      {image && (
        <img
          src={image}
          alt=""
          onError={(event) => {
            event.currentTarget.style.display = "none";
          }}
        />
      )}
    </span>
  );
}
export function dateLabel(
  date: string,
  options: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
    year: "numeric",
  },
) {
  return date
    ? new Date(`${date}T12:00:00`).toLocaleDateString(undefined, options)
    : "Date to be announced";
}
export function EventArtwork({
  event,
  large = false,
}: {
  event: Pick<PublicEvent, "coverImage" | "category" | "eventName">;
  large?: boolean;
}) {
  const variant =
    Math.max(0, categories.indexOf(event.category || "Community")) % 4;
  return (
    <div className={`p-artwork p-art-${variant} ${large ? "p-art-large" : ""}`}>
      {event.coverImage ? (
        <img
          src={event.coverImage}
          alt=""
          onError={(event) => {
            event.currentTarget.style.display = "none";
          }}
        />
      ) : (
        <>
          <div className="p-art-orbit p-orbit-one" />
          <div className="p-art-orbit p-orbit-two" />
          <div className="p-art-orbit p-orbit-three" />
          <span className="p-art-caption">
            {event.category || "Community"}
            <br />
            <b>
              IN GOOD
              <br />
              COMPANY.
            </b>
          </span>
          <Sparkles
            className="p-art-spark"
            size={large ? 98 : 62}
            strokeWidth={1}
          />
        </>
      )}
    </div>
  );
}
export function EventCard({
  event,
  saved,
  onSave,
}: {
  event: PublicEvent;
  saved?: boolean;
  onSave: (event: PublicEvent) => void;
}) {
  return (
    <article className="p-event-card">
      <div className="p-event-image">
        <Link to={`/events/${event.id}`} aria-label={`View ${event.eventName}`}>
          <EventArtwork event={event} />
        </Link>
        <button
          className={`p-save ${saved ? "is-saved" : ""}`}
          aria-label={`${saved ? "Unsave" : "Save"} ${event.eventName}`}
          aria-pressed={Boolean(saved)}
          onClick={() => onSave(event)}
        >
          <Bookmark size={19} fill={saved ? "currentColor" : "none"} />
        </button>
        <span className="p-free">Free entry</span>
      </div>
      <div className="p-event-body">
        <div className="p-card-category">
          {event.category} <span>•</span>{" "}
          {event.locationType === "online" ? "Online" : event.city}
        </div>
        <h3>
          <Link to={`/events/${event.id}`}>{event.eventName}</Link>
        </h3>
        <p className="p-event-meta">
          <CalendarDays size={15} />
          {dateLabel(event.eventDate)} · {event.eventTime || "TBA"}
        </p>
        <p className="p-event-meta">
          <MapPin size={15} />
          {event.locationType === "online" ? "Online event" : event.venue}
        </p>
        <div className="p-card-footer">
          <Link to={`/organizers/${event.organizer.id}`}>
            <Avatar name={event.organizer.name} />
            {event.organizer.name}
          </Link>
          <span>
            <Users size={14} />
            {event.attendeeCount} going
          </span>
        </div>
      </div>
    </article>
  );
}
export function PageTitle({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="p-page-title">
      <div>
        <span className="p-eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {children}
    </div>
  );
}
export function SignInPrompt({
  title = "Your next great experience starts here.",
}: {
  title?: string;
}) {
  return (
    <Empty
      title={title}
      description="Create one account to attend events and bring your own ideas to life."
    >
      <Link
        className="p-button"
        to={`/signup?next=${encodeURIComponent(window.location.pathname)}`}
      >
        Join EVENTZ <ArrowUpRight size={16} />
      </Link>
      <Link
        className="p-text-link"
        to={`/login?next=${encodeURIComponent(window.location.pathname)}`}
      >
        Already a member? Sign in
      </Link>
    </Empty>
  );
}
