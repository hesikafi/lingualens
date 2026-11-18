// Firebase web app config — REAL config, from the Firebase console.
// Project: lingualens (projectId lingualens-ee436), web app "lingualens-web".
// Registered 19:39 WIB 18 Nov 2026. Gemini Developer API (free, no billing).
// Note: the apiKey now comes from the VITE_FIREBASE_API_KEY env var
// in a local .env file (never committed). Do not hard-code the key here.
// The key is restricted by the console's API restrictions + App Check + security rules.

export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY ?? '',
  authDomain: 'lingualens-ee436.firebaseapp.com',
  projectId: 'lingualens-ee436',
  storageBucket: 'lingualens-ee436.firebasestorage.app',
  messagingSenderId: '1064743748042',
  appId: '1:1064743748042:web:612157ac366e82b8d10f33',
};

/** True when a real Firebase config has been pasted in (no PLACEHOLDER values left). */
export function isFirebaseConfigured(): boolean {
  return Object.values(firebaseConfig).every(
    (v) => typeof v === 'string' && v.length > 0 && !v.startsWith('PASTE_'),
  );
}

/**
 * App Check debug token (local dev only).
 * Firebase App Check is enforced for AI Logic. For local development we use
 * the debug provider; the token is registered in the Firebase console
 * (App Check > Apps > Manage debug tokens). Debug tokens are accepted in
 * hackathon submissions. Leave empty to let the SDK generate one and print
 * it to the console on first run — then copy it into the console.
 */
export const appCheckDebugToken: string | undefined = undefined;
