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

## Improvements #2–#5 (23 Nov 2026, dari konsultasi Gemini Neon)

Dibangun dari `GEMINI-IMPROVE-2026-11-23.md`. Routing AI, prompt, dan Firebase
config TIDAK diubah. Tidak ada fitur AI baru, login, service worker, atau
refactor UI. Build lokal + verifikasi saja — TIDAK push GitHub, TIDAK deploy,
TIDAK sentuh video demo.

### #2 Hybrid Telemetry Strip — DONE
- `index.html`: strip `<p id="telemetry-strip">` di bawah status model di tab
  Write; tampil sejak awal (`Session · 0 On-device · 0 KB sent · $0 · 0 Cloud`).
- `src/main.ts`: `telemetry` state + `recordTelemetry(source, ms)` +
  `renderTelemetry()`; setiap panggilan AI (grammar, rewrite, vocab,
  translate, essay review, chat) diukur dengan `performance.now()` dan
  dicatat; `badge(source, ms)` menampilkan latensi per hasil
  (mis. `On-device · Gemini Nano · 320 ms`).
- `src/style.css`: `.telemetry` (kotak kecil, tidak mencolok).
- Verifikasi: `window.__lingualensTelemetry('on_device', 320)` +
  `('in_cloud', 1900)` → strip: `Session · 1 On-device · 0 KB sent · $0 ·
  1 Cloud — last: 320 ms on-device / 1.9 s cloud`. `npm run build` lolos.

### #3 1-Click Sample Drafts — DONE
- `index.html`: baris `Try a sample:` di bawah editor (3 tombol:
  Learner essay, Casual email, IELTS paragraph).
- `src/main.ts`: `SAMPLES` (esai pelajar dgn kesalahan tense/preposition,
  email kasual→formal, paragraf IELTS) — 1 klik memuat teks ke editor.
- Verifikasi: ketiga tombol diklik via CDP, editor terisi teks yang benar.
  `npm run build` lolos.

### #4 Inline Visual Diff + offline guard — DONE
- `src/main.ts`: `wordDiffHtml(original, corrected)` — diff kata berbasis LCS
  (cap 2000 token, fallback teks biasa); kata dihapus → `<del>` merah
  coret, kata ditambah → `<ins>` hijau. Dipakai di hasil grammar
  (`#corrected-text`) dan rewrite (`#rewrite-text`); tombol "Use corrected
  text" tetap memakai string `result.corrected` asli.
- `src/style.css`: `.result-box del/ins`.
- Offline guard: `updateCloudButtons()` — saat `navigator.onLine === false`,
  tombol Essay Review + Send chat dinonaktifkan + hint tampil
  (`#review-offline-hint`: "Butuh koneksi — gunakan alat On-device di bawah
  sambil offline."; `#chat-offline-hint` analog); handler review/chat juga
  early-return saat offline; `setBusy()` tidak bisa mengaktifkan kembali
  tombol saat offline (finally memanggil `updateCloudButtons()`).
- Verifikasi: diff `I goes to school yesterday` → `I went…` me-render
  `I <del>goes</del><ins>went</ins> to school yesterday`. Guard dites
  dengan CDP `Network.emulateNetworkConditions` offline ASLI
  (`/tmp/ll-offline-test.mjs`): offline → kedua tombol disabled, kedua hint
  tampil, pill "Offline — on-device still works", klik tombol review tidak
  menghasilkan apa-apa; kembali online → tombol aktif lagi, hint hilang.
  `npm run build` lolos.

### #5 Auto-Sync offline → Firestore + badge status — DONE (dengan batasan VM)
- `src/firebase-app.ts`: `getFirestore()` → `initializeFirestore(app,
  { localCache: persistentLocalCache() })` (fallback ke `getFirestore`
  bila cache persisten tidak tersedia).
- `src/store.ts`: `Store.syncPending()` — upload draf localStorage yang
  ber-id `d-…` ke Firestore, hapus dari localStorage yang sudah naik,
  `reconcileProgress()` gabung progres (max per field) Firestore ↔ lokal.
  Dipanggil sekali saat init + tiap event `online`. Status dilaporkan via
  `onSyncStatus`: `synced` / `syncing` / `local` / `offline`.
  Semua langkah jaringan dibatasi timeout (`withTimeout`: upload 15 dtk,
  baca progres 8 dtk) — jaringan mati tidak bisa menggantung sync;
  kegagalan menyimpan salinan lokal (tidak ada data hilang, tidak ada
  status sukses palsu).
- `src/main.ts` + `index.html`: badge `#sync-status` di kartu progress
  ("Tersinkron ke Firestore." / "Menyinkronkan…" / "Tersimpan lokal
  (belum tersinkron)." / "Offline — tersimpan di perangkat ini.").
- Verifikasi (VM): `npm run build` lolos; `syncPending()` dipanggil dengan
  draf lokal `d-999` + uid injeksi → selesai dalam ~27 dtk (tanpa hang),
  draf TETAP di localStorage, status jujur "Tersimpan lokal (belum
  tersinkron)." — karena VM tidak bisa mencapai Google (SSL error), tulis
  Firestore tidak pernah resolve dari cache lokal dalam 15 dtk. Timeout
  bekerja sesuai desain. **Upload ke server Firestore yang sebenarnya
  BELUM terverifikasi dari VM** — butuh jaringan ke Google (Chrome desktop
  Mafie / setelah deploy).
- Catatan: bila timeout terjadi SETELAH server menerima tulis tapi sebelum
  promise resolve, draf bisa terduplikasi saat retry berikutnya (judul +
  teks sama, dua baris). Risiko kecil; tidak ditangani di ronde ini.

### Test hooks (pola sama seperti `__lingualensReady`)
- `window.__lingualensTelemetry`, `__lingualensDiff`, `__lingualensStore`,
  `__lingualensFirebase` — hanya untuk tes otomatis, tidak dipakai UI.

### Verifikasi akhir (23 Nov 2026, semua setelah perubahan terakhir)
- `npm run build` lolos (tsc + Vite, bundle 768 KB / 191 KB gzip).
- Tes CDP gabungan (`tools/test.mjs` + interact): APP READY; strip, sample,
  diff, badge sync, tombol review online — semua sesuai harapan.
- Console: hanya 2 warning yang SUDAH ADA sebelum perubahan ini (App Check
  token fetch + anonymous sign-in gagal — VM tidak bisa mencapai Google).
  Tidak ada console error baru, tidak ada exception dari kode baru.
- `gitleaks detect --no-git` pada 5 file yang diubah (`src/main.ts`,
  `src/store.ts`, `src/firebase-app.ts`, `src/style.css`, `index.html`):
  **no leaks found** di semuanya. Tidak ada secret yang ditambahkan.

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
