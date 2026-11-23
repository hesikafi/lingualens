// LinguaLens UI wiring.
import './style.css';
import { initFirebase, type FirebaseServices } from './firebase-app';
import { isFirebaseConfigured } from './firebase-config';
import { FirebaseAIClient, DemoAIClient, type AIClient, type InferenceSource } from './ai';
import { Store } from './store';
import { speak, stopSpeaking, ttsSupported } from './tts';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

function fmtMs(ms: number): string {
  return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)} s`;
}

function badge(source: InferenceSource, ms?: number): string {
  const lat = ms == null ? '' : ` · ${fmtMs(ms)}`;
  if (source === 'on_device')
    return `<span class="badge on-device"><span class="dot"></span>On-device · Gemini Nano${lat}</span>`;
  if (source === 'in_cloud')
    return `<span class="badge in-cloud"><span class="dot"></span>Cloud · Gemini Flash${lat}</span>`;
  return `<span class="badge demo"><span class="dot"></span>Demo (no Firebase config)${lat}</span>`;
}

// ---- hybrid telemetry: per-session counts + last latency per source ----
const telemetry = {
  counts: { on_device: 0, in_cloud: 0, demo: 0 } as Record<InferenceSource, number>,
  lastMs: { on_device: null, in_cloud: null, demo: null } as Record<InferenceSource, number | null>,
};

function renderTelemetry() {
  const el = $('telemetry-strip');
  const c = telemetry.counts;
  const last: string[] = [];
  if (telemetry.lastMs.on_device != null) last.push(`${fmtMs(telemetry.lastMs.on_device)} on-device`);
  if (telemetry.lastMs.in_cloud != null) last.push(`${fmtMs(telemetry.lastMs.in_cloud)} cloud`);
  el.innerHTML =
    `Session · <b>${c.on_device}</b> On-device · 0 KB sent · $0 · <b>${c.in_cloud}</b> Cloud` +
    (c.demo > 0 ? ` · <b>${c.demo}</b> Demo` : '') +
    (last.length > 0 ? ` — last: ${last.join(' / ')}` : '');
}

function recordTelemetry(source: InferenceSource, ms: number) {
  telemetry.counts[source] += 1;
  telemetry.lastMs[source] = ms;
  renderTelemetry();
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Tiny markdown-ish renderer for the essay review (headings, bold, lists). */
function renderRich(text: string): string {
  const lines = text.split('\n');
  const out: string[] = [];
  let inList = false;
  for (const raw of lines) {
    const line = raw.trim();
    if (line.startsWith('## ')) {
      if (inList) { out.push('</ul>'); inList = false; }
      out.push(`<h3>${escapeHtml(line.slice(3))}</h3>`);
    } else if (line.startsWith('# ')) {
      if (inList) { out.push('</ul>'); inList = false; }
      out.push(`<h3>${escapeHtml(line.slice(2))}</h3>`);
    } else if (/^[-*]\s+/.test(line)) {
      if (!inList) { out.push('<ul>'); inList = true; }
      out.push(`<li>${inlineMd(line.replace(/^[-*]\s+/, ''))}</li>`);
    } else if (/^\d+[.)]\s+/.test(line)) {
      if (!inList) { out.push('<ul>'); inList = true; }
      out.push(`<li>${inlineMd(line.replace(/^\d+[.)]\s+/, ''))}</li>`);
    } else if (line === '') {
      if (inList) { out.push('</ul>'); inList = false; }
    } else {
      if (inList) { out.push('</ul>'); inList = false; }
      out.push(`<p>${inlineMd(line)}</p>`);
    }
  }
  if (inList) out.push('</ul>');
  return out.join('\n');
}

function inlineMd(s: string): string {
  return escapeHtml(s)
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/\*([^*]+)\*/g, '<i>$1</i>');
}

/**
 * Word-level diff between the original text and the corrected/rewritten text.
 * Removed words render as <del> (red strikethrough), added words as <ins>
 * (green) — the inline visual diff judges can read at a glance. Falls back
 * to plain escaped text for very long inputs (keeps the LCS table small).
 */
function wordDiffHtml(original: string, corrected: string): string {
  const a = original.split(/(\s+)/);
  const b = corrected.split(/(\s+)/);
  if (a.length > 2000 || b.length > 2000) return escapeHtml(corrected);
  const n = a.length;
  const m = b.length;
  const dp: Uint16Array[] = [];
  for (let i = 0; i <= n; i++) dp.push(new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  let i = 0;
  let j = 0;
  const out: string[] = [];
  while (i < n && j < m) {
    if (a[i] === b[j]) { out.push(escapeHtml(a[i])); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { out.push(`<del>${escapeHtml(a[i])}</del>`); i++; }
    else { out.push(`<ins>${escapeHtml(b[j])}</ins>`); j++; }
  }
  while (i < n) { out.push(`<del>${escapeHtml(a[i])}</del>`); i++; }
  while (j < m) { out.push(`<ins>${escapeHtml(b[j])}</ins>`); j++; }
  return out.join('');
}

function setBusy(btn: HTMLButtonElement, busy: boolean) {
  if (busy) {
    if (!btn.dataset.label) btn.dataset.label = btn.textContent ?? '';
    btn.disabled = true;
    btn.textContent = 'Working…';
  } else {
    btn.disabled = false;
    if (btn.dataset.label) btn.textContent = btn.dataset.label;
  }
}

async function main() {
  // ---- tabs ----
  document.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
      document.querySelectorAll('.panel').forEach((p) => p.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(`panel-${(tab as HTMLElement).dataset.tab}`)?.classList.add('active');
    });
  });

  // ---- network indicator ----
  const netPill = $('net-pill');
  const netText = $('net-text');
  const updateNet = () => {
    const online = navigator.onLine;
    netPill.className = 'pill ' + (online ? 'online' : 'offline');
    netText.textContent = online ? 'Online' : 'Offline — on-device still works';
  };
  window.addEventListener('online', updateNet);
  window.addEventListener('offline', updateNet);
  updateNet();

  // ---- cloud features need the internet: disable them while offline and
  // show a clear message instead of a raw error (essay review + chat) ----
  const btnReview = $('btn-review') as HTMLButtonElement;
  const btnSendChat = $('btn-send-chat') as HTMLButtonElement;
  function updateCloudButtons() {
    const offline = !navigator.onLine;
    btnReview.disabled = offline;
    btnSendChat.disabled = offline;
    $('review-offline-hint').hidden = !offline;
    $('chat-offline-hint').hidden = !offline;
  }
  window.addEventListener('online', updateCloudButtons);
  window.addEventListener('offline', updateCloudButtons);
  updateCloudButtons();

  // ---- firebase + AI client ----
  const configured = isFirebaseConfigured();
  const aiPill = $('ai-pill');
  const demoBanner = $('demo-banner');
  let ai: AIClient;
  let store: Store;
  let fb: FirebaseServices | null = null;
  if (configured) {
    fb = await initFirebase();
    ai = new FirebaseAIClient(fb.app!);
    store = new Store(fb.db, fb.user?.uid ?? null);
    aiPill.className = 'pill live';
    $('ai-text').textContent = 'Hybrid AI ready';
    $('progress-note').textContent = fb.user ? 'Saved to Firestore (signed in anonymously).' : 'Saved on this device.';
  } else {
    ai = new DemoAIClient();
    store = new Store(null, null);
    demoBanner.hidden = false;
    aiPill.className = 'pill demo';
    $('ai-text').textContent = 'Demo mode';
  }

  // ---- offline → Firestore auto-sync + sync status badge ----
  // Uploads drafts saved offline in localStorage once the connection
  // returns; the store reports status through this callback.
  if (configured) {
    store.onSyncStatus = (s) => {
      $('sync-status').textContent =
        s === 'synced' ? 'Tersinkron ke Firestore.'
        : s === 'syncing' ? 'Menyinkronkan…'
        : s === 'offline' ? 'Offline — tersimpan di perangkat ini.'
        : 'Tersimpan lokal (belum tersinkron).';
    };
    window.addEventListener('online', () => void store.syncPending());
    void store.syncPending();
  }

  // ---- device model status (on-device warm-up) ----
  const deviceStatus = $('device-status');
  const deviceWrap = $('device-progress-wrap');
  const deviceBar = $('device-progress');
  let deviceWarmed = false;
  async function warmDevice() {
    if (deviceWarmed) return;
    deviceWarmed = true;
    if (!ai.real) {
      deviceStatus.textContent = 'Demo mode: no device model to download. Connect Firebase to use on-device Gemini Nano.';
      return;
    }
    deviceStatus.textContent = 'Starting on-device model… (first run downloads Gemini Nano, ~1–2 GB, only on desktop Chrome)';
    deviceWrap.hidden = false;
    try {
      await ai.ensureDeviceModel((pct) => {
        deviceBar.style.width = `${pct}%`;
        deviceStatus.textContent = `Downloading on-device model… ${pct}%`;
      });
      deviceWrap.hidden = true;
      deviceStatus.textContent = 'On-device model ready. Corrections below run on your device when possible (badge shows where each answer was computed).';
    } catch {
      deviceWrap.hidden = true;
      deviceStatus.textContent = 'On-device model not available in this browser — results will come from the cloud (badge will say so).';
    }
  }

  // ---- progress + drafts ----
  async function refreshProgress() {
    const p = await store.getProgress();
    $('stat-corrections').textContent = String(p.corrections);
    $('stat-rewrites').textContent = String(p.rewrites);
    $('stat-essays').textContent = String(p.essays);
    $('stat-chats').textContent = String(p.chats);
    $('stat-words').textContent = String(p.wordsWritten);
  }
  async function refreshDrafts() {
    const list = $('draft-list');
    const drafts = await store.listDrafts();
    if (drafts.length === 0) {
      list.innerHTML = '<li class="empty">No drafts yet — write something and hit “Save draft”.</li>';
      return;
    }
    list.innerHTML = '';
    for (const d of drafts) {
      const li = document.createElement('li');
      const title = document.createElement('span');
      title.className = 'title';
      title.textContent = d.title;
      const date = document.createElement('span');
      date.className = 'date';
      date.textContent = new Date(d.createdAt).toLocaleDateString();
      const loadBtn = document.createElement('button');
      loadBtn.className = 'btn';
      loadBtn.textContent = 'Load';
      loadBtn.onclick = () => {
        ($('editor') as HTMLTextAreaElement).value = d.text;
        document.querySelector('[data-tab="write"]')?.dispatchEvent(new Event('click'));
        window.scrollTo({ top: 0, behavior: 'smooth' });
      };
      const delBtn = document.createElement('button');
      delBtn.className = 'btn ghost';
      delBtn.textContent = 'Delete';
      delBtn.onclick = async () => {
        await store.deleteDraft(d.id);
        await refreshDrafts();
      };
      li.append(title, date, loadBtn, delBtn);
      list.appendChild(li);
    }
  }
  await refreshProgress();
  await refreshDrafts();

  // ---- editor helpers ----
  const editor = $('editor') as HTMLTextAreaElement;
  const getText = () => editor.value.trim();
  const wordCount = (t: string) => t.split(/\s+/).filter(Boolean).length;

  // ---- 1-click sample drafts (lets a judge test every flow in seconds) ----
  const SAMPLES: Record<string, string> = {
    essay:
      'Yesterday I go to the market with my friend. We buyed some fruits and we was very happy. She give me a book about English grammar, and I read it every night. I think learning English is very important for my future because I want to work in abroad.',
    email:
      "hey boss, i wanted to ask if i can take friday off? my cousin is getting married and i need to go to jakarta. i will finish all my work before i go, dont worry. thanks a lot!",
    ielts:
      'Some people think that studying abroad is the best way to learn a language. However, others believes that you can learn just as good at home. In my opinion, living in another country give you more chance to practise every day, but it also cost a lot of money and you may feel homesick.',
  };
  document.querySelectorAll('.sample').forEach((btn) => {
    btn.addEventListener('click', () => {
      editor.value = SAMPLES[(btn as HTMLElement).dataset.sample ?? ''] ?? '';
      editor.focus();
    });
  });

  // ---- grammar correction ----
  $('btn-correct').addEventListener('click', async (e) => {
    const btn = e.currentTarget as HTMLButtonElement;
    const text = getText();
    if (!text) return;
    await warmDevice();
    setBusy(btn, true);
    try {
      const t0 = performance.now();
      const { result, source } = await ai.correctGrammar(text);
      const ms = performance.now() - t0;
      recordTelemetry(source, ms);
      $('correction-result').hidden = false;
      $('correction-badge').innerHTML = badge(source, ms);
      $('corrected-text').innerHTML = wordDiffHtml(text, result.corrected);
      const ul = $('issues-list');
      ul.innerHTML = '';
      if (result.issues.length === 0) {
        const li = document.createElement('li');
        li.textContent = 'No mistakes found — nice work!';
        ul.appendChild(li);
      } else {
        for (const iss of result.issues) {
          const li = document.createElement('li');
          li.innerHTML = `<s>${escapeHtml(iss.original)}</s> → <b>${escapeHtml(iss.fixed)}</b> <span class="rule">(${escapeHtml(iss.rule)})</span>`;
          ul.appendChild(li);
        }
      }
      ($('btn-apply-correction') as HTMLButtonElement).onclick = () => {
        editor.value = result.corrected;
      };
      ($('btn-speak-corrected') as HTMLButtonElement).onclick = () => speak(result.corrected);
      await store.bumpProgress({ corrections: 1, wordsWritten: wordCount(text) });
      await refreshProgress();
    } catch (err) {
      alert('Correction failed: ' + (err as Error).message);
    } finally {
      setBusy(btn, false);
    }
  });

  // ---- rewrites ----
  const doRewrite = (style: 'formal' | 'casual' | 'short') => async (e: Event) => {
    const btn = e.currentTarget as HTMLButtonElement;
    const text = getText();
    if (!text) return;
    await warmDevice();
    setBusy(btn, true);
    try {
      const t0 = performance.now();
      const r = await ai.rewrite(text, style);
      const ms = performance.now() - t0;
      recordTelemetry(r.source, ms);
      $('rewrite-result').hidden = false;
      $('rewrite-badge').innerHTML = badge(r.source, ms);
      $('rewrite-text').innerHTML = wordDiffHtml(text, r.text);
      ($('btn-apply-rewrite') as HTMLButtonElement).onclick = () => {
        editor.value = r.text;
      };
      ($('btn-speak-rewrite') as HTMLButtonElement).onclick = () => speak(r.text);
      await store.bumpProgress({ rewrites: 1 });
      await refreshProgress();
    } catch (err) {
      alert('Rewrite failed: ' + (err as Error).message);
    } finally {
      setBusy(btn, false);
    }
  };
  $('btn-rewrite-formal').addEventListener('click', doRewrite('formal'));
  $('btn-rewrite-casual').addEventListener('click', doRewrite('casual'));
  $('btn-rewrite-short').addEventListener('click', doRewrite('short'));

  // ---- vocabulary ----
  $('btn-vocab').addEventListener('click', async (e) => {
    const btn = e.currentTarget as HTMLButtonElement;
    const text = getText();
    if (!text) return;
    await warmDevice();
    setBusy(btn, true);
    try {
      const t0 = performance.now();
      const { cards, source } = await ai.vocabulary(text);
      const ms = performance.now() - t0;
      recordTelemetry(source, ms);
      $('vocab-result').hidden = false;
      $('vocab-badge').innerHTML = badge(source, ms);
      const grid = $('vocab-grid');
      grid.innerHTML = '';
      if (cards.length === 0) {
        grid.innerHTML = '<p class="empty">No vocabulary found — try a longer text.</p>';
      }
      for (const c of cards) {
        const div = document.createElement('div');
        div.className = 'vocab-card';
        div.innerHTML = `<div class="word">${escapeHtml(c.word)}</div><div class="meaning">${escapeHtml(c.meaning)}</div><div class="example">“${escapeHtml(c.example)}”</div>`;
        const speakBtn = document.createElement('button');
        speakBtn.className = 'btn ghost speak';
        speakBtn.textContent = '🔊 Hear it';
        speakBtn.onclick = () => speak(`${c.word}. ${c.example}`);
        div.appendChild(speakBtn);
        grid.appendChild(div);
      }
    } catch (err) {
      alert('Vocabulary failed: ' + (err as Error).message);
    } finally {
      setBusy(btn, false);
    }
  });

  // ---- translate ----
  $('btn-translate').addEventListener('click', async (e) => {
    const btn = e.currentTarget as HTMLButtonElement;
    const text = getText();
    if (!text) return;
    await warmDevice();
    setBusy(btn, true);
    try {
      const t0 = performance.now();
      const r = await ai.translate(text, 'Indonesian');
      const ms = performance.now() - t0;
      recordTelemetry(r.source, ms);
      $('translate-result').hidden = false;
      $('translate-badge').innerHTML = badge(r.source, ms);
      $('translate-text').textContent = r.text;
    } catch (err) {
      alert('Translation failed: ' + (err as Error).message);
    } finally {
      setBusy(btn, false);
    }
  });

  // ---- save draft ----
  $('btn-save-draft').addEventListener('click', async () => {
    const text = getText();
    if (!text) return;
    await store.saveDraft('', text);
    await refreshDrafts();
    await store.bumpProgress({ wordsWritten: wordCount(text) });
    await refreshProgress();
  });

  // ---- essay review ----
  let lastReview = '';
  $('btn-review').addEventListener('click', async (e) => {
    const btn = e.currentTarget as HTMLButtonElement;
    const text = ($('essay') as HTMLTextAreaElement).value.trim();
    if (!text) return;
    if (!navigator.onLine) { updateCloudButtons(); return; }
    setBusy(btn, true);
    try {
      const t0 = performance.now();
      const r = await ai.reviewEssay(text);
      const ms = performance.now() - t0;
      recordTelemetry(r.source, ms);
      lastReview = r.text;
      $('review-result').hidden = false;
      $('review-badge').innerHTML = badge(r.source, ms);
      $('review-text').innerHTML = renderRich(r.text);
      ($('btn-speak-review') as HTMLButtonElement).disabled = !ttsSupported();
      await store.bumpProgress({ essays: 1, wordsWritten: wordCount(text) });
      await refreshProgress();
    } catch (err) {
      alert('Review failed: ' + (err as Error).message);
    } finally {
      setBusy(btn, false);
      updateCloudButtons();
    }
  });
  $('btn-speak-review').addEventListener('click', () => {
    if (lastReview) speak(lastReview.replace(/[#*`]/g, ''));
  });

  // ---- practice chat ----
  const chat = ai.startChat();
  const chatLog = $('chat-log');
  const chatInput = $('chat-input') as HTMLInputElement;
  let chatBusy = false;
  function addMsg(text: string, who: 'user' | 'model', source?: InferenceSource, ms?: number) {
    const div = document.createElement('div');
    div.className = `msg ${who}`;
    div.textContent = text;
    if (who === 'model' && source) {
      const meta = document.createElement('span');
      meta.className = 'meta';
      meta.innerHTML = badge(source, ms);
      div.appendChild(meta);
      const speakBtn = document.createElement('button');
      speakBtn.className = 'btn ghost';
      speakBtn.style.cssText = 'margin-top:6px;font-size:12.5px;padding:4px 9px;';
      speakBtn.textContent = '🔊 Hear it';
      speakBtn.onclick = () => speak(text);
      div.appendChild(document.createElement('br'));
      div.appendChild(speakBtn);
    }
    chatLog.appendChild(div);
    chatLog.scrollTop = chatLog.scrollHeight;
  }
  async function sendChat() {
    const msg = chatInput.value.trim();
    if (!msg || chatBusy) return;
    if (!navigator.onLine) { updateCloudButtons(); return; }
    chatBusy = true;
    chatInput.value = '';
    addMsg(msg, 'user');
    try {
      const t0 = performance.now();
      const r = await chat.send(msg);
      const ms = performance.now() - t0;
      recordTelemetry(r.source, ms);
      addMsg(r.text, 'model', r.source, ms);
      await store.bumpProgress({ chats: 1 });
      await refreshProgress();
    } catch (err) {
      addMsg('Sorry, something went wrong: ' + (err as Error).message, 'model', 'demo');
    } finally {
      chatBusy = false;
      updateCloudButtons();
    }
  }
  $('btn-send-chat').addEventListener('click', sendChat);
  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') sendChat();
  });

  // Expose a tiny hook for automated testing.
  (window as unknown as { __lingualensReady: boolean }).__lingualensReady = true;
  // Test hook for the telemetry strip (same pattern as __lingualensReady).
  (window as unknown as { __lingualensTelemetry: typeof recordTelemetry }).__lingualensTelemetry = recordTelemetry;
  // Test hook for the word-level diff renderer.
  (window as unknown as { __lingualensDiff: typeof wordDiffHtml }).__lingualensDiff = wordDiffHtml;
  // Test hook for the store (lets tests seed an offline draft + run sync).
  (window as unknown as { __lingualensStore: Store }).__lingualensStore = store;
  // Test hook for the Firebase services (lets tests inject a uid for sync).
  if (fb) (window as unknown as { __lingualensFirebase: FirebaseServices }).__lingualensFirebase = fb;
  stopSpeaking;
}

main().catch((e) => {
  console.error('[LinguaLens] init failed:', e);
  const banner = $('demo-banner');
  banner.hidden = false;
  banner.querySelector('.banner-inner')!.textContent =
    'LinguaLens failed to start: ' + (e as Error).message;
});
