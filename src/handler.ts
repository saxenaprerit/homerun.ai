import type { AppCtx, AppHandler } from "@sauna/apps-runtime";
import { Hono } from "hono";
import { eq, and, gte, lte, asc, desc } from "drizzle-orm";
import {
  makeDb,
  people, groceryItems, bills, expenses, events, movies, reminders,
} from "./db";
import { buildSeed } from "./lib/seed";
import { pickTonight, todayLocal } from "./lib/movie";

// Bind ctx through to Hono so routes can reach ctx.session if needed.
type Env = { sql: any; websocket: any; ctx: AppCtx; ASSETS?: { fetch: (url: string) => Promise<Response> } };
const app = new Hono<{ Bindings: Env }>();

const RELS = new Set(["home", "extended", "friend"]);

// ── ElevenLabs (user's paid connection, pinned at deploy) ──────────────────
// Pin the paid Starter connection so the proxy injects the right key. Do NOT
// set an xi-api-key header — the proxy injects it; a manual header 401s.
const EL_BASE = "https://api.elevenlabs.io";
const EL_CONN = "conn_pd_apn_Bmhenw3";
const elHeaders = (extra: Record<string, string> = {}) => ({
  "X-Sauna-Connection-Id": EL_CONN,
  ...extra,
});

function nowSec() { return Math.floor(Date.now() / 1000); }
function isRel(s: unknown): s is "home" | "extended" | "friend" {
  return typeof s === "string" && RELS.has(s);
}

// Strip markdown/URLs so TTS never reads syntax aloud.
function cleanForSpeech(s: string): string {
  return s
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[*_`#>]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Compute the next occurrence of `dueDay` from today, then return its
// YYYY-MM-DD string + daysUntil. Roll to next month if dueDay already passed.
function nextDueDate(dueDay: number, today: Date): { nextDate: string; daysUntil: number } {
  const y = today.getFullYear();
  const m = today.getMonth();

  const candidateThis = new Date(y, m, Math.min(dueDay, daysInMonth(y, m)));
  let target = candidateThis;
  if (target.getTime() < startOfDay(today).getTime()) {
    const nm = m + 1;
    const ny = nm > 11 ? y + 1 : y;
    const realNm = ((nm % 12) + 12) % 12;
    target = new Date(ny, realNm, Math.min(dueDay, daysInMonth(ny, realNm)));
  }
  const ms = target.getTime() - startOfDay(today).getTime();
  const daysUntil = Math.round(ms / 86_400_000);
  const nextDate = `${target.getFullYear()}-${pad(target.getMonth() + 1)}-${pad(target.getDate())}`;
  return { nextDate, daysUntil };
}
function daysInMonth(y: number, m: number): number {
  return new Date(y, m + 1, 0).getDate();
}
function pad(n: number) { return n.toString().padStart(2, "0"); }
function startOfDay(d: Date) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }

// ── People ───────────────────────────────────────────────────────────────
app.get("/api/people", async (c) => {
  const rel = c.req.query("rel");
  const db = makeDb(c.env);
  if (rel && !isRel(rel)) return c.json({ error: "invalid rel" }, 400);
  const rows = rel
    ? await db.select().from(people).where(eq(people.relationship, rel)).orderBy(asc(people.name)).all()
    : await db.select().from(people).orderBy(asc(people.relationship), asc(people.name)).all();
  return c.json({ people: rows });
});

app.post("/api/people", async (c) => {
  const body = await c.req.json<{ rel?: string; relationship?: string; name: string; role?: string; emoji?: string }>();
  const rel = body.rel ?? body.relationship;
  if (!isRel(rel)) return c.json({ error: "invalid rel" }, 400);
  if (!body.name?.trim()) return c.json({ error: "name required" }, 400);
  const db = makeDb(c.env);
  const res = await db.insert(people).values({
    name: body.name.trim(),
    relationship: rel,
    role: body.role ?? null,
    emoji: body.emoji ?? null,
    createdAt: nowSec(),
  }).run();
  return c.json({ ok: true, id: Number((res as any).lastInsertRowid ?? 0) });
});

app.delete("/api/people/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isFinite(id)) return c.json({ error: "bad id" }, 400);
  const db = makeDb(c.env);
  await db.delete(people).where(eq(people.id, id)).run();
  return c.json({ ok: true });
});

// ── Voice cloning ──────────────────────────────────────────────────────────
// Upload one or more audio samples for a person → clone via ElevenLabs →
// store the returned voice_id on the person. Expects multipart form with one
// or more `audio` file parts.
app.post("/api/people/:id/voice", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isFinite(id)) return c.json({ error: "bad id" }, 400);
  const db = makeDb(c.env);
  const person = await db.select().from(people).where(eq(people.id, id)).get();
  if (!person) return c.json({ error: "person not found" }, 404);

  const form = await c.req.formData();
  const files = form.getAll("audio").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) return c.json({ error: "no audio sample uploaded" }, 400);

  const voiceName = `Homerun – ${person.name} (#${person.id})`;
  const out = new FormData();
  out.append("name", voiceName);
  out.append("description", `Cloned family voice for ${person.name} in Homerun.ai`);
  out.append("remove_background_noise", "true");
  for (const f of files) {
    out.append("files", f, f.name || `sample-${Date.now()}.webm`);
  }

  const r = await fetch(`${EL_BASE}/v1/voices/add`, {
    method: "POST",
    headers: elHeaders(),
    body: out,
  });
  const text = await r.text();
  if (!r.ok) {
    console.error("clone failed", r.status, text);
    let msg = text;
    try { msg = JSON.parse(text)?.detail?.message ?? text; } catch {}
    return c.json({ error: `ElevenLabs clone failed: ${msg}` }, 502);
  }
  const data = JSON.parse(text) as { voice_id?: string };
  if (!data.voice_id) return c.json({ error: "no voice_id returned" }, 502);

  await db.update(people).set({
    voiceId: data.voice_id,
    voiceName,
    voiceCreatedAt: nowSec(),
  }).where(eq(people.id, id)).run();

  return c.json({ ok: true, voiceId: data.voice_id, voiceName });
});

// Remove a person's cloned voice (delete upstream + clear local binding).
app.delete("/api/people/:id/voice", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isFinite(id)) return c.json({ error: "bad id" }, 400);
  const db = makeDb(c.env);
  const person = await db.select().from(people).where(eq(people.id, id)).get();
  if (!person) return c.json({ error: "person not found" }, 404);
  if (person.voiceId) {
    const r = await fetch(`${EL_BASE}/v1/voices/${person.voiceId}`, {
      method: "DELETE",
      headers: elHeaders(),
    });
    if (!r.ok) console.error("upstream voice delete failed", r.status, await r.text());
  }
  await db.update(people).set({ voiceId: null, voiceName: null, voiceCreatedAt: null }).where(eq(people.id, id)).run();
  return c.json({ ok: true });
});

