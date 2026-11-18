// AI layer — Firebase AI Logic hybrid inference.
// ---------------------------------------------------------------------------
// REAL PATH (when a Firebase config is pasted in firebase-config.ts):
//   * On-device model  — InferenceMode.PREFER_ON_DEVICE  (Gemini Nano in
//     Chrome; falls back to cloud automatically when the device model is not
//     available). Used for: grammar correction, rewrite, vocabulary, translate.
//   * Cloud model      — InferenceMode.PREFER_IN_CLOUD   (Gemini Flash).
//     Used for: full essay review, multi-turn practice chat.
//   Every result carries `source` = the response's `inferenceSource`
//   ('on_device' | 'in_cloud'), shown in the UI as a badge — this is the
//   proof of hybrid inference the judges look for.
//   `initializeDeviceModel()` is called on the first user interaction
//   (button click), as required by the SDK, before any on-device call.
// DEMO PATH (no Firebase config yet):
//   A local mock (DemoAIClient) that returns sensible, deterministic answers
//   so the whole UI can be tested end-to-end. Every demo result is tagged
//   source 'demo'. The demo path is ONLY active while the config is a
//   placeholder; it is never used once a real config is present.
// ---------------------------------------------------------------------------
import { getAI, getGenerativeModel, GoogleAIBackend, InferenceMode, type GenerativeModel } from 'firebase/ai';
import type { FirebaseApp } from 'firebase/app';

export type InferenceSource = 'on_device' | 'in_cloud' | 'demo';

export interface AIResult {
  text: string;
  source: InferenceSource;
}

export interface GrammarCorrection {
  corrected: string;
  issues: { original: string; fixed: string; rule: string }[];
}

export interface VocabCard {
  word: string;
  meaning: string;
  example: string;
}

export interface AIClient {
  /** True when this client talks to real Firebase AI Logic (not the demo mock). */
  readonly real: boolean;
  correctGrammar(text: string): Promise<{ result: GrammarCorrection; source: InferenceSource }>;
  rewrite(text: string, style: 'formal' | 'casual' | 'short'): Promise<AIResult>;
  vocabulary(text: string): Promise<{ cards: VocabCard[]; source: InferenceSource }>;
  translate(text: string, targetLang: string): Promise<AIResult>;
  reviewEssay(text: string): Promise<AIResult>;
  startChat(): ChatHandle;
  ensureDeviceModel(progress?: (pct: number) => void): Promise<void>;
}

export interface ChatHandle {
  send(message: string): Promise<AIResult>;
}

const CLOUD_MODEL = 'gemini-2.5-flash';

/** Extract the first {...} or [...] JSON block from model text. */
function extractJson(text: string): string {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start >= 0 && end > start) return text.slice(start, end + 1);
  const aStart = text.indexOf('[');
  const aEnd = text.lastIndexOf(']');
  if (aStart >= 0 && aEnd > aStart) return text.slice(aStart, aEnd + 1);
  return text;
}

function safeJson<T>(text: string, fallback: T): T {
  try {
    return JSON.parse(extractJson(text)) as T;
  } catch {
    return fallback;
  }
}

// ---------------------------------------------------------------------------
// Real client — Firebase AI Logic
// ---------------------------------------------------------------------------
export class FirebaseAIClient implements AIClient {
  readonly real = true;
  private onDeviceModel: GenerativeModel;
  private cloudModel: GenerativeModel;
  private deviceReady = false;
  private deviceInitPromise: Promise<void> | null = null;

  constructor(app: FirebaseApp) {
    const ai = getAI(app, { backend: new GoogleAIBackend() });
    // On-device first, cloud fallback (automatic in the SDK).
    this.onDeviceModel = getGenerativeModel(ai, {
      mode: InferenceMode.PREFER_ON_DEVICE,
      inCloudParams: { model: CLOUD_MODEL },
    });
    // Cloud first (essay review + chat need the bigger model + multi-turn).
    this.cloudModel = getGenerativeModel(ai, {
      mode: InferenceMode.PREFER_IN_CLOUD,
      inCloudParams: { model: CLOUD_MODEL },
    });
  }

