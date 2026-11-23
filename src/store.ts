// Drafts + progress store.
// Real path: Firestore (when Firebase is configured and the user is signed
// in anonymously). Fallback: localStorage (demo mode / offline). The rest of
// the app calls the same functions either way.
import {
  collection,
  addDoc,
  getDocs,
  deleteDoc,
  doc,
  query,
  orderBy,
  limit,
  serverTimestamp,
  setDoc,
  getDoc,
  type Firestore,
} from 'firebase/firestore';

export interface Draft {
  id: string;
  title: string;
  text: string;
  createdAt: number;
}

export interface Progress {
  corrections: number;
  rewrites: number;
  chats: number;
  essays: number;
  wordsWritten: number;
}

/** Where a draft/progress write currently lives (shown in the UI sync badge). */
export type SyncStatus = 'synced' | 'local' | 'syncing' | 'offline';

const LS_DRAFTS = 'lingualens.drafts.v1';
const LS_PROGRESS = 'lingualens.progress.v1';

function lsDrafts(): Draft[] {
  try {
    return JSON.parse(localStorage.getItem(LS_DRAFTS) || '[]') as Draft[];
  } catch {
    return [];
  }
}

function lsProgress(): Progress {
  try {
    return (
      (JSON.parse(localStorage.getItem(LS_PROGRESS) || 'null') as Progress | null) ?? {
        corrections: 0,
        rewrites: 0,
        chats: 0,
        essays: 0,
        wordsWritten: 0,
      }
    );
  } catch {
    return { corrections: 0, rewrites: 0, chats: 0, essays: 0, wordsWritten: 0 };
  }
}