// ── Reminders (voice) ──────────────────────────────────────────────────────
app.get("/api/reminders", async (c) => {
  const rel = c.req.query("rel");
  if (rel && !isRel(rel)) return c.json({ error: "invalid rel" }, 400);
  const db = makeDb(c.env);
  const rows = rel
    ? await db.select().from(reminders).where(eq(reminders.relationship, rel)).orderBy(asc(reminders.done), desc(reminders.createdAt)).all()
    : await db.select().from(reminders).orderBy(asc(reminders.done), desc(reminders.createdAt)).all();
  // Join person name / emoji / voice state for display.
  const ppl = await db.select().from(people).all();
  const byId = new Map(ppl.map((p) => [p.id, p]));
  const out = rows.map((rm) => {
    const p = byId.get(rm.personId);
    return {
      ...rm,
      personName: p?.name ?? "Someone",
      personEmoji: p?.emoji ?? null,
      hasVoice: !!p?.voiceId,
    };
  });
  return c.json({ reminders: out });
});

app.post("/api/reminders", async (c) => {
  const body = await c.req.json<{ rel?: string; personId: number; message: string; dueAt?: string }>();
  if (!isRel(body.rel)) return c.json({ error: "invalid rel" }, 400);
  if (!Number.isFinite(body.personId)) return c.json({ error: "personId required" }, 400);
  if (!body.message?.trim()) return c.json({ error: "message required" }, 400);
  const db = makeDb(c.env);
  const person = await db.select().from(people).where(eq(people.id, body.personId)).get();
  if (!person) return c.json({ error: "person not found" }, 404);
  const res = await db.insert(reminders).values({
    relationship: body.rel,
    personId: body.personId,
    message: body.message.trim(),
    dueAt: body.dueAt?.trim() || null,
    done: 0,
    createdAt: nowSec(),
  }).run();
  return c.json({ ok: true, id: Number((res as any).lastInsertRowid ?? 0) });
});

