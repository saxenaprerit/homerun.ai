// Demo data builder — pure function. The handler calls it once on /api/seed
// if the people table is empty. All rows are stamped with createdAt = now
// (SECONDS since epoch — matching the rest of the schema). The `month` on
// expense rows uses wall-clock `new Date()` (ms) — DO NOT pass `now` (seconds)
// to Date or it lands in 1970.
import { currentMonth, todayLocal } from "./movie";

export type SeedRow = Record<string, any>;

export function buildSeed(now: number): SeedRow[] {
  // Wall-clock now (ms) — `now` is seconds, so DO NOT pass it to Date here.
  const month = currentMonth(new Date());
  const today = todayLocal(new Date());

  return [
    // ── People — Home ────────────────────────────────────────────────────
    { table: "people", data: { name: "Alex",       relationship: "home",     role: "parent", emoji: "🧑", createdAt: now } },
    { table: "people", data: { name: "Priya",      relationship: "home",     role: "parent", emoji: "👩", createdAt: now } },
    { table: "people", data: { name: "Maya",       relationship: "home",     role: "child",  emoji: "🧒", createdAt: now } },
    { table: "people", data: { name: "Leo",        relationship: "home",     role: "child",  emoji: "👦", createdAt: now } },

    // ── People — Extended ────────────────────────────────────────────────
    { table: "people", data: { name: "Mom (Rita)", relationship: "extended", role: "parent", emoji: "👵", createdAt: now } },
    { table: "people", data: { name: "Dad (Sam)",  relationship: "extended", role: "parent", emoji: "👴", createdAt: now } },
    { table: "people", data: { name: "Nina",       relationship: "extended", role: "in-law", emoji: "👩", createdAt: now } },

    // ── People — Friends ─────────────────────────────────────────────────
    { table: "people", data: { name: "Jordan",     relationship: "friend",   role: "friend", emoji: "🧑‍🦱", createdAt: now } },
    { table: "people", data: { name: "Casey",      relationship: "friend",   role: "friend", emoji: "🧑", createdAt: now } },

    // ── Grocery ── Home ──────────────────────────────────────────────────
    { table: "grocery_items", data: { relationship: "home", name: "Milk",          qty: "1 gal",  done: 0, createdAt: now } },
    { table: "grocery_items", data: { relationship: "home", name: "Eggs",          qty: "dozen",  done: 0, createdAt: now } },
    { table: "grocery_items", data: { relationship: "home", name: "Pasta",         qty: "2 boxes", done: 1, createdAt: now } },
    { table: "grocery_items", data: { relationship: "home", name: "Tomato sauce",  qty: "3 jars",  done: 0, createdAt: now } },

    // ── Grocery ── Extended ──────────────────────────────────────────────
    { table: "grocery_items", data: { relationship: "extended", name: "Fresh fruit", qty: "basket", done: 0, createdAt: now } },
    { table: "grocery_items", data: { relationship: "extended", name: "Whole-grain bread", qty: "2 loaves", done: 0, createdAt: now } },

    // ── Bills ── Home ────────────────────────────────────────────────────
    { table: "bills", data: { relationship: "home", name: "Rent",      amount: 2800, dueDay: 1,  kind: "bill",        createdAt: now } },
    { table: "bills", data: { relationship: "home", name: "Electric",  amount: 145,  dueDay: 12, kind: "bill",        createdAt: now } },
    { table: "bills", data: { relationship: "home", name: "Internet",  amount: 79,   dueDay: 18, kind: "bill",        createdAt: now } },
    { table: "bills", data: { relationship: "home", name: "Visa Card", amount: 612,  dueDay: 22, kind: "credit_card", createdAt: now } },

    // ── Bills ── Extended ────────────────────────────────────────────────
    { table: "bills", data: { relationship: "extended", name: "Pharmacy plan", amount: 38, dueDay: 5, kind: "bill", createdAt: now } },

    // ── Expenses — current month, Home ───────────────────────────────────
    { table: "expenses", data: { relationship: "home", label: "Costco run",     amount: 187.42, category: "groceries",  month, createdAt: now } },
    { table: "expenses", data: { relationship: "home", label: "Pizza Friday",   amount: 62.00,  category: "dining",     month, createdAt: now } },
    { table: "expenses", data: { relationship: "home", label: "Soccer cleats",  amount: 74.95,  category: "kids",       month, createdAt: now } },
    { table: "expenses", data: { relationship: "home", label: "Date night",     amount: 118.30, category: "dining",     month, createdAt: now } },
    { table: "expenses", data: { relationship: "home", label: "Water bill",     amount: 52.00,  category: "utilities",  month, createdAt: now } },

    // ── Expenses — current month, Extended ───────────────────────────────
    { table: "expenses", data: { relationship: "extended", label: "Birthday gift", amount: 95.00, category: "gifts", month, createdAt: now } },

    // ── Calendar ── Home ─────────────────────────────────────────────────
    { table: "events", data: { relationship: "home", title: "Family dinner", type: "dinner", date: todayOffset(0), time: "18:30", attendees: "Alex, Priya, Maya, Leo", notes: "Pasta night", createdAt: now } },
    { table: "events", data: { relationship: "home", title: "Maya's soccer game", type: "outing", date: todayOffset(3), time: "16:00", attendees: "Priya, Maya", notes: "Bring snacks", createdAt: now } },

    // ── Calendar ── Friends ──────────────────────────────────────────────
    { table: "events", data: { relationship: "friend", title: "Movie night with Jordan", type: "movie", date: todayOffset(5), time: "20:00", attendees: "Alex, Priya, Jordan", notes: "Pick the film on the Movie tile", createdAt: now } },

    // ── Movies — shared curated list ─────────────────────────────────────
    { table: "movies", data: { title: "Paddington 2", year: 2017, runtime: 103, rating: "PG",     reason: "Wholesome, funny, and short enough to finish before bedtime." } },
    { table: "movies", data: { title: "Coco",         year: 2017, runtime: 105, rating: "PG",     reason: "Beautiful music and a warm family story — perfect over pasta." } },
    { table: "movies", data: { title: "Toy Story",    year: 1995, runtime: 81,  rating: "G",      reason: "Short, classic, and the kids already know the characters." } },
    { table: "movies", data: { title: "The Mitchells vs. the Machines", year: 2021, runtime: 110, rating: "PG", reason: "Fast-paced and hilarious — keeps everyone glued to the screen." } },
    { table: "movies", data: { title: "Spirited Away", year: 2001, runtime: 125, rating: "PG", reason: "Calmer pace, stunning visuals — pairs well with a quieter meal." } },
    { table: "movies", data: { title: "Lilo & Stitch", year: 2002, runtime: 85,  rating: "PG", reason: "Short, sweet, and a family favorite for reruns." } },
    { table: "movies", data: { title: "Ratatouille",  year: 2007, runtime: 111, rating: "G",      reason: "On-theme for dinner — and a great pick for picky eaters." } },
    { table: "movies", data: { title: "A Bug's Life", year: 1998, runtime: 95,  rating: "G",      reason: "Light, easy watch that holds up for the adults too." } },
  ];
}

function todayOffset(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
