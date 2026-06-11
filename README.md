# MirrorMe

See it on you before you buy — a Chrome extension that composites clothing from
any store's product page onto a photo of you, powered by **Gemini 2.5 Flash
Image** ("nano banana", ~$0.04 per try-on).

```
┌────────────────────┐   garment URL + JWT    ┌─────────────────────────┐
│  Chrome extension   │ ─────────────────────▶ │  Next.js app  (/web)    │
│  (/extension, MV3)  │                        │  UI + /api routes       │
│  click-to-select +  │ ◀───────────────────── │  · verify JWT           │
│  auto-detect picker │   signed result URL    │  · quota checkpoint     │
└────────────────────┘                         │  · SSRF-guarded fetch   │
         │  Google sign-in                     │  · Gemini generate      │
         ▼                                     └───────────┬─────────────┘
┌────────────────────┐                                     │ service role
│  Supabase           │ ◀───────────────────────────────────┘
│  Auth · Postgres    │   private buckets: photos/ generated/
│  (RLS) · Storage    │   served only via short-lived signed URLs
└────────────────────┘
```

- `web/` — Next.js 16 (App Router, Tailwind v4): sign-in, photo manager,
  try-on history ("lookbook"), and all API routes.
- `extension/` — Vite 7 + CRXJS + React 19, Manifest V3.
- `supabase/migrations/` — schema, RLS, private buckets.

**The Gemini API key and the Supabase service-role key live only in `web/`
server env. They are never shipped to the browser or the extension.**

---

## Setup