app.patch("/api/reminders/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const body = await c.req.json<{ done?: number }>();
  if (!Number.isFinite(id)) return c.json({ error: "bad id" }, 400);
  const db = makeDb(c.env);
  await db.update(reminders).set({ done: body.done ? 1 : 0 }).where(eq(reminders.id, id)).run();
  return c.json({ ok: true });
});

app.delete("/api/reminders/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isFinite(id)) return c.json({ error: "bad id" }, 400);
  const db = makeDb(c.env);
  await db.delete(reminders).where(eq(reminders.id, id)).run();
  return c.json({ ok: true });
});

// Speak a reminder in the requesting person's cloned voice → audio/mpeg.
app.get("/api/reminders/:id/speak", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isFinite(id)) return c.json({ error: "bad id" }, 400);
  const db = makeDb(c.env);
  const rm = await db.select().from(reminders).where(eq(reminders.id, id)).get();
  if (!rm) return c.json({ error: "reminder not found" }, 404);
  const person = await db.select().from(people).where(eq(people.id, rm.personId)).get();
  if (!person?.voiceId) return c.json({ error: "no cloned voice for this person yet" }, 409);

  const spoken = cleanForSpeech(rm.message);
  const r = await fetch(`${EL_BASE}/v1/text-to-speech/${person.voiceId}`, {
    method: "POST",
    headers: elHeaders({ "content-type": "application/json", accept: "audio/mpeg" }),
    body: JSON.stringify({
      text: spoken,
      model_id: "eleven_turbo_v2_5",
      voice_settings: { stability: 0.5, similarity_boost: 0.75 },
    }),
  });
  if (!r.ok) {
    const t = await r.text();
    console.error("tts failed", r.status, t);
    let msg = t;
    try { msg = JSON.parse(t)?.detail?.message ?? t; } catch {}
    return c.json({ error: `ElevenLabs TTS failed: ${msg}` }, 502);
  }
  const buf = await r.arrayBuffer();
  return new Response(buf, {
    headers: { "content-type": "audio/mpeg", "cache-control": "no-store" },
  });
});

// ── Grocery ──────────────────────────────────────────────────────────────
app.get("/api/grocery", async (c) => {
  const rel = c.req.query("rel");
  if (rel && !isRel(rel)) return c.json({ error: "invalid rel" }, 400);
  const db = makeDb(c.env);
  const rows = rel
    ? await db.select().from(groceryItems).where(eq(groceryItems.relationship, rel)).orderBy(asc(groceryItems.done), asc(groceryItems.id)).all()
    : await db.select().from(groceryItems).orderBy(asc(groceryItems.relationship), asc(groceryItems.done), asc(groceryItems.id)).all();
  return c.json({ items: rows });
});

app.post("/api/grocery", async (c) => {
  const body = await c.req.json<{ rel?: string; name: string; qty?: string }>();
  if (!isRel(body.rel)) return c.json({ error: "invalid rel" }, 400);
  if (!body.name?.trim()) return c.json({ error: "name required" }, 400);
  const db = makeDb(c.env);
  const res = await db.insert(groceryItems).values({
    relationship: body.rel,
    name: body.name.trim(),
    qty: body.qty?.trim() || null,
    done: 0,
    createdAt: nowSec(),
  }).run();
  return c.json({ ok: true, id: Number((res as any).lastInsertRowid ?? 0) });
});

app.patch("/api/grocery/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const body = await c.req.json<{ done?: number }>();
  if (!Number.isFinite(id)) return c.json({ error: "bad id" }, 400);
  const db = makeDb(c.env);
  await db.update(groceryItems).set({ done: body.done ? 1 : 0 }).where(eq(groceryItems.id, id)).run();
  return c.json({ ok: true });
});

app.delete("/api/grocery/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isFinite(id)) return c.json({ error: "bad id" }, 400);
  const db = makeDb(c.env);
  await db.delete(groceryItems).where(eq(groceryItems.id, id)).run();
  return c.json({ ok: true });
});

