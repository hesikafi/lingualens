// Text-to-speech for pronunciation practice (browser SpeechSynthesis).
// No network, no API key — uses the device's built-in English voices.

export function ttsSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

export function speak(text: string, lang = 'en-US', rate = 0.9): void {
  if (!ttsSupported()) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang;
  u.rate = rate;
  const voices = window.speechSynthesis.getVoices();
  const en = voices.find((v) => v.lang.toLowerCase().startsWith('en') && /google|natural|samantha|zira|aria/i.test(v.name))
    ?? voices.find((v) => v.lang.toLowerCase().startsWith('en'));
  if (en) u.voice = en;
  window.speechSynthesis.speak(u);
}

export function stopSpeaking(): void {
  if (ttsSupported()) window.speechSynthesis.cancel();
}
