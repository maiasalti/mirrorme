# MirrorMe

See it on you before you buy — a Chrome extension that composites clothing from any
store's product page onto a photo of you, powered by Gemini 2.5 Flash Image.

- `web/` — Next.js companion app: sign-in, your photos, try-on history, and the API the extension calls.
- `extension/` — Manifest V3 Chrome extension (Vite + CRXJS + React).
- `supabase/` — SQL migrations (schema, RLS, private storage buckets).

> Full setup and run instructions are finalized in the last build milestone — see
> `docs/superpowers/plans/2026-06-11-mirrorme.md` for the build plan.
