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

export class Store {
  constructor(
    private db: Firestore | null,
    private uid: string | null,
  ) {}

  private get useFirestore(): boolean {
    return !!this.db && !!this.uid;
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
        return draft;
      } catch (e) {
        console.warn('[LinguaLens] Firestore save failed, using localStorage:', e);
      }
    }
    const all = lsDrafts();
    all.unshift(draft);
    localStorage.setItem(LS_DRAFTS, JSON.stringify(all.slice(0, 50)));
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
