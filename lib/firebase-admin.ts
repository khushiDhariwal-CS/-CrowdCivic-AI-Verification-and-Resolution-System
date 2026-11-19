import { initializeApp, getApps, getApp, cert, App } from 'firebase-admin/app';
import { getFirestore, Firestore } from 'firebase-admin/firestore';
import { getAuth, Auth, DecodedIdToken } from 'firebase-admin/auth';
import defaultConfig from '../firebase-applet-config.json';

let cachedAdminApp: App | null = null;

export function getAdminApp(): App {
  if (cachedAdminApp) return cachedAdminApp;
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || defaultConfig.projectId;

  if (getApps().length > 0) {
    cachedAdminApp = getApp();
    return cachedAdminApp;
  }

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (raw) {
    try {
      const json = raw.trim().startsWith('{')
        ? raw
        : Buffer.from(raw, 'base64').toString('utf8');
      const sa = JSON.parse(json);
      if (sa.private_key) sa.private_key = sa.private_key.replace(/\\n/g, '\n');
      cachedAdminApp = initializeApp({
        credential: cert(sa),
        projectId: sa.project_id || projectId,
      });
      return cachedAdminApp;
    } catch (e) {
      console.error('Invalid FIREBASE_SERVICE_ACCOUNT, falling back to default credentials', e);
    }
  }

  cachedAdminApp = initializeApp({ projectId });
  return cachedAdminApp;
}

export function getAdminDb(): Firestore {
  const app = getAdminApp();
  const databaseId = process.env.NEXT_PUBLIC_FIREBASE_DATABASE_ID || defaultConfig.firestoreDatabaseId;
  if (databaseId && databaseId !== '(default)') {
    return getFirestore(app, databaseId);
  }
  return getFirestore(app);
}

export function getAdminAuth(): Auth {
  return getAuth(getAdminApp());
}

/**
 * Verifies a Firebase ID Token passed in Authorization: Bearer <token>.
 * Does not require IAM permissions — works on all Google Cloud / Firebase projects.
 */
export async function verifyBearerIdToken(authHeader: string | null): Promise<{
  verified: boolean;
  decoded: DecodedIdToken | null;
  error?: string;
}> {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { verified: false, decoded: null, error: 'Missing Bearer authorization token.' };
  }
  const token = authHeader.slice('Bearer '.length).trim();
  if (!token) {
    return { verified: false, decoded: null, error: 'Empty authorization token.' };
  }
  try {
    const decoded = await getAdminAuth().verifyIdToken(token);
    return { verified: true, decoded };
  } catch (err: any) {
    return {
      verified: false,
      decoded: null,
      error: err?.message || 'Invalid or expired Firebase ID token.',
    };
  }
}

export function isAdminSdkPermissionDenied(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes('PERMISSION_DENIED') || msg.includes('Missing or insufficient permissions');
}
