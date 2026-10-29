import React, { lazy, Suspense, useEffect, useState } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Bookmark,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  Compass,
  Globe2,
  Heart,
  LayoutDashboard,
  LogOut,
  MapPin,
  Menu,
  Plus,
  Search,
  Share2,
  SlidersHorizontal,
  Sparkles,
  Ticket,
  Users,
  X,
} from "lucide-react";
import { platformRequest, body } from "./api.js";
import {
  Avatar,
  categories,
  dateLabel,
  Empty,
  ErrorState,
  EventArtwork,
  EventCard,
  Link,
  Loading,
  navigate,
  PageTitle,
  SignInPrompt,
  useResource,
} from "./ui.js";
import type {
  Account,
  Organizer,
  PublicEvent,
  Registration,
  WorkspaceEvent,
} from "./types.js";
import EventEditor from "./EventEditor.js";
import BrandLogo from "./BrandLogo.js";
import {
  EVENTZ_SESSION_TOKEN_KEY,
  WORKSPACE_EVENT_KEY,
} from "../utils/auth.js";
import { PassStatus, UserRole } from "../types.js";
import "./platform.css";

const Workspace = lazy(() => import("../App.js"));
const today = () => new Date().toISOString().slice(0, 10);
type Actions = {
  user: Account | null;
  notify: (message: string) => void;
  onSave: (event: PublicEvent) => Promise<void>;
  onFollow: (organizer: Organizer) => Promise<void>;
};

