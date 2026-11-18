# LinguaLens — Build Notes (18 Nov 2026)

## Status: WORKING APP, demo mode (no Firebase config yet)

App lengkap dan teruji end-to-end di VM (mode demo). Menunggu Firebase config dari Mafie
untuk mengaktifkan AI asli (Firebase AI Logic). Jangan submit ke Devpost sebelum config
terpasang + dites di Chrome desktop.

## Yang sudah dibangun

- **Lokasi:** `~/workspace/cuan/lingualens/` (Vite + TypeScript, Firebase JS SDK 12.19.0)
- **Fitur:**
  - Write: editor + koreksi grammar instan (dengan daftar issue + rule), rewrite 3 gaya
    (formal/kasual/short), kartu kosakata + contoh kalimat + TTS, translate ke Indonesia.
  - Essay review: skor, strengths, improvements, rewritten paragraph (render markdown).
  - Practice chat: multi-turn, balasan simple English, koreksi lembut, badge + TTS per balasan.
  - Progress (corrections/rewrites/essays/chats/words) + Drafts (save/load/delete).
  - Indikator online/offline di header; banner demo mode yang jelas.
  - Badge `inferenceSource` di SETIAP hasil: "On-device · Gemini Nano" / "Cloud · Gemini Flash" / "Demo".
- **Firebase AI Logic (real path, `src/ai.ts`):**
  - `getAI(app, { backend: new GoogleAIBackend() })`
  - On-device: `getGenerativeModel(ai, { mode: InferenceMode.PREFER_ON_DEVICE, inCloudParams: { model: 'gemini-2.5-flash' } })`
  - Cloud: `getGenerativeModel(ai, { mode: InferenceMode.PREFER_IN_CLOUD, inCloudParams: { model: 'gemini-2.5-flash' } })`
  - `initializeDeviceModel(progressCb)` dipanggil saat klik pertama (wajib, per SDK).
  - `result.response.inferenceSource` dibaca dan ditampilkan sebagai badge.
  - Bundle produksi terverifikasi mengandung `getGenerativeModel`, `InferenceMode`,
    `initializeDeviceModel`, `GoogleAIBackend`, `inferenceSource` (bukan cuma disebut di README).
- **Demo path (`DemoAIClient`):** mock lokal, aktif HANYA saat config masih placeholder.
  Jelas ditandai "Demo" di UI. Tidak dipakai sama sekali begitu config asli terpasang.
- **Config:** `src/firebase-config.ts` — semua nilai `PASTE_...`. Satu file, satu edit.
  `isFirebaseConfigured()` menggerakkan saklar demo ↔ real.
- **App Check:** debug provider untuk local dev (debug token diterima di submission).
- **Firestore/Auth:** anonymous sign-in + simpan draft/progress ke Firestore saat config ada;
  fallback localStorage saat demo/offline.

## Verifikasi (18 Nov 2026, headless Chromium di VM)

- `npm run build` sukses (tsc bersih, Vite build 6 detik). Bundle 768 KB (191 KB gzip).
- CDP test (`tools/test.mjs`, file://): app load (`__lingualensReady`), **0 console errors,
  0 failed requests** di semua skenario.
- Grammar: koreksi tampil + badge Demo + issues + stat naik ke 1. Rewrite + vocab tampil.
  Essay review tampil (7/10, 71 kata). Chat: 3 pesan (greeting + user + balasan + badge + TTS).
  Save draft: 1 baris draft muncul.
- Bug ditemukan + diperbaiki: `setBusy()` tidak mengembalikan label tombol ("Working…" nyangkut)
  — diperbaiki, terverifikasi tombol kembali jadi "Check grammar".
- Screenshot: `screenshots/01-home.png`, `02-grammar.png`, `03-rewrite-vocab.png`,
  `04-review.png`, `05-chat.png`, `06-draft.png` (dibaca visual: 01, 02, 04, 05 OK).

## BLOCKER KUNCI — On-device Gemini Nano TIDAK jalan di VM

- Headless Chromium di VM: v157.0.8103.81 (di atas v139, syarat minimum terpenuhi).
- `window.LanguageModel` ADA, tapi `availability()` = `"unavailable"` dan
  `LanguageModel.create()` melempar `NotSupportedError: "The feature flag gating model
  execution was disabled."` — dicoba 2 set flag (termasuk `OptimizationGuideOnDeviceModel`,
  `ModelExecution`), hasil sama.
- **Artinya:** tes on-device + bukti offline untuk video demo HARUS dilakukan di Chrome
  desktop Mafie (v139+ + flag `chrome://flags/#prompt-api-for-gemini-nano-multimodal-input`
  + unduh model Nano). Di VM, jalur on-device otomatis fallback ke cloud (itu perilaku
  bawaan `PREFER_ON_DEVICE`) — aplikasi tidak rusak, tapi badge akan menunjukkan "Cloud".
- Probe: `/tmp/prompt-test/probe.mjs` (CDP, recipe webgl-policy `hatch-webgl-all-origins-v1`,
  sha256 `8097045f…`).

## Yang masih menunggu Mafie

1. **Firebase config** — buat project di console.firebase.google.com (akun dia), enable AI
   Logic (Gemini Developer API, gratis, tanpa billing), daftarkan web app, kirim config ke MAE.
   Lalu MAE tempel ke `src/firebase-config.ts` + tes ulang jalur AI asli.
2. **Chrome desktop v139+ + flag + unduh Nano** — untuk tes on-device + rekam video demo offline.
3. **Repo GitHub publik + lisensi** — file sudah siap (README + LICENSE Apache-2.0); push via
   browser atau Mafie. Repo harus publik saat submit.
4. **Daftar Devpost + submit** — MAE siapkan materi; Mafie submit atas nama dia.
5. **Video demo (<3 mnt, English, YouTube publik)** — skrip + rekaman (25 Nov di rencana).

## Rencana build (dari concept file, target submit 29 Nov)

- 19 Nov: setup + config (HARI INI — app scaffold selesai, config ditunggu).
- 20 Nov: fondasi + on-device (tes jalur AI asli begitu config ada).
- 21 Nov: cloud (essay review + chat + TTS) — sudah dibangun, tinggal tes dengan AI asli.
- 22 Nov: fitur pelengkap + polish UI.
- 23 Nov: deploy Firebase Hosting + tes URL hosted.
- 24 Nov: play-test (Chrome desktop on-device + fallback + offline).
- 25 Nov: video demo. 26 Nov: repo + deskripsi. 27–28 Nov: buffer/final check. 29 Nov: SUBMIT.

## File penting

- `src/ai.ts` — AI layer (Firebase AI Logic + demo fallback)
- `src/firebase-config.ts` — PLACEHOLDER config (satu-satunya file yang perlu diubah Mafie/MAE)
- `src/firebase-app.ts` — init Firebase, App Check debug, anon Auth, Firestore
- `src/store.ts` — drafts + progress (Firestore / localStorage)
- `src/main.ts` — UI wiring; `src/style.css`; `index.html`
- `tools/test.mjs` — CDP test + screenshot; `screenshots/` — 6 screenshot terverifikasi
- `README.md`, `LICENSE` (Apache-2.0)
