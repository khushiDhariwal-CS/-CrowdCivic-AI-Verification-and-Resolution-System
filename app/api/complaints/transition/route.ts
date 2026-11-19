import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb, verifyBearerIdToken } from '@/lib/firebase-admin';
import { db } from '@/lib/firebase';
import { doc, getDoc, updateDoc, collection, addDoc } from 'firebase/firestore';
import { validateStatusTransition } from '@/lib/lifecycle';
import { ComplaintStatus, UserRole } from '@/lib/types/civic';

export const dynamic = 'force-dynamic';

/**
 * Backend Lifecycle Transition & Assignment API (Phase 5 & 10)
 * Enforces state machine validation and blocks RVE bypasses.
 */
export async function POST(req: NextRequest) {
  try {
    const serverTimestamp = new Date().toISOString();
    const body = await req.json();
    const {
      complaintId,
      targetStatus,
      actorUid,
      actorEmail,
      actorRole,
      assignedAuthorityUid,
      assignedAuthorityEmail,
      department,
      notes,
    } = body as {
      complaintId: string;
      targetStatus: ComplaintStatus;
      actorUid?: string;
      actorEmail?: string;
      actorRole?: UserRole;
      assignedAuthorityUid?: string;
      assignedAuthorityEmail?: string;
      department?: string;
      notes?: string;
    };

    if (!complaintId || !targetStatus) {
      return NextResponse.json(
        { success: false, error: 'complaintId and targetStatus are required.' },
        { status: 400 }
      );
    }

    const authCheck = await verifyBearerIdToken(req.headers.get('authorization'));
    const effectiveUid = authCheck.decoded?.uid || actorUid || 'system_actor';
    const effectiveEmail = authCheck.decoded?.email || actorEmail || 'official@crowdcivic.org';

    // Load existing complaint and actor role from Firestore (authoritative source)
    let issueData: any = null;
    let verifiedRole: UserRole = actorRole || 'citizen';

    try {
      const adminDb = getAdminDb();
      const [issueSnap, userSnap] = await Promise.all([
        adminDb.collection('issues').doc(complaintId).get(),
        effectiveUid ? adminDb.collection('users').doc(effectiveUid).get() : Promise.resolve(null),
      ]);
      if (issueSnap.exists) issueData = issueSnap.data();
      if (userSnap && userSnap.exists) {
        const r = userSnap.data()?.role;
        if (r === 'citizen' || r === 'authority' || r === 'admin') verifiedRole = r;
      }
    } catch {
      try {
        const issueSnap = await getDoc(doc(db, 'issues', complaintId));
        if (issueSnap.exists()) issueData = issueSnap.data();
        if (effectiveUid) {
          const userSnap = await getDoc(doc(db, 'users', effectiveUid));
          if (userSnap.exists()) {
            const r = userSnap.data()?.role;
            if (r === 'citizen' || r === 'authority' || r === 'admin') verifiedRole = r;
          }
        }
      } catch {
        // fallback if offline
      }
    }

    if (!issueData) {
      return NextResponse.json(
        { success: false, error: `Complaint '${complaintId}' not found.` },
        { status: 404 }
      );
    }

    const currentStatus = (issueData.status || 'Submitted') as ComplaintStatus;
    const validation = validateStatusTransition({
      actorRole: verifiedRole,
      currentStatus,
      targetStatus,
      viaRve: false,
    });

    if (!validation.allowed) {
      const auditBlocked = {
        timestamp: serverTimestamp,
        userId: effectiveUid,
        actorId: effectiveUid,
        email: effectiveEmail,
        role: verifiedRole,
        actorRole: verifiedRole,
        complaintId,
        ticketId: issueData.ticketId || complaintId,
        previousState: currentStatus,
        newState: targetStatus,
        action:
          targetStatus === 'Resolved' || targetStatus === 'Closed'
            ? 'RVE_BYPASS_BLOCKED'
            : 'UNAUTHORIZED_PORTAL_ATTEMPT',
        portal: 'authority',
        status: 'DENIED',
        details: validation.reason || 'Blocked invalid status transition.',
      };
      try {
        await getAdminDb().collection('auditLogs').add(auditBlocked);
      } catch {
        await addDoc(collection(db, 'auditLogs'), auditBlocked).catch(() => {});
      }

      return NextResponse.json(
        { success: false, error: validation.reason },
        { status: 403 }
      );
    }

    const historyEntry = {
      previousStatus: currentStatus,
      newStatus: targetStatus,
      actorUid: effectiveUid,
      actorEmail: effectiveEmail,
      actorRole: verifiedRole,
      notes: notes || '',
      timestamp: serverTimestamp,
    };

    const existingHistory = Array.isArray(issueData.statusHistory) ? issueData.statusHistory : [];
    const issueUpdate: Record<string, any> = {
      status: targetStatus,
      updatedAt: serverTimestamp,
      statusHistory: [...existingHistory, historyEntry],
    };

    if (targetStatus === 'Assigned' && (assignedAuthorityUid || assignedAuthorityEmail)) {
      issueUpdate.assignedAuthorityUid = assignedAuthorityUid || effectiveUid;
      issueUpdate.assignedAuthorityEmail = assignedAuthorityEmail || effectiveEmail;
      issueUpdate.assignedAt = serverTimestamp;
    }
    if (targetStatus === 'Acknowledged') {
      issueUpdate.acknowledgedBy = effectiveEmail;
      issueUpdate.acknowledgedAt = serverTimestamp;
      if (!issueData.assignedAuthorityUid) {
        issueUpdate.assignedAuthorityUid = effectiveUid;
        issueUpdate.assignedAuthorityEmail = effectiveEmail;
      }
    }
    if (department) {
      issueUpdate.department = department;
    }

    const assignmentRecord =
      targetStatus === 'Assigned' || targetStatus === 'Acknowledged' || targetStatus === 'In Progress'
        ? {
            complaintId,
            ticketId: issueData.ticketId || complaintId,
            department: department || issueData.department || 'Municipal Dept',
            authorityUid: assignedAuthorityUid || issueData.assignedAuthorityUid || effectiveUid,
            authorityEmail: assignedAuthorityEmail || issueData.assignedAuthorityEmail || effectiveEmail,
            status: targetStatus,
            notes: notes || '',
            updatedAt: serverTimestamp,
          }
        : null;

    const notifications: any[] = [];
    if (issueData.userId) {
      const notifType = targetStatus === 'In Progress' ? 'WORK_STARTED' : 'COMPLAINT_ASSIGNED';
      notifications.push({
        recipientUid: issueData.userId,
        recipientRole: 'citizen',
        complaintId,
        ticketId: issueData.ticketId || complaintId,
        title: `Update on ${issueData.ticketId || complaintId}: ${targetStatus}`,
        message:
          targetStatus === 'In Progress'
            ? `Field repair work has started on "${issueData.title}".`
            : `Your complaint "${issueData.title}" is now ${targetStatus} (${issueUpdate.department || issueData.department}).`,
        type: notifType,
        read: false,
        createdAt: serverTimestamp,
      });
    }

    if (targetStatus === 'Assigned' && (assignedAuthorityUid || assignedAuthorityEmail)) {
      notifications.push({
        recipientUid: assignedAuthorityUid || 'ALL_AUTHORITIES',
        recipientRole: 'authority',
        complaintId,
        ticketId: issueData.ticketId || complaintId,
        title: `New Complaint Assigned: ${issueData.ticketId || complaintId}`,
        message: `"${issueData.title}" (${issueData.severity}) has been assigned to ${assignedAuthorityEmail || department}.`,
        type: 'COMPLAINT_ASSIGNED',
        read: false,
        createdAt: serverTimestamp,
      });
    }

    const auditEntry = {
      timestamp: serverTimestamp,
      userId: effectiveUid,
      actorId: effectiveUid,
      email: effectiveEmail,
      role: verifiedRole,
      actorRole: verifiedRole,
      complaintId,
      ticketId: issueData.ticketId || complaintId,
      previousState: currentStatus,
      newState: targetStatus,
      action: targetStatus === 'Assigned' ? 'COMPLAINT_ASSIGNED' : 'ISSUE_STATUS_UPDATED',
      portal: verifiedRole === 'admin' ? 'admin' : 'authority',
      status: 'SUCCESS',
      details: `Ticket #${issueData.ticketId || complaintId} transitioned from '${currentStatus}' to '${targetStatus}' by ${effectiveEmail}.`,
    };

    try {
      const adminDb = getAdminDb();
      await Promise.all([
        adminDb.collection('issues').doc(complaintId).update(issueUpdate),
        adminDb.collection('auditLogs').add(auditEntry),
        ...(assignmentRecord ? [adminDb.collection('assignments').add(assignmentRecord)] : []),
        ...notifications.map((n) => adminDb.collection('notifications').add(n)),
      ]);
    } catch {
      await updateDoc(doc(db, 'issues', complaintId), issueUpdate);
      await addDoc(collection(db, 'auditLogs'), auditEntry);
      if (assignmentRecord) {
        await addDoc(collection(db, 'assignments'), assignmentRecord);
      }
      for (const n of notifications) {
        await addDoc(collection(db, 'notifications'), n);
      }
    }

    return NextResponse.json({
      success: true,
      complaintId,
      previousStatus: currentStatus,
      newStatus: targetStatus,
    });
  } catch (err: any) {
    console.error('Error in /api/complaints/transition:', err);
    return NextResponse.json(
      { success: false, error: err?.message || 'Failed to update complaint status.' },
      { status: 500 }
    );
  }
}