// ── Bills ────────────────────────────────────────────────────────────────
app.get("/api/bills", async (c) => {
  const rel = c.req.query("rel");
  if (rel && !isRel(rel)) return c.json({ error: "invalid rel" }, 400);
  const db = makeDb(c.env);
  const rows = rel
    ? await db.select().from(bills).where(eq(bills.relationship, rel)).orderBy(asc(bills.dueDay)).all()
    : await db.select().from(bills).orderBy(asc(bills.relationship), asc(bills.dueDay)).all();
  return c.json({ bills: rows });
});

app.post("/api/bills", async (c) => {
  const body = await c.req.json<{ rel?: string; name: string; amount: number; dueDay: number; kind?: string }>();
  if (!isRel(body.rel)) return c.json({ error: "invalid rel" }, 400);
  if (!body.name?.trim()) return c.json({ error: "name required" }, 400);
  if (!Number.isFinite(body.amount)) return c.json({ error: "amount required" }, 400);
  if (!Number.isFinite(body.dueDay) || body.dueDay < 1 || body.dueDay > 31) {
    return c.json({ error: "dueDay must be 1..31" }, 400);
  }
  const db = makeDb(c.env);
  const res = await db.insert(bills).values({
    relationship: body.rel,
    name: body.name.trim(),
    amount: body.amount,
    dueDay: body.dueDay,
    kind: body.kind === "credit_card" ? "credit_card" : "bill",
    createdAt: nowSec(),
  }).run();
  return c.json({ ok: true, id: Number((res as any).lastInsertRowid ?? 0) });
});

app.delete("/api/bills/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isFinite(id)) return c.json({ error: "bad id" }, 400);
  const db = makeDb(c.env);
  await db.delete(bills).where(eq(bills.id, id)).run();
  return c.json({ ok: true });
});

app.get("/api/bills/upcoming", async (c) => {
  const rel = c.req.query("rel");
  if (rel && !isRel(rel)) return c.json({ error: "invalid rel" }, 400);
  const db = makeDb(c.env);
  const all = rel
    ? await db.select().from(bills).where(eq(bills.relationship, rel)).all()
    : await db.select().from(bills).all();
  const today = new Date();
  const upcoming = all
    .map((b) => ({ ...b, ...nextDueDate(b.dueDay, today) }))
    .filter((b) => b.daysUntil >= 0 && b.daysUntil <= 14)
    .sort((a, b) => a.daysUntil - b.daysUntil);
  return c.json({ upcoming });
});

// ── Expenses ─────────────────────────────────────────────────────────────
app.get("/api/expenses", async (c) => {
  const rel = c.req.query("rel");
  const month = c.req.query("month");
  if (rel && !isRel(rel)) return c.json({ error: "invalid rel" }, 400);
  if (!month) return c.json({ error: "month required (YYYY-MM)" }, 400);
  const db = makeDb(c.env);
  const rows = rel
    ? await db.select().from(expenses).where(and(eq(expenses.relationship, rel), eq(expenses.month, month))).orderBy(asc(expenses.id)).all()
    : await db.select().from(expenses).where(eq(expenses.month, month)).orderBy(asc(expenses.id)).all();
  return c.json({ expenses: rows });
});

app.post("/api/expenses", async (c) => {
  const body = await c.req.json<{ rel?: string; label: string; amount: number; category?: string; month?: string }>();
  if (!isRel(body.rel)) return c.json({ error: "invalid rel" }, 400);
  if (!body.label?.trim()) return c.json({ error: "label required" }, 400);
  if (!Number.isFinite(body.amount)) return c.json({ error: "amount required" }, 400);
  const db = makeDb(c.env);
  const res = await db.insert(expenses).values({
    relationship: body.rel,
    label: body.label.trim(),
    amount: body.amount,
    category: body.category?.trim() || null,
    month: body.month || defaultMonth(),
    createdAt: nowSec(),
  }).run();
  return c.json({ ok: true, id: Number((res as any).lastInsertRowid ?? 0) });
});