You need: Node 20+, pnpm, a [Supabase](https://supabase.com) project, a
[Google AI Studio](https://aistudio.google.com/apikey) key, and a Google Cloud
project for OAuth.

### 1. Install

All commands in this README run from the repo root (`~/mirrorme`) unless noted:

```bash
cd ~/mirrorme
(cd web && pnpm install)
(cd extension && pnpm install)
```

### 2. Supabase project

1. Create a project at supabase.com → note the **Project URL**, **anon/publishable
   key**, and **service_role/secret key** (Project Settings → API keys).
2. Apply the schema (creates tables, RLS, and the private `photos` +
   `generated` buckets):

   ```bash
   npx supabase login
   npx supabase link --project-ref <your-project-ref>   # run at repo root
   npx supabase db push
   ```

   (No Docker needed — `db push` runs against the hosted project. Alternatively
   paste `supabase/migrations/20260611000000_init.sql` into the SQL editor.)

### 3. Google OAuth — two clients

**A. Web app sign-in** (Supabase Google provider):
1. Google Cloud Console → APIs & Services → Credentials → Create OAuth client →
   type **Web application**. Authorized redirect URI:
   `https://<project-ref>.supabase.co/auth/v1/callback`.
2. Supabase Dashboard → Authentication → Sign In / Providers → Google → enable,
   paste this client id + secret.
3. Supabase → Authentication → URL Configuration: add your web origins
   (`http://localhost:3000`, your Vercel URL) to Redirect URLs as
   `<origin>/auth/callback`.

**B. Extension sign-in**:
1. Build the extension once (step 5) and load it unpacked, or set a stable id
   first (step 6 — recommended). Note the extension ID from `chrome://extensions`.
2. Create a second OAuth client → type **Chrome Extension** → enter that
   extension ID.
3. Supabase → Google provider → add this client id to the **Client IDs** (a.k.a.
   Authorized Client IDs) list. If sign-in fails with a nonce error, enable
   **Skip nonce check** on the provider (the id_token flow can't carry one).

### 4. Environment files

Copy from `.env.example`:

- `web/.env.local`: `GEMINI_API_KEY`, `NEXT_PUBLIC_SUPABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `extension/.env.local`: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`,
  `VITE_API_BASE_URL` (web app origin), `VITE_GOOGLE_OAUTH_CLIENT_ID` (client B),
  `VITE_CRX_PUBLIC_KEY` (step 6)

### 5. Run

```bash
# web app + API
cd web && pnpm dev                    # http://localhost:3000

# extension (separate terminal)
cd extension && pnpm build            # or pnpm dev for HMR
```

Load the extension: `chrome://extensions` → Developer mode → **Load unpacked**
→ select `extension/dist`.

### 6. Stable extension ID (do this before creating OAuth client B)

The OAuth redirect (`https://<extension-id>.chromiumapp.org/`) and the Chrome
Extension OAuth client are bound to the extension ID, so pin it:

```bash
openssl genrsa 2048 > key.pem                                   # keep private, don't commit
openssl rsa -in key.pem -pubout -outform DER | base64 | tr -d '\n'
```

Put the base64 output in `extension/.env.local` as `VITE_CRX_PUBLIC_KEY` and
rebuild — the unpacked extension now has a fixed ID. (When you later publish,
the Web Store assigns the ID from the uploaded package; the documented path is
Developer Dashboard → Package → View public key.)

### 7. Use it

1. Web app → Sign in with Google → upload a photo of yourself (it becomes your
   default base).
2. Open any store's product page → click the MirrorMe action.
3. The popup auto-detects the product image (JSON-LD → og:image → largest
   visible image). Wrong or missing? **"Click the garment on the page"** and
   click the exact image.
4. **Try it on** (~10s — keep the popup open; the result is saved to your
   lookbook either way).
5. **+ Add another piece** chains the result: it becomes the new base and the
   next garment is layered on top.

## Verification checklist (live keys)

After setup, confirm the end-to-end path:

```bash
# 1. unit tests + builds
cd web && pnpm vitest run && pnpm build
cd ../extension && pnpm vitest run && pnpm build

# 2. backend try-on with a hardcoded garment (get a JWT: sign in to the web
#    app, then in the browser console of localhost:3000 run
#    (await (await fetch('/api/photos')).json()) to confirm cookie auth, or
#    copy an access token from the extension's chrome.storage.local)
curl -X POST localhost:3000/api/tryon \
  -H "Authorization: Bearer <access_token>" -H "Content-Type: application/json" \
  -d '{"garmentImageUrl":"https://upload.wikimedia.org/wikipedia/commons/2/24/Blue_Tshirt.jpg","basePhotoId":"<photo id from GET /api/photos>"}'
# → { "tryonId": "...", "resultUrl": "https://...signed..." }
```

## Deploy (web)

Deploy `web/` to Vercel (set the four env vars; root directory = `web`). Then:
- add the production origin to Supabase Redirect URLs,
- rebuild the extension with `VITE_API_BASE_URL=https://<your-domain>`.

## Extension permissions (Web Store justifications)

| Permission | Why |
|---|---|
| `activeTab` + `scripting` | Inject the garment picker only when the user clicks the MirrorMe button — no standing access to any site. |
| `storage` | Persist the session and the pending garment selection. |
| `identity` | Google sign-in via `launchWebAuthFlow`. |
| `host_permissions` (own API + Supabase project only) | The popup calls our backend and Supabase auth. No third-party origins. |

## Privacy

- Photos and generated images live in **private** Supabase buckets; every URL
  the client ever sees is a short-lived (1h) signed URL.
- RLS on every table; the backend verifies the JWT on every request and never
  trusts a client-supplied user id.
- Garment images are fetched server-side with an SSRF guard (private-IP
  blocking at every redirect hop, image-only content types, 15MB cap).
- "Delete all my photos & data" on the Photos page removes storage objects,
  rows, and the account itself.

## Billing readiness (Phase 5, not built)

`profiles` already has `plan` (default `'trial'`), `trial_ends_at` (default
now + 14 days), and `tryon_count` (incremented atomically per generation).
`assertWithinQuota(userId)` in `web/src/lib/quota.ts` is the single
checkpoint `POST /api/tryon` calls before generating — Stripe drops in there
with **no schema migration**.
