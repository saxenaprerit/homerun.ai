---
name: homerun
description: Family-management dashboard — groceries, bills, calendar & movie night across Home, Extended family, and Friends.
manifest_version: 1
enabled: true
visibility: private
---

# Homerun.ai

A single-household family dashboard. Three relationship tabs — **Home**, **Extended family**, **Friends** — each with the same four tiles: **Grocery**, **Finances** (month-end bills, credit-card due-date reminders, monthly expense tracking), **Calendar** (dinner & outing planning), and **Movie Sync** (tonight's family-friendly pick + why).

## Data

All data is app-owned SQLite (Drizzle). People / grocery / bills / expenses / events are scoped by a `relationship` discriminator (`home | extended | friend`); movies are a shared curated list.

## Seed

`POST /api/seed` populates realistic demo data on first run. It is **idempotent** — it no-ops if the `people` table already has rows. The client calls it once on mount, so after a fresh deploy the dashboard is populated automatically. Re-run manually if you wipe the DB.

## Deferred (not in v1)

MCP integrations (school portals, bank/finance feeds, external calendar sync) and ElevenLabs voice from the product overview are out of scope for this build — data is entered/seeded locally.

## API (agent lane)

`GET /llms.txt` describes the agent-actionable routes at the bare origin.