app.get("/api/expenses/summary", async (c) => {
  const rel = c.req.query("rel");
  const month = c.req.query("month") || defaultMonth();
  if (rel && !isRel(rel)) return c.json({ error: "invalid rel" }, 400);
  const db = makeDb(c.env);
  const rows = rel
    ? await db.select().from(expenses).where(and(eq(expenses.relationship, rel), eq(expenses.month, month))).all()
    : await db.select().from(expenses).where(eq(expenses.month, month)).all();
  const total = rows.reduce((s, r) => s + r.amount, 0);
  const byCategory: Record<string, number> = {};
  for (const r of rows) {
    const k = r.category || "other";
    byCategory[k] = (byCategory[k] ?? 0) + r.amount;
  }
  return c.json({ month, total, byCategory: Object.entries(byCategory).map(([category, amount]) => ({ category, amount })).sort((a, b) => b.amount - a.amount), count: rows.length });
});

// ── Events ───────────────────────────────────────────────────────────────
app.get("/api/events", async (c) => {
  const rel = c.req.query("rel");
  const from = c.req.query("from");
  const to = c.req.query("to");
  if (rel && !isRel(rel)) return c.json({ error: "invalid rel" }, 400);
  const today = todayLocal(new Date());
  const fromQ = from || today;
  const toQ = to || addDays(today, 30);
  const db = makeDb(c.env);
  const baseWhere = and(
    rel ? eq(events.relationship, rel) : undefined,
    gte(events.date, fromQ),
    lte(events.date, toQ),
  );
  const rows = await db.select().from(events).where(baseWhere).orderBy(asc(events.date), asc(events.time)).all();
  return c.json({ events: rows });
});

app.post("/api/events", async (c) => {
  const body = await c.req.json<{ rel?: string; title: string; type?: string; date: string; time?: string; attendees?: string; notes?: string }>();
  if (!isRel(body.rel)) return c.json({ error: "invalid rel" }, 400);
  if (!body.title?.trim()) return c.json({ error: "title required" }, 400);
  if (!body.date || !/^\d{4}-\d{2}-\d{2}$/.test(body.date)) return c.json({ error: "date YYYY-MM-DD" }, 400);
  const db = makeDb(c.env);
  const res = await db.insert(events).values({
    relationship: body.rel,
    title: body.title.trim(),
    type: ["dinner", "outing", "movie"].includes(body.type ?? "") ? body.type! : "dinner",
    date: body.date,
    time: body.time || null,
    attendees: body.attendees?.trim() || null,
    notes: body.notes?.trim() || null,
    createdAt: nowSec(),
  }).run();
  return c.json({ ok: true, id: Number((res as any).lastInsertRowid ?? 0) });
});

app.delete("/api/events/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isFinite(id)) return c.json({ error: "bad id" }, 400);
  const db = makeDb(c.env);
  await db.delete(events).where(eq(events.id, id)).run();
  return c.json({ ok: true });
});

// ── Movies ───────────────────────────────────────────────────────────────
app.get("/api/movies", async (c) => {
  const db = makeDb(c.env);
  const rows = await db.select().from(movies).orderBy(asc(movies.title)).all();
  return c.json({ movies: rows });
});

app.get("/api/movies/tonight", async (c) => {
  const db = makeDb(c.env);
  const rows = await db.select().from(movies).all();
  if (!rows.length) return c.json({ error: "no movies — call /api/seed first" }, 404);
  const pick = pickTonight(rows, todayLocal(new Date()));
  return c.json({ movie: pick, reason: pick.reason });
});

app.post("/api/movies", async (c) => {
  const body = await c.req.json<{ title: string; year?: number; runtime?: number; rating?: string; reason?: string }>();
  if (!body.title?.trim()) return c.json({ error: "title required" }, 400);
  const db = makeDb(c.env);
  const res = await db.insert(movies).values({
    title: body.title.trim(),
    year: Number.isFinite(Number(body.year)) ? Number(body.year) : null,
    runtime: Number.isFinite(Number(body.runtime)) ? Number(body.runtime) : null,
    rating: body.rating?.trim() || null,
    reason: body.reason?.trim() || "Added to the family list.",
  }).run();
  return c.json({ ok: true, id: Number((res as any).lastInsertRowid ?? 0) });
});