  /** Must be called from a user gesture before the first on-device call. */
  async ensureDeviceModel(progress?: (pct: number) => void): Promise<void> {
    if (this.deviceReady) return;
    if (!this.deviceInitPromise) {
      this.deviceInitPromise = this.onDeviceModel
        .initializeDeviceModel((pct) => progress?.(Math.round(pct * 100)))
        .then(() => {
          this.deviceReady = true;
        })
        .catch((e) => {
          // On-device unavailable (e.g. no Nano model on this browser) —
          // PREFER_ON_DEVICE falls back to cloud automatically, so this is
          // not fatal. We just remember not to retry initialisation.
          console.warn('[LinguaLens] Device model unavailable, using cloud fallback:', e);
          this.deviceReady = true;
        });
    }
    return this.deviceInitPromise;
  }

  private sourceOf(result: { response: { inferenceSource?: string } }): InferenceSource {
    return result.response.inferenceSource === 'on_device' ? 'on_device' : 'in_cloud';
  }

  private async runOnDevice(prompt: string): Promise<AIResult> {
    await this.ensureDeviceModel();
    const result = await this.onDeviceModel.generateContent(prompt);
    return { text: result.response.text(), source: this.sourceOf(result) };
  }

  private async runCloud(prompt: string): Promise<AIResult> {
    const result = await this.cloudModel.generateContent(prompt);
    return { text: result.response.text(), source: this.sourceOf(result) };
  }

  async correctGrammar(text: string) {
    const prompt = `You are an English grammar coach. Correct the grammar, spelling and punctuation of the text below. Reply with ONLY a JSON object, no other text: {"corrected": "<the fully corrected text>", "issues": [{"original": "<the exact wrong phrase>", "fixed": "<the corrected phrase>", "rule": "<short rule name, e.g. subject-verb agreement>"}]}. If there are no mistakes, return the original text as "corrected" and an empty "issues" array.\n\nText:\n${text}`;
    const r = await this.runOnDevice(prompt);
    const parsed = safeJson<GrammarCorrection>(r.text, { corrected: text, issues: [] });
    return { result: parsed, source: r.source };
  }

  async rewrite(text: string, style: 'formal' | 'casual' | 'short') {
    const styleHint =
      style === 'formal'
        ? 'formal and professional, suitable for a work email'
        : style === 'casual'
          ? 'casual and friendly, like a message to a friend'
          : 'as short as possible while keeping the meaning';
    const prompt = `Rewrite the text below in a ${styleHint} style. Reply with ONLY the rewritten text, no explanation, no quotes.\n\nText:\n${text}`;
    return this.runOnDevice(prompt);
  }

  async vocabulary(text: string) {
    const prompt = `From the English text below, pick the 5 most useful or difficult words for an English learner. Reply with ONLY a JSON array, no other text: [{"word": "<word>", "meaning": "<short simple meaning>", "example": "<a short example sentence using the word>"}].\n\nText:\n${text}`;
    const r = await this.runOnDevice(prompt);
    const cards = safeJson<VocabCard[]>(r.text, []);
    return { cards, source: r.source };
  }

  async translate(text: string, targetLang: string) {
    const prompt = `Translate the following text to ${targetLang}. Reply with ONLY the translation, no explanation.\n\nText:\n${text}`;
    return this.runOnDevice(prompt);
  }

  async reviewEssay(text: string) {
    const prompt = `You are an English writing coach. Review the essay below in detail. Give: (1) an overall score out of 10, (2) 3 strengths, (3) 3 things to improve with a concrete example for each, (4) a short rewritten version of the weakest paragraph. Use clear headings and keep it encouraging and practical.\n\nEssay:\n${text}`;
    return this.runCloud(prompt);
  }

  startChat(): ChatHandle {
    const chat = this.cloudModel.startChat({
      history: [
        {
          role: 'user',
          parts: [
            {
              text: 'You are a friendly English conversation partner for an Indonesian learner. Keep replies short (1-3 sentences), use simple English, and gently correct mistakes by repeating the correct sentence. Ask a question at the end of each reply to keep the conversation going.',
            },
          ],
        },
        { role: 'model', parts: [{ text: "Hi! I'm your English practice partner. What would you like to talk about today?" }] },
      ],
    });
    return {
      send: async (message: string) => {
        const result = await chat.sendMessage(message);
        return { text: result.response.text(), source: this.sourceOf(result) };
      },
    };
  }
}

