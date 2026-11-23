# LinguaLens — Konsultasi Gemini Neon (23 Nov 2026, 13:02 WIB)

Pertanyaan: dengan sisa ~6 hari dan tanpa refactor besar, improvement berdampak tertinggi apa yang masih bisa dilakukan supaya peluang menang naik? Jawaban lengkap, tanpa penolakan (tidak perlu retry kali ini).

## 1. 6 improvement berdampak tertinggi (terurut)

| Urutan | Improvement | Usaha | Kenapa juri peduli |
|---|---|---|---|
| 1 | Tes Gemini Nano asli di Desktop Chrome + indikator status model & fallback eksplisit. Uji keempat tugas PREFER_ON_DEVICE (grammar, rewrite, vocab card, translate ID) langsung di Chrome desktop. Tambah indikator status Nano (tersedia / sedang mengunduh / tidak didukung → otomatis ke Cloud). | Sedang (wajib hari ini) | Di VM headless, PREFER_ON_DEVICE sebenarnya baru teruji lewat fallback ke Cloud. Prompt yang lolos di Flash sering gagal/berantakan di Nano. Kalau juri buka URL di Firefox/Safari/Chrome tanpa Nano, fallback yang menjelaskan alasan routing terlihat matang, bukan rusak. |
| 2 | Upgrade badge jadi Hybrid Telemetry Strip — di samping badge On-device/Cloud dari inferenceSource, tampilkan latensi (ms) dan penghitung sesi ringkas (misal: 5 On-device · 0 KB terkirim · $0 vs 2 Cloud). | Kecil (1–2 jam) | Juri hybrid cari alasan nyata kenapa app perlu hybrid. On-device · 320ms vs Cloud · 1.9s + jumlah panggilan cloud yang dihemat langsung membuktikan kecepatan, privasi, dan efisiensi biaya tanpa baca teks panjang. |
| 3 | Tombol 1-Click Sample Drafts — 2–3 contoh teks siap klik di editor (esai pelajar Indonesia dengan kesalahan khas tense/preposition, draf email kasual→formal, paragraf IELTS). | Kecil (30–60 mnt) | Juri rata-rata cuma punya 2–3 menit mencoba URL publik. Tanpa sample button, mereka harus mengetik kalimat Inggris yang sengaja salah secara manual. Dengan 1 klik, juri bisa menguji alur on-device dan cloud dalam 20 detik. |
| 4 | Inline Visual Diff (grammar/rewrite) + guard fitur Cloud saat offline — perbandingan merah-coret/hijau untuk hasil koreksi grammar/rewrite on-device. Saat navigator.onLine === false, nonaktifkan tombol Essay Review & Chat Partner dengan pesan jelas ("Butuh koneksi — gunakan alat On-device di bawah sambil offline"), bukan error mentah. | Kecil–Sedang (2–3 jam) | Visual diff mengangkat LinguaLens dari "kotak teks output AI biasa" jadi produk pelatih menulis sungguhan. Guard offline mencegah juri mengalami error saat sengaja menguji klik fitur Cloud ketika Wi-Fi dimatikan. |
| 5 | Auto-Sync bersih offline → Firestore + badge status sinkronisasi — draf yang diedit saat offline di localStorage otomatis tersinkron ke Firestore begitu koneksi kembali (atau aktifkan persistentLocalCache() bawaan Firestore), disertai indikator kecil (Tersimpan lokal → Tersinkron ke Firestore). | Sedang (2–3 jam) | Kontinuitas data offline→online yang benar-benar mendarat di Firestore (bukan terpisah permanen di localStorage) memberi nilai ekstra pada kualitas integrasi ekosistem Firebase. |
| 6 | Audit repo publik (hesikhasme/lingualens), Firestore Rules, & README khusus juri — verifikasi riwayat git dari kebocoran secret sebelumnya, kunci firestore.rules per request.auth.uid, tambah bagian "How to Verify On-Device Mode" + tabel routing hybrid di README. | Kecil (1–2 jam) | Juri teknis Firebase sering mengecek repo publik, firestore.rules, dan cara mereproduksi mode on-device secara lokal. Dokumentasi reproduksi yang bersih sering jadi pembeda di babak finalis. |

## 2. Kelemahan & risiko terbesar

