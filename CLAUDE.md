# Project: [habit tracker name]
Stack: React 19, Vite, Dexie.js, Zustand, vite-plugin-pwa.
Local-first: Dexie/IndexedDB is the source of truth on-device; Supabase (v2)
is for cross-device sync only — the app must remain fully usable offline
and signed-out.

## Guardrails
- Never change a function signature or a Zustand store shape without
  updating every call site in the same change. Search the whole repo
  first, list all call sites, then edit.
- Offline-first: every write goes to IndexedDB first. No feature should
  assume network availability.

  ## New in v2
Stack addition: Supabase (auth + Postgres) for cross-device sync.
Dexie remains local source of truth. Sync uses an outbox table with
idempotent UUIDs — same pattern as REE Tracker.

## New guardrails
- Sync must never silently overwrite unsynced local changes. Conflict
  resolution is last-write-wins by updated_at, but unsynced local
  writes always queue and retry — never dropped.
- Every new Supabase table needs Row Level Security scoped to auth.uid()
  before any client code touches it.
- Reminders are time-adaptive (based on habit completion history), not
  location-based — do not implement geolocation/geofencing unless
  explicitly asked.