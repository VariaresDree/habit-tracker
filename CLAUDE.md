# Project: [habit tracker name]
Stack: React 19, Vite, Dexie.js, Zustand, vite-plugin-pwa. Client-only, no backend.

## Guardrails
- Never change a function signature or a Zustand store shape without
  updating every call site in the same change. Search the whole repo
  first, list all call sites, then edit.
- Offline-first: every write goes to IndexedDB first. No feature should
  assume network availability.