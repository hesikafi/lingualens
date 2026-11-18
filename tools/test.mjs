// LinguaLens CDP test + screenshot tool (Node 22 stdlib only).
// Launches headless Chromium, loads the built app from file://, waits for
// window.__lingualensReady, runs an optional interaction script, captures
// console errors and a screenshot.
// Usage:
//   node tools/test.mjs --out shot.png [--interact <js-expr>] [--url <file-url>]
//   --interact is a JS expression evaluated in the page after load, e.g.
//   "document.getElementById('btn-correct').click()"
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const get = (k, d) => {
  const i = args.indexOf(k);
  return i === -1 ? d : args[i + 1];
};
const url = get('--url', 'file:///home/hatch/workspace/cuan/lingualens/dist/index.html');
const out = get('--out', '/tmp/lingualens-shot.png');
const interact = get('--interact', '');
const width = Number(get('--width', '1280'));
const height = Number(get('--height', '900'));
const timeoutMs = Number(get('--timeout', '60000'));
const chrome = '/opt/meta-chromium/chrome';

const policyPath = `/tmp/webgl-policy-test-${process.pid}.txt`;
const policyText = 'hatch-webgl-all-origins-v1\n';
writeFileSync(policyPath, policyText);
const policySha = createHash('sha256').update(policyText).digest('hex');
const port = 9500 + Math.floor(Math.random() * 400);
const userData = `/tmp/chrome-lingualens-${process.pid}`;

const child = spawn(chrome, [
  '--headless=new', '--no-sandbox', '--disable-gpu-sandbox', '--disable-dev-shm-usage',
  `--remote-debugging-port=${port}`, `--user-data-dir=${userData}`,
  `--window-size=${width},${height}`, '--hide-scrollbars',
  '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
  '--no-proxy-server', '--disable-features=LocalNetworkAccessChecks',
  '--allow-file-access-from-files',
  `--hatch-webgl-allowed-domains-file=${policyPath}`,
  `--hatch-webgl-allowed-domains-sha256=${policySha}`,
  'about:blank',
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function getWsUrl() {
  for (let i = 0; i < 50; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`);
      return (await res.json()).webSocketDebuggerUrl;
    } catch { await sleep(200); }
  }
  throw new Error('CDP did not come up');
}
let id = 0;
const pending = new Map();
const consoleMsgs = [];
const failedReqs = [];
function send(ws, method, params, sessionId) {
  return new Promise((resolve, reject) => {
    const mid = ++id;
    pending.set(mid, { resolve, reject });
    const msg = { id: mid, method, params: params || {} };
    if (sessionId) msg.sessionId = sessionId;
    ws.send(JSON.stringify(msg));
  });
}

async function main() {
  const wsUrl = await getWsUrl();
  const ws = new WebSocket(wsUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const p = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) p.reject(new Error(`CDP ${msg.error.code}: ${msg.error.message}`));
      else p.resolve(msg.result);
      return;
    }
    if (msg.method === 'Runtime.consoleAPICalled') {
      const p = msg.params;
      if (p.type === 'error' || p.type === 'warning') {
        consoleMsgs.push(`[console.${p.type}] ` + p.args.map((a) => a.value ?? a.description ?? '').join(' '));
      }
    }
    if (msg.method === 'Runtime.exceptionThrown') {
      const d = msg.params.exceptionDetails;
      consoleMsgs.push(`[exception] ${d.text} ${d.exception?.description || ''}`);
    }
    if (msg.method === 'Network.loadingFailed') failedReqs.push(msg.params.errorText);
    if (msg.method === 'Network.responseReceived' && msg.params.response.status >= 400) {
      failedReqs.push(`${msg.params.response.status} ${msg.params.response.url}`);
    }
  };
  const { targetId } = await send(ws, 'Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send(ws, 'Target.attachToTarget', { targetId, flatten: true });
  const sendS = (m, p) => send(ws, m, p, sessionId);
  await sendS('Runtime.enable');
  await sendS('Page.enable');
  await sendS('Network.enable');
  await sendS('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
  await sendS('Page.navigate', { url });
  const start = Date.now();
  let ready = false;
  while (Date.now() - start < timeoutMs) {
    const r = await sendS('Runtime.evaluate', { expression: 'window.__lingualensReady === true', returnByValue: true });
    if (r.result?.value === true) { ready = true; break; }
    await sleep(250);
  }
  if (!ready) throw new Error('__lingualensReady never became true');
  console.log('APP READY');

  if (interact) {
    const r = await sendS('Runtime.evaluate', { expression: interact, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) console.log('INTERACT ERROR:', r.exceptionDetails.text, r.exceptionDetails.exception?.description || '');
    else console.log('INTERACT RESULT:', JSON.stringify(r.result?.value)?.slice(0, 500));
    await sleep(2500);
  }

  // Report visible state for verification
  const state = await sendS('Runtime.evaluate', {
    expression: `JSON.stringify({
      title: document.title,
      demoBannerVisible: !document.getElementById('demo-banner').hidden,
      aiPill: document.getElementById('ai-text').textContent,
      correctionVisible: !document.getElementById('correction-result').hidden,
      correctedText: document.getElementById('corrected-text').textContent.slice(0,200),
      correctionBadge: document.getElementById('correction-badge').textContent,
      rewriteVisible: !document.getElementById('rewrite-result').hidden,
      vocabVisible: !document.getElementById('vocab-result').hidden,
      reviewVisible: !document.getElementById('review-result').hidden,
      chatMsgs: document.querySelectorAll('#chat-log .msg').length,
      statCorrections: document.getElementById('stat-corrections').textContent,
    })`,
    returnByValue: true,
  });
  console.log('STATE:', state.result?.value);

  await sleep(300);
  const shot = await sendS('Page.captureScreenshot', { format: 'png' });
  writeFileSync(out, Buffer.from(shot.data, 'base64'));
  console.log(`saved ${out}`);
  console.log(`console errors: ${consoleMsgs.length}`);
  for (const m of consoleMsgs) console.log('  ' + m);
  console.log(`failed requests: ${failedReqs.length}`);
  for (const m of failedReqs) console.log('  ' + m);
  ws.close();
  child.kill('SIGKILL');
  process.exit(consoleMsgs.length || failedReqs.length ? 2 : 0);
}
main().catch((e) => {
  console.error('TEST FAILED:', e.message);
  console.log(`console errors: ${consoleMsgs.length}`);
  for (const m of consoleMsgs) console.log('  ' + m);
  console.log(`failed requests: ${failedReqs.length}`);
  for (const m of failedReqs) console.log('  ' + m);
  child.kill('SIGKILL');
  process.exit(1);
});