export default function PlatformApp() {
  const [url, setUrl] = useState(
    window.location.pathname + window.location.search,
  );
  const [user, setUser] = useState<Account | null>(null),
    [sessionLoading, setSessionLoading] = useState(true);
  const [toast, setToast] = useState(""),
    [menu, setMenu] = useState(false);
  const path = url.split("?")[0];
  useEffect(() => {
    const update = () => {
      setUrl(window.location.pathname + window.location.search);
      setMenu(false);
    };
    window.addEventListener("popstate", update);
    return () => window.removeEventListener("popstate", update);
  }, []);
  useEffect(() => {
    if (!localStorage.getItem(EVENTZ_SESSION_TOKEN_KEY)) {
      setSessionLoading(false);
      return;
    }
    platformRequest<Account>("/me")
      .then(setUser)
      .catch((error) => {
        if (error.status === 401) {
          localStorage.removeItem(EVENTZ_SESSION_TOKEN_KEY);
          localStorage.removeItem("etsn_user");
        } else
          setToast("Could not restore your session. Try signing in again.");
      })
      .finally(() => setSessionLoading(false));
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 5500);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    if (!path.startsWith("/organizer/")) {
      sessionStorage.removeItem(WORKSPACE_EVENT_KEY);
      delete document.documentElement.dataset.eventzTheme;
    }
  }, [path]);
  const auth = (data: { user: Account; sessionToken: string }) => {
    localStorage.setItem(EVENTZ_SESSION_TOKEN_KEY, data.sessionToken);
    localStorage.setItem("etsn_user", JSON.stringify(data.user));
    setUser(data.user);
    const next = new URLSearchParams(window.location.search).get("next") || "/";
    navigate(next.startsWith("/") && !next.startsWith("//") ? next : "/");
  };
  const logout = () => {
    localStorage.removeItem(EVENTZ_SESSION_TOKEN_KEY);
    localStorage.removeItem("etsn_user");
    sessionStorage.removeItem(WORKSPACE_EVENT_KEY);
    Object.keys(localStorage)
      .filter((key) => key.startsWith("eventz_offline_gate_"))
      .forEach((key) => localStorage.removeItem(key));
    setUser(null);
    navigate("/");
    setToast("You’re signed out. See you soon.");
  };
  const requireLogin = () => {
    navigate(`/login?next=${encodeURIComponent(window.location.pathname)}`);
  };
  const onSave = async (event: PublicEvent) => {
    if (!user) return requireLogin();
    try {
      const saved = !user.savedEventIds?.includes(event.id);
      setUser(
        await platformRequest<Account>(
          `/me/saved/${event.id}`,
          body({ saved }, "PUT"),
        ),
      );
      setToast(
        saved ? "Saved for your next adventure." : "Event removed from saved.",
      );
    } catch (error: any) {
      setToast(error.message);
    }
  };
  const onFollow = async (organizer: Organizer) => {
    if (!user) return requireLogin();
    try {
      const following = !user.followedOrganizerIds?.includes(organizer.id);
      setUser(
        await platformRequest<Account>(
          `/organizers/${organizer.id}/follow`,
          body({ following }, "PUT"),
        ),
      );
      setToast(
        following
          ? `You’re now following ${organizer.name}.`
          : "Organizer unfollowed.",
      );
    } catch (error: any) {
      setToast(error.message);
    }
  };
  const actions: Actions = { user, notify: setToast, onSave, onFollow };
  let page: React.ReactNode;
  if (sessionLoading) page = <Loading />;
  else if (path === "/login" || path === "/signup")
    page = (
      <AuthPage
        key={path}
        signup={path === "/signup"}
        onAuth={auth}
        user={user}
      />
    );
  else if (path === "/create")
    page = user ? (
      <EventEditor notify={setToast} />
    ) : (
      <SignInPrompt title="Your idea deserves an audience." />
    );
  else if (/^\/events\/[^/]+\/edit$/.test(path))
    page = user ? (
      <EditPage id={path.split("/")[2]} user={user} notify={setToast} />
    ) : (
      <SignInPrompt />
    );
  else if (/^\/events\/[^/]+$/.test(path))
    page = <EventPage key={path} id={path.split("/")[2]} {...actions} />;
  else if (/^\/organizers\/[^/]+$/.test(path))
    page = <OrganizerPage id={path.split("/")[2]} {...actions} />;
  else if (/^\/organizer\/[^/]+$/.test(path))
    return (
      <div className="platform-workspace">
        <WorkspacePage id={path.split("/")[2]} user={user} />
        {toast && (
          <div className="p-toast" role="status">
            {toast}
          </div>
        )}
      </div>
    );
  else if (path === "/organizer")
    page = user ? (
      <OrganizerHome user={user} notify={setToast} />
    ) : (
      <SignInPrompt title="Bring your people together." />
    );
  else if (path === "/my-events")
    page = user ? (
      <Wallet user={user} notify={setToast} />
    ) : (
      <SignInPrompt title="Your plans. All in one place." />
    );
  else if (path === "/profile")
    page = user ? (
      <Profile user={user} onUpdate={setUser} notify={setToast} />
    ) : (
      <SignInPrompt />
    );
  else if (/^\/verify\/[^/]+$/.test(path))
    page = <VerifyPage passId={path.split("/")[2]} />;
  else if (["/", "/saved", "/following"].includes(path))
    page = <Discovery key={path} mode={path} {...actions} />;
  else
    page = (
      <Empty
        title="This page took a different path."
        description="Let’s get you back to discovering something good."
      >
        <Link className="p-button" to="/">
          Explore events
        </Link>
      </Empty>
    );
  const nav = [
    { to: "/", icon: Compass, label: "Discover" },
    { to: "/following", icon: Heart, label: "Following" },
    { to: "/my-events", icon: Ticket, label: "My tickets" },
    { to: "/saved", icon: Bookmark, label: "Saved events" },
  ];
  return (
    <div className="platform">
      <header className="p-topbar">
        <Link className="p-brand-link" to="/" aria-label="EVENTZ home">
          <BrandLogo />
        </Link>
        <span className="p-top-tagline">GOOD PEOPLE. GREAT MOMENTS.</span>
        <div className="p-top-actions">
          <Link to="/create" className="p-top-create">
            <Plus size={17} /> Create an event
          </Link>
          {user ? (
            <>
              <Link to="/profile" className="p-account">
                <Avatar name={user.name} image={user.profileImage} />
                <span>{user.name.split(" ")[0]}</span>
              </Link>
              <button
                onClick={logout}
                className="p-icon-button p-logout"
                aria-label="Sign out"
              >
                <LogOut size={18} />
              </button>
            </>
          ) : (
            <>
              <Link to="/login" className="p-signin">
                Sign in
              </Link>
              <Link to="/signup" className="p-button p-join">
                Join the community <ArrowUpRight size={15} />
              </Link>
            </>
          )}
          <button
            className="p-icon-button p-menu"
            aria-label={menu ? "Close menu" : "Open menu"}
            aria-expanded={menu}
            onClick={() => setMenu(!menu)}
          >
            {menu ? <X /> : <Menu />}
          </button>
        </div>
      </header>
      <div className="p-layout">
        <aside className={`p-sidebar ${menu ? "is-open" : ""}`}>
          <span className="p-nav-caption">YOUR LITTLE WORLD</span>
          <nav>
            {nav.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className={`p-nav-item ${path === item.to ? "is-active" : ""}`}
                aria-current={path === item.to ? "page" : undefined}
              >
                <item.icon size={20} />
                {item.label}
                {path === item.to && <span />}
              </Link>
            ))}
          </nav>
          <div className="p-sidebar-divider" />
          <Link
            to="/organizer"
            className={`p-nav-item ${path === "/organizer" ? "is-active" : ""}`}
          >
            <LayoutDashboard size={20} /> Organizer space
          </Link>
          <div className="p-mobile-session">
            {user && (
              <>
                <Link className="p-nav-item" to="/profile">
                  <Users size={19} /> My profile
                </Link>
                <button className="p-nav-item" onClick={logout}>
                  <LogOut size={19} /> Sign out
                </button>
              </>
            )}
          </div>
          <div className="p-sidebar-promo">
            <div className="p-promo-symbol" aria-hidden="true">
              <Ticket size={28} strokeWidth={1.5} />
            </div>
            <h3>
              Be the reason
              <br />
              people show up.
            </h3>
            <p>
              Your idea. Your community.
              <br />
              Make it happen on EVENTZ.
            </p>
            <Link to="/create">
              Create your event <ArrowUpRight size={17} />
            </Link>
          </div>
          <div className="p-sidebar-footer">
            A little more connection.
            <br />A lot more life.
            <span>© {new Date().getFullYear()} EVENTZ</span>
          </div>
        </aside>
        <main className="p-main" id="main-content">
          {page}
          <footer className="p-footer">
            <span>Made for moments that matter.</span>
            <BrandLogo className="p-footer-logo" />
          </footer>
        </main>
      </div>
      {toast && (
        <div className="p-toast" role="status">
          <CheckCircle2 size={18} />
          <span>{toast}</span>
          <button
            aria-label="Dismiss notification"
            onClick={() => setToast("")}
          >
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  );
}

