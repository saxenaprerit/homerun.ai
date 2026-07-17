import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";

// ── Types ────────────────────────────────────────────────────────────────
type Rel = "home" | "extended" | "friend";
type Person = { id: number; name: string; relationship: Rel; role?: string | null; emoji?: string | null; voiceId?: string | null; voiceName?: string | null };
type Grocery = { id: number; relationship: Rel; name: string; qty?: string | null; done: number };
type Bill = { id: number; relationship: Rel; name: string; amount: number; dueDay: number; kind: string; nextDate?: string; daysUntil?: number };
type Expense = { id: number; relationship: Rel; label: string; amount: number; category?: string | null; month: string };
type ExpenseSummary = { month: string; total: number; byCategory: { category: string; amount: number }[]; count: number };
type Event = { id: number; relationship: Rel; title: string; type: string; date: string; time?: string | null; attendees?: string | null; notes?: string | null };
type Movie = { id: number; title: string; year?: number | null; runtime?: number | null; rating?: string | null; reason: string };
type Reminder = { id: number; relationship: Rel; personId: number; message: string; dueAt?: string | null; done: number; personName: string; personEmoji?: string | null; hasVoice: boolean };

// ── Inline SVG icons ───────────────────────────────────────────────────────
const Icon = ({ children, size = 16 }: { children: React.ReactNode; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
);
const I = {
  cart:    <Icon><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.7 13.4a2 2 0 0 0 2 1.6h9.7a2 2 0 0 0 2-1.6L23 6H6"/></Icon>,
  wallet:  <Icon><path d="M20 12V8H6a2 2 0 0 1-2-2c0-1.1.9-2 2-2h12v4"/><path d="M4 6v12c0 1.1.9 2 2 2h14v-4"/><path d="M18 12a2 2 0 0 0 0 4h4v-4z"/></Icon>,
  cal:     <Icon><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></Icon>,
  film:    <Icon><rect x="2" y="2" width="20" height="20" rx="2.18"/><line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="2" y1="7" x2="7" y2="7"/><line x1="2" y1="17" x2="7" y2="17"/><line x1="17" y1="17" x2="22" y2="17"/><line x1="17" y1="7" x2="22" y2="7"/></Icon>,
  house:   <Icon><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></Icon>,
  users:   <Icon><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></Icon>,
  heart:   <Icon><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78z"/></Icon>,
  mic:     <Icon><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></Icon>,
  bell:    <Icon><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></Icon>,
  play:    <Icon><polygon points="5 3 19 12 5 21 5 3"/></Icon>,
};

// ── Helpers ──────────────────────────────────────────────────────────────
async function jget<T>(url: string): Promise<T> {
  const r = await fetch(url);
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((d as any).error || `HTTP ${r.status}`);
  return d as T;
}
async function jsend<T>(url: string, method: "POST" | "PATCH" | "DELETE", body?: any): Promise<T> {
  const r = await fetch(url, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((d as any).error || `HTTP ${r.status}`);
  return d as T;
}
const monthNow = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};
const fmtUSD = (n: number) => `$${n.toLocaleString(undefined, { maximumFractionDigits: 2, minimumFractionDigits: 2 })}`;

// ── App ──────────────────────────────────────────────────────────────────
function App() {
  const [rel, setRel] = useState<Rel>("home");
  const [ready, setReady] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    (async () => {
      try {
        await jsend("/api/seed", "POST");
      } catch (e) { console.error("seed failed:", e); }
      finally { setReady(true); }
    })();
  }, []);

  return (
    <>
      <div className="topbar">
        <h1>{I.house} Homerun.ai</h1>
        <div className="sub">Your family's shared memory — groceries, bills, calendar, movies, and voice reminders.</div>
      </div>

      <nav className="tabs" role="tablist" aria-label="Relationship">
        {([
          { key: "home",     label: "Home",     icon: I.house },
          { key: "extended", label: "Extended", icon: I.users },
          { key: "friend",   label: "Friends",  icon: I.heart },
        ] as { key: Rel; label: string; icon: React.ReactNode }[]).map((t) => (
          <button key={t.key} role="tab" aria-selected={rel === t.key} className="tab" onClick={() => setRel(t.key)}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>{t.icon} {t.label}</span>
          </button>
        ))}
      </nav>

      <main className="container">
        {!ready ? (
          <div className="grid">
            <div className="tile"><h2>{I.cart} Grocery</h2><div className="skeleton" /></div>
            <div className="tile"><h2>{I.wallet} Finances</h2><div className="skeleton" /></div>
            <div className="tile"><h2>{I.cal} Calendar</h2><div className="skeleton" /></div>
            <div className="tile"><h2>{I.film} Movie</h2><div className="skeleton" /></div>
          </div>
        ) : (
          <div className="grid">
            <RemindersTile rel={rel} refreshKey={refreshKey} />
            <VoicesTile rel={rel} refreshKey={refreshKey} />
            <GroceryTile rel={rel} refreshKey={refreshKey} />
            <FinancesTile rel={rel} refreshKey={refreshKey} />
            <CalendarTile rel={rel} refreshKey={refreshKey} />
            <MovieTile refreshKey={refreshKey} />
          </div>
        )}
        <div className="footer">Homerun.ai · v1 · voices by ElevenLabs</div>
      </main>
      <MicButton rel={rel} onDone={() => setRefreshKey((k) => k + 1)} />
    </>
  );
}

