import { db } from './firebase';
import { collection, addDoc, getDocs, query, where, orderBy, limit } from 'firebase/firestore';

export interface AuditLogEntry {
  id?: string;
  timestamp: string;
  userId: string;
  actorId?: string;
  email: string;
  role: 'citizen' | 'authority' | 'admin' | 'guest' | 'rve';
  actorRole?: 'citizen' | 'authority' | 'admin' | 'guest' | 'rve';
  complaintId?: string;
  ticketId?: string;
  previousState?: string;
  newState?: string;
  action:
    | 'LOGIN_SUCCESS'
    | 'SIGNUP_SUCCESS'
    | 'LOGIN_FAILED'
    | 'LOGIN_CREDENTIAL_MISMATCH'
    | 'UNAUTHORIZED_PORTAL_ATTEMPT'
    | 'SECURITY_PIN_VERIFIED'
    | 'SECURITY_PIN_FAILED'
    | 'COMPLAINT_REGISTERED'
    | 'COMPLAINT_ASSIGNED'
    | 'ISSUE_STATUS_UPDATED'
    | 'RVE_VERIFIED'
    | 'RVE_REJECTED'
    | 'RVE_BYPASS_BLOCKED'
    | 'ADMIN_MANUAL_REVIEW_APPROVED'
    | 'ADMIN_MANUAL_REVIEW_REJECTED'
    | 'ROLE_PERMISSIONS_CHANGED'
    | 'AUTHORITY_ACCOUNT_PROVISIONED'
    | 'SESSION_LOCKED'
    | 'ADMIN_ISSUE_FLAGGED'
    | 'ADMIN_ISSUE_UNFLAGGED'
    | 'ADMIN_DELETE_ISSUE'
    | 'AUTHORITY_DELETE_RESOLVED_ISSUE';
  portal: 'auth' | 'citizen' | 'authority' | 'admin' | 'rve';
  status: 'SUCCESS' | 'DENIED' | 'WARNING';
  details: string;
  verificationDetails?: Record<string, any>;
  deviceInfo?: string;
}

const LOCAL_AUDIT_KEY = 'crowdcivic_security_audit_logs';

export const DEFAULT_PIN_AUTHORITY = '123456';
export const DEFAULT_PIN_ADMIN = '999999';

function getClientDeviceInfo(): string {
  if (typeof navigator === 'undefined') return 'Server API';
  const platform = navigator.platform || 'Web';
  const uaSnippet = navigator.userAgent ? navigator.userAgent.slice(0, 40) : '';
  return `${platform} (${uaSnippet}...)`;
}

export async function logSecurityEvent(entry: Omit<AuditLogEntry, 'timestamp'>): Promise<void> {
  const timestamp = new Date().toISOString();
  const fullEntry: AuditLogEntry = {
    ...entry,
    actorId: entry.actorId || entry.userId,
    actorRole: entry.actorRole || entry.role,
    timestamp,
    deviceInfo: getClientDeviceInfo(),
  };

  if (typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem(LOCAL_AUDIT_KEY);
      const logs: AuditLogEntry[] = raw ? JSON.parse(raw) : [];
      logs.unshift(fullEntry);
      localStorage.setItem(LOCAL_AUDIT_KEY, JSON.stringify(logs.slice(0, 100)));
    } catch {
      // Storage unavailable
    }
  }

  try {
    await addDoc(collection(db, 'auditLogs'), fullEntry);
  } catch (err) {
    console.warn('Firestore auditLog write warning:', err);
  }
}

export async function getSecurityAuditLogs(maxEntries = 50): Promise<AuditLogEntry[]> {
  const logsMap = new Map<string, AuditLogEntry>();

  if (typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem(LOCAL_AUDIT_KEY);
      if (raw) {
        const localLogs: AuditLogEntry[] = JSON.parse(raw);
        localLogs.forEach((log) => {
          const key = `${log.timestamp}_${log.email}_${log.action}`;
          logsMap.set(key, log);
        });
      }
    } catch {
      // Ignore storage error
    }
  }

  try {
    const q = query(
      collection(db, 'auditLogs'),
      where('timestamp', '>=', ''),
      orderBy('timestamp', 'desc'),
      limit(maxEntries)
    );
    const querySnap = await getDocs(q);
    querySnap.forEach((docSnap) => {
      const data = docSnap.data() as AuditLogEntry;
      const key = `${data.timestamp}_${data.email}_${data.action}`;
      logsMap.set(key, { ...data, id: docSnap.id });
    });
  } catch (err) {
    console.warn('Firestore auditLogs read warning:', err);
  }

  const combined = Array.from(logsMap.values());
  combined.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  return combined.slice(0, maxEntries);
}