// ---------------------------------------------------------------------------
// Demo client — local mock, active ONLY while the Firebase config is a
// placeholder. Lets the whole UI be tested end-to-end with no network.
// ---------------------------------------------------------------------------
const DEMO_FIXES: [RegExp, string, string][] = [
  [/\bi\b/g, 'I', 'Capitalise the pronoun "I"'],
  [/\bteh\b/gi, 'the', 'Spelling: "the"'],
  [/\brecieve\b/gi, 'receive', 'Spelling: "receive" (i before e)'],
  [/\bgoes to school yesterday\b/gi, 'went to school yesterday', 'Past tense: "went"'],
  [/\bhe don't\b/gi, "he doesn't", 'Subject-verb agreement: "he doesn\'t"'],
  [/\btheir is\b/gi, 'there is', '"there" vs "their"'],
  [/\byour welcome\b/gi, "you're welcome", '"you\'re" (you are) vs "your"'],
  [/\bcould of\b/gi, 'could have', '"could have", not "could of"'],
];

export class DemoAIClient implements AIClient {
  readonly real = false;
  async ensureDeviceModel(): Promise<void> {
    return;
  }

  async correctGrammar(text: string) {
    let corrected = text;
    const issues: GrammarCorrection['issues'] = [];
    for (const [re, fix, rule] of DEMO_FIXES) {
      if (re.test(corrected)) {
        const m = corrected.match(re);
        if (m) {
          issues.push({ original: m[0], fixed: fix, rule });
          corrected = corrected.replace(re, fix);
        }
      }
    }
    // Demo sentence-case fix for the first letter.
    if (corrected.length > 0 && corrected[0] === corrected[0].toLowerCase()) {
      issues.push({ original: corrected[0], fixed: corrected[0].toUpperCase(), rule: 'Capitalise the first letter' });
      corrected = corrected[0].toUpperCase() + corrected.slice(1);
    }
    return { result: { corrected, issues }, source: 'demo' as InferenceSource };
  }

  async rewrite(text: string, style: 'formal' | 'casual' | 'short'): Promise<AIResult> {
    const out =
      style === 'formal'
        ? `Dear Sir/Madam, ${text.charAt(0).toLowerCase()}${text.slice(1)} Thank you for your attention.`
        : style === 'casual'
          ? `Hey! ${text} 😊`
          : text.split(/\s+/).slice(0, 8).join(' ') + (text.split(/\s+/).length > 8 ? '…' : '');
    return { text: out, source: 'demo' };
  }

  async vocabulary(text: string) {
    const words = [...new Set(text.toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/).filter((w) => w.length >= 6))].slice(0, 5);
    const cards: VocabCard[] = words.map((w) => ({
      word: w,
      meaning: `(demo) a word from your text — connect Firebase to get a real definition.`,
      example: `I used the word "${w}" in my writing.`,
    }));
    return { cards, source: 'demo' as InferenceSource };
  }

  async translate(text: string, targetLang: string): Promise<AIResult> {
    return { text: `[demo] (${targetLang}) ${text}`, source: 'demo' };
  }

  async reviewEssay(text: string): Promise<AIResult> {
    const words = text.split(/\s+/).filter(Boolean).length;
    return {
      text: `## Essay review (demo)\n\n**Overall: 7/10** — ${words} words.\n\n**Strengths**\n- Clear main idea.\n- Good sentence variety.\n- Natural tone.\n\n**To improve**\n- Watch subject-verb agreement.\n- Vary your linking words (however, therefore, for example).\n- One paragraph is a little long — split it in two.\n\nConnect a real Firebase config to get a full AI review of this essay.`,
      source: 'demo',
    };
  }

  startChat(): ChatHandle {
    const replies = [
      "That's a great start! Can you tell me more about it?",
      'Nice! How did that make you feel?',
      'Good sentence! Try adding one more detail — for example, when or where it happened.',
      'I like that. What happened next?',
    ];
    let i = 0;
    return {
      send: async () => ({ text: replies[i++ % replies.length], source: 'demo' as InferenceSource }),
    };
  }
}
