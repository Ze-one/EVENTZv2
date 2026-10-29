import React, { useEffect, useState } from "react";
import {
  CheckCircle2,
  ExternalLink,
  RefreshCw,
  Search,
  Users,
} from "lucide-react";
import { EventDetails, Participant, PassStatus } from "../types.js";
import { workspaceFetch } from "../utils/auth.js";

export default function RegistrationManagementView({
  event,
}: {
  event: EventDetails;
  adminName: string;
  onSaveEvent: (event: EventDetails) => void;
  onChanged: () => void;
}) {
  const [items, setItems] = useState<Participant[]>([]),
    [query, setQuery] = useState(""),
    [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const refresh = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await workspaceFetch("/api/participants");
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setItems(data.filter((p: Participant) => p.userId));
    } catch (error: any) {
      setError(error.message || "Could not load registrations.");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    refresh();
  }, [event.id]);
  const filtered = items.filter((p) =>
    `${p.fullName} ${p.email}`.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <section className="bg-white rounded-2xl border border-slate-200 p-5 space-y-5">
      <div className="flex flex-wrap gap-3 justify-between items-start">
        <div>
          <h2 className="font-black text-lg flex items-center gap-2">
            <Users size={20} /> Event registrations
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            People joining your event through EVENTZ receive their pass
            immediately.
          </p>
        </div>
        <button
          onClick={refresh}
          className="p-2 border rounded-lg"
          aria-label="Refresh registrations"
        >
          <RefreshCw size={17} />
        </button>
      </div>
      <div className="flex flex-wrap gap-3">
        <a
          className="text-sm font-bold underline inline-flex gap-2 items-center"
          href={`/events/${event.id}`}
        >
          <ExternalLink size={15} /> Public event page
        </a>
        <a
          className="text-sm font-bold underline"
          href={`/events/${event.id}/edit`}
        >
          Edit registration availability and capacity
        </a>
      </div>
      <label className="flex items-center gap-2 border rounded-xl px-3 py-2">
        <Search size={16} />
        <input
          aria-label="Search registrations"
          placeholder="Search by attendee name or email"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full outline-none text-sm"
        />
      </label>
      {error && (
        <p role="alert" className="text-red-700">
          {error}
        </p>
      )}
      {loading ? (
        <p role="status">Loading registrations…</p>
      ) : !filtered.length ? (
        <p className="text-slate-500 py-8 text-center">
          {query
            ? "No matching registrations."
            : "Your online registrations will appear here."}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="text-slate-500 border-b">
                <th className="py-3">Attendee</th>
                <th>Registered</th>
                <th>Pass status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.id} className="border-b border-slate-100">
                  <td className="py-4">
                    <strong>{p.fullName}</strong>
                    <div className="text-xs text-slate-500">{p.email}</div>
                  </td>
                  <td>{new Date(p.createdAt).toLocaleDateString()}</td>
                  <td>
                    <span className="inline-flex items-center gap-1">
                      <CheckCircle2 size={14} />
                      {p.status === PassStatus.CANCELLED
                        ? "Cancelled"
                        : p.status === PassStatus.USED
                          ? "Checked in"
                          : "Confirmed"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
