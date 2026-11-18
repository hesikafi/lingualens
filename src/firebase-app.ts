// Firebase initialisation: app, App Check (debug provider for local dev),
// anonymous Auth, and Firestore. Everything is guarded so the app runs in
// DEMO MODE (localStorage only, no network) when no real Firebase config has
// been pasted into firebase-config.ts yet.
import { initializeApp, type FirebaseApp } from 'firebase/app';
import { initializeAppCheck, ReCaptchaEnterpriseProvider, CustomProvider } from 'firebase/app-check';
import { getAuth, signInAnonymously, type Auth, type User } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { firebaseConfig, isFirebaseConfigured, appCheckDebugToken } from './firebase-config';

export interface FirebaseServices {
  app: FirebaseApp | null;
  auth: Auth | null;
  db: Firestore | null;
  user: User | null;
  configured: boolean;
  appCheckReady: boolean;
}

let services: FirebaseServices | null = null;

/** Initialise Firebase (or return demo-mode services when not configured). */
export async function initFirebase(): Promise<FirebaseServices> {
  if (services) return services;
  const configured = isFirebaseConfigured();
  if (!configured) {
    services = { app: null, auth: null, db: null, user: null, configured: false, appCheckReady: false };
    return services;
  }

  const app = initializeApp(firebaseConfig);

  // App Check: debug provider for local dev / hackathon submission.
  // In production (hosted, public URL) swap to ReCaptchaEnterpriseProvider
  // with the site key from the Firebase console.
  let appCheckReady = false;
  try {
    if (typeof window !== 'undefined') {
      // @ts-expect-error debug token flag is read by the Firebase SDK
      window.FIREBASE_APPCHECK_DEBUG_TOKEN = appCheckDebugToken ?? true;
    }
    initializeAppCheck(app, {
      provider: new CustomProvider({
        getToken: async () => ({ token: 'debug-token', expireTimeMillis: Date.now() + 3600_000 }),
      }),
      isTokenAutoRefreshEnabled: true,
    });
    appCheckReady = true;
  } catch (e) {
    console.warn('[LinguaLens] App Check init failed (continuing):', e);
  }
  void ReCaptchaEnterpriseProvider;

  const auth = getAuth(app);
  const db = getFirestore(app);
  let user: User | null = null;
  try {
    const cred = await signInAnonymously(auth);
    user = cred.user;
  } catch (e) {
    console.warn('[LinguaLens] Anonymous sign-in failed (continuing without auth):', e);
  }

  services = { app, auth, db, user, configured: true, appCheckReady };
  return services;
}