- **Risiko #1 (kritis): prompt single-turn belum pernah teruji di Gemini Nano sungguhan.** E2E baru jalan di VM headless, jadi semua fitur PREFER_ON_DEVICE kemungkinan besar belum pernah benar-benar dieksekusi Nano. Nano punya jendela konteks jauh lebih sempit dan kepatuhan format (terutama JSON terstruktur untuk kartu kosakata + contoh kalimat atau terjemahan) yang lebih rapuh dari Flash. Kalau dites baru H-1 dan output Nano rusak/terpotong, waktu tidak cukup untuk menyederhanakan prompt.
- **Jebakan fallback diam-diam (PREFER_ON_DEVICE → Cloud).** Kalau juri buka URL Hosting di browser tanpa model Nano, Firebase AI Logic otomatis melempar tugas pendek ke Cloud. Kalau UI tidak menjelaskan bahwa browser juri tidak mendukung on-device (dan tidak menunjukkan badge Cloud (fallback)), juri bisa mengira routing hybrid salah konfigurasi atau bohong.
- **Sisa kebocoran secret di riwayat git publik.** Menghapus secret lewat commit baru tidak menghapusnya dari git log. Jika kredensial yang sempat bocor adalah kunci sensitif (bukan sekadar public Firebase config), kunci tersebut wajib dirotasi/dicabut, dan commit-nya dibersihkan (atau minimal dikonfirmasi aman jika itu hanya apiKey klien Firebase yang sudah dibatasi domain HTTP referrer di Google Cloud Console).
- **App Check gagal setelah deploy ke Firebase Hosting.** App Check + Anonymous Auth yang mulus di localhost (memakai debug token) sangat sering meledak dengan 403 / App Check token invalid saat pertama kali di-deploy ke *.web.app karena domain belum masuk allowlist reCAPTCHA v3 / Enterprise atau token debug masih tertinggal. Wajib deploy minimal H-4, bukan H-1.
- **Konflik localStorage vs Firestore & aturan keamanan default.** Dua penyimpanan terpisah rawan bikin draf offline tidak pernah naik ke Firestore (atau malah menimpa draf terbaru saat kembali online). Pastikan firestore.rules tidak masih test mode (allow read, write: if true) — kunci ketat ke request.auth != null && request.auth.uid == userId, terutama karena Anonymous Auth aktif.
- **Risiko dianggap "wrapper grammar checker biasa".** Kategori writing coach sangat padat. Kalau tidak menonjolkan kenapa split hybrid ini spesifik menyelesaikan masalah pelajar bahasa Inggris di Indonesia (privasi draf pribadi, belajar di kereta/koneksi tidak stabil, menghemat biaya API dengan memindahkan 80% micro-edit ke perangkat), nilai di kriteria Creativity / Real-world Impact bisa mentok di tengah.

## 3. Strategi video demo 3 menit & poles draf Devpost

### Skrip video (maks 2:50 — sisakan buffer 10 detik)

- **0:00–0:25 | Masalah & hook nyata:** langsung tampilkan URL Live Firebase Hosting. 1 kalimat tajam sesuai tagline: pelajar melakukan puluhan koreksi kecil per sesi — mengirim setiap koreksi kecil ke cloud itu lambat, boros kuota, dan mati saat offline.
- **0:25–1:30 | Bukti offline & on-device (bagian terpenting):** klik tombol Sample Draft; buka Chrome DevTools tab Network (di samping/bawah) DAN matikan Wi-Fi OS secara terlihat di menu bar sistem (jauh lebih meyakinkan daripada sekadar centang Offline di DevTools); jalankan 3 fitur cepat berturut-turut: Grammar Fix (tunjukkan visual diff), Rewrite Formal/Casual, Translate ke Indonesia / Kartu Kosakata; zoom singkat ke 3 bukti sekaligus: badge On-device dari inferenceSource, latensi milidetik, dan tab Network yang tetap kosong (0 requests); coba klik sebentar tombol Essay Review saat Wi-Fi masih mati untuk memperlihatkan graceful offline guard (tidak crash, memberi arahan jelas), lalu edit sedikit draf untuk menunjukkan penyimpanan lokal.
- **1:30–2:25 | Nyalakan Wi-Fi → auto-sync & cloud deep coaching:** nyalakan Wi-Fi kembali; perlihatkan indikator sinkronisasi draf ke Firestore; klik Full Essay Review → badge berubah jadi Cloud (Gemini Flash), skor terstruktur + rewrite paragraf muncul; buka Chat Partner 2 giliran singkat yang mengacu pada topik esai tadi; tunjukkan Hybrid Telemetry Strip yang merangkum rasio panggilan On-device vs Cloud dalam satu sesi.
- **2:25–2:50 | Arsitektur singkat & penutup:** 1 diagram/tabel bersih: Firebase AI Logic (PREFER_ON_DEVICE / PREFER_IN_CLOUD) + Anonymous Auth + App Check + Firestore + Firebase Hosting. Tutup dengan URL live dan repo GitHub.