function Discovery({ mode, ...actions }: Actions & { mode: string }) {
  const [query, setQuery] = useState(""),
    [category, setCategory] = useState(""),
    [city, setCity] = useState(""),
    [date, setDate] = useState(""),
    [filters, setFilters] = useState(false);
  const params = new URLSearchParams({ q: query, category, city, date });
  const resource = useResource<PublicEvent[]>(
    `${mode}:${params}:${actions.user?.id}`,
    () =>
      platformRequest(mode === "/saved" ? "/me/saved" : `/events?${params}`),
  );
  if (mode !== "/" && !actions.user)
    return (
      <SignInPrompt
        title={
          mode === "/saved"
            ? "Keep the good ones close."
            : "Stay close to your favorite communities."
        }
      />
    );
  const events = (resource.data || []).filter(
    (event) =>
      mode !== "/following" ||
      actions.user?.followedOrganizerIds?.includes(event.organizer.id),
  );
  return (
    <>
      {mode === "/" ? (
        <section className="p-hero">
          <div className="p-hero-copy">
            <span className="p-eyebrow">
              <span className="p-live-dot" /> REAL EVENTS. REAL CONNECTIONS.
            </span>
            <h1>
              Find your people.
              <br />
              <em>Make a moment.</em>
            </h1>
            <p>
              Discover events that feel like you.
              <br />
              Come for the experience. Stay for the connections.
            </p>
            <a className="p-hero-link" href="#events">
              Explore the possibilities <ArrowUpRight size={17} />
            </a>
          </div>
          <div className="p-hero-art" aria-hidden="true">
            <div className="p-hero-orbit" />
            <div className="p-hero-ticket-back" />
            <div className="p-hero-ticket">
              <span className="p-hero-ticket-label">
                <Ticket size={17} /> YOUR NEXT EXPERIENCE
              </span>
              <div className="p-hero-ticket-title">
                GREAT
                <br />
                MOMENTS
                <br />
                <em>START HERE.</em>
              </div>
              <div className="p-hero-ticket-divider" />
              <div className="p-hero-ticket-footer">
                <span>
                  SHOW UP.
                  <br />
                  <b>FEEL CONNECTED.</b>
                </span>
                <ArrowUpRight size={32} strokeWidth={1.25} />
              </div>
            </div>
            <span className="p-hero-sticker p-sticker-top">
              <CheckCircle2 size={17} /> One pass. A new possibility.
            </span>
            <span className="p-hero-sticker p-sticker-bottom">
              <Users size={18} /> Your kind of people
            </span>
          </div>
        </section>
      ) : (
        <PageTitle
          eyebrow="Your community"
          title={
            mode === "/saved"
              ? "Worth making time for."
              : "From people you follow."
          }
          description={
            mode === "/saved"
              ? "All the events you’ve bookmarked, ready when you are."
              : "Upcoming experiences from the organizers you want to hear from."
          }
        />
      )}
      <section id="events" className="p-discovery">
        <div className="p-section-heading">
          <div>
            <span className="p-eyebrow">MAKE ROOM FOR SOMETHING GOOD</span>
            <h2>
              {mode === "/"
                ? "Your next “I’m glad I went.”"
                : mode === "/saved"
                  ? "Your saved events"
                  : "Your community’s next events"}
            </h2>
          </div>
          {mode === "/" && (
            <button
              className={`p-filter-button ${filters ? "is-active" : ""}`}
              onClick={() => setFilters(!filters)}
              aria-expanded={filters}
            >
              <SlidersHorizontal size={16} /> Filters
            </button>
          )}
        </div>
        {mode === "/" && (
          <>
            <div className="p-searchbar">
              <Search size={20} />
              <input
                aria-label="Search events"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search events, interests, or something new…"
              />
              {query && (
                <button
                  className="p-icon-button"
                  aria-label="Clear search"
                  onClick={() => setQuery("")}
                >
                  <X size={16} />
                </button>
              )}
              <span className="p-search-shortcut">EXPLORE</span>
            </div>
            <div className="p-categories">
              {["", ...categories].map((item) => (
                <button
                  key={item}
                  className={category === item ? "is-active" : ""}
                  aria-pressed={category === item}
                  onClick={() => setCategory(item)}
                >
                  {item === "" && <Sparkles size={14} />}
                  {item || "For everyone"}
                </button>
              ))}
            </div>
            {filters && (
              <div className="p-filter-panel">
                <label>
                  City
                  <input
                    aria-label="Filter by city"
                    placeholder="Any city"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                  />
                </label>
                <label>
                  Date
                  <input
                    aria-label="Filter by date"
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                  />
                </label>
                <button
                  className="p-text-link"
                  onClick={() => {
                    setCity("");
                    setDate("");
                    setCategory("");
                    setQuery("");
                  }}
                >
                  Clear filters
                </button>
              </div>
            )}
          </>
        )}
        {resource.loading ? (
          <Loading />
        ) : resource.error ? (
          <ErrorState message={resource.error} retry={resource.refresh} />
        ) : events.length ? (
          <>
            <div className="p-result-count">
              {events.length}{" "}
              {events.length === 1 ? "experience" : "experiences"} to look
              forward to <span>SOONEST FIRST</span>
            </div>
            <div className="p-event-grid">
              {events.map((event) => (
                <EventCard
                  key={event.id}
                  event={event}
                  saved={actions.user?.savedEventIds?.includes(event.id)}
                  onSave={async (event) => {
                    await actions.onSave(event);
                    if (mode === "/saved") resource.refresh();
                  }}
                />
              ))}
            </div>
          </>
        ) : (
          <Empty
            title={
              mode === "/following"
                ? "Your community starts with a follow."
                : mode === "/saved"
                  ? "Make a little room for possibility."
                  : query || category || city || date
                    ? "Nothing here just yet."
                    : "Be the first to bring people together."
            }
            description={
              mode === "/following"
                ? "Find an event you love, visit its organizer, and follow them to see what’s next."
                : mode === "/saved"
                  ? "Tap the bookmark on any event and we’ll keep it here for you."
                  : query || category || city || date
                    ? "Try another interest, city, or date. Your next experience is out there."
                    : "The stage is yours. Publish your first event and give your community something to look forward to."
            }
          >
            <Link className="p-button" to={mode === "/" ? "/create" : "/"}>
              {mode === "/" ? "Create an event" : "Discover events"}
              <ArrowUpRight size={16} />
            </Link>
          </Empty>
        )}
      </section>
      {mode === "/" && (
        <section className="p-community-banner">
          <div>
            <span className="p-eyebrow">EVERY COMMUNITY STARTS SOMEWHERE</span>
            <h2>Got a reason to gather?</h2>
            <p>We’ll help you turn “we should” into “see you there.”</p>
          </div>
          <Link className="p-button" to="/create">
            Bring your idea to life <ArrowUpRight size={17} />
          </Link>
        </section>
      )}
    </>
  );
}

