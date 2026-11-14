import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  Firestore,
  doc,
  getDoc,
  getDocFromCache,
  Unsubscribe,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const googleAuthProvider = new GoogleAuthProvider();

let firestoreInstance: Firestore | null = null;
try {
  firestoreInstance = initializeFirestore(
    app,
    {
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager(),
      }),
    },
    firebaseConfig.firestoreDatabaseId
  );
} catch {
  try {
    firestoreInstance = getFirestore(app, firebaseConfig.firestoreDatabaseId);
  } catch (err) {
    console.warn('Firestore client init fallback:', err);
  }
}
export const db = firestoreInstance;

const QUOTA_COOLDOWN_STORAGE_KEY = 'cbt_firestore_quota_cooldown_until';
const PULSE_CACHE_STORAGE_KEY = 'cbt_last_sync_pulse_v1';
const QUOTA_COOLDOWN_MS = 15 * 60 * 1000; // 15 minutes cooldown when Spark Plan daily quota is reached
let quotaCooldownUntilMemory = 0;

export function isQuotaExceededError(error: unknown): boolean {
  if (!error) return false;
  const code = (error as any)?.code || '';
  const msg = error instanceof Error ? error.message : String(error);
  return (
    code === 'resource-exhausted' ||
    msg.includes('resource-exhausted') ||
    msg.includes('Quota exceeded')
  );
}

export function markFirestoreQuotaExhausted(): void {
  quotaCooldownUntilMemory = Date.now() + QUOTA_COOLDOWN_MS;
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      window.sessionStorage.setItem(
        QUOTA_COOLDOWN_STORAGE_KEY,
        String(quotaCooldownUntilMemory)
      );
    }
  } catch {
    // Ignore storage error
  }
}

export function isFirestoreQuotaCooldownActive(): boolean {
  const now = Date.now();
  if (quotaCooldownUntilMemory > now) return true;
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      const stored = Number(
        window.sessionStorage.getItem(QUOTA_COOLDOWN_STORAGE_KEY) || '0'
      );
      if (stored > now) {
        quotaCooldownUntilMemory = stored;
        return true;
      }
    }
  } catch {
    // Ignore storage error
  }
  return false;
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
) {
  if (isQuotaExceededError(error)) {
    markFirestoreQuotaExhausted();
    return;
  }

  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export async function testFirestoreConnection(): Promise<boolean> {
  return Boolean(db);
}

export interface CbtSyncPulseData {
  lastSyncedAt: string;
  lastEvent: string;
  totalExams: number;
  totalStudents: number;
  totalQuestions: number;
  totalResults: number;
  authorUid: string;
}

export function saveCachedSyncPulseLocal(pulse: CbtSyncPulseData): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(PULSE_CACHE_STORAGE_KEY, JSON.stringify(pulse));
    }
  } catch {
    // Ignore storage error
  }
}

export function getCachedSyncPulseLocal(): CbtSyncPulseData | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    const raw = window.localStorage.getItem(PULSE_CACHE_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as CbtSyncPulseData;
  } catch {
    return null;
  }
}

async function fetchSyncPulseFromApiFallback(): Promise<CbtSyncPulseData | null> {
  try {
    const res = await fetch('/api/firebase/status');
    const contentType = res.headers.get('content-type') || '';
    if (res.ok && contentType.toLowerCase().includes('application/json')) {
      const data = await res.json();
      if (data?.pulse) {
        saveCachedSyncPulseLocal(data.pulse as CbtSyncPulseData);
        return data.pulse as CbtSyncPulseData;
      }
    }
  } catch {
    // Ignore network errors
  }
  return getCachedSyncPulseLocal();
}

export async function fetchCbtSyncPulseOnce(): Promise<CbtSyncPulseData | null> {
  if (!db) {
    return fetchSyncPulseFromApiFallback();
  }

  const pulseRef = doc(db, 'cbt_sync', 'live_state');

  if (isFirestoreQuotaCooldownActive()) {
    try {
      const cachedSnap = await getDocFromCache(pulseRef);
      if (cachedSnap.exists()) {
        return cachedSnap.data() as CbtSyncPulseData;
      }
    } catch {
      // Ignore cache miss
    }
    return fetchSyncPulseFromApiFallback();
  }

  try {
    const snap = await getDoc(pulseRef);
    if (snap.exists()) {
      const pulse = snap.data() as CbtSyncPulseData;
      saveCachedSyncPulseLocal(pulse);
      return pulse;
    }
  } catch (error) {
    if (isQuotaExceededError(error)) {
      markFirestoreQuotaExhausted();
    }
    try {
      const cachedSnap = await getDocFromCache(pulseRef);
      if (cachedSnap.exists()) {
        return cachedSnap.data() as CbtSyncPulseData;
      }
    } catch {
      // Ignore cache miss
    }
    return fetchSyncPulseFromApiFallback();
  }

  return getCachedSyncPulseLocal();
}

export function subscribeToCbtSyncPulse(
  onUpdate: (pulse: CbtSyncPulseData) => void
): Unsubscribe {
  fetchCbtSyncPulseOnce().then((pulse) => {
    if (pulse) onUpdate(pulse);
  });
  return () => {};
}