/** Race a promise against a timeout so a dead network can never hang sync. */
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<T>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`[LinguaLens] ${label} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer));
}

export class Store {
  /** Set by the UI to show sync status (Tersimpan lokal → Tersinkron). */
  onSyncStatus: ((s: SyncStatus) => void) | null = null;

  constructor(
    private db: Firestore | null,
    private uid: string | null,
  ) {}

  private get useFirestore(): boolean {
    return !!this.db && !!this.uid;
  }

  private emitStatus(s: SyncStatus) {
    this.onSyncStatus?.(s);
  }

  /**
   * Upload drafts that were saved to localStorage while offline (id `d-…`)
   * to Firestore and reconcile progress (max per field), so nothing edited
   * offline stays stranded on the device. No-op when Firestore is not in
   * use or the browser is offline. Safe to call repeatedly and on every
   * 'online' event; already-synced drafts are never re-uploaded. Every
   * network step is time-boxed, so a dead connection can never hang sync.
   */
  async syncPending(): Promise<void> {
    if (!this.useFirestore || !this.db || !this.uid) return;
    if (!navigator.onLine) {
      this.emitStatus('offline');
      return;
    }
    const pending = lsDrafts().filter((d) => d.id.startsWith('d-'));
    const localProgress = lsProgress();
    if (pending.length === 0) {
      const ok = await this.reconcileProgress(localProgress);
      this.emitStatus(ok ? 'synced' : 'local');
      return;
    }
    this.emitStatus('syncing');
    try {
      const { done, failed } = await withTimeout(this.uploadPending(pending), 15000, 'draft sync');
      if (done.length > 0) {
        const ids = new Set(done);
        localStorage.setItem(LS_DRAFTS, JSON.stringify(lsDrafts().filter((d) => !ids.has(d.id))));
      }
      if (failed) {
        this.emitStatus('local');
        return;
      }
      await this.reconcileProgress(localProgress);
      this.emitStatus('synced');
    } catch (e) {
      console.warn('[LinguaLens] Draft sync failed, keeping local copies:', e);
      this.emitStatus('local');
    }
  }

  /** Upload local-only drafts one by one; returns the ids that landed. */
  private async uploadPending(pending: Draft[]): Promise<{ done: string[]; failed: boolean }> {
    if (!this.db || !this.uid) return { done: [], failed: false };
    const done: string[] = [];
    for (const d of pending) {
      try {
        await addDoc(collection(this.db, 'users', this.uid, 'drafts'), {
          title: d.title,
          text: d.text,
          createdAt: serverTimestamp(),
        });
        done.push(d.id);
      } catch {
        return { done, failed: true };
      }
    }
    return { done, failed: false };
  }

  /** Merge local progress into Firestore (max per field) and mirror back.
   * Returns false when the remote read/write could not complete. */
  private async reconcileProgress(local: Progress): Promise<boolean> {
    if (!this.db || !this.uid) return false;
    try {
      const snap = await withTimeout(
        getDoc(doc(this.db, 'users', this.uid, 'progress', 'summary')),
        8000,
        'progress read',
      );
      const remote = (snap.exists() ? (snap.data() as Progress) : null) ?? {
        corrections: 0,
        rewrites: 0,
        chats: 0,
        essays: 0,
        wordsWritten: 0,
      };
      const merged: Progress = {
        corrections: Math.max(local.corrections, remote.corrections ?? 0),
        rewrites: Math.max(local.rewrites, remote.rewrites ?? 0),
        chats: Math.max(local.chats, remote.chats ?? 0),
        essays: Math.max(local.essays, remote.essays ?? 0),
        wordsWritten: Math.max(local.wordsWritten, remote.wordsWritten ?? 0),
      };
      await setDoc(doc(this.db, 'users', this.uid, 'progress', 'summary'), merged, { merge: true });
      localStorage.setItem(LS_PROGRESS, JSON.stringify(merged));
      return true;
    } catch (e) {
      console.warn('[LinguaLens] Progress reconcile failed:', e);
      return false;
    }
  }

  async saveDraft(title: string, text: string): Promise<Draft> {
    const draft: Draft = {
      id: `d-${Date.now()}`,
      title: title || text.slice(0, 40) || 'Untitled',
      text,
      createdAt: Date.now(),
    };
    if (this.useFirestore && this.db && this.uid) {
      try {
        const ref = await addDoc(collection(this.db, 'users', this.uid, 'drafts'), {
          title: draft.title,
          text: draft.text,
          createdAt: serverTimestamp(),
        });
        draft.id = ref.id;
        this.emitStatus('synced');
        return draft;
      } catch (e) {
        console.warn('[LinguaLens] Firestore save failed, using localStorage:', e);
      }
    }
    const all = lsDrafts();
    all.unshift(draft);
    localStorage.setItem(LS_DRAFTS, JSON.stringify(all.slice(0, 50)));
    this.emitStatus(navigator.onLine ? 'local' : 'offline');
    return draft;
  }

  async listDrafts(): Promise<Draft[]> {
    if (this.useFirestore && this.db && this.uid) {
      try {
        const q = query(
          collection(this.db, 'users', this.uid, 'drafts'),
          orderBy('createdAt', 'desc'),
          limit(50),
        );
        const snap = await getDocs(q);
        return snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            title: (data.title as string) || 'Untitled',
            text: (data.text as string) || '',
            createdAt: typeof data.createdAt?.toMillis === 'function' ? data.createdAt.toMillis() : Date.now(),
          } as Draft;
        });
      } catch (e) {
        console.warn('[LinguaLens] Firestore read failed, using localStorage:', e);
      }
    }
    return lsDrafts();
  }

  async deleteDraft(id: string): Promise<void> {
    if (this.useFirestore && this.db && this.uid) {
      try {
        await deleteDoc(doc(this.db, 'users', this.uid, 'drafts', id));
      } catch (e) {
        console.warn('[LinguaLens] Firestore delete failed:', e);
      }
    }
    localStorage.setItem(LS_DRAFTS, JSON.stringify(lsDrafts().filter((d) => d.id !== id)));
  }

  async getProgress(): Promise<Progress> {
    if (this.useFirestore && this.db && this.uid) {
      try {
        const snap = await getDoc(doc(this.db, 'users', this.uid, 'progress', 'summary'));
        if (snap.exists()) return snap.data() as Progress;
      } catch (e) {
        console.warn('[LinguaLens] Firestore progress read failed:', e);
      }
    }
    return lsProgress();
  }

  async bumpProgress(patch: Partial<Progress>): Promise<Progress> {
    const cur = await this.getProgress();
    const next: Progress = {
      corrections: cur.corrections + (patch.corrections ?? 0),
      rewrites: cur.rewrites + (patch.rewrites ?? 0),
      chats: cur.chats + (patch.chats ?? 0),
      essays: cur.essays + (patch.essays ?? 0),
      wordsWritten: cur.wordsWritten + (patch.wordsWritten ?? 0),
    };
    if (this.useFirestore && this.db && this.uid) {
      try {
        await setDoc(doc(this.db, 'users', this.uid, 'progress', 'summary'), next, { merge: true });
      } catch (e) {
        console.warn('[LinguaLens] Firestore progress write failed:', e);
      }
    }
    localStorage.setItem(LS_PROGRESS, JSON.stringify(next));
    return next;
  }
}
