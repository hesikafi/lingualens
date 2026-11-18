# LinguaLens — English writing coach that works offline

**Firebase #BuildHybridAI 2026 hackathon entry (Web).**

LinguaLens helps English learners write better English. Fast, private corrections run
**on-device** (Gemini Nano in Chrome) — they work even with the Wi-Fi off. Deep coaching
(essay review, conversation practice) runs in the **cloud** (Gemini Flash). Every answer
shows a badge saying where it was computed.

## How hybrid inference is used (this is the core of the entry)

All AI calls go through **Firebase AI Logic** (`firebase/ai`) — the SDK is imported and
called at runtime in `src/ai.ts`, not just named in this README.

| Feature | Model | Mode | Why |
|---|---|---|---|
| Grammar correction | Gemini Nano | `InferenceMode.PREFER_ON_DEVICE` | Instant, private, single-turn — the perfect on-device task |
| Rewrite (formal / casual / short) | Gemini Nano | `PREFER_ON_DEVICE` | Short, deterministic, single-turn |
| Vocabulary cards | Gemini Nano | `PREFER_ON_DEVICE` | Structured JSON output from on-device |
| Translate word/phrase | Gemini Nano | `PREFER_ON_DEVICE` | Single-turn |
| Essay review | Gemini Flash | `PREFER_IN_CLOUD` | Long, deep analysis — needs the bigger model |
| Practice chat (multi-turn) | Gemini Flash | `PREFER_IN_CLOUD` | Multi-turn is cloud-only (on-device is single-turn) |

Key implementation details (`src/ai.ts`):
- `getAI(app, { backend: new GoogleAIBackend() })`, then `getGenerativeModel(ai, { mode, inCloudParams: { model: 'gemini-2.5-flash' } })`.
- `model.initializeDeviceModel(progressCb)` is called on the first user click, before any
  on-device call (required by the SDK).
- Every result reads `result.response.inferenceSource` (`on_device` | `in_cloud`) and the UI
  renders it as a badge — the visible proof of hybrid inference.
- `PREFER_ON_DEVICE` falls back to cloud automatically when the device model is unavailable,
  so the app never breaks on browsers without Nano.

## Features

- **Write tab** — editor + instant grammar correction (with per-issue rules), rewrite in 3
  styles, vocabulary cards with example sentences + pronunciation (TTS), translate to Indonesian.
- **Essay review tab** — full essay review with score, strengths, improvements, rewritten paragraph.
- **Practice chat tab** — multi-turn conversation partner in simple English, gentle corrections,
  read-aloud (TTS) on every reply.
- **Progress + drafts** — saved to Firestore (anonymous auth) when Firebase is configured,
  otherwise localStorage. Offline indicator in the header.
- **Demo mode** — without a Firebase config the app runs on a local demo AI so the whole UI can
  be tested end-to-end. Demo results are clearly badged "Demo".

## Setup (5 minutes, $0 — no credit card)

1. Go to https://console.firebase.google.com and create a project.
2. Left menu: **Build → AI Logic → Get started** → choose **Gemini Developer API** (free tier,
   no billing). This enables Firebase AI Logic for the project.
3. **Project settings → Your apps → Add app → Web** — copy the `firebaseConfig` object.
4. Paste it into `src/firebase-config.ts` (replacing the `PASTE_...` values). One file, one edit.
5. (Optional, for the hosted public URL) In the Firebase console, **App Check → Apps**,
   register a debug token for local dev; for the hosted app, add reCAPTCHA Enterprise
   (free tier). Debug tokens are accepted in hackathon submissions.

## Run locally

```bash
npm install
npm run dev        # http://127.0.0.1:5173
npm run build      # type-check + production build
npm run preview    # serve the production build
```

## On-device testing (desktop Chrome only)

On-device Gemini Nano needs **Chrome desktop v139+** with the flag
`chrome://flags/#prompt-api-for-gemini-nano-multimodal-input` enabled, then restart Chrome
and let the model download (first use, ~1–2 GB). The headless Chromium in a Linux VM does
**not** support model execution (`availability()` returns `unavailable` and `create()` throws
`NotSupportedError: The feature flag gating model execution was disabled`) — so on-device
verification and the offline demo video must be recorded on a desktop Chrome. The app handles
this gracefully: on browsers without Nano, `PREFER_ON_DEVICE` falls back to cloud and the
badge says so.

## Deploy (Firebase Hosting)

```bash
npm install -g firebase-tools
firebase login
firebase init hosting   # point it at dist/
npm run build
firebase deploy --only hosting
```

## Project structure

```
src/
  main.ts            — UI wiring (tabs, editor, chat, drafts, progress)
  ai.ts              — Firebase AI Logic (hybrid) + demo fallback
  firebase-app.ts    — Firebase init, App Check (debug), anon Auth, Firestore
  firebase-config.ts — PLACEHOLDER config — paste the real one here
  store.ts           — drafts + progress (Firestore / localStorage)
  tts.ts             — pronunciation (browser SpeechSynthesis)
  style.css          — design
```

## License

Apache License 2.0 — see `LICENSE`.
