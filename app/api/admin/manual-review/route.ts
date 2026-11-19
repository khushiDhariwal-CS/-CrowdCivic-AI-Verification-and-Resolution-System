import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb, verifyBearerIdToken } from '@/lib/firebase-admin';
import { db } from '@/lib/firebase';
import { doc, getDoc, updateDoc, collection, addDoc } from 'firebase/firestore';
import { DEFAULT_PIN_ADMIN } from '@/lib/audit';

export const dynamic = 'force-dynamic';

/**
 * Executive Admin Manual Verification Queue Decision API (Phase 7 & 11)
 * Reviews RVE-rejected submissions with Admin PIN 2FA enforcement.
 */
export async function POST(req: NextRequest) {
  try {
    const serverTimestamp = new Date().toISOString();
    const body = await req.json();
    const {
      queueItemId,
      complaintId,
      decision, // 'approve' | 'reject_rework'
      reviewNotes,
      adminPin,
      adminUid,
      adminEmail,
    } = body as {
      queueItemId: string;
      complaintId: string;
      decision: 'approve' | 'reject_rework';
      reviewNotes?: string;
      adminPin: string;
      adminUid?: string;
      adminEmail?: string;
    };

    if (!queueItemId || !complaintId || !['approve', 'reject_rework'].includes(decision)) {
      return NextResponse.json(
        { success: false, error: 'queueItemId, complaintId, and valid decision are required.' },
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
    const effectiveUid = authCheck.decoded?.uid || adminUid || 'admin_user';
    const effectiveEmail = authCheck.decoded?.email || adminEmail || 'admin@crowdcivic.org';

    let issueData: any = null;
    try {
      const snap = await getAdminDb().collection('issues').doc(complaintId).get();
      if (snap.exists) issueData = snap.data();
    } catch {
      const snap = await getDoc(doc(db, 'issues', complaintId));
      if (snap.exists()) issueData = snap.data();
    }

    const previousStatus = issueData?.status || 'Rejected';
    const ticketId = issueData?.ticketId || complaintId;
    const isApproved = decision === 'approve';
    const newStatus = isApproved ? 'Resolved' : 'In Progress';

    const queueUpdate = {
      reviewStatus: isApproved ? 'Approved by Admin' : 'Returned for Rework',
      reviewedBy: effectiveEmail,
      reviewedAt: serverTimestamp,
      reviewNotes: reviewNotes || '',
    };

    const issueUpdate: Record<string, any> = {
      status: newStatus,
      manualReviewQueue: false,
      isDisputed: !isApproved,
      manualReviewDecision: {
        decision,
        reviewedBy: effectiveEmail,
        reviewedAt: serverTimestamp,
        notes: reviewNotes || '',
      },
      updatedAt: serverTimestamp,
    };

    if (isApproved) {
      issueUpdate.resolvedAt = serverTimestamp;
      issueUpdate.resolvedBy = `Admin Override (${effectiveEmail})`;
    }

    const auditEntry = {
      timestamp: serverTimestamp,
      userId: effectiveUid,
      actorId: effectiveUid,
      email: effectiveEmail,
      role: 'admin',
      actorRole: 'admin',
      complaintId,
      ticketId,
      previousState: previousStatus,
      newState: newStatus,
      action: isApproved ? 'ADMIN_MANUAL_REVIEW_APPROVED' : 'ADMIN_MANUAL_REVIEW_REJECTED',
      portal: 'admin',
      status: isApproved ? 'SUCCESS' : 'WARNING',
      details: `Admin ${effectiveEmail} ${
        isApproved ? 'approved manual verification & closed' : 'rejected submission for rework on'
      } #${ticketId}. Notes: ${reviewNotes || 'N/A'}`,
    };

    const notifications: any[] = [
      {
        recipientUid: issueData?.assignedAuthorityUid || 'ALL_AUTHORITIES',
        recipientRole: 'authority',
        complaintId,
        ticketId,
        title: isApproved
          ? `Manual Review Approved: ${ticketId}`
          : `Rework Required: ${ticketId}`,
        message: isApproved
          ? `Admin approved your resolution submission for ${ticketId}.`
          : `Admin rejected your RVE submission for ${ticketId}: ${reviewNotes || 'Please capture a clearer 30s on-site verification video.'}`,
        type: 'MANUAL_REVIEW_DECISION',
        read: false,
        createdAt: serverTimestamp,
      },
    ];

    if (issueData?.userId) {
      notifications.push({
        recipientUid: issueData.userId,
        recipientRole: 'citizen',
        complaintId,
        ticketId,
        title: isApproved
          ? `Issue ${ticketId} Resolved After Admin Audit`
          : `Update on ${ticketId}: Sent Back for Rework`,
        message: isApproved
          ? `Executive Admin completed manual verification and closed "${issueData?.title}".`
          : `Executive Admin reviewed "${issueData?.title}" and requested additional field repair from the municipal team.`,
        type: 'MANUAL_REVIEW_DECISION',
        read: false,
        createdAt: serverTimestamp,
      });
    }

    try {
      const adminDb = getAdminDb();
      await Promise.all([
        adminDb.collection('manualVerificationQueue').doc(queueItemId).update(queueUpdate),
        adminDb.collection('issues').doc(complaintId).update(issueUpdate),
        adminDb.collection('auditLogs').add(auditEntry),
        ...notifications.map((n) => adminDb.collection('notifications').add(n)),
      ]);
    } catch {
      await updateDoc(doc(db, 'manualVerificationQueue', queueItemId), queueUpdate);
      await updateDoc(doc(db, 'issues', complaintId), issueUpdate);
      await addDoc(collection(db, 'auditLogs'), auditEntry);
      for (const n of notifications) {
        await addDoc(collection(db, 'notifications'), n);
      }
    }

    return NextResponse.json({
      success: true,
      complaintId,
      newStatus,
      reviewStatus: queueUpdate.reviewStatus,
    });
  } catch (err: any) {
    console.error('Error in /api/admin/manual-review:', err);
    return NextResponse.json(
      { success: false, error: err?.message || 'Failed processing manual verification review.' },
      { status: 500 }
    );
  }
}