// ── Voice reminders tile ───────────────────────────────────────────────────
function RemindersTile({ rel, refreshKey }: { rel: Rel; refreshKey: number }) {
  const [people, setPeople] = useState<Person[] | null>(null);
  const [list, setList] = useState<Reminder[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [personId, setPersonId] = useState<number | "">("");
  const [message, setMessage] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [playing, setPlaying] = useState<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const load = async () => {
    setErr(null);
    try {
      const [p, r] = await Promise.all([
        jget<{ people: Person[] }>(`/api/people?rel=${rel}`),
        jget<{ reminders: Reminder[] }>(`/api/reminders?rel=${rel}`),
      ]);
      setPeople(p.people);
      setList(r.reminders);
      const withVoice = p.people.find((x) => x.voiceId);
      setPersonId((prev) => (prev === "" && withVoice ? withVoice.id : prev));
    } catch (e: any) { setErr(String(e?.message ?? e)); console.error(e); }
  };
  useEffect(() => { setPersonId(""); load(); }, [rel, refreshKey]);

  const voiced = (people ?? []).filter((p) => p.voiceId);

  const add = async () => {
    if (personId === "" || !message.trim()) return;
    const body = { rel, personId, message: message.trim(), dueAt: dueAt.trim() || undefined };
    setMessage(""); setDueAt("");
    try { await jsend("/api/reminders", "POST", body); await load(); }
    catch (e: any) { setErr(String(e?.message ?? e)); }
  };

  const toggle = async (id: number, done: number) => {
    setList((prev) => prev ? prev.map((x) => x.id === id ? { ...x, done: x.done ? 0 : 1 } : x) : prev);
    try { await jsend(`/api/reminders/${id}`, "PATCH", { done: done ? 0 : 1 }); }
    catch (e: any) { setErr(String(e?.message ?? e)); load(); }
  };

  const remove = async (id: number) => {
    setList((prev) => prev ? prev.filter((x) => x.id !== id) : prev);
    try { await jsend(`/api/reminders/${id}`, "DELETE"); }
    catch (e: any) { setErr(String(e?.message ?? e)); load(); }
  };

  const play = async (id: number) => {
    setErr(null);
    setPlaying(id);
    try {
      const r = await fetch(`/api/reminders/${id}/speak`);
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error((d as any).error || `HTTP ${r.status}`);
      }
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      if (audioRef.current) { audioRef.current.pause(); }
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => { setPlaying(null); URL.revokeObjectURL(url); };
      audio.onerror = () => { setPlaying(null); URL.revokeObjectURL(url); };
      await audio.play();
    } catch (e: any) {
      setErr(String(e?.message ?? e));
      setPlaying(null);
    }
  };

  return (
    <section className="tile" aria-label="Voice reminders">
      <h2><span className="ic">{I.bell}</span> Voice Reminders</h2>
      {voiced.length === 0 ? (
        <div className="empty">Clone a family member's voice in <b>Family Voices</b> first, then reminders can play back in their voice.</div>
      ) : (
        <>
          <div className="formRow">
            <select value={personId} onChange={(e) => setPersonId(e.target.value ? Number(e.target.value) : "")} aria-label="From">
              <option value="">From…</option>
              {voiced.map((p) => <option key={p.id} value={p.id}>{p.emoji ? p.emoji + " " : ""}{p.name}</option>)}
            </select>
          </div>
          <div className="formRow">
            <input placeholder="What should they say? e.g. Don't forget to call the electric guy" value={message} onChange={(e) => setMessage(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
          </div>
          <div className="formRow">
            <input placeholder="When (optional)" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
            <button onClick={add} disabled={personId === "" || !message.trim()}>Add</button>
          </div>
        </>
      )}
      {err && <div className="err">⚠ {err} <button onClick={load}>Retry</button></div>}
      {list === null ? <div className="skeleton" /> :
        list.length === 0 ? <div className="empty">No reminders yet.</div> :
        <ul className="list">
          {list.map((rm) => (
            <li key={rm.id} className={rm.done ? "done" : ""}>
              <input className="check" type="checkbox" checked={!!rm.done} onChange={() => toggle(rm.id, rm.done)} />
              <span className="name">
                <span style={{ fontWeight: 600 }}>{rm.personEmoji ? rm.personEmoji + " " : ""}{rm.personName}:</span> {rm.message}
                {rm.dueAt && <span className="qty"> · {rm.dueAt}</span>}
              </span>
              <button
                className="del"
                title={rm.hasVoice ? "Play in their voice" : "No cloned voice yet"}
                aria-label="Play"
                disabled={!rm.hasVoice || playing === rm.id}
                onClick={() => play(rm.id)}
                style={{ color: rm.hasVoice ? "var(--brand)" : "var(--muted)" }}
              >
                {playing === rm.id ? "…" : I.play}
              </button>
              <button className="del" onClick={() => remove(rm.id)} aria-label="Delete">✕</button>
            </li>
          ))}
        </ul>
      }
    </section>
  );
}

// ── Family voices tile (clone management) ──────────────────────────────────
function VoicesTile({ rel, refreshKey }: { rel: Rel; refreshKey: number }) {
  const [people, setPeople] = useState<Person[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = async () => {
    setErr(null);
    try { setPeople((await jget<{ people: Person[] }>(`/api/people?rel=${rel}`)).people); }
    catch (e: any) { setErr(String(e?.message ?? e)); console.error(e); }
  };
  useEffect(() => { load(); }, [rel, refreshKey]);

  return (
    <section className="tile" aria-label="Family voices">
      <h2><span className="ic">{I.mic}</span> Family Voices</h2>
      <div style={{ fontSize: 13, color: "var(--muted)" }}>
        Record or upload ~30–60s of each person speaking clearly. Their reminders then play back in their own voice.
      </div>
      {err && <div className="err">⚠ {err} <button onClick={load}>Retry</button></div>}
      {people === null ? <div className="skeleton" /> :
        people.length === 0 ? <div className="empty">No people in this tab yet.</div> :
        <ul className="list">
          {people.map((p) => <PersonVoiceRow key={p.id} person={p} onChange={load} setErr={setErr} />)}
        </ul>
      }
    </section>
  );
}

function PersonVoiceRow({ person, onChange, setErr }: { person: Person; onChange: () => void; setErr: (s: string | null) => void }) {
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const upload = async (blob: Blob, filename: string) => {
    setBusy(true);
    setErr(null);
    try {
      const fd = new FormData();
      fd.append("audio", blob, filename);
      const r = await fetch(`/api/people/${person.id}/voice`, { method: "POST", body: fd });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error((d as any).error || `HTTP ${r.status}`);
      onChange();
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    } finally {
      setBusy(false);
    }
  };

  const startRec = async () => {
    setErr(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" });
        stream.getTracks().forEach((t) => t.stop());
        setRecording(false);
        if (blob.size > 0) upload(blob, `${person.name}-sample.webm`);
      };
      recRef.current = rec;
      rec.start();
      setRecording(true);
    } catch (e: any) {
      setErr("Microphone unavailable: " + String(e?.message ?? e));
    }
  };
  const stopRec = () => { recRef.current?.stop(); };

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) upload(f, f.name);
    e.target.value = "";
  };

  return (
    <li>
      <span className="name">
        {person.emoji ? person.emoji + " " : ""}{person.name}
        {person.voiceId
          ? <span className="badge" style={{ marginLeft: 8 }}>voice ready</span>
          : <span className="badge warn" style={{ marginLeft: 8 }}>no voice</span>}
      </span>
      {busy ? <span className="meta">cloning…</span> : (
        <span style={{ display: "inline-flex", gap: 6 }}>
          {recording
            ? <button className="del" style={{ color: "var(--danger)" }} onClick={stopRec} title="Stop &amp; clone">■ stop</button>
            : <button className="del" style={{ color: "var(--brand)" }} onClick={startRec} title="Record sample" aria-label="Record">{I.mic}</button>}
          <button className="del" onClick={() => fileRef.current?.click()} title="Upload audio file" aria-label="Upload">⤴</button>
          <input ref={fileRef} type="file" accept="audio/*" style={{ display: "none" }} onChange={onFile} />
        </span>
      )}
    </li>
  );
}