function AuthPage({
  signup,
  onAuth,
  user,
}: {
  signup: boolean;
  onAuth: (data: { user: Account; sessionToken: string }) => void;
  user: Account | null;
}) {
  const [name, setName] = useState(""),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const next = new URLSearchParams(window.location.search).get("next") || "/";
  if (user)
    return (
      <Empty
        title={`You’re in, ${user.name.split(" ")[0]}.`}
        description="Your next experience is waiting."
      >
        <Link className="p-button" to="/">
          Explore events
        </Link>
      </Empty>
    );
  return (
    <div className="p-auth-layout">
      <div className="p-auth-story">
        <span className="p-eyebrow">A LITTLE MORE REAL LIFE</span>
        <h1>
          Your people
          <br />
          are <em>out there.</em>
        </h1>
        <p>
          Find them at a gathering, a workshop, a show.
          <br />
          Or bring them together yourself.
        </p>
        <div className="p-auth-symbol" aria-hidden="true">
          <Ticket size={210} strokeWidth={0.75} />
        </div>
      </div>
      <form
        className="p-auth-form"
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          setError("");
          try {
            onAuth(
              await platformRequest(
                signup ? "/auth/register" : "/auth/login",
                body({ name, email, password }),
              ),
            );
          } catch (error: any) {
            setError(error.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <span className="p-eyebrow">
          {signup ? "YOUR NEXT CHAPTER" : "GOOD TO HAVE YOU BACK"}
        </span>
        <h2>{signup ? "Find your place." : "Welcome back."}</h2>
        <p>
          {signup
            ? "One account. So many ways to show up."
            : "More moments, less missing out."}
        </p>
        {signup && (
          <label>
            Your name
            <input
              required
              name="name"
              autoComplete="name"
              maxLength={100}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="What should we call you?"
            />
          </label>
        )}
        <label>
          Email address
          <input
            required
            name="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
        </label>
        <label>
          Password
          <input
            required
            name="password"
            type="password"
            autoComplete={signup ? "new-password" : "current-password"}
            minLength={signup ? 10 : undefined}
            maxLength={128}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={signup ? "At least 10 characters" : "Your password"}
          />
        </label>
        {error && (
          <div role="alert" className="p-error">
            {error}
          </div>
        )}
        <button disabled={busy} className="p-button" type="submit">
          {busy ? "One moment…" : signup ? "Create my account" : "Sign in"}
          <ArrowUpRight size={17} />
        </button>
        <p className="p-auth-switch">
          {signup ? "Already part of the community?" : "New around here?"}{" "}
          <Link
            to={`${signup ? "/login" : "/signup"}?next=${encodeURIComponent(next)}`}
          >
            {signup ? "Sign in" : "Join EVENTZ"}
          </Link>
        </p>
      </form>
    </div>
  );
}

function EventPage({
  id,
  user,
  notify,
  onSave,
  onFollow,
}: Actions & { id: string }) {
  const resource = useResource<PublicEvent>(`${id}:${user?.id}`, () =>
    platformRequest(`/events/${id}`),
  );
  const tickets = useResource<Registration[]>(
    `tickets:${id}:${user?.id}`,
    () => (user ? platformRequest("/me/registrations") : Promise.resolve([])),
  );
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  if (resource.loading) return <Loading />;
  if (resource.error || !resource.data)
    return <ErrorState message={resource.error} retry={resource.refresh} />;
  const event = resource.data,
    existing = tickets.data?.find(
      (ticket) =>
        ticket.event.id === id &&
        ticket.participant.status !== PassStatus.CANCELLED,
    );
  const closed =
    event.publicationStatus !== "published" ||
    !event.registrationEnabled ||
    event.eventDate < today() ||
    (event.registrationDeadline && event.registrationDeadline < today());
  const full = event.availableSpots === 0;
  const register = async () => {
    if (!user)
      return navigate(`/login?next=${encodeURIComponent(`/events/${id}`)}`);
    setBusy(true);
    setError("");
    try {
      await platformRequest(`/events/${id}/register`, body({}));
      tickets.refresh();
      resource.refresh();
      notify("You’re going! Your QR pass is waiting in My tickets.");
    } catch (error: any) {
      setError(error.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <Link to="/" className="p-back">
        <ArrowLeft size={16} /> Back to discovery
      </Link>
      <div className="p-event-detail-cover">
        <EventArtwork event={event} large />
        <span className="p-detail-category">{event.category}</span>
      </div>
      <div className="p-event-detail-layout">
        <div className="p-event-story">
          <span className="p-eyebrow">
            {event.city || "WHEREVER YOU ARE"} ·{" "}
            {event.locationType === "online" ? "ONLINE" : "IN PERSON"}
          </span>
          <h1>{event.eventName}</h1>
          {event.publicationStatus !== "published" && (
            <div className="p-notice">
              {event.publicationStatus === "draft"
                ? "Draft preview — only you can see this event."
                : "This event has been cancelled."}
            </div>
          )}
          <div className="p-detail-facts">
            <div>
              <CalendarDays />
              <span>
                <b>{dateLabel(event.eventDate)}</b>
                <small>
                  {event.eventTime || "Time to be announced"} · {event.timezone}
                </small>
              </span>
            </div>
            <div>
              <MapPin />
              <span>
                <b>
                  {event.locationType === "online"
                    ? "Online event"
                    : event.venue || "Location to be announced"}
                </b>
                <small>
                  {event.locationType === "online"
                    ? "Meeting link is included in your registration."
                    : event.city}
                </small>
              </span>
            </div>
          </div>
          <h2>A little about the experience</h2>
          <p className="p-description">
            {event.description ||
              "The organizer is still putting the finishing touches on this experience."}
          </p>
          <div className="p-organizer-box">
            <Avatar
              name={event.organizer.name}
              image={event.organizer.profileImage}
              size="p-avatar-large"
            />
            <div>
              <small>BROUGHT TO YOU BY</small>
              <Link to={`/organizers/${event.organizer.id}`}>
                <h3>
                  {event.organizer.name}
                  <ArrowUpRight size={16} />
                </h3>
              </Link>
              <p>{event.organizer.followerCount} followers</p>
            </div>
            {user?.id !== event.organizer.id && (
              <button
                className="p-button p-button-outline"
                onClick={() => onFollow(event.organizer)}
              >
                {user?.followedOrganizerIds?.includes(event.organizer.id) ? (
                  <>
                    <Check size={15} /> Following
                  </>
                ) : (
                  "Follow"
                )}
              </button>
            )}
          </div>
        </div>
        <aside className="p-booking-card">
          <span className="p-eyebrow">MAKE IT A PLAN</span>
          <h2>
            Good times.
            <br />
            <em>On the house.</em>
          </h2>
          <div className="p-price">
            Free <span>General admission</span>
          </div>
          <p>
            <Users size={17} />
            {event.attendeeCount}{" "}
            {event.attendeeCount === 1 ? "person is" : "people are"} going
            {event.availableSpots !== null &&
              ` · ${event.availableSpots} spots left`}
          </p>
          {existing ? (
            <>
              <div className="p-confirmed">
                <CheckCircle2 size={19} /> You’re on the list!
              </div>
              <Link className="p-button" to="/my-events">
                View my pass <Ticket size={17} />
              </Link>
            </>
          ) : (
            <button
              className="p-button"
              disabled={Boolean(closed || full || busy || tickets.loading)}
              onClick={register}
            >
              {busy
                ? "Saving your spot…"
                : closed
                  ? "Registration closed"
                  : full
                    ? "Fully booked"
                    : "Count me in"}
              {!closed && !full && <ArrowUpRight size={17} />}
            </button>
          )}
          {error && (
            <p role="alert" className="p-error">
              {error}
            </p>
          )}
          {tickets.error && (
            <p className="p-error">
              Could not check your registration.{" "}
              <button onClick={tickets.refresh}>Try again</button>
            </p>
          )}
          <span className="p-booking-note">
            Your own QR pass. One less thing to think about.
          </span>
          <div className="p-booking-actions">
            <button
              onClick={() => onSave(event)}
              aria-pressed={Boolean(user?.savedEventIds?.includes(id))}
            >
              <Bookmark size={17} />
              {user?.savedEventIds?.includes(id) ? "Saved" : "Save event"}
            </button>
            <button
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(window.location.href);
                  notify("Event link copied. Send it to your people.");
                } catch {
                  notify(
                    "Copy the page address from your browser to share this event.",
                  );
                }
              }}
            >
              <Share2 size={17} /> Share
            </button>
          </div>
          {user?.id === event.organizer.id && (
            <Link to={`/events/${id}/edit`} className="p-text-link">
              Edit this event <ArrowRight size={15} />
            </Link>
          )}
        </aside>
      </div>
    </>
  );
}

function OrganizerPage({
  id,
  user,
  onSave,
  onFollow,
}: Actions & { id: string }) {
  const resource = useResource<{ organizer: Organizer; events: PublicEvent[] }>(
    id,
    () => platformRequest(`/organizers/${id}`),
  );
  if (resource.loading) return <Loading />;
  if (resource.error || !resource.data)
    return <ErrorState message={resource.error} retry={resource.refresh} />;
  const { organizer, events } = resource.data;
  return (
    <>
      <Link to="/" className="p-back">
        <ArrowLeft size={16} /> Discover events
      </Link>
      <section className="p-organizer-profile">
        <Avatar
          name={organizer.name}
          image={organizer.profileImage}
          size="p-avatar-xl"
        />
        <div>
          <span className="p-eyebrow">PEOPLE WHO MAKE THINGS HAPPEN</span>
          <h1>{organizer.name}</h1>
          <p>
            {organizer.bio ||
              "Bringing people together, one experience at a time."}
          </p>
          <span>
            {organizer.followerCount} followers · {events.length} published
            events
          </span>
        </div>
        {user?.id !== id && (
          <button
            className="p-button"
            onClick={async () => {
              await onFollow(organizer);
              resource.refresh();
            }}
          >
            {user?.followedOrganizerIds?.includes(id) ? (
              <>
                <Check size={16} /> Following
              </>
            ) : (
              <>
                <Plus size={16} /> Follow organizer
              </>
            )}
          </button>
        )}
      </section>
      <div className="p-section-heading">
        <h2>On their calendar</h2>
      </div>
      {events.length ? (
        <div className="p-event-grid">
          {events.map((event) => (
            <EventCard
              key={event.id}
              event={event}
              saved={user?.savedEventIds?.includes(event.id)}
              onSave={onSave}
            />
          ))}
        </div>
      ) : (
        <Empty
          title="Something good is in the making."
          description="Follow this organizer and check back for their next event."
        />
      )}
    </>
  );
}

function OrganizerHome({
  user,
  notify,
}: {
  user: Account;
  notify: (message: string) => void;
}) {
  const resource = useResource<WorkspaceEvent[]>(user.id, () =>
    platformRequest("/me/events"),
  );
  const owned =
    resource.data?.filter((event) => event.organizer.id === user.id) || [];
  return (
    <>
      <PageTitle
        eyebrow="YOUR ORGANIZER SPACE"
        title="Bring people together."
        description="From your first idea to the last guest through the door."
      >
        <Link className="p-button" to="/create">
          <Plus size={17} /> Create event
        </Link>
      </PageTitle>
      <div className="p-stats">
        <div>
          <span>YOUR EVENTS</span>
          <strong>{owned.length}</strong>
          <small>Ideas becoming experiences</small>
        </div>
        <div>
          <span>OUT IN THE WORLD</span>
          <strong>
            {
              owned.filter((event) => event.publicationStatus === "published")
                .length
            }
          </strong>
          <small>Published and ready to share</small>
        </div>
        <div>
          <span>PEOPLE COMING TOGETHER</span>
          <strong>
            {owned.reduce((sum, event) => sum + event.attendeeCount, 0)}
          </strong>
          <small>Registrations across your events</small>
        </div>
      </div>
      {resource.loading ? (
        <Loading />
      ) : resource.error ? (
        <ErrorState message={resource.error} retry={resource.refresh} />
      ) : !resource.data?.length ? (
        <Empty
          title="Your first event starts here."
          description="Create a draft, make it yours, and publish when you’re ready. We’ll take care of registrations and passes."
        >
          <Link className="p-button" to="/create">
            Let’s make it happen <ArrowUpRight size={17} />
          </Link>
        </Empty>
      ) : (
        <div className="p-organizer-events">
          {resource.data.map((event) => (
            <article key={event.id}>
              <Link
                to={`/events/${event.id}`}
                className="p-organizer-event-art"
              >
                <EventArtwork event={event} />
              </Link>
              <div>
                <span
                  className={`p-status p-status-${event.publicationStatus}`}
                >
                  {event.publicationStatus}
                  {event.accessRole === "gate_officer" && " · Gate staff"}
                </span>
                <h2>
                  <Link to={`/events/${event.id}`}>{event.eventName}</Link>
                </h2>
                <p>
                  {dateLabel(event.eventDate)} · {event.city || "Online"} ·{" "}
                  {event.attendeeCount} registered
                </p>
              </div>
              <div className="p-organizer-event-actions">
                {event.accessRole === "admin" && (
                  <Link
                    to={`/events/${event.id}/edit`}
                    className="p-button p-button-outline"
                  >
                    Edit listing
                  </Link>
                )}
                <Link to={`/organizer/${event.id}`} className="p-button">
                  {event.accessRole === "admin"
                    ? "Manage event"
                    : "Open gate scanner"}
                  <ArrowUpRight size={16} />
                </Link>
              </div>
            </article>
          ))}
        </div>
      )}
    </>
  );
}
function EditPage({
  id,
  user,
  notify,
}: {
  id: string;
  user: Account;
  notify: (message: string) => void;
}) {
  const resource = useResource<PublicEvent>(id, () =>
    platformRequest(`/me/events/${id}`),
  );
  if (resource.loading) return <Loading />;
  if (resource.error || !resource.data)
    return <ErrorState message={resource.error} retry={resource.refresh} />;
  if (resource.data.organizer.id !== user.id)
    return (
      <ErrorState message="Only this event’s organizer can edit its listing." />
    );
  return <EventEditor key={id} event={resource.data} notify={notify} />;
}
function WorkspacePage({ id, user }: { id: string; user: Account | null }) {
  const resource = useResource<WorkspaceEvent[]>(`${id}:${user?.id}`, () =>
    user ? platformRequest("/me/events") : Promise.resolve([]),
  );
  useEffect(() => {
    sessionStorage.setItem(WORKSPACE_EVENT_KEY, id);
    return () => {
      sessionStorage.removeItem(WORKSPACE_EVENT_KEY);
    };
  }, [id]);
  if (!user)
    return (
      <div className="platform">
        <SignInPrompt />
      </div>
    );
  if (resource.loading)
    return (
      <div className="platform">
        <Loading />
      </div>
    );
  if (resource.error)
    return (
      <div className="platform">
        <ErrorState message={resource.error} retry={resource.refresh} />
      </div>
    );
  const event = resource.data?.find((event) => event.id === id);
  if (!event)
    return (
      <div className="platform">
        <ErrorState message="You do not have access to this event workspace." />
        <Link to="/organizer" className="p-button">
          Your organizer space
        </Link>
      </div>
    );
  return (
    <Suspense fallback={<Loading />}>
      <Workspace
        key={id}
        sessionUser={{
          ...user,
          role:
            event.accessRole === "admin"
              ? UserRole.ADMIN
              : UserRole.GATE_OFFICER,
        }}
        eventId={id}
        onExit={() => navigate("/organizer")}
      />
    </Suspense>
  );
}
function Wallet({
  user,
  notify,
}: {
  user: Account;
  notify: (message: string) => void;
}) {
  const resource = useResource<Registration[]>(user.id, () =>
    platformRequest("/me/registrations"),
  );
  const [selected, setSelected] = useState<string | null>(null),
    [busy, setBusy] = useState("");
  return (
    <>
      <PageTitle
        eyebrow="MY TICKETS"
        title="You’ve got plans."
        description="Your events and personal passes, together in one place."
      />
      {resource.loading ? (
        <Loading />
      ) : resource.error ? (
        <ErrorState message={resource.error} retry={resource.refresh} />
      ) : !resource.data?.length ? (
        <Empty
          title="Your calendar has room for a good story."
          description="Find an event you love and save yourself a spot."
        >
          <Link className="p-button" to="/">
            Discover events <ArrowUpRight size={17} />
          </Link>
        </Empty>
      ) : (
        <div className="p-wallet">
          {resource.data.map((ticket) => {
            const cancelled =
              ticket.participant.status === PassStatus.CANCELLED ||
              ticket.event.publicationStatus === "cancelled";
            return (
              <article key={ticket.participant.id} className="p-ticket">
                <div className="p-ticket-main">
                  <span
                    className={`p-status ${cancelled ? "p-status-cancelled" : "p-status-published"}`}
                  >
                    {cancelled
                      ? "Cancelled"
                      : ticket.participant.status === PassStatus.USED
                        ? "Checked in"
                        : "You’re going"}
                  </span>
                  <h2>
                    <Link to={`/events/${ticket.event.id}`}>
                      {ticket.event.eventName}
                    </Link>
                  </h2>
                  <p>
                    <CalendarDays size={16} />
                    {dateLabel(ticket.event.eventDate)} ·{" "}
                    {ticket.event.eventTime} · {ticket.event.timezone}
                  </p>
                  <p>
                    <MapPin size={16} />
                    {ticket.event.locationType === "online" ? (
                      <a
                        href={ticket.event.venue}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Join online event <ArrowUpRight size={14} />
                      </a>
                    ) : (
                      ticket.event.venue
                    )}
                  </p>
                  <small>Registered as {ticket.participant.fullName}</small>
                </div>
                <div className="p-ticket-actions">
                  <Ticket size={32} strokeWidth={1.3} />
                  <button
                    className="p-button"
                    disabled={cancelled}
                    onClick={() => setSelected(ticket.participant.id)}
                  >
                    View my pass <ArrowUpRight size={16} />
                  </button>
                  {!cancelled &&
                    ticket.participant.status !== PassStatus.USED && (
                      <button
                        className="p-text-link"
                        disabled={busy === ticket.participant.id}
                        onClick={async () => {
                          if (
                            !window.confirm(
                              "Cancel your registration? This pass will stop working.",
                            )
                          )
                            return;
                          setBusy(ticket.participant.id);
                          try {
                            await platformRequest(
                              `/registrations/${ticket.participant.id}`,
                              { method: "DELETE" },
                            );
                            resource.refresh();
                            notify(
                              "Registration cancelled. Your place has been released.",
                            );
                          } catch (error: any) {
                            notify(error.message);
                          } finally {
                            setBusy("");
                          }
                        }}
                      >
                        Cancel registration
                      </button>
                    )}
                </div>
              </article>
            );
          })}
        </div>
      )}
      {selected && resource.data && (
        <PassDialog
          ticket={
            resource.data.find((ticket) => ticket.participant.id === selected)!
          }
          onClose={() => setSelected(null)}
        />
      )}
    </>
  );
}
function PassDialog({
  ticket,
  onClose,
}: {
  ticket: Registration;
  onClose: () => void;
}) {
  const resource = useResource<string>(ticket.participant.id, async () => {
    const response = await fetch(
      `/api/platform/passes/${ticket.participant.id}/qr`,
      {
        headers: {
          Authorization: `Bearer ${localStorage.getItem(EVENTZ_SESSION_TOKEN_KEY)}`,
        },
      },
    );
    if (!response.ok) throw new Error((await response.json()).error);
    return URL.createObjectURL(await response.blob());
  });
  useEffect(
    () => () => {
      if (resource.data) URL.revokeObjectURL(resource.data);
    },
    [resource.data],
  );
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const listener = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    const active = document.activeElement as HTMLElement;
    const dialog = document.querySelector<HTMLDialogElement>(".p-pass-dialog");
    dialog?.showModal();
    window.addEventListener("keydown", listener);
    return () => {
      window.removeEventListener("keydown", listener);
      document.body.style.overflow = previous;
      active?.focus();
    };
  }, []);
  return (
    <dialog
      className="p-pass-dialog"
      aria-label="Your event pass"
      onCancel={onClose}
    >
      <button
        className="p-icon-button p-dialog-close"
        onClick={onClose}
        aria-label="Close pass"
      >
        <X />
      </button>
      <BrandLogo className="p-pass-logo" />
      <span className="p-eyebrow">YOUR WAY IN</span>
      <h2>{ticket.event.eventName}</h2>
      <p>
        {dateLabel(ticket.event.eventDate)} · {ticket.event.eventTime}
      </p>
      {resource.loading ? (
        <Loading />
      ) : resource.error ? (
        <ErrorState message={resource.error} retry={resource.refresh} />
      ) : (
        <img
          className="p-pass-qr"
          src={resource.data!}
          alt="Your signed entrance QR code"
        />
      )}
      <h3>{ticket.participant.fullName}</h3>
      <code>{ticket.participant.passId}</code>
      <p>
        Present this personal pass at the entrance.
        <br />
        Keep it private. It belongs to you.
      </p>
      {resource.data && (
        <a
          className="p-button"
          href={resource.data}
          download={`eventz-pass-${ticket.participant.passId}.png`}
        >
          Download QR pass <ArrowDown size={16} />
        </a>
      )}
    </dialog>
  );
}
function Profile({
  user,
  onUpdate,
  notify,
}: {
  user: Account;
  onUpdate: (user: Account) => void;
  notify: (message: string) => void;
}) {
  const [name, setName] = useState(user.name),
    [bio, setBio] = useState(user.bio || ""),
    [image, setImage] = useState(user.profileImage || ""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <>
      <PageTitle
        eyebrow="YOUR PROFILE"
        title="A little more you."
        description="This is how people will see you when you bring them together."
      />
      <form
        className="p-profile-form p-form-panel"
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          setError("");
          try {
            const updated = await platformRequest<Account>(
              "/me",
              body({ name, bio, profileImage: image }, "PATCH"),
            );
            onUpdate(updated);
            localStorage.setItem("etsn_user", JSON.stringify(updated));
            notify("Profile updated. Looking good.");
          } catch (error: any) {
            setError(error.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <Avatar name={name} image={image} size="p-avatar-xl" />
        <label>
          Your name
          <input
            required
            maxLength={100}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label>
          A little about you
          <textarea
            rows={4}
            maxLength={600}
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            placeholder="Your interests, your community, or what brings you here."
          />
        </label>
        <label>
          Profile image URL <small>Optional · HTTPS</small>
          <input
            type="url"
            value={image}
            onChange={(e) => setImage(e.target.value)}
          />
        </label>
        <p className="p-form-note">Your email stays private: {user.email}</p>
        {error && (
          <p role="alert" className="p-error">
            {error}
          </p>
        )}
        <button className="p-button" disabled={busy}>
          {busy ? "Saving…" : "Save profile"}
          <Check size={17} />
        </button>
        <Link className="p-text-link" to={`/organizers/${user.id}`}>
          View my public profile <ArrowUpRight size={15} />
        </Link>
      </form>
    </>
  );
}
function VerifyPage({ passId }: { passId: string }) {
  const token = new URLSearchParams(window.location.search).get("t") || "";
  const resource = useResource<{
    name: string;
    eventName: string;
    status: string;
    message: string;
  }>(`${passId}:${token}`, () =>
    platformRequest(
      `/verify/${encodeURIComponent(passId)}?t=${encodeURIComponent(token)}`,
    ),
  );
  if (resource.loading) return <Loading />;
  if (resource.error || !resource.data)
    return <ErrorState message={resource.error} retry={resource.refresh} />;
  const result = resource.data;
  return (
    <Empty
      title={
        result.status === PassStatus.CANCELLED
          ? "This pass has been cancelled."
          : result.status === PassStatus.USED
            ? "This pass has already been used."
            : "A good moment is waiting."
      }
      description={`${result.name} · ${result.eventName}`}
    >
      <span className="p-tag">{result.status}</span>
      <p>{result.message}</p>
      <Link className="p-button" to="/organizer">
        Open event workspace <ArrowUpRight size={16} />
      </Link>
    </Empty>
  );
}
