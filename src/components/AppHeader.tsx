import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Mail,
  Mic,
  MicOff,
  Moon,
  Search,
  Settings2,
  Sun,
  X
} from 'lucide-react';
import { Participant, UserRole } from '../types.js';
import Logo from './Logo.tsx';
import HeaderAccountControl from './HeaderAccountControl.tsx';
import NotificationCenter from './NotificationCenter.tsx';

interface Props {
  currentUser: any;
  participants: Participant[];
  onNavigate: (page: string) => void;
  onMessage?: (message: string, type?: 'success' | 'error' | 'info') => void;
}

type ThemeMode = 'light' | 'dark';

export default function AppHeader({ currentUser, participants, onNavigate, onMessage }: Props) {
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [listening, setListening] = useState(false);
  const [theme, setTheme] = useState<ThemeMode>(() => {
    const stored = localStorage.getItem('eventz_theme');
    return stored === 'dark' ? 'dark' : 'light';
  });
  const searchRef = useRef<HTMLDivElement>(null);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return participants
      .filter((participant) =>
        [
          participant.fullName,
          participant.passId,
          participant.email,
          participant.phone,
          participant.organization,
          participant.category
        ].some((value) => String(value || '').toLowerCase().includes(q))
      )
      .slice(0, 6);
  }, [participants, query]);

  useEffect(() => {
    document.documentElement.dataset.eventzTheme = theme;
    localStorage.setItem('eventz_theme', theme);
  }, [theme]);

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) setSearchOpen(false);
    };
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, []);

  const openParticipant = (participant: Participant) => {
    sessionStorage.setItem('eventz_header_search', participant.passId || participant.fullName);
    setSearchOpen(false);
    setQuery('');
    onNavigate('participants');
  };

  const submitSearch = () => {
    if (results[0]) {
      openParticipant(results[0]);
      return;
    }
    if (query.trim()) {
      sessionStorage.setItem('eventz_header_search', query.trim());
      setSearchOpen(false);
      onNavigate('participants');
    }
  };

  const startVoiceSearch = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      onMessage?.('Voice search is not supported by this browser.', 'info');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onstart = () => setListening(true);
    recognition.onend = () => setListening(false);
    recognition.onerror = () => {
      setListening(false);
      onMessage?.('Voice search could not start. Check microphone permission.', 'error');
    };
    recognition.onresult = (event: any) => {
      const transcript = String(event.results?.[0]?.[0]?.transcript || '').trim();
      if (transcript) {
        setQuery(transcript);
        setSearchOpen(true);
      }
    };
    recognition.start();
  };

  const openEmailActivity = () => {
    sessionStorage.setItem('eventz_reports_tab', 'email');
    onNavigate('reports');
  };

  return (
    <header className="eventz-global-header">
      <button
        type="button"
        className="eventz-header-brand"
        onClick={() => onNavigate('dashboard')}
        aria-label="Open EVENTZ dashboard"
      >
        <Logo size="sm" variant="dark" />
      </button>

      <div ref={searchRef} className="eventz-header-search-wrap">
        <div className="eventz-header-search">
          <Search size={14} />
          <input
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setSearchOpen(true);
            }}
            onFocus={() => setSearchOpen(true)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') submitSearch();
              if (event.key === 'Escape') {
                setSearchOpen(false);
                setQuery('');
              }
            }}
            placeholder="Search"
            aria-label="Search participants and passes"
          />
          {query && (
            <button type="button" onClick={() => setQuery('')} className="eventz-header-search-clear" title="Clear search">
              <X size={12} />
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={startVoiceSearch}
          className={`eventz-header-circle ${listening ? 'eventz-header-circle-active' : ''}`}
          title={listening ? 'Listening…' : 'Voice search'}
          aria-label="Voice search"
        >
          {listening ? <MicOff size={14} /> : <Mic size={14} />}
        </button>

        {searchOpen && query.trim() && (
          <div className="eventz-header-search-results">
            {results.length > 0 ? (
              results.map((participant) => (
                <button
                  key={participant.id}
                  type="button"
                  onClick={() => openParticipant(participant)}
                  className="eventz-header-result"
                >
                  <span className="eventz-header-result-avatar">
                    {participant.fullName
                      .split(' ')
                      .map((part) => part[0])
                      .join('')
                      .slice(0, 2)
                      .toUpperCase()}
                  </span>
                  <span className="min-w-0">
                    <strong>{participant.fullName}</strong>
                    <small>{participant.passId} · {participant.category || 'Attendee'}</small>
                  </span>
                </button>
              ))
            ) : (
              <button type="button" onClick={submitSearch} className="eventz-header-result eventz-header-result-empty">
                <Search size={14} />
                <span>Search Manage Passes for “{query.trim()}”</span>
              </button>
            )}
          </div>
        )}
      </div>

      <div className="eventz-header-actions">
        {currentUser?.role === UserRole.ADMIN && (
          <button
            type="button"
            onClick={() => onNavigate('event-settings')}
            className="eventz-header-circle eventz-header-circle-accent"
            title="Event and pass settings"
            aria-label="Event settings"
          >
            <Settings2 size={14} />
          </button>
        )}

        <button
          type="button"
          onClick={() => setTheme((value) => value === 'light' ? 'dark' : 'light')}
          className="eventz-header-circle"
          title={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
          aria-label="Toggle appearance"
        >
          {theme === 'light' ? <Moon size={14} /> : <Sun size={14} />}
        </button>

        <NotificationCenter />

        {currentUser?.role === UserRole.ADMIN && (
          <button
            type="button"
            onClick={openEmailActivity}
            className="eventz-header-circle"
            title="Email delivery activity"
            aria-label="Email activity"
          >
            <Mail size={14} />
          </button>
        )}

        <HeaderAccountControl />
      </div>
    </header>
  );
}
