# MirrorMe

See it on you before you buy — a free, local-first Chrome extension that
composites clothing from any store's product page onto a photo of you, using
Google's **Gemini 2.5 Flash Image** ("nano banana") with **your own API key**.

No accounts. No servers. Your photos never leave your machine except going
directly to Google's API, with your key, to generate your try-on
(~$0.04/image, billed to your Google account).

```
any store's product page
        │  you click the garment (or auto-detect finds it)
        ▼
┌──────────────────────────────┐      your key, direct call
│ MirrorMe extension (MV3)      │ ───────────────────────────▶ Gemini API
│ photos · key · lookbook       │ ◀─────────────────────────── generated image
│ all stored locally (IndexedDB)│
└──────────────────────────────┘
```

## Install

1. Clone and build (needs Node 20+ and pnpm):

   ```bash
   git clone https://github.com/maiasalti/mirrorme.git && cd mirrorme/extension
   pnpm install && pnpm build
   ```

2. Load it: `chrome://extensions` → enable **Developer mode** → **Load
   unpacked** → select `mirrorme/extension/dist`.

## Set up (one time, ~2 minutes)

1. Click the MirrorMe icon → **Set up MirrorMe** (or right-click the icon →
   Options).
2. **Gemini API key:** create one at
   [aistudio.google.com/apikey](https://aistudio.google.com/apikey) and paste
   it in. It's stored only on your device.
3. **Your photo:** add a clear, well-lit, full-length photo of yourself.

## Use it

1. Open any product page → click the MirrorMe icon.
2. The popup auto-detects the product image (JSON-LD → og:image → largest
   visible image). Wrong or missing? **"Click the garment on the page"** and
   click the exact image — that path always works.
3. **Try it on** (~10 seconds — keep the popup open).
4. **+ Add another piece** chains the look: the result becomes your new base
   and the next garment is layered on top.
5. Every look is saved to your **lookbook** (Settings page) — download or
   delete them any time.

## Privacy

- Photos, your API key, and all try-ons live only in the extension's local
  storage (IndexedDB / chrome.storage on your machine).
- The only network calls are: downloading the garment image you selected, and
  Google's `generativelanguage.googleapis.com` with your key.
- **Delete everything** in Settings wipes key, photos, and lookbook. There is
  nothing to delete anywhere else.

## Extension permissions, justified

| Permission | Why |
|---|---|
| `activeTab` + `scripting` | Inject the garment picker only when you click the MirrorMe button — no standing access to any site. |
| `storage` + `unlimitedStorage` | Your photos and lookbook are stored locally. |
| `host_permissions` (http/https) | Download the product image you selected (stores serve images from arbitrary CDNs) and call the Gemini API. |

## Development

```bash
cd extension
pnpm dev          # Vite + CRXJS with HMR (load dist/ unpacked once)
pnpm test         # vitest — garment detection, srcset, JSON-LD, Gemini parsing
pnpm build        # type-check + production build
```

Optional, for a stable extension id across rebuilds/machines: generate a key
and put it in `extension/.env.local` as `VITE_CRX_PUBLIC_KEY`:

```bash
openssl genrsa 2048 > key.pem    # keep private, never commit
openssl rsa -in key.pem -pubout -outform DER | base64 | tr -d '\n'
```

## The hosted edition

An earlier multi-user SaaS build (Next.js backend + Supabase auth/storage +
server-side Gemini, billing-ready schema) is preserved on the
[`hosted-saas`](../../tree/hosted-saas) branch, in case MirrorMe ever needs
accounts and paid plans again.

---

Created by [Maia Salti](https://www.linkedin.com/in/maia-salti/) — questions
welcome at [maia.salti@gmail.com](mailto:maia.salti@gmail.com).