// ── Seed (idempotent) ────────────────────────────────────────────────────
app.post("/api/seed", async (c) => {
  const db = makeDb(c.env);
  const existing = await db.select().from(people).all();
  if (existing.length) return c.json({ seeded: false, count: existing.length });
  const now = nowSec();
  const rows = buildSeed(now);
  const groups: Record<string, any[]> = {};
  for (const r of rows) (groups[r.table] ??= []).push(r.data);
  for (const [t, data] of Object.entries(groups)) {
    const tableRef = t === "people" ? people : t === "grocery_items" ? groceryItems : t === "bills" ? bills : t === "expenses" ? expenses : t === "events" ? events : movies;
    await db.insert(tableRef).values(data as any).run();
  }
  return c.json({ seeded: true, inserted: rows.length });
});

// ── llms.txt (agent lane) ────────────────────────────────────────────────
app.get("/llms.txt", (c) => {
  const txt = `# Homerun.ai — agent lane

Family-management dashboard. Owner-private (signed-in user only). All write endpoints scope by rel=home|extended|friend.

Routes (all JSON unless noted):

- GET  /api/people?rel=                List people (includes voiceId/voiceName if cloned)
- POST /api/people                     { rel, name, role?, emoji? }
- DELETE /api/people/:id
- POST /api/people/:id/voice           multipart: audio file part(s) → clones voice via ElevenLabs
- DELETE /api/people/:id/voice         remove cloned voice
- GET  /api/grocery?rel=               List grocery items (done items sorted last)
- POST /api/grocery                    { rel, name, qty? }
- PATCH /api/grocery/:id               { done: 0|1 }
- DELETE /api/grocery/:id
- GET  /api/bills?rel=                 List bills ordered by dueDay
- POST /api/bills                      { rel, name, amount, dueDay (1..31), kind? = bill|credit_card }
- DELETE /api/bills/:id
- GET  /api/bills/upcoming?rel=        Next 14 days of bills with { nextDate, daysUntil }
- GET  /api/expenses?rel=&month=YYYY-MM
- POST /api/expenses                   { rel, label, amount, category?, month? (default current) }
- GET  /api/expenses/summary?rel=&month=   { month, total, byCategory, count }
- GET  /api/events?rel=&from=YYYY-MM-DD&to=  Default window: today → +30 days
- POST /api/events                     { rel, title, type (dinner|outing|movie), date, time?, attendees?, notes? }
- DELETE /api/events/:id
- GET  /api/reminders?rel=             Voice reminders + personName/personEmoji/hasVoice
- POST /api/reminders                  { rel, personId, message, dueAt? }
- PATCH /api/reminders/:id             { done: 0|1 }
- DELETE /api/reminders/:id
- GET  /api/reminders/:id/speak        audio/mpeg — reminder spoken in the person's cloned voice
- GET  /api/movies                     Shared curated family-friendly list
- GET  /api/movies/tonight             Deterministic pick for today + reason
- POST /api/seed                       Idempotent demo data; no-ops if people table non-empty
- POST /api/movies                     { title, year?, runtime?, rating?, reason? }  Add to shared list
- POST /api/agent/command              { text, rel?, today? } → { ok, action, rel, transcript, reply }
- POST /api/agent/voice                multipart: audio clip + rel? + today? → transcribes then runs the command
`;
  return new Response(txt, { headers: { "content-type": "text/plain; charset=utf-8" } });
});

// ── Voice agent (floating mic) ─────────────────────────────────────────────
// Frontend records a short clip, POSTs it here. We transcribe via ElevenLabs
// STT, ask the Sauna LLM to turn it into ONE structured action, execute it
// against the app DB, and return { transcript, reply }.

async function sttTranscribe(env: Env, file: File): Promise<string> {
  const form = new FormData();
  form.append("model_id", "scribe_v1");
  form.append("file", file, file.name || "command.webm");
  const r = await fetch(`${EL_BASE}/v1/speech-to-text`, {
    method: "POST",
    headers: elHeaders(),
    body: form,
  });
  const t = await r.text();
  if (!r.ok) {
    console.error("stt failed", r.status, t);
    let msg = t;
    try { msg = JSON.parse(t)?.detail?.message ?? t; } catch {}
    throw new Error(`transcription failed: ${msg}`);
  }
  const data = JSON.parse(t) as { text?: string };
  return (data.text ?? "").trim();
}