### Poles draf Devpost (tanpa menulis ulang semuanya)

Tagline sudah sangat kuat — pertahankan. Selipkan 4 elemen konkret:
- **Tabel split hybrid eksplisit (di How we built it):** 4 kolom (Fitur | Mode Firebase AI Logic | Model | Kenapa Di Sini).
- **Bagian "Real-World Impact of Hybrid Split" (2–3 kalimat terukur):** dalam sesi menulis 15 menit, mayoritas interaksi bersifat single-turn pendek — memindahkannya ke Gemini Nano memangkas ~70–80% panggilan cloud, menjaga draf tetap privat di perangkat, dan tetap berfungsi di area koneksi tidak stabil.
- **Catatan jujur soal Challenges:** tantangan nyata — menguji perbedaan perilaku Nano vs Flash, mengamankan aplikasi web publik dengan App Check + Anonymous Auth, menjaga konsistensi data antara offline dan Firestore.
- **Kotak "How Judges Can Test Both Modes":** URL live Firebase Hosting, syarat melihat badge On-device (Chrome desktop versi terbaru dengan Gemini Nano aktif), dan jelaskan bahwa di browser lain app tetap berjalan normal melalui fallback otomatis PREFER_ON_DEVICE ke Cloud.

## 4. Yang sebaiknya TIDAK dilakukan di sisa 6 hari

- Jangan tambahkan login Google / Email-Password. Anonymous Auth justru keunggulan — juri bisa langsung mencoba tanpa signup wall.
- Jangan tambah fitur AI baru (voice/speaking coach, unggah PDF/DOCX, XP/gamifikasi, banyak bahasa lain). 6 fitur yang ada (4 on-device + 2 cloud) sudah seimbang dan pas diceritakan dalam 3 menit.
- Jangan pasang custom Service Worker / PWA caching yang rumit di menit terakhir. Service worker yang salah konfigurasi sering memutus pembaruan Firebase Hosting, mengganggu token App Check/Auth, dan menyulitkan debugging. Untuk demo offline, memutus Wi-Fi saat halaman sudah terbuka sudah 100% sah dan stabil.
- Jangan refactor UI besar-besaran atau ganti library CSS/state. Poles visual tipis (badge, diff, sample buttons, spacing) jauh lebih aman daripada merombak komponen yang sudah bersih dari console error.
- Jangan menunda deploy Firebase Hosting dan tes Chrome Desktop sampai 28–29 Nov. Selesaikan deploy + tes Nano asli paling lambat 25 Nov agar ada 3 hari tenang untuk memperbaiki kejutan prompt Nano/App Check, merekam video, dan mengunci submit di 29 Nov.

## Rencana kerja ringkas 6 hari (23–29 Nov)

- **Hari 1–2 (23–24 Nov):** deploy ke Firebase Hosting, uji App Check di domain live, tes desktop Chrome asli untuk Gemini Nano di keempat fitur on-device; sesuaikan prompt jika output Nano bermasalah; cek git history secret & kunci firestore.rules.
- **Hari 3–4 (25–26 Nov):** implementasi Hybrid Telemetry Strip, 1-Click Sample Drafts, visual diff grammar/rewrite, offline guard tombol Cloud, verifikasi auto-sync offline → Firestore.
- **Hari 5 (27 Nov):** bekukan kode (code freeze), rekam video demo <3 menit dengan bukti Wi-Fi mati + DevTools Network, finalisasi README & draf Devpost.
- **Hari 6 (28–29 Nov):** tes ulang URL live di mode incognito (Chrome dengan Nano + 1 browser non-Nano untuk cek fallback), unggah video, submit di 29 Nov (1 hari sebelum batas 30 Nov 17:00 ET).
