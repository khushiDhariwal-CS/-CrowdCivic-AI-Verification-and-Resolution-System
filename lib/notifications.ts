import { collection, addDoc, getDocs, query, where, updateDoc, doc } from 'firebase/firestore';
import { getMessaging, getToken, isSupported } from 'firebase/messaging';
import { app, db } from './firebase';
import { NotificationRecord, UserRole } from './types/civic';

/**
 * Notification Layer (Phase 10)
 * Writes persistent Firestore notifications for Citizen & Authority lifecycle events
 * and optionally registers Firebase Cloud Messaging (FCM) Web Push tokens when configured.
 */

export async function createNotification(
  payload: Omit<NotificationRecord, 'id' | 'read' | 'createdAt'>
): Promise<void> {
  try {
    await addDoc(collection(db, 'notifications'), {
      ...payload,
      read: false,
      createdAt: new Date().toISOString(),
    });
  } catch (err) {
    console.warn('Notification creation notice:', err);
  }
}

export async function fetchUserNotifications(uid: string): Promise<NotificationRecord[]> {
  try {
    const q = query(collection(db, 'notifications'), where('recipientUid', '==', uid));
    const snap = await getDocs(q);
    const list: NotificationRecord[] = snap.docs.map((d) => ({
      id: d.id,
      ...(d.data() as Omit<NotificationRecord, 'id'>),
    }));
    list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return list.slice(0, 30);
  } catch (err) {
    console.warn('Notification fetch notice:', err);
    return [];
  }
}

export async function fetchRoleNotifications(role: UserRole, uid?: string): Promise<NotificationRecord[]> {
  try {
    const results = new Map<string, NotificationRecord>();
    if (uid) {
      const userSnap = await getDocs(query(collection(db, 'notifications'), where('recipientUid', '==', uid)));
      userSnap.docs.forEach((d) => {
        results.set(d.id, { id: d.id, ...(d.data() as Omit<NotificationRecord, 'id'>) });
      });
    }
    const roleSnap = await getDocs(query(collection(db, 'notifications'), where('recipientRole', '==', role)));
    roleSnap.docs.forEach((d) => {
      if (!results.has(d.id)) {
        const data = d.data() as Omit<NotificationRecord, 'id'>;
        if (!data.recipientUid || data.recipientUid === 'ALL_AUTHORITIES' || data.recipientUid === uid) {
          results.set(d.id, { id: d.id, ...data });
        }
      }
    });
    const list = Array.from(results.values());
    list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return list.slice(0, 30);
  } catch (err) {
    console.warn('Role notification fetch notice:', err);
    return [];
  }
}

export async function markNotificationRead(notificationId: string): Promise<void> {
  try {
    await updateDoc(doc(db, 'notifications', notificationId), { read: true });
  } catch {
    // non-fatal
  }
}

export async function registerFcmPushToken(uid: string): Promise<{
  ok: boolean;
  token?: string;
  reason?: string;
}> {
  if (typeof window === 'undefined') {
    return { ok: false, reason: 'Client browser required for FCM registration.' };
  }
  const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;
  if (!vapidKey) {
    return {
      ok: false,
      reason: 'NEXT_PUBLIC_FIREBASE_VAPID_KEY is not configured; using real-time in-app Firestore notifications.',
    };
  }
  try {
    const supported = await isSupported();
    if (!supported) {
      return { ok: false, reason: 'Firebase Cloud Messaging is not supported in this browser.' };
    }
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      return { ok: false, reason: 'Browser notification permission denied.' };
    }
    const swReg = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
    const messaging = getMessaging(app);
    const token = await getToken(messaging, {
      vapidKey,
      serviceWorkerRegistration: swReg,
    });
    if (token) {
      await updateDoc(doc(db, 'users', uid), {
        fcmToken: token,
        fcmUpdatedAt: new Date().toISOString(),
      }).catch(() => {});
      return { ok: true, token };
    }
    return { ok: false, reason: 'No FCM registration token generated.' };
  } catch (err: any) {
    return { ok: false, reason: err?.message || 'FCM registration error.' };
  }
}