// Sauna-provided LLM (handler-only origin). No key — metered to the app owner.
async function llmText(instructions: string, input: string): Promise<string> {
  const r = await fetch("https://sauna.local/v1/llms/responses", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model: "fast", instructions, input }),
  });
  const data: any = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data?.error?.message || `LLM ${r.status}`);
  if (typeof data.output_text === "string" && data.output_text.trim()) return data.output_text;
  const parts: string[] = [];
  for (const item of data.output ?? []) {
    for (const cpart of item?.content ?? []) {
      if (typeof cpart?.text === "string") parts.push(cpart.text);
    }
  }
  return parts.join("").trim();
}

function parseJsonObject(s: string): any {
  let t = s.trim();
  if (t.startsWith("```")) t = t.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const a = t.indexOf("{");
  const b = t.lastIndexOf("}");
  if (a >= 0 && b > a) t = t.slice(a, b + 1);
  return JSON.parse(t);
}

type AgentResult = { ok: boolean; action: string; rel: string; transcript: string; reply: string };

async function runAgent(env: Env, text: string, currentRel: "home" | "extended" | "friend", today: string): Promise<AgentResult> {
  const db = makeDb(env);
  const ppl = await db.select().from(people).all();
  const peopleCtx = ppl.length ? ppl.map((p) => `${p.name} [${p.relationship}]`).join(", ") : "none yet";

  const instructions = [
    "You are Homerun, a family-dashboard assistant. Turn the user's spoken request into EXACTLY ONE action.",
    `Current tab / default relationship: ${currentRel}. Today's date: ${today}.`,
    `Known people: ${peopleCtx}.`,
    "Relationships are: home, extended, friend.",
    "Respond with ONLY a JSON object (no prose, no code fences):",
    '{"action": ACTION, "params": { ... }, "reply": "<=15 word confirmation to read back"}',
    "ACTION is one of add_grocery, add_bill, add_expense, add_event, add_movie, add_person, add_reminder, none.",
    "Params by action:",
    "- add_grocery: {name, qty?, rel?}",
    "- add_bill: {name, amount(number), dueDay(1-31), kind?('bill'|'credit_card'), rel?}",
    "- add_expense: {label, amount(number), category?('dining'|'groceries'|'utilities'|'kids'|'gifts'|'other'), rel?}",
    "- add_event: {title, type?('dinner'|'outing'|'movie'), date(YYYY-MM-DD, resolve relative to today), time?(HH:MM 24h), notes?, rel?}",
    "- add_movie: {title, year?, runtime?, rating?, reason?}  (movies are shared; no rel)",
    "- add_person: {name, role?, emoji?, rel?}",
    "- add_reminder: {personName(one of the known people), message(first person, as that person would say it), rel?}",
    "- none: {}  when the request is not actionable; explain briefly in reply.",
    "Omit rel to use the current tab.",
  ].join("\n");

  const parsed = parseJsonObject(await llmText(instructions, text));
  const action = String(parsed?.action ?? "none");
  const p = parsed?.params ?? {};
  const rel = isRel(p.rel) ? p.rel : currentRel;
  let reply = typeof parsed?.reply === "string" && parsed.reply.trim() ? parsed.reply.trim() : "Done.";
  let ok = true;

  try {
    switch (action) {
      case "add_grocery": {
        if (!p.name) throw new Error("no item name");
        await db.insert(groceryItems).values({ relationship: rel, name: String(p.name).trim(), qty: p.qty ? String(p.qty).trim() : null, done: 0, createdAt: nowSec() }).run();
        break;
      }
      case "add_bill": {
        const amount = Number(p.amount); const dueDay = Number(p.dueDay);
        if (!p.name || !Number.isFinite(amount) || !Number.isFinite(dueDay)) throw new Error("bill needs name, amount, dueDay");
        await db.insert(bills).values({ relationship: rel, name: String(p.name).trim(), amount, dueDay: Math.min(31, Math.max(1, Math.round(dueDay))), kind: p.kind === "credit_card" ? "credit_card" : "bill", createdAt: nowSec() }).run();
        break;
      }
      case "add_expense": {
        const amount = Number(p.amount);
        if (!p.label || !Number.isFinite(amount)) throw new Error("expense needs label and amount");
        await db.insert(expenses).values({ relationship: rel, label: String(p.label).trim(), amount, category: p.category ? String(p.category).trim() : null, month: today.slice(0, 7), createdAt: nowSec() }).run();
        break;
      }
      case "add_event": {
        if (!p.title || !/^\d{4}-\d{2}-\d{2}$/.test(String(p.date ?? ""))) throw new Error("event needs title and a valid date");
        await db.insert(events).values({ relationship: rel, title: String(p.title).trim(), type: ["dinner", "outing", "movie"].includes(p.type) ? p.type : "dinner", date: String(p.date), time: p.time ? String(p.time) : null, attendees: null, notes: p.notes ? String(p.notes).trim() : null, createdAt: nowSec() }).run();
        break;
      }
      case "add_movie": {
        if (!p.title) throw new Error("no movie title");
        await db.insert(movies).values({ title: String(p.title).trim(), year: Number.isFinite(Number(p.year)) ? Number(p.year) : null, runtime: Number.isFinite(Number(p.runtime)) ? Number(p.runtime) : null, rating: p.rating ? String(p.rating) : null, reason: p.reason ? String(p.reason).trim() : "Added by voice." }).run();
        break;
      }
      case "add_person": {
        if (!p.name) throw new Error("no person name");
        await db.insert(people).values({ name: String(p.name).trim(), relationship: rel, role: p.role ? String(p.role).trim() : null, emoji: p.emoji ? String(p.emoji) : null, createdAt: nowSec() }).run();
        break;
      }
      case "add_reminder": {
        const want = String(p.personName ?? "").toLowerCase().trim();
        const match = want
          ? (ppl.find((x) => x.relationship === rel && x.name.toLowerCase().includes(want)) ?? ppl.find((x) => x.name.toLowerCase().includes(want)))
          : undefined;
        if (!match) { ok = false; reply = want ? `I don't know who ${p.personName} is yet.` : "Who is the reminder from?"; break; }
        if (!p.message) throw new Error("no reminder message");
        await db.insert(reminders).values({ relationship: match.relationship, personId: match.id, message: String(p.message).trim(), dueAt: p.dueAt ? String(p.dueAt) : null, done: 0, createdAt: nowSec() }).run();
        break;
      }
      case "none":
      default:
        ok = false;
        break;
    }
  } catch (e: any) {
    ok = false;
    reply = `Couldn't do that: ${e?.message ?? e}`;
  }

  return { ok, action, rel, transcript: text, reply };
}

