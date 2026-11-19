import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, getAdminDb, isAdminSdkPermissionDenied, verifyBearerIdToken } from '@/lib/firebase-admin';
import { db } from '@/lib/firebase';
import { doc, setDoc, collection, addDoc } from 'firebase/firestore';
import { DEFAULT_PIN_ADMIN } from '@/lib/audit';

export const dynamic = 'force-dynamic';

/**
 * Executive Admin Field Authority Provisioning Endpoint (Phase 2)
 * Creates a Field Authority account with PIN 2FA and records governance audit log.
 */
export async function POST(req: NextRequest) {
  try {
    const serverTimestamp = new Date().toISOString();
    const body = await req.json();
    const {
      email,
      password,
      name,
      department,
      adminPin,
      adminUid,
      adminEmail,
    } = body as {
      email: string;
      password: string;
      name?: string;
      department: string;
      adminPin: string;
      adminUid?: string;
      adminEmail?: string;
    };

    if (!email || !password || password.length < 6 || !department) {
      return NextResponse.json(
        { success: false, error: 'Valid email, password (min 6 chars), and department are required.' },
        { status: 400 }
      );
    }

    if ((adminPin || '').trim() !== DEFAULT_PIN_ADMIN) {
      return NextResponse.json(
        { success: false, error: 'Invalid Executive Admin 2FA Security PIN.' },
        { status: 403 }
      );
    }

    const authCheck = await verifyBearerIdToken(req.headers.get('authorization'));
    const effectiveAdminUid = authCheck.decoded?.uid || adminUid || 'admin_user';
    const effectiveAdminEmail = authCheck.decoded?.email || adminEmail || 'admin@crowdcivic.org';
    const cleanEmail = email.trim().toLowerCase();

    let createdUid = 'auth_pending_' + cleanEmail.replace(/[^a-z0-9]/gi, '_');
    let authAccountCreated = false;
    let iamNotice: string | null = null;

    try {
      const userRec = await getAdminAuth().createUser({
        email: cleanEmail,
        password,
        displayName: name || 'Field Authority Official',
        emailVerified: true,
      });
      createdUid = userRec.uid;
      authAccountCreated = true;
    } catch (authErr: any) {
      if (isAdminSdkPermissionDenied(authErr) || String(authErr?.message || '').includes('PERMISSION_DENIED')) {
        iamNotice =
          'Authority role pre-approved in Firestore. Grant roles/firebaseauth.admin to the runtime service account in Google Cloud IAM to create Auth credentials server-side.';
      } else if (authErr?.code === 'auth/email-already-exists') {
        const existing = await getAdminAuth().getUserByEmail(cleanEmail).catch(() => null);
        if (existing) {
          createdUid = existing.uid;
          authAccountCreated = true;
        }
      } else {
        iamNotice = authErr?.message || 'Auth provisioning deferred.';
      }
    }

    const userDocData = {
      uid: createdUid,
      email: cleanEmail,
      name: name || 'Municipal Field Officer',
      role: 'authority',
      department,
      approvedBy: effectiveAdminEmail,
      authAccountCreated,
      createdAt: serverTimestamp,
      updatedAt: serverTimestamp,
    };

    const auditEntry = {
      timestamp: serverTimestamp,
      userId: effectiveAdminUid,
      actorId: effectiveAdminUid,
      email: effectiveAdminEmail,
      role: 'admin',
      actorRole: 'admin',
      action: 'AUTHORITY_ACCOUNT_PROVISIONED',
      portal: 'admin',
      status: 'SUCCESS',
      details: `Admin provisioned Field Authority account for ${cleanEmail} (${department}). AuthCreated: ${authAccountCreated}`,
    };

    try {
      const adminDb = getAdminDb();
      await Promise.all([
        adminDb.collection('users').doc(createdUid).set(userDocData, { merge: true }),
        adminDb.collection('auditLogs').add(auditEntry),
      ]);
    } catch {
      await setDoc(doc(db, 'users', createdUid), userDocData, { merge: true });
      await addDoc(collection(db, 'auditLogs'), auditEntry);
    }

    return NextResponse.json({
      success: true,
      uid: createdUid,
      email: cleanEmail,
      role: 'authority',
      department,
      authAccountCreated,
      iamNotice,
    });
  } catch (err: any) {
    console.error('Error in /api/admin/authority-accounts:', err);
    return NextResponse.json(
      { success: false, error: err?.message || 'Failed to provision Field Authority account.' },
      { status: 500 }
    );
  }
}