// ── Grocery tile ─────────────────────────────────────────────────────────
function GroceryTile({ rel, refreshKey }: { rel: Rel; refreshKey: number }) {
  const [items, setItems] = useState<Grocery[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [qty, setQty] = useState("");

  const load = async () => {
    setErr(null);
    try { setItems((await jget<{ items: Grocery[] }>(`/api/grocery?rel=${rel}`)).items); }
    catch (e: any) { setErr(String(e?.message ?? e)); console.error(e); }
  };
  useEffect(() => { load(); }, [rel, refreshKey]);

  const add = async () => {
    const n = name.trim(); if (!n) return;
    setName(""); setQty("");
    const tmpId = -Date.now();
    setItems((prev) => prev ? [{ id: tmpId, relationship: rel, name: n, qty: qty.trim() || null, done: 0 }, ...prev] : prev);
    try { await jsend("/api/grocery", "POST", { rel, name: n, qty }); await load(); }
    catch (e: any) { setErr(String(e?.message ?? e)); load(); }
  };

  const toggle = async (id: number, done: number) => {
    setItems((prev) => prev ? prev.map((x) => x.id === id ? { ...x, done: x.done ? 0 : 1 } : x) : prev);
    try { await jsend(`/api/grocery/${id}`, "PATCH", { done: done ? 0 : 1 }); }
    catch (e: any) { setErr(String(e?.message ?? e)); load(); }
  };

  const remove = async (id: number) => {
    setItems((prev) => prev ? prev.filter((x) => x.id !== id) : prev);
    try { await jsend(`/api/grocery/${id}`, "DELETE"); }
    catch (e: any) { setErr(String(e?.message ?? e)); load(); }
  };

  return (
    <section className="tile" aria-label="Grocery">
      <h2><span className="ic">{I.cart}</span> Grocery</h2>
      <div className="formRow">
        <input placeholder="Add item…" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
        <input placeholder="Qty" value={qty} onChange={(e) => setQty(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} style={{ maxWidth: 90 }} />
        <button onClick={add} disabled={!name.trim()}>Add</button>
      </div>
      {err && <div className="err">⚠ {err} <button onClick={load}>Retry</button></div>}
      {items === null ? <div className="skeleton" /> :
        items.length === 0 ? <div className="empty">No groceries yet — add one above.</div> :
        <ul className="list">
          {items.map((it) => (
            <li key={it.id} className={it.done ? "done" : ""}>
              <input className="check" type="checkbox" checked={!!it.done} onChange={() => toggle(it.id, it.done)} />
              <span className="name">{it.name}</span>
              {it.qty && <span className="qty">{it.qty}</span>}
              <button className="del" onClick={() => remove(it.id)} aria-label="Delete">✕</button>
            </li>
          ))}
        </ul>
      }
    </section>
  );
}

// ── Finances tile ────────────────────────────────────────────────────────
function FinancesTile({ rel, refreshKey }: { rel: Rel; refreshKey: number }) {
  const [upcoming, setUpcoming] = useState<Bill[] | null>(null);
  const [summary, setSummary] = useState<ExpenseSummary | null>(null);
  const [bills, setBills] = useState<Bill[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const month = monthNow();

  const [bName, setBName] = useState(""); const [bAmt, setBAmt] = useState(""); const [bDay, setBDay] = useState(""); const [bKind, setBKind] = useState<"bill" | "credit_card">("bill");
  const [eLabel, setELabel] = useState(""); const [eAmt, setEAmt] = useState(""); const [eCat, setECat] = useState("dining");

  const load = async () => {
    setErr(null);
    try {
      const [u, s, b] = await Promise.all([
        jget<{ upcoming: Bill[] }>(`/api/bills/upcoming?rel=${rel}`),
        jget<ExpenseSummary>(`/api/expenses/summary?rel=${rel}&month=${month}`),
        jget<{ bills: Bill[] }>(`/api/bills?rel=${rel}`),
      ]);
      setUpcoming(u.upcoming); setSummary(s); setBills(b.bills);
    } catch (e: any) { setErr(String(e?.message ?? e)); console.error(e); }
  };
  useEffect(() => { load(); }, [rel, month, refreshKey]);

  const addBill = async () => {
    const amt = parseFloat(bAmt); const day = parseInt(bDay, 10);
    if (!bName.trim() || !Number.isFinite(amt) || !Number.isFinite(day)) return;
    setBName(""); setBAmt(""); setBDay("");
    try { await jsend("/api/bills", "POST", { rel, name: bName, amount: amt, dueDay: day, kind: bKind }); await load(); }
    catch (e: any) { setErr(String(e?.message ?? e)); }
  };

  const addExpense = async () => {
    const amt = parseFloat(eAmt); if (!eLabel.trim() || !Number.isFinite(amt)) return;
    setELabel(""); setEAmt("");
    try { await jsend("/api/expenses", "POST", { rel, label: eLabel, amount: amt, category: eCat, month }); await load(); }
    catch (e: any) { setErr(String(e?.message ?? e)); }
  };

  const maxCat = summary?.byCategory?.[0]?.amount ?? 1;

  return (
    <section className="tile" aria-label="Finances">
      <h2><span className="ic">{I.wallet}</span> Finances</h2>
      {err && <div className="err">⚠ {err} <button onClick={load}>Retry</button></div>}

      <div>
        <div style={{ fontSize: 12, color: "var(--muted)", textTransform: "uppercase", letterSpacing: .5, marginBottom: 6 }}>Upcoming · next 14 days</div>
        {upcoming === null ? <div className="skeleton" /> :
         upcoming.length === 0 ? <div className="empty">Nothing due in the next two weeks.</div> :
         <ul className="list">
           {upcoming.map((b) => (
             <li key={b.id}>
               <span className="name">{b.kind === "credit_card" ? "💳 " : ""}{b.name}</span>
               <span className="meta">{fmtUSD(b.amount)}</span>
               <span className={"badge " + (b.daysUntil! <= 3 ? "danger" : b.daysUntil! <= 7 ? "warn" : "")}>
                 {b.daysUntil === 0 ? "today" : `in ${b.daysUntil}d`}
               </span>
             </li>
           ))}
         </ul>
        }
      </div>

      <div>
        <div style={{ fontSize: 12, color: "var(--muted)", textTransform: "uppercase", letterSpacing: .5, marginBottom: 6 }}>This month</div>
        {summary === null ? <div className="skeleton" /> : (
          <div className="summary">
            <div className="total">{fmtUSD(summary.total)}</div>
            {summary.byCategory.slice(0, 4).map((c) => (
              <div className="bar" key={c.category}>
                <span style={{ minWidth: 80 }}>{c.category}</span>
                <div className="track"><div className="fill" style={{ width: `${Math.min(100, (c.amount / maxCat) * 100)}%` }} /></div>
                <span>{fmtUSD(c.amount)}</span>
              </div>
            ))}
            {summary.count === 0 && <div className="empty">No expenses logged yet this month.</div>}
          </div>
        )}
      </div>

      <details>
        <summary>Add bill</summary>
        <div className="formRow" style={{ marginTop: 6 }}>
          <input placeholder="Name" value={bName} onChange={(e) => setBName(e.target.value)} />
          <input placeholder="Amt" value={bAmt} onChange={(e) => setBAmt(e.target.value)} style={{ maxWidth: 90 }} />
        </div>
        <div className="formRow" style={{ marginTop: 6 }}>
          <input placeholder="Due day (1-31)" value={bDay} onChange={(e) => setBDay(e.target.value)} style={{ maxWidth: 120 }} />
          <select value={bKind} onChange={(e) => setBKind(e.target.value as any)}>
            <option value="bill">Bill</option>
            <option value="credit_card">Credit card</option>
          </select>
          <button onClick={addBill}>Add</button>
        </div>
      </details>

      <details>
        <summary>Add expense</summary>
        <div className="formRow" style={{ marginTop: 6 }}>
          <input placeholder="Label" value={eLabel} onChange={(e) => setELabel(e.target.value)} />
          <input placeholder="Amt" value={eAmt} onChange={(e) => setEAmt(e.target.value)} style={{ maxWidth: 90 }} />
        </div>
        <div className="formRow" style={{ marginTop: 6 }}>
          <select value={eCat} onChange={(e) => setECat(e.target.value)}>
            <option value="dining">Dining</option>
            <option value="groceries">Groceries</option>
            <option value="utilities">Utilities</option>
            <option value="kids">Kids</option>
            <option value="gifts">Gifts</option>
            <option value="other">Other</option>
          </select>
          <button onClick={addExpense}>Add</button>
        </div>
      </details>

      {bills && bills.length > 0 && (
        <details>
          <summary>All bills ({bills.length})</summary>
          <ul className="list" style={{ marginTop: 6 }}>
            {bills.map((b) => (
              <li key={b.id}>
                <span className="name">{b.kind === "credit_card" && <span className="badge card" style={{ marginRight: 6 }}>card</span>}{b.name}</span>
                <span className="meta">day {b.dueDay} · {fmtUSD(b.amount)}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

// ── Calendar tile ────────────────────────────────────────────────────────
function CalendarTile({ rel, refreshKey }: { rel: Rel; refreshKey: number }) {
  const [list, setList] = useState<Event[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [type, setType] = useState<"dinner" | "outing" | "movie">("dinner");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [time, setTime] = useState("18:00");
  const [notes, setNotes] = useState("");

  const load = async () => {
    setErr(null);
    try { setList((await jget<{ events: Event[] }>(`/api/events?rel=${rel}`)).events); }
    catch (e: any) { setErr(String(e?.message ?? e)); console.error(e); }
  };
  useEffect(() => { load(); }, [rel, refreshKey]);

  const add = async () => {
    if (!title.trim()) return;
    const body = { rel, title: title.trim(), type, date, time, notes: notes.trim() };
    setTitle(""); setNotes("");
    try { await jsend("/api/events", "POST", body); await load(); }
    catch (e: any) { setErr(String(e?.message ?? e)); }
  };

  const remove = async (id: number) => {
    setList((prev) => prev ? prev.filter((x) => x.id !== id) : prev);
    try { await jsend(`/api/events/${id}`, "DELETE"); }
    catch (e: any) { setErr(String(e?.message ?? e)); load(); }
  };

  const grouped = useMemo(() => {
    const m = new Map<string, Event[]>();
    (list ?? []).forEach((e) => { if (!m.has(e.date)) m.set(e.date, []); m.get(e.date)!.push(e); });
    return Array.from(m.entries());
  }, [list]);

  const typeIcon = (t: string) => t === "outing" ? "🎉" : t === "movie" ? "🎬" : "🍽";

  return (
    <section className="tile" aria-label="Calendar">
      <h2><span className="ic">{I.cal}</span> Calendar</h2>
      <div className="formRow">
        <input placeholder="What?" value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
        <select value={type} onChange={(e) => setType(e.target.value as any)}>
          <option value="dinner">Dinner</option>
          <option value="outing">Outing</option>
          <option value="movie">Movie</option>
        </select>
      </div>
      <div className="formRow">
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <input type="time" value={time} onChange={(e) => setTime(e.target.value)} style={{ maxWidth: 120 }} />
      </div>
      <div className="formRow">
        <input placeholder="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
        <button onClick={add} disabled={!title.trim()}>Add</button>
      </div>
      {err && <div className="err">⚠ {err} <button onClick={load}>Retry</button></div>}
      {list === null ? <div className="skeleton" /> :
       list.length === 0 ? <div className="empty">No upcoming events in the next 30 days.</div> :
       <ul className="list">
         {grouped.flatMap(([d, evs]) => [
           <li key={`d-${d}`} style={{ background: "transparent", border: 0, padding: "4px 0 0", color: "var(--muted)", fontSize: 12, textTransform: "uppercase", letterSpacing: .5 }}>{d}</li>,
           ...evs.map((e) => (
             <li key={e.id}>
               <span className="name">{typeIcon(e.type)} {e.title}{e.time ? <span className="qty"> · {e.time}</span> : null}</span>
               {e.notes && <span className="meta">{e.notes}</span>}
               <button className="del" onClick={() => remove(e.id)} aria-label="Delete">✕</button>
             </li>
           )),
         ])}
       </ul>
      }
    </section>
  );
}

// ── Movie tile ───────────────────────────────────────────────────────────
function MovieTile({ refreshKey }: { refreshKey: number }) {
  const [tonight, setTonight] = useState<Movie | null>(null);
  const [all, setAll] = useState<Movie[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = async () => {
    setErr(null);
    try {
      const [t, a] = await Promise.all([
        jget<{ movie: Movie }>("/api/movies/tonight"),
        jget<{ movies: Movie[] }>("/api/movies"),
      ]);
      setTonight(t.movie); setAll(a.movies);
    } catch (e: any) { setErr(String(e?.message ?? e)); console.error(e); }
  };
  useEffect(() => { load(); }, [refreshKey]);

  return (
    <section className="tile" aria-label="Movie">
      <h2><span className="ic">{I.film}</span> Movie</h2>
      {err && <div className="err">⚠ {err} <button onClick={load}>Retry</button></div>}
      {!tonight && !err && <div className="skeleton" />}
      {tonight && (
        <div className="movie">
          <div className="title">{tonight.title}</div>
          <div className="meta">
            {tonight.year ?? ""}{tonight.runtime ? ` · ${tonight.runtime} min` : ""}{tonight.rating ? ` · ${tonight.rating}` : ""}
          </div>
          <div className="why"><b>Why tonight: </b>{tonight.reason}</div>
        </div>
      )}
      {all && all.length > 0 && (
        <details>
          <summary>All picks ({all.length})</summary>
          <ul className="list" style={{ marginTop: 6 }}>
            {all.map((m) => (
              <li key={m.id}>
                <span className="name">{m.title}{m.rating ? <span className="badge" style={{ marginLeft: 6 }}>{m.rating}</span> : null}</span>
                <span className="meta">{m.runtime ? `${m.runtime}m` : ""}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

// ── Floating voice-command mic ────────────────────────────────────
type AgentResp = { ok?: boolean; action?: string; transcript?: string; reply?: string; error?: string };

function MicButton({ rel, onDone }: { rel: Rel; onDone: () => void }) {
  const [state, setState] = useState<"idle" | "recording" | "working">("idle");
  const [panel, setPanel] = useState<{ transcript?: string; reply: string; ok: boolean } | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const stopTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const today = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };

  const cleanup = () => {
    if (stopTimer.current) { clearTimeout(stopTimer.current); stopTimer.current = null; }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  const upload = async () => {
    const blob = new Blob(chunksRef.current, { type: recRef.current?.mimeType || "audio/webm" });
    cleanup();
    recRef.current = null;
    if (blob.size < 1200) { setPanel({ reply: "Didn't hear anything — tap the mic and speak.", ok: false }); setState("idle"); return; }
    const fd = new FormData();
    fd.append("audio", blob, "command.webm");
    fd.append("rel", rel);
    fd.append("today", today());
    try {
      const r = await fetch("/api/agent/voice", { method: "POST", body: fd });
      const d: AgentResp = await r.json().catch(() => ({}));
      if (!r.ok) setPanel({ reply: d.error || `Error ${r.status}`, ok: false });
      else {
        setPanel({ transcript: d.transcript, reply: d.reply || (d.ok ? "Done." : "Sorry, I couldn't do that."), ok: !!d.ok });
        if (d.ok) onDone();
      }
    } catch (e: any) {
      setPanel({ reply: String(e?.message ?? e), ok: false });
    } finally {
      setState("idle");
    }
  };

  const start = async () => {
    setPanel(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      const rec = new MediaRecorder(stream);
      recRef.current = rec;
      rec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      rec.onstop = () => { void upload(); };
      rec.start();
      setState("recording");
      stopTimer.current = setTimeout(() => stop(), 15000);
    } catch {
      setPanel({ reply: "Mic access denied. Enable microphone permission and try again.", ok: false });
      cleanup();
      recRef.current = null;
      setState("idle");
    }
  };

  const stop = () => {
    if (stopTimer.current) { clearTimeout(stopTimer.current); stopTimer.current = null; }
    const rec = recRef.current;
    if (rec && rec.state !== "inactive") { setState("working"); rec.stop(); }
  };

  const onClick = () => { if (state === "recording") stop(); else if (state === "idle") start(); };

  return (
    <div className="mic-wrap">
      {panel && (
        <div className={"mic-panel " + (panel.ok ? "ok" : "bad")}>
          {panel.transcript && <div className="mic-heard">“{panel.transcript}”</div>}
          <div className="mic-reply">{panel.reply}</div>
          <button className="mic-dismiss" onClick={() => setPanel(null)} aria-label="Dismiss">✕</button>
        </div>
      )}
      {state === "recording" && <div className="mic-hint">Listening… tap to send</div>}
      <button
        className={"mic-btn " + state}
        onClick={onClick}
        disabled={state === "working"}
        aria-label={state === "recording" ? "Stop and send" : "Speak a command"}
        title={state === "recording" ? "Tap to send" : "Tap and speak, e.g. “Add Interstellar to the movies list”"}
      >
        {state === "working" ? <span className="mic-spin" /> : I.mic}
      </button>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
