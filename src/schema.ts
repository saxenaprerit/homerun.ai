import { sqliteTable, integer, text, real, index } from "drizzle-orm/sqlite-core";
import { relations } from "drizzle-orm";

// Homerun.ai schema — Drizzle is the source of truth for types and migrations.

export const people = sqliteTable("people", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  relationship: text("relationship").notNull(), // 'home' | 'extended' | 'friend'
  role: text("role"),
  emoji: text("emoji"),
  // ElevenLabs cloned-voice binding. Nullable until a sample is cloned.
  voiceId: text("voice_id"),
  voiceName: text("voice_name"),
  voiceCreatedAt: integer("voice_created_at"),
  createdAt: integer("created_at").notNull(),
}, (t) => ({
  relIdx: index("people_rel_idx").on(t.relationship),
}));

export const groceryItems = sqliteTable("grocery_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  relationship: text("relationship").notNull(),
  name: text("name").notNull(),
  qty: text("qty"),
  done: integer("done").notNull().default(0),
  createdAt: integer("created_at").notNull(),
}, (t) => ({
  relIdx: index("grocery_rel_idx").on(t.relationship),
}));

export const bills = sqliteTable("bills", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  relationship: text("relationship").notNull(),
  name: text("name").notNull(),
  amount: real("amount").notNull(),
  dueDay: integer("due_day").notNull(),
  kind: text("kind").notNull().default("bill"),
  createdAt: integer("created_at").notNull(),
}, (t) => ({
  dueIdx: index("bills_due_idx").on(t.relationship, t.dueDay),
}));

export const expenses = sqliteTable("expenses", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  relationship: text("relationship").notNull(),
  label: text("label").notNull(),
  amount: real("amount").notNull(),
  category: text("category"),
  month: text("month").notNull(),
  createdAt: integer("created_at").notNull(),
}, (t) => ({
  monthIdx: index("expenses_month_idx").on(t.relationship, t.month),
}));

export const events = sqliteTable("events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  relationship: text("relationship").notNull(),
  title: text("title").notNull(),
  type: text("type").notNull().default("dinner"),
  date: text("date").notNull(),
  time: text("time"),
  attendees: text("attendees"),
  notes: text("notes"),
  createdAt: integer("created_at").notNull(),
}, (t) => ({
  dateIdx: index("events_date_idx").on(t.relationship, t.date),
}));

export const movies = sqliteTable("movies", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  year: integer("year"),
  runtime: integer("runtime"),
  rating: text("rating"),
  reason: text("reason").notNull(),
});

// Voice reminders — a task a family member "asked" for, spoken back in their
// own cloned voice, first person. `personId` is who it's from; `message` is
// the exact line spoken (phrased as that person would say it).
export const reminders = sqliteTable("reminders", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  relationship: text("relationship").notNull(),
  personId: integer("person_id").notNull(),
  message: text("message").notNull(),
  dueAt: text("due_at"),
  done: integer("done").notNull().default(0),
  createdAt: integer("created_at").notNull(),
}, (t) => ({
  relIdx: index("reminders_rel_idx").on(t.relationship, t.done),
}));

export const peopleRelations = relations(people, () => ({}));