app.post("/api/agent/command", async (c) => {
  const body = await c.req.json<{ text?: string; rel?: string; today?: string }>();
  const text = (body.text ?? "").trim();
  if (!text) return c.json({ error: "text required" }, 400);
  const rel = isRel(body.rel) ? body.rel : "home";
  const today = /^\d{4}-\d{2}-\d{2}$/.test(body.today ?? "") ? body.today! : todayLocal(new Date());
  const out = await runAgent(c.env, text, rel, today);
  return c.json(out);
});

app.post("/api/agent/voice", async (c) => {
  const form = await c.req.formData();
  const file = form.getAll("audio").find((f): f is File => f instanceof File && f.size > 0);
  if (!file) return c.json({ error: "no audio uploaded" }, 400);
  const relRaw = form.get("rel");
  const todayRaw = form.get("today");
  const rel = isRel(relRaw) ? relRaw : "home";
  const today = typeof todayRaw === "string" && /^\d{4}-\d{2}-\d{2}$/.test(todayRaw) ? todayRaw : todayLocal(new Date());
  let transcript = "";
  try {
    transcript = await sttTranscribe(c.env, file);
  } catch (e: any) {
    return c.json({ error: String(e?.message ?? e) }, 502);
  }
  if (!transcript) return c.json({ ok: false, action: "none", rel, transcript: "", reply: "I didn't catch that — try again." });
  const out = await runAgent(c.env, transcript, rel, today);
  return c.json(out);
});


// ── SPA fallback ─────────────────────────────────────────────────────────
app.get("*", (c) => {
  return c.env.ASSETS
    ? c.env.ASSETS.fetch(new URL("/index.html", c.req.url).toString())
    : new Response("index.html not found", { status: 404 });
});

app.onError((err, c) => {
  console.error("handler error:", err);
  return c.json({ error: String((err as Error).message ?? err) }, 500);
});

// Helpers
function defaultMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}
function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export default {
  fetch: (request, env, ctx) => app.fetch(request, { ...env, ctx }),
} satisfies AppHandler;
