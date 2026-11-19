'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ALL_ISSUE_STATUSES,
  ALL_MANUAL_QUEUE_STATUSES,
  auth,
  buildFirestoreErrorInfo,
  db,
  OperationType,
} from '@/lib/firebase';
import { signOut, onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { collection, getDocs, doc, updateDoc, setDoc, getDoc, deleteDoc, query, where } from 'firebase/firestore';
import {
  getSecurityAuditLogs,
  logSecurityEvent,
  AuditLogEntry,
  DEFAULT_PIN_ADMIN,
} from '@/lib/audit';
import { LanguageSelector, useLanguage } from '@/lib/LanguageContext';
import { PinBoxInput } from '@/components/PinBoxInput';
import { StatusDot } from '@/components/StatusIndicator';
import { motion } from 'motion/react';
import {
  LogOut,
  Shield,
  Users,
  Activity,
  Settings,
  ShieldCheck,
  KeyRound,
  Search,
  RefreshCw,
  X,
  Flag,
  ThumbsUp,
  ThumbsDown,
  MessageSquare,
  Trash2,
  Menu,
  AlertTriangle,
  Building2,
  MapPin,
  CheckCircle2,
  UserPlus,
  Eye,
  ShieldAlert,
} from 'lucide-react';
import { RVEResult } from '@/lib/types/civic';

interface UserRecord {
  uid: string;
  email: string;
  role: 'citizen' | 'authority' | 'admin';
  updatedAt?: string;
}

interface AdminIssueReport {
  id: string;
  ticketId: string;
  title?: string;
  category: string;
  severity?: string;
  department?: string;
  description: string;
  status: string;
  createdAt?: any;
  location?: {
    latitude: number | null;
    longitude: number | null;
    address: string;
    city?: string;
    area?: string;
  };
  voteStats?: {
    yes: number;
    no: number;
  };
  communityVotes?: Array<{
    userId: string;
    userEmail: string;
    vote: 'yes' | 'no';
    comment: string;
    createdAt: string;
    distanceKm?: number;
  }>;
  isDisputed?: boolean;
  supportersCount?: number;
  duplicateCount?: number;
  isDuplicate?: boolean;
  parentId?: string | null;
  adminFlagged?: boolean;
  adminFlagReason?: string;
  resolutionProofUrl?: string;
  resolutionAiAudit?: any;
}

interface ManualQueueItem {
  id: string;
  complaintId: string;
  ticketId: string;
  title?: string;
  category?: string;
  department?: string;
  authorityUid?: string;
  authorityEmail?: string;
  failureGate?: string;
  rejectionReason?: string;
  potentiallyTamperedEvidence?: boolean;
  rveResult?: RVEResult;
  videoStorageUrl?: string;
  originalImageUrl?: string;
  sampleKeyframes?: string[];
  reviewStatus: 'Pending Review' | 'Approved by Admin' | 'Returned for Rework';
  reviewedBy?: string;
  reviewedAt?: string;
  reviewNotes?: string;
  createdAt: string;
}

const PAGE_SIZE = 7;

export default function AdminDashboard() {
  const router = useRouter();
  const { t } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(null);

  // Mobile governance drawer
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  // Tab State: 'audit' | 'users' | 'config' | 'issues' | 'manualQueue' | 'heatmap'
  const [activeTab, setActiveTab] = useState<
    'audit' | 'users' | 'config' | 'issues' | 'manualQueue' | 'heatmap'
  >('audit');

  // Inline feedback banner (replaces alert())
  const [actionBanner, setActionBanner] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Security Audit Logs State
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [logFilter, setLogFilter] = useState<'ALL' | 'DENIED' | 'PIN' | 'LOGIN'>('ALL');
  const [searchLogQuery, setSearchLogQuery] = useState('');
  const [auditPage, setAuditPage] = useState(1);
  const [selectedAuditLog, setSelectedAuditLog] = useState<AuditLogEntry | null>(null);

  // Registered Users State
  const [usersList, setUsersList] = useState<UserRecord[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [searchUserQuery, setSearchUserQuery] = useState('');
  const [usersPage, setUsersPage] = useState(1);

  // Community Issues & Verification State
  const [issuesList, setIssuesList] = useState<AdminIssueReport[]>([]);
  const [loadingIssues, setLoadingIssues] = useState(false);
  const [adminDeleteModal, setAdminDeleteModal] = useState<{ issueId: string; ticketId: string } | null>(null);
  const [deletingIssue, setDeletingIssue] = useState(false);
  const [searchIssueQuery, setSearchIssueQuery] = useState('');
  const [issueFilter, setIssueFilter] = useState<'ALL' | 'DISPUTED' | 'FLAGGED' | 'RESOLVED'>('ALL');
  const [issuesPage, setIssuesPage] = useState(1);
  const [selectedIssueComments, setSelectedIssueComments] = useState<AdminIssueReport | null>(null);

  // Manual Verification Queue State
  const [manualQueue, setManualQueue] = useState<ManualQueueItem[]>([]);
  const [loadingManualQueue, setLoadingManualQueue] = useState(false);
  const [reviewingQueueItem, setReviewingQueueItem] = useState<ManualQueueItem | null>(null);
  const [reviewDecision, setReviewDecision] = useState<'approve' | 'reject_rework'>('reject_rework');
  const [reviewNotes, setReviewNotes] = useState('');
  const [reviewPin, setReviewPin] = useState('');
  const [reviewError, setReviewError] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);

  // Geospatial Heatmap Selection
  const [selectedHeatmapIssue, setSelectedHeatmapIssue] = useState<AdminIssueReport | null>(null);

  // Provision Field Authority Modal State
  const [showProvisionModal, setShowProvisionModal] = useState(false);
  const [provName, setProvName] = useState('');
  const [provEmail, setProvEmail] = useState('');
  const [provPassword, setProvPassword] = useState('');
  const [provDepartment, setProvDepartment] = useState('Roads & Highways Dept');
  const [provPin, setProvPin] = useState('');
  const [provError, setProvError] = useState('');
  const [provisioningAuth, setProvisioningAuth] = useState(false);

  // Admin 2FA PIN Modal State
  const [showAdminPinModal, setShowAdminPinModal] = useState(false);
  const [adminPinInput, setAdminPinInput] = useState('');
  const [adminPinError, setAdminPinError] = useState('');
  const [pendingUserUpdate, setPendingUserUpdate] = useState<{
    targetUid: string;
    targetEmail: string;
    newRole: 'citizen' | 'authority' | 'admin';
  } | null>(null);

  // Role verification guard
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (activeUser) => {
      if (!activeUser) {
        if (typeof window !== 'undefined') {
          localStorage.removeItem('user_role');
          localStorage.removeItem('user_email');
          localStorage.removeItem('user_uid');
        }
        router.push('/');
        return;
      }

      const effUser = activeUser;
      setCurrentUser(effUser);

      try {
        let userRole: string | null = null;
        if (effUser.uid) {
          try {
            const userDoc = await getDoc(doc(db, 'users', effUser.uid));
            if (userDoc.exists()) {
              userRole = userDoc.data().role;
            }
          } catch (docErr) {
            console.warn('Notice: Firestore user document fetch offline, fallback to local session:', docErr);
          }
        }
        if (!userRole && effUser.email) {
          try {
            const q = query(collection(db, 'users'), where('email', '==', effUser.email.toLowerCase()));
            const snap = await getDocs(q);
            if (!snap.empty) {
              userRole = snap.docs[0].data().role;
            }
          } catch (queryErr) {
            console.warn('Notice: Firestore user query offline:', queryErr);
          }
        }

        if (!userRole) {
          const cachedUid = typeof window !== 'undefined' ? localStorage.getItem('user_uid') : null;
          const cachedRole =
            typeof window !== 'undefined' && cachedUid === effUser.uid
              ? localStorage.getItem('user_role')
              : null;
          userRole = cachedRole || 'citizen';
          try {
            const nowIso = new Date().toISOString();
            await setDoc(
              doc(db, 'users', effUser.uid),
              {
                uid: effUser.uid,
                email: (effUser.email || 'user@example.com').toLowerCase(),
                name: (effUser.displayName || (effUser.email || 'user').split('@')[0]).slice(0, 120),
                role: userRole,
                createdAt: nowIso,
                updatedAt: nowIso,
              },
              { merge: true }
            );
          } catch (setErr) {
            console.warn('Notice: Firestore profile setDoc offline:', setErr);
          }
        }

        if (userRole !== 'admin') {
          router.push(userRole === 'authority' ? '/authority' : '/citizen');
          return;
        }
      } catch (err) {
        console.warn('Admin role verification error:', err);
      }

      setLoading(false);
      fetchAuditLogs();
      fetchUsers();
      fetchIssues();
      fetchManualQueue();
    });

    return () => unsubscribe();
  }, [router]);

  // Fetch Community Issues & Verification Votes (filtered by status for Firestore rule compliance)
  const fetchIssues = async () => {
    setLoadingIssues(true);
    try {
      const q = query(collection(db, 'issues'), where('status', 'in', [...ALL_ISSUE_STATUSES]));
      const snap = await getDocs(q);
      const fetched: AdminIssueReport[] = [];
      snap.forEach((docSnap) => {
        const data = docSnap.data();
        fetched.push({
          id: docSnap.id,
          ticketId: data.ticketId || docSnap.id,
          title: data.title || data.category || 'Civic Complaint',
          category: data.category || 'General',
          severity: data.severity || 'Medium',
          department: data.department || 'Municipal Dept',
          description: data.description || '',
          status: data.status || 'Submitted',
          createdAt: data.createdAt,
          location: data.location,
          voteStats: data.voteStats,
          communityVotes: data.communityVotes || [],
          isDisputed: data.isDisputed || false,
          adminFlagged: data.adminFlagged || false,
          adminFlagReason: data.adminFlagReason || '',
          resolutionProofUrl: data.resolutionProofUrl,
          resolutionAiAudit: data.resolutionAiAudit,
        });
      });
      setIssuesList(fetched);
    } catch (err) {
      const errInfo = buildFirestoreErrorInfo(err, OperationType.LIST, 'issues');
      console.error('Firestore Error: ', JSON.stringify(errInfo));
    } finally {
      setLoadingIssues(false);
    }
  };

  // Fetch Manual Verification Queue (rejected RVE submissions)
  const fetchManualQueue = async () => {
    setLoadingManualQueue(true);
    try {
      const q = query(
        collection(db, 'manualVerificationQueue'),
        where('reviewStatus', 'in', [...ALL_MANUAL_QUEUE_STATUSES])
      );
      const snap = await getDocs(q);
      const items: ManualQueueItem[] = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<ManualQueueItem, 'id'>),
      }));
      items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setManualQueue(items);
    } catch (err) {
      const errInfo = buildFirestoreErrorInfo(err, OperationType.LIST, 'manualVerificationQueue');
      console.error('Firestore Error: ', JSON.stringify(errInfo));
    } finally {
      setLoadingManualQueue(false);
    }
  };

  // Submit Manual Review Decision (Approve & Close OR Return for Rework)
  const handleManualReviewSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reviewingQueueItem) return;
    setReviewError('');
    setSubmittingReview(true);

    try {
      const idToken = auth.currentUser ? await auth.currentUser.getIdToken().catch(() => null) : null;
      const res = await fetch('/api/admin/manual-review', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
        },
        body: JSON.stringify({
          queueItemId: reviewingQueueItem.id,
          complaintId: reviewingQueueItem.complaintId,
          decision: reviewDecision,
          reviewNotes,
          adminPin: reviewPin.trim(),
          adminUid: currentUser?.uid || 'admin_user',
          adminEmail: currentUser?.email || 'admin@crowdcivic.org',
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setReviewError(data.error || 'Manual review submission failed.');
        return;
      }

      setActionBanner({
        type: 'success',
        message: `Manual review recorded for #${reviewingQueueItem.ticketId}: ${data.reviewStatus}.`,
      });
      setReviewingQueueItem(null);
      setReviewNotes('');
      setReviewPin('');
      fetchManualQueue();
      fetchIssues();
      fetchAuditLogs();
    } catch (err: any) {
      setReviewError(err?.message || 'Network error while submitting manual review.');
    } finally {
      setSubmittingReview(false);
    }
  };

  // Provision Field Authority Account
  const handleProvisionAuthority = async (e: React.FormEvent) => {
    e.preventDefault();
    setProvError('');
    setProvisioningAuth(true);

    try {
      const idToken = auth.currentUser ? await auth.currentUser.getIdToken().catch(() => null) : null;
      const res = await fetch('/api/admin/authority-accounts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
        },
        body: JSON.stringify({
          name: provName.trim(),
          email: provEmail.trim(),
          password: provPassword,
          department: provDepartment,
          adminPin: provPin.trim(),
          adminUid: currentUser?.uid || 'admin_user',
          adminEmail: currentUser?.email || 'admin@crowdcivic.org',
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setProvError(data.error || 'Failed to provision Field Authority account.');
        return;
      }

      setActionBanner({
        type: 'success',
        message: `Field Authority account provisioned for ${data.email} (${data.department}).${
          data.iamNotice ? ` Note: ${data.iamNotice}` : ''
        }`,
      });
      setShowProvisionModal(false);
      setProvName('');
      setProvEmail('');
      setProvPassword('');
      setProvPin('');
      fetchUsers();
      fetchAuditLogs();
    } catch (err: any) {
      setProvError(err?.message || 'Network error provisioning authority account.');
    } finally {
      setProvisioningAuth(false);
    }
  };

  // Toggle Admin Flag on Issue
  const handleToggleAdminFlag = async (issueId: string, currentFlagged: boolean) => {
    setActionBanner(null);
    try {
      const newFlagState = !currentFlagged;
      await updateDoc(doc(db, 'issues', issueId), {
        adminFlagged: newFlagState,
        isDisputed: newFlagState,
        adminFlaggedAt: new Date().toISOString(),
      });

      await logSecurityEvent({
        userId: currentUser?.uid || 'admin_user',
        email: currentUser?.email || 'admin@crowdcivic.org',
        role: 'admin',
        action: newFlagState ? 'ADMIN_ISSUE_FLAGGED' : 'ADMIN_ISSUE_UNFLAGGED',
        portal: 'admin',
        status: 'SUCCESS',
        details: `Admin ${newFlagState ? 'FLAGGED' : 'CLEARED FLAG ON'} Issue #${issueId} based on community governance audit.`,
      });

      setActionBanner({
        type: 'success',
        message: newFlagState ? 'Issue flagged for governance audit.' : 'Governance flag cleared.',
      });
      fetchIssues();
      fetchAuditLogs();
    } catch (err) {
      console.error('Error toggling issue flag:', err);
      setActionBanner({
        type: 'error',
        message: 'Failed to update governance flag. Check your connection and try again.',
      });
    }
  };

  // Delete Complaint permanently from system
  const handleDeleteIssue = (issueId: string, ticketId: string) => {
    setAdminDeleteModal({ issueId, ticketId });
  };

  const executeDeleteIssue = async () => {
    if (!adminDeleteModal) return;
    const { issueId, ticketId } = adminDeleteModal;
    setDeletingIssue(true);
    setActionBanner(null);
    try {
      await deleteDoc(doc(db, 'issues', issueId));
      await logSecurityEvent({
        userId: currentUser?.uid || 'admin_user',
        email: currentUser?.email || 'admin@crowdcivic.org',
        role: 'admin',
        action: 'ADMIN_DELETE_ISSUE',
        portal: 'admin',
        status: 'SUCCESS',
        details: `Admin deleted complaint ticket #${ticketId} (ID: ${issueId})`,
      });
      setIssuesList((prev) => prev.filter((i) => i.id !== issueId));
      fetchAuditLogs();
      setAdminDeleteModal(null);
      setActionBanner({
        type: 'success',
        message: `Civic record #${ticketId} permanently deleted.`,
      });
    } catch (err: any) {
      console.error('Error deleting issue:', err);
      setActionBanner({
        type: 'error',
        message: `Failed to delete record: ${err.message || 'Unknown error'}`,
      });
    } finally {
      setDeletingIssue(false);
    }
  };

  // Fetch Security Audit Logs
  const fetchAuditLogs = async () => {
    setLoadingLogs(true);
    try {
      const logs = await getSecurityAuditLogs(100);
      setAuditLogs(logs);
    } catch (err) {
      console.error('Error fetching audit logs:', err);
    } finally {
      setLoadingLogs(false);
    }
  };

  // Fetch Registered System Users (filtered by valid roles for Firestore rule compliance)
  const fetchUsers = async () => {
    setLoadingUsers(true);
    try {
      const q = query(collection(db, 'users'), where('role', 'in', ['citizen', 'authority', 'admin']));
      const querySnap = await getDocs(q);
      const fetched: UserRecord[] = [];
      querySnap.forEach((docSnap) => {
        const data = docSnap.data();
        fetched.push({
          uid: docSnap.id,
          email: data.email || 'Unknown User',
          role: data.role || 'citizen',
          updatedAt: data.updatedAt || new Date().toISOString(),
        });
      });

      const demoAccounts: UserRecord[] = [
        { uid: 'usr_citizen@crowdcivic.org', email: 'citizen@crowdcivic.org', role: 'citizen' },
        { uid: 'usr_authority@crowdcivic.org', email: 'authority@crowdcivic.org', role: 'authority' },
        { uid: 'usr_admin@crowdcivic.org', email: 'admin@crowdcivic.org', role: 'admin' },
      ];

      demoAccounts.forEach((demo) => {
        if (!fetched.some((f) => f.email === demo.email)) {
          fetched.push(demo);
        }
      });

      setUsersList(fetched);
    } catch (err) {
      const errInfo = buildFirestoreErrorInfo(err, OperationType.LIST, 'users');
      console.error('Firestore Error: ', JSON.stringify(errInfo));
      setUsersList([
        { uid: 'usr_citizen@crowdcivic.org', email: 'citizen@crowdcivic.org', role: 'citizen' },
        { uid: 'usr_authority@crowdcivic.org', email: 'authority@crowdcivic.org', role: 'authority' },
        { uid: 'usr_admin@crowdcivic.org', email: 'admin@crowdcivic.org', role: 'admin' },
      ]);
    } finally {
      setLoadingUsers(false);
    }
  };

  // Initiate Role Change Request
  const handleRequestRoleChange = (targetUid: string, targetEmail: string, newRole: 'citizen' | 'authority' | 'admin') => {
    setPendingUserUpdate({ targetUid, targetEmail, newRole });
    setAdminPinInput('');
    setAdminPinError('');
    setShowAdminPinModal(true);
  };

  // Confirm Role Change with 2FA Admin PIN
  const handleConfirmRoleChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdminPinError('');

    if (adminPinInput.trim() !== DEFAULT_PIN_ADMIN) {
      await logSecurityEvent({
        userId: currentUser?.uid || 'admin_user',
        email: currentUser?.email || 'admin@crowdcivic.org',
        role: 'admin',
        action: 'SECURITY_PIN_FAILED',
        portal: 'admin',
        status: 'DENIED',
        details: `Failed Admin 2FA Passkey PIN attempt for changing user permissions of ${pendingUserUpdate?.targetEmail}`,
      });
      setAdminPinError('Invalid System Admin Passkey. Access Denied.');
      return;
    }

    if (!pendingUserUpdate) return;

    try {
      await setDoc(
        doc(db, 'users', pendingUserUpdate.targetUid),
        {
          email: pendingUserUpdate.targetEmail,
          role: pendingUserUpdate.newRole,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );

      await logSecurityEvent({
        userId: currentUser?.uid || 'admin_user',
        email: currentUser?.email || 'admin@crowdcivic.org',
        role: 'admin',
        action: 'ROLE_PERMISSIONS_CHANGED',
        portal: 'admin',
        status: 'SUCCESS',
        details: `Role permissions for ${pendingUserUpdate.targetEmail} updated to [${pendingUserUpdate.newRole.toUpperCase()}].`,
      });

      setActionBanner({
        type: 'success',
        message: `Updated ${pendingUserUpdate.targetEmail} to ${pendingUserUpdate.newRole} access.`,
      });
      setShowAdminPinModal(false);
      setPendingUserUpdate(null);
      fetchUsers();
      fetchAuditLogs();
    } catch (err) {
      console.error('Error updating user role:', err);
      setAdminPinError('Failed to update user document in database.');
    }
  };

  const handleSignOut = async () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('user_role');
      localStorage.removeItem('user_email');
      localStorage.removeItem('user_uid');
    }
    await signOut(auth);
    window.location.href = '/';
  };

  // Filtered Logs
  const filteredLogs = auditLogs.filter((log) => {
    const q = searchLogQuery.toLowerCase();
    const matchesSearch =
      log.email.toLowerCase().includes(q) ||
      log.action.toLowerCase().includes(q) ||
      log.details.toLowerCase().includes(q);

    if (!matchesSearch) return false;
    if (logFilter === 'DENIED') {
      return log.status === 'DENIED' || log.action.includes('UNAUTHORIZED') || log.action.includes('MISMATCH');
    }
    if (logFilter === 'PIN') return log.action.includes('PIN');
    if (logFilter === 'LOGIN') return log.action.includes('LOGIN');
    return true;
  });

  // Filtered Users
  const filteredUsers = usersList.filter((u) => u.email.toLowerCase().includes(searchUserQuery.toLowerCase()));

  // Filtered Issues for Community Governance & Flags
  const filteredIssues = issuesList.filter((issue) => {
    const q = searchIssueQuery.toLowerCase();
    const matchesSearch =
      issue.ticketId.toLowerCase().includes(q) ||
      issue.category.toLowerCase().includes(q) ||
      issue.description.toLowerCase().includes(q);

    if (!matchesSearch) return false;
    if (issueFilter === 'DISPUTED') {
      return issue.isDisputed || (issue.voteStats && issue.voteStats.no > issue.voteStats.yes);
    }
    if (issueFilter === 'FLAGGED') return issue.adminFlagged;
    if (issueFilter === 'RESOLVED') return issue.status === 'Resolved';
    return true;
  });

  // Paginated Slices
  const totalAuditPages = Math.max(1, Math.ceil(filteredLogs.length / PAGE_SIZE));
  const safeAuditPage = Math.min(auditPage, totalAuditPages);
  const pagedLogs = filteredLogs.slice((safeAuditPage - 1) * PAGE_SIZE, safeAuditPage * PAGE_SIZE);

  const totalUserPages = Math.max(1, Math.ceil(filteredUsers.length / PAGE_SIZE));
  const safeUsersPage = Math.min(usersPage, totalUserPages);
  const pagedUsers = filteredUsers.slice((safeUsersPage - 1) * PAGE_SIZE, safeUsersPage * PAGE_SIZE);

  const totalIssuePages = Math.max(1, Math.ceil(filteredIssues.length / PAGE_SIZE));
  const safeIssuesPage = Math.min(issuesPage, totalIssuePages);
  const pagedIssues = filteredIssues.slice((safeIssuesPage - 1) * PAGE_SIZE, safeIssuesPage * PAGE_SIZE);

  // Stats Counters
  const deniedAttemptsCount = auditLogs.filter((l) => l.status === 'DENIED' || l.action.includes('UNAUTHORIZED')).length;
  const disputedOrFlaggedCount = issuesList.filter((i) => i.isDisputed || i.adminFlagged).length;

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F4F8FD] flex items-center justify-center text-[#13345D]">
        <div className="bg-white border border-[#DCE7F5] rounded-2xl px-6 py-5 flex items-center gap-3 shadow-xs">
          <RefreshCw className="w-5 h-5 animate-spin text-[#15427B]" />
          <span className="text-sm font-medium">Loading Governance Center...</span>
        </div>
      </div>
    );
  }

  const sidebarContent = (
    <div className="flex flex-col h-full bg-white">
      <div className="h-[68px] flex items-center justify-between px-5 border-b border-[#E2E8F0]">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-[#133B6E] text-white flex items-center justify-center relative shadow-xs shrink-0">
            <Building2 className="w-4 h-4" />
            <span className="w-2 h-2 rounded-full bg-[#F59E0B] absolute top-1 right-1" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-bold tracking-tight leading-tight flex items-center gap-1">
              <span className="text-[#13345D]">CrowdCivic</span>
              <span className="text-[#F59E0B]">AI</span>
            </div>
            <span className="text-[9px] font-bold tracking-[0.14em] text-[#64748B] uppercase block mt-0.5 truncate">
              {t('role_admin', 'SYSTEM ADMIN')}
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setMobileNavOpen(false)}
          className="lg:hidden p-1.5 rounded-lg hover:bg-[#F4F8FD] text-[#64748B]"
          aria-label="Close navigation drawer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <nav className="flex-1 py-4 space-y-1 px-3">
        <div className="text-[11px] font-bold uppercase tracking-wider text-[#64748B] mb-2 px-3">
          Governance &amp; Access
        </div>

        <button
          onClick={() => {
            setActiveTab('audit');
            setMobileNavOpen(false);
          }}
          className={`w-full flex items-center gap-3 px-3 py-2.5 text-xs rounded-lg font-medium transition-colors border-l-[3px] ${
            activeTab === 'audit'
              ? 'bg-[#EFF6FF] border-[#F59E0B] text-[#13345D] font-semibold'
              : 'border-transparent text-[#475569] hover:bg-[#F4F8FD] hover:text-[#13345D]'
          }`}
        >
          <Activity className="w-4 h-4 text-[#15427B] shrink-0" />
          <span>{t('tab_audit', 'Security Audit Trail')}</span>
        </button>

        <button
          onClick={() => {
            setActiveTab('users');
            setMobileNavOpen(false);
          }}
          className={`w-full flex items-center gap-3 px-3 py-2.5 text-xs rounded-lg font-medium transition-colors border-l-[3px] ${
            activeTab === 'users'
              ? 'bg-[#EFF6FF] border-[#F59E0B] text-[#13345D] font-semibold'
              : 'border-transparent text-[#475569] hover:bg-[#F4F8FD] hover:text-[#13345D]'
          }`}
        >
          <Users className="w-4 h-4 text-[#15427B] shrink-0" />
          <span>{t('tab_users', 'User Access & Roles')}</span>
        </button>

        <button
          onClick={() => {
            setActiveTab('config');
            setMobileNavOpen(false);
          }}
          className={`w-full flex items-center gap-3 px-3 py-2.5 text-xs rounded-lg font-medium transition-colors border-l-[3px] ${
            activeTab === 'config'
              ? 'bg-[#EFF6FF] border-[#F59E0B] text-[#13345D] font-semibold'
              : 'border-transparent text-[#475569] hover:bg-[#F4F8FD] hover:text-[#13345D]'
          }`}
        >
          <Settings className="w-4 h-4 text-[#15427B] shrink-0" />
          <span>{t('tab_config', 'System Policy Rules')}</span>
        </button>

        <button
          onClick={() => {
            setActiveTab('manualQueue');
            setMobileNavOpen(false);
          }}
          className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 text-xs rounded-lg font-medium transition-colors border-l-[3px] ${
            activeTab === 'manualQueue'
              ? 'bg-[#EFF6FF] border-[#F59E0B] text-[#13345D] font-semibold'
              : 'border-transparent text-[#475569] hover:bg-[#F4F8FD] hover:text-[#13345D]'
          }`}
        >
          <div className="flex items-center gap-3 min-w-0">
            <ShieldAlert className="w-4 h-4 text-[#15427B] shrink-0" />
            <span className="truncate">Manual Verification</span>
          </div>
          {manualQueue.filter((q) => q.reviewStatus === 'Pending Review').length > 0 && (
            <span className="text-xs font-mono font-bold text-[#DC2626] shrink-0">
              {manualQueue.filter((q) => q.reviewStatus === 'Pending Review').length}
            </span>
          )}
        </button>

        <button
          onClick={() => {
            setActiveTab('heatmap');
            setMobileNavOpen(false);
          }}
          className={`w-full flex items-center gap-3 px-3 py-2.5 text-xs rounded-lg font-medium transition-colors border-l-[3px] ${
            activeTab === 'heatmap'
              ? 'bg-[#EFF6FF] border-[#F59E0B] text-[#13345D] font-semibold'
              : 'border-transparent text-[#475569] hover:bg-[#F4F8FD] hover:text-[#13345D]'
          }`}
        >
          <MapPin className="w-4 h-4 text-[#15427B] shrink-0" />
          <span>Geospatial Heatmap</span>
        </button>

        <button
          onClick={() => {
            setActiveTab('issues');
            setMobileNavOpen(false);
          }}
          className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 text-xs rounded-lg font-medium transition-colors border-l-[3px] ${
            activeTab === 'issues'
              ? 'bg-[#EFF6FF] border-[#F59E0B] text-[#13345D] font-semibold'
              : 'border-transparent text-[#475569] hover:bg-[#F4F8FD] hover:text-[#13345D]'
          }`}
        >
          <div className="flex items-center gap-3 min-w-0">
            <Flag className="w-4 h-4 text-[#15427B] shrink-0" />
            <span className="truncate">{t('tab_issues', 'Community Flags')}</span>
          </div>
          {disputedOrFlaggedCount > 0 && (
            <span className="text-xs font-mono font-bold text-[#DC2626] shrink-0">
              {disputedOrFlaggedCount}
            </span>
          )}
        </button>
      </nav>

      <div className="p-4 border-t border-[#E2E8F0] space-y-3">
        <div className="p-3 bg-[#F4F8FD] rounded-xl border border-[#DCE7F5] text-xs space-y-0.5">
          <div className="flex items-center gap-1.5 font-semibold text-[#13345D]">
            <ShieldCheck className="w-4 h-4 text-[#0E8A4E]" />
            <span>Admin Passkey Active</span>
          </div>
          <p className="text-[11px] font-mono text-[#64748B]">SYS-ADM-99</p>
        </div>

        <button
          onClick={handleSignOut}
          className="flex items-center w-full px-3 py-2 text-xs font-semibold text-[#475569] hover:text-[#DC2626] hover:bg-[#FEF2F2] rounded-lg transition-colors"
        >
          <LogOut className="w-4 h-4 mr-2.5" />
          <span>{t('signOut', 'Sign Out')}</span>
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#F4F8FD] text-[#13345D] flex flex-col font-sans">
      {/* TOP DARK NAVY GOVERNANCE UTILITY BAR (Matches Landing Page) */}
      <div className="hidden sm:block w-full bg-[#0B2A52] text-white text-xs shrink-0">
        <div className="max-w-full mx-auto px-4 sm:px-6 lg:px-8 h-9 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5 truncate">
            <span className="font-semibold tracking-tight whitespace-nowrap">CrowdCivic AI</span>
            <span className="text-white/40" aria-hidden="true">
              |
            </span>
            <span className="text-white/85 truncate">Executive Governance &amp; Security Control Center</span>
          </div>
          <div className="flex items-center gap-4 text-white/85 shrink-0">
            <span className="hidden md:inline">RBAC &amp; Audit Ledger Active</span>
            <span className="text-white/40 hidden md:inline">|</span>
            <span className="font-mono text-white truncate max-w-[220px]">
              {currentUser?.email || 'admin@crowdcivic.org'}
            </span>
          </div>
        </div>
      </div>

      <div className="flex-1 flex min-w-0">
        {/* Desktop Sidebar */}
        <aside className="hidden lg:block w-64 border-r border-[#E2E8F0] shrink-0 bg-white">
          {sidebarContent}
        </aside>

        {/* Mobile Governance Drawer */}
        {mobileNavOpen && (
          <div className="fixed inset-0 z-50 lg:hidden flex">
            <div
              className="fixed inset-0 bg-[#0B2A52]/55 backdrop-blur-xs"
              onClick={() => setMobileNavOpen(false)}
            />
            <aside className="relative z-10 w-72 max-w-[85vw] h-full border-r border-[#E2E8F0] shadow-2xl bg-white">
              {sidebarContent}
            </aside>
          </div>
        )}

        {/* Main Content */}
        <main className="flex-1 flex flex-col min-w-0">
          <header className="h-[68px] bg-white border-b border-[#E2E8F0] flex items-center justify-between px-4 sm:px-8 gap-3 sticky top-0 z-30">
            <div className="flex items-center gap-3 min-w-0">
              <button
                type="button"
                onClick={() => setMobileNavOpen(true)}
                className="lg:hidden p-2 rounded-lg border border-[#CBD5E1] text-[#13345D] hover:bg-[#F4F8FD]"
                aria-label="Open governance navigation"
              >
                <Menu className="w-4 h-4" />
              </button>
              <div className="min-w-0">
                <h1 className="text-sm sm:text-base font-bold text-[#13345D] truncate">
                  {t('admin_title', 'Executive Governance Center')}
                </h1>
              </div>
              <StatusDot status="Operational" className="hidden sm:inline-flex" />
            </div>

            <div className="flex items-center gap-2 sm:gap-3 text-xs shrink-0">
              <LanguageSelector />

              <button
                onClick={() => {
                  fetchAuditLogs();
                  fetchUsers();
                  fetchIssues();
                  fetchManualQueue();
                }}
                className="px-3 py-2 bg-white hover:bg-[#F4F8FD] border border-[#CBD5E1] rounded-lg text-[#13345D] font-semibold transition-colors flex items-center gap-1.5 text-xs"
              >
                <RefreshCw className="w-3.5 h-3.5 text-[#15427B]" />
                <span className="hidden sm:inline">{t('refresh_incidents', 'Refresh')}</span>
              </button>
            </div>
          </header>

          <div className="p-4 sm:p-8 flex-1 space-y-6">
            {actionBanner && (
              <div
                className={`bg-white rounded-xl border p-4 flex items-center justify-between gap-3 text-xs shadow-xs ${
                  actionBanner.type === 'error' ? 'border-[#FCA5A5]' : 'border-[#DCE7F5]'
                }`}
              >
                <p className={`font-semibold ${actionBanner.type === 'error' ? 'text-[#DC2626]' : 'text-[#13345D]'}`}>
                  {actionBanner.message}
                </p>
                <button
                  type="button"
                  onClick={() => setActionBanner(null)}
                  className="text-[#64748B] hover:text-[#13345D] font-medium"
                >
                  Dismiss
                </button>
              </div>
            )}

            {/* 4 Statistics Cards with Landing Page Colored Top Accent Borders */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white p-4 rounded-2xl border border-[#E2E8F0] border-t-[3px] border-t-[#15427B] shadow-[0_2px_12px_rgba(15,41,74,0.04)]">
                <p className="text-xs font-medium text-[#64748B]">{t('registered_users_count', 'Registered Users')}</p>
                <p className="text-2xl font-mono tabular-nums text-[#13345D] font-bold mt-2">{usersList.length}</p>
                <p className="text-xs text-[#64748B] mt-1">Role-segmented accounts</p>
              </div>

              <div className="bg-white p-4 rounded-2xl border border-[#E2E8F0] border-t-[3px] border-t-[#F59E0B] shadow-[0_2px_12px_rgba(15,41,74,0.04)]">
                <p className="text-xs font-medium text-[#64748B]">
                  {t('disputed_reports_count', 'Disputed / Flagged Reports')}
                </p>
                <p className="text-2xl font-mono tabular-nums text-[#13345D] font-bold mt-2">
                  {disputedOrFlaggedCount} <span className="text-sm font-normal text-[#64748B]">/ {issuesList.length}</span>
                </p>
                <p className="text-xs text-[#64748B] mt-1">Community or admin flagged</p>
              </div>

              <div className="bg-white p-4 rounded-2xl border border-[#E2E8F0] border-t-[3px] border-t-[#DC2626] shadow-[0_2px_12px_rgba(15,41,74,0.04)]">
                <p className="text-xs font-medium text-[#64748B]">
                  {t('denied_access_attempts', 'Intercepted Violations')}
                </p>
                <p className="text-2xl font-mono tabular-nums text-[#DC2626] font-bold mt-2">{deniedAttemptsCount}</p>
                <p className="text-xs text-[#64748B] mt-1">Unauthorized attempts blocked</p>
              </div>

              <div className="bg-white p-4 rounded-2xl border border-[#E2E8F0] border-t-[3px] border-t-[#0E8A4E] shadow-[0_2px_12px_rgba(15,41,74,0.04)]">
                <p className="text-xs font-medium text-[#64748B]">Security Guard Status</p>
                <div className="flex items-center mt-2 gap-2">
                  <span className="w-2 h-2 bg-[#0E8A4E] rounded-full shrink-0" />
                  <p className="text-lg font-mono text-[#13345D] font-bold">LOCKED &amp; GUARDED</p>
                </div>
                <p className="text-xs text-[#64748B] mt-1">Firestore security rules active</p>
              </div>
            </div>

          {/* TAB 1: SECURITY AUDIT TRAIL */}
          {activeTab === 'audit' && (
            <div className="bg-white rounded-2xl border border-[#E2E8F0] shadow-[0_2px_12px_rgba(15,41,74,0.04)] overflow-hidden">
              <div className="p-5 sm:p-6 border-b border-[#E2E8F0] flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h2 className="font-bold text-[#13345D] text-base flex items-center gap-2">
                    <Activity className="w-4 h-4 text-[#15427B]" />
                    <span>Real-Time Security Audit Logs</span>
                  </h2>
                  <p className="text-xs text-[#475569] mt-0.5">
                    Immutable ledger of authentication events, role checks, and 2FA passkey verifications.
                  </p>
                </div>

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-[#64748B] absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={searchLogQuery}
                      onChange={(e) => {
                        setSearchLogQuery(e.target.value);
                        setAuditPage(1);
                      }}
                      placeholder="Search email or action"
                      className="w-full sm:w-52 bg-white border border-[#CBD5E1] focus:border-[#15427B] text-xs text-[#13345D] placeholder:text-[#94A3B8] pl-8 pr-3 py-2 rounded-lg outline-none"
                    />
                  </div>

                  <div className="flex bg-[#F4F8FD] border border-[#E2E8F0] p-1 rounded-lg text-xs">
                    {(['ALL', 'DENIED', 'PIN', 'LOGIN'] as const).map((filter) => (
                      <button
                        key={filter}
                        onClick={() => {
                          setLogFilter(filter);
                          setAuditPage(1);
                        }}
                        className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors ${
                          logFilter === filter
                            ? 'bg-[#15427B] text-white'
                            : 'text-[#64748B] hover:text-[#13345D]'
                        }`}
                      >
                        {filter}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="p-4 sm:p-6">
                {loadingLogs ? (
                  <div className="space-y-3 py-4">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="h-10 rounded-lg civic-skeleton" />
                    ))}
                  </div>
                ) : filteredLogs.length === 0 ? (
                  <div className="py-10 text-center text-xs text-[#64748B]">
                    No security audit logs match the current filter.
                  </div>
                ) : (
                  <>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr className="border-b border-[#E2E8F0] text-[#64748B] text-[11px] font-semibold">
                            <th className="pb-3 pr-4">Timestamp</th>
                            <th className="pb-3 pr-4">User &amp; Role</th>
                            <th className="pb-3 pr-4">Action</th>
                            <th className="pb-3 pr-4">Portal</th>
                            <th className="pb-3 pr-4">Status</th>
                            <th className="pb-3 text-right">Details</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#E2E8F0]">
                          {pagedLogs.map((log, idx) => (
                            <tr key={idx} className="hover:bg-[#F4F8FD]/70 transition-colors">
                              <td className="py-3 pr-4 font-mono text-[11px] text-[#64748B] whitespace-nowrap">
                                {new Date(log.timestamp).toLocaleDateString('en-GB', {
                                  day: '2-digit',
                                  month: 'short',
                                })}
                                ,{' '}
                                {new Date(log.timestamp).toLocaleTimeString([], {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </td>

                              <td className="py-3 pr-4">
                                <span className="font-semibold text-[#13345D]">{log.email}</span>
                                <span className="text-[11px] text-[#64748B] font-mono ml-1.5">· {log.role}</span>
                              </td>

                              <td className="py-3 pr-4 font-mono text-[11px] font-semibold text-[#13345D] whitespace-nowrap">
                                {log.action}
                              </td>

                              <td className="py-3 pr-4 text-xs capitalize text-[#475569] whitespace-nowrap">
                                {log.portal}
                              </td>

                              <td className="py-3 pr-4 whitespace-nowrap">
                                <StatusDot
                                  status={
                                    log.status === 'SUCCESS'
                                      ? 'ALLOWED'
                                      : log.status
                                  }
                                />
                              </td>

                              <td className="py-3 text-right whitespace-nowrap">
                                <button
                                  type="button"
                                  onClick={() => setSelectedAuditLog(log)}
                                  className="text-xs font-semibold text-[#15427B] hover:text-[#0F2F5A] hover:underline"
                                >
                                  View Details
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Table Pagination */}
                    <div className="pt-4 mt-4 border-t border-[#E2E8F0] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <span className="text-xs text-[#64748B]">
                        Showing {(safeAuditPage - 1) * PAGE_SIZE + 1}–
                        {Math.min(safeAuditPage * PAGE_SIZE, filteredLogs.length)} of {filteredLogs.length} entries
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          disabled={safeAuditPage <= 1}
                          onClick={() => setAuditPage((p) => Math.max(1, p - 1))}
                          className="px-4 py-2 bg-white hover:bg-[#F4F8FD] disabled:opacity-45 border border-[#CBD5E1] text-xs font-semibold text-[#13345D] rounded-lg"
                        >
                          Previous
                        </button>
                        <button
                          type="button"
                          disabled={safeAuditPage >= totalAuditPages}
                          onClick={() => setAuditPage((p) => Math.min(totalAuditPages, p + 1))}
                          className="px-4 py-2 bg-white hover:bg-[#F4F8FD] disabled:opacity-45 border border-[#CBD5E1] text-xs font-semibold text-[#13345D] rounded-lg"
                        >
                          Next
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: USER ACCESS & ROLE PERMISSIONS */}
          {activeTab === 'users' && (
            <div className="bg-white rounded-2xl border border-[#E2E8F0] shadow-[0_2px_12px_rgba(15,41,74,0.04)] overflow-hidden">
              <div className="p-5 sm:p-6 border-b border-[#E2E8F0] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h2 className="font-bold text-[#13345D] text-base flex items-center gap-2">
                    <Users className="w-4 h-4 text-[#15427B]" />
                    <span>Registered System Users &amp; Role Governance</span>
                  </h2>
                  <p className="text-xs text-[#475569] mt-0.5">
                    Assign Citizen, Authority, or Admin permissions. Changes require Admin 2FA passkey verification.
                  </p>
                </div>

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
                  <div className="relative w-full sm:w-64">
                    <Search className="w-3.5 h-3.5 text-[#64748B] absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={searchUserQuery}
                      onChange={(e) => {
                        setSearchUserQuery(e.target.value);
                        setUsersPage(1);
                      }}
                      placeholder="Search user email"
                      className="w-full bg-white border border-[#CBD5E1] focus:border-[#15427B] text-xs text-[#13345D] placeholder:text-[#94A3B8] pl-8 pr-3 py-2 rounded-lg outline-none"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setProvError('');
                      setProvPin('');
                      setShowProvisionModal(true);
                    }}
                    className="px-3.5 py-2 bg-[#15427B] hover:bg-[#0F2F5A] text-white text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 whitespace-nowrap transition-colors"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    <span>Provision Field Authority</span>
                  </button>
                </div>
              </div>

              <div className="p-4 sm:p-6">
                {loadingUsers ? (
                  <div className="space-y-3 py-4">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="h-10 rounded-lg civic-skeleton" />
                    ))}
                  </div>
                ) : filteredUsers.length === 0 ? (
                  <div className="py-10 text-center text-xs text-[#64748B]">No users match your search query.</div>
                ) : (
                  <>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr className="border-b border-[#E2E8F0] text-[#64748B] text-[11px] font-semibold">
                            <th className="pb-3 pr-4">User UID</th>
                            <th className="pb-3 pr-4">User Email</th>
                            <th className="pb-3 pr-4">Assigned Role</th>
                            <th className="pb-3">Change Permissions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#E2E8F0]">
                          {pagedUsers.map((u, idx) => (
                            <tr key={idx} className="hover:bg-[#F4F8FD]/70 transition-colors">
                              <td className="py-3 pr-4 font-mono text-[11px] text-[#64748B]">
                                {u.uid.slice(0, 18)}
                              </td>

                              <td className="py-3 pr-4 font-semibold text-[#13345D]">{u.email}</td>

                              <td className="py-3 pr-4 capitalize">
                                <StatusDot
                                  status={u.role}
                                  isDisputed={u.role === 'admin'}
                                />
                              </td>

                              <td className="py-3">
                                <div className="flex flex-wrap items-center gap-2">
                                  <button
                                    onClick={() => handleRequestRoleChange(u.uid, u.email, 'citizen')}
                                    disabled={u.role === 'citizen'}
                                    className="px-3 py-1.5 bg-white hover:bg-[#F4F8FD] disabled:opacity-40 border border-[#CBD5E1] text-xs font-semibold text-[#13345D] rounded-lg transition-colors"
                                  >
                                    Make Citizen
                                  </button>
                                  <button
                                    onClick={() => handleRequestRoleChange(u.uid, u.email, 'authority')}
                                    disabled={u.role === 'authority'}
                                    className="px-3 py-1.5 bg-white hover:bg-[#EFF6FF] disabled:opacity-40 border border-[#CBD5E1] text-xs font-semibold text-[#15427B] rounded-lg transition-colors"
                                  >
                                    Grant Authority
                                  </button>
                                  <button
                                    onClick={() => handleRequestRoleChange(u.uid, u.email, 'admin')}
                                    disabled={u.role === 'admin'}
                                    className="px-3 py-1.5 bg-white hover:bg-[#F5F3FF] disabled:opacity-40 border border-[#CBD5E1] text-xs font-semibold text-[#7C3AED] rounded-lg transition-colors"
                                  >
                                    Grant Admin
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <div className="pt-4 mt-4 border-t border-[#E2E8F0] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <span className="text-xs text-[#64748B]">
                        Showing {(safeUsersPage - 1) * PAGE_SIZE + 1}–
                        {Math.min(safeUsersPage * PAGE_SIZE, filteredUsers.length)} of {filteredUsers.length} entries
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          disabled={safeUsersPage <= 1}
                          onClick={() => setUsersPage((p) => Math.max(1, p - 1))}
                          className="px-4 py-2 bg-white hover:bg-[#F4F8FD] disabled:opacity-45 border border-[#CBD5E1] text-xs font-semibold text-[#13345D] rounded-lg"
                        >
                          Previous
                        </button>
                        <button
                          type="button"
                          disabled={safeUsersPage >= totalUserPages}
                          onClick={() => setUsersPage((p) => Math.min(totalUserPages, p + 1))}
                          className="px-4 py-2 bg-white hover:bg-[#F4F8FD] disabled:opacity-45 border border-[#CBD5E1] text-xs font-semibold text-[#13345D] rounded-lg"
                        >
                          Next
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: SYSTEM POLICY RULES */}
          {activeTab === 'config' && (
            <div className="bg-white rounded-2xl border border-[#E2E8F0] shadow-[0_2px_12px_rgba(15,41,74,0.04)] p-5 sm:p-6 space-y-6">
              <div className="border-b border-[#E2E8F0] pb-4">
                <h2 className="font-bold text-[#13345D] text-base flex items-center gap-2">
                  <Settings className="w-4 h-4 text-[#15427B]" />
                  <span>Platform Security &amp; Access Policies</span>
                </h2>
                <p className="text-xs text-[#475569] mt-0.5">
                  Active enforcement rules governing role boundaries, 2FA passkeys, and audit persistence.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                <div className="p-4 bg-[#F4F8FD] border border-[#DCE7F5] border-t-2 border-t-[#15427B] rounded-xl space-y-2">
                  <div className="flex items-center justify-between font-semibold text-[#13345D]">
                    <span>1. Role-Guard Navigation Interceptor</span>
                    <StatusDot status="Enforced" />
                  </div>
                  <p className="text-[#475569] leading-relaxed">
                    Attempts by Citizens to enter Authority or Admin portals are intercepted at route load and written to the audit log.
                  </p>
                </div>

                <div className="p-4 bg-[#F4F8FD] border border-[#DCE7F5] border-t-2 border-t-[#0E8A4E] rounded-xl space-y-2">
                  <div className="flex items-center justify-between font-semibold text-[#13345D]">
                    <span>2. Credential-Based Portal Diversion</span>
                    <StatusDot status="Enforced" />
                  </div>
                  <p className="text-[#475569] leading-relaxed">
                    Authentication automatically resolves the account role from user credentials and diverts to the authorized portal.
                  </p>
                </div>

                <div className="p-4 bg-[#F4F8FD] border border-[#DCE7F5] border-t-2 border-t-[#F59E0B] rounded-xl space-y-2">
                  <div className="flex items-center justify-between font-semibold text-[#13345D]">
                    <span>3. Municipal 2FA Security Passkeys</span>
                    <StatusDot status="Enforced" />
                  </div>
                  <p className="text-[#475569] leading-relaxed">
                    High-impact status updates and role privilege grants require a verified 6-digit passkey PIN.
                  </p>
                </div>

                <div className="p-4 bg-[#F4F8FD] border border-[#DCE7F5] border-t-2 border-t-[#0F294A] rounded-xl space-y-2">
                  <div className="flex items-center justify-between font-semibold text-[#13345D]">
                    <span>4. Immutable Firestore Security Ledger</span>
                    <StatusDot status="Active" />
                  </div>
                  <p className="text-[#475569] leading-relaxed">
                    All sign-ins, permission changes, and PIN verification attempts are persisted to the auditLogs collection.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: COMMUNITY VERIFICATION & GOVERNANCE FLAGS */}
          {activeTab === 'issues' && (
            <div className="bg-white rounded-2xl border border-[#E2E8F0] shadow-[0_2px_12px_rgba(15,41,74,0.04)] overflow-hidden">
              <div className="p-5 sm:p-6 border-b border-[#E2E8F0] flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h2 className="font-bold text-[#13345D] text-base flex items-center gap-2">
                    <Flag className="w-4 h-4 text-[#15427B]" />
                    <span>Community Verification &amp; Dispute Flags</span>
                  </h2>
                  <p className="text-xs text-[#475569] mt-0.5">
                    Review citizen feedback on resolved tickets and flag disputed repairs for re-audit.
                  </p>
                </div>

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-[#64748B] absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={searchIssueQuery}
                      onChange={(e) => {
                        setSearchIssueQuery(e.target.value);
                        setIssuesPage(1);
                      }}
                      placeholder="Search ticket or category"
                      className="w-full sm:w-52 bg-white border border-[#CBD5E1] focus:border-[#15427B] text-xs text-[#13345D] placeholder:text-[#94A3B8] pl-8 pr-3 py-2 rounded-lg outline-none"
                    />
                  </div>

                  <div className="flex bg-[#F4F8FD] border border-[#E2E8F0] p-1 rounded-lg text-xs">
                    {(['ALL', 'DISPUTED', 'FLAGGED', 'RESOLVED'] as const).map((filter) => (
                      <button
                        key={filter}
                        onClick={() => {
                          setIssueFilter(filter);
                          setIssuesPage(1);
                        }}
                        className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors ${
                          issueFilter === filter
                            ? 'bg-[#15427B] text-white'
                            : 'text-[#64748B] hover:text-[#13345D]'
                        }`}
                      >
                        {filter}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="p-4 sm:p-6">
                {loadingIssues ? (
                  <div className="space-y-3 py-4">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="h-10 rounded-lg civic-skeleton" />
                    ))}
                  </div>
                ) : filteredIssues.length === 0 ? (
                  <div className="py-10 text-center text-xs text-[#64748B]">
                    No civic reports match the current filter.
                  </div>
                ) : (
                  <>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr className="border-b border-[#E2E8F0] text-[#64748B] text-[11px] font-semibold">
                            <th className="pb-3 pr-4">Ticket &amp; Category</th>
                            <th className="pb-3 pr-4">Status</th>
                            <th className="pb-3 pr-4">Approval Score</th>
                            <th className="pb-3 pr-4">Feedback</th>
                            <th className="pb-3 pr-4">Flag Status</th>
                            <th className="pb-3 text-right">Governance Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#E2E8F0]">
                          {pagedIssues.map((issue, idx) => {
                            const totalVotes = (issue.voteStats?.yes || 0) + (issue.voteStats?.no || 0);
                            const approvalPct =
                              totalVotes > 0 ? Math.round(((issue.voteStats?.yes || 0) / totalVotes) * 100) : null;

                            return (
                              <tr key={idx} className="hover:bg-[#F4F8FD]/70 transition-colors">
                                <td className="py-3 pr-4">
                                  <span className="font-mono font-bold text-[#15427B] block">{issue.ticketId}</span>
                                  <span className="text-[11px] text-[#64748B] block">{issue.category}</span>
                                </td>

                                <td className="py-3 pr-4 whitespace-nowrap">
                                  <StatusDot status={issue.status} />
                                </td>

                                <td className="py-3 pr-4 whitespace-nowrap">
                                  {totalVotes > 0 ? (
                                    <div>
                                      <span className="font-mono font-semibold text-[#13345D]">
                                        {approvalPct}% approved
                                      </span>
                                      <p className="text-[11px] text-[#64748B]">
                                        {issue.voteStats?.yes || 0} fixed · {issue.voteStats?.no || 0} unresolved
                                      </p>
                                    </div>
                                  ) : (
                                    <span className="text-[#64748B]">No votes yet</span>
                                  )}
                                </td>

                                <td className="py-3 pr-4 whitespace-nowrap">
                                  <button
                                    type="button"
                                    onClick={() => setSelectedIssueComments(issue)}
                                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#15427B] hover:underline"
                                  >
                                    <MessageSquare className="w-3.5 h-3.5" />
                                    <span>{issue.communityVotes?.length || 0} Comments</span>
                                  </button>
                                </td>

                                <td className="py-3 pr-4 whitespace-nowrap">
                                  <StatusDot
                                    status="Verified"
                                    isDisputed={issue.isDisputed}
                                    adminFlagged={issue.adminFlagged}
                                  />
                                </td>

                                <td className="py-3 text-right whitespace-nowrap">
                                  <div className="inline-flex items-center gap-2">
                                    <button
                                      type="button"
                                      onClick={() => handleToggleAdminFlag(issue.id, !!issue.adminFlagged)}
                                      className="px-3 py-1.5 bg-white hover:bg-[#F4F8FD] border border-[#CBD5E1] rounded-lg text-xs font-semibold text-[#13345D] transition-colors inline-flex items-center gap-1.5"
                                    >
                                      <Flag className="w-3.5 h-3.5 text-[#15427B]" />
                                      <span>{issue.adminFlagged ? 'Clear Flag' : 'Flag Audit'}</span>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteIssue(issue.id, issue.ticketId)}
                                      className="px-3 py-1.5 bg-white hover:bg-[#FEF2F2] border border-[#FCA5A5] rounded-lg text-xs font-semibold text-[#DC2626] transition-colors inline-flex items-center gap-1.5"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                      <span>Delete</span>
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    <div className="pt-4 mt-4 border-t border-[#E2E8F0] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <span className="text-xs text-[#64748B]">
                        Showing {(safeIssuesPage - 1) * PAGE_SIZE + 1}–
                        {Math.min(safeIssuesPage * PAGE_SIZE, filteredIssues.length)} of {filteredIssues.length} entries
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          disabled={safeIssuesPage <= 1}
                          onClick={() => setIssuesPage((p) => Math.max(1, p - 1))}
                          className="px-4 py-2 bg-white hover:bg-[#F4F8FD] disabled:opacity-45 border border-[#CBD5E1] text-xs font-semibold text-[#13345D] rounded-lg"
                        >
                          Previous
                        </button>
                        <button
                          type="button"
                          disabled={safeIssuesPage >= totalIssuePages}
                          onClick={() => setIssuesPage((p) => Math.min(totalIssuePages, p + 1))}
                          className="px-4 py-2 bg-white hover:bg-[#F4F8FD] disabled:opacity-45 border border-[#CBD5E1] text-xs font-semibold text-[#13345D] rounded-lg"
                        >
                          Next
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
          {/* TAB 5: MANUAL VERIFICATION QUEUE (RVE REJECTIONS) */}
          {activeTab === 'manualQueue' && (
            <div className="bg-white rounded-2xl border border-[#E2E8F0] shadow-[0_2px_12px_rgba(15,41,74,0.04)] overflow-hidden">
              <div className="p-5 sm:p-6 border-b border-[#E2E8F0] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h2 className="font-bold text-[#13345D] text-base flex items-center gap-2">
                    <ShieldAlert className="w-4 h-4 text-[#DC2626]" />
                    <span>Manual Verification Queue (RVE Rejections)</span>
                  </h2>
                  <p className="text-xs text-[#475569] mt-0.5">
                    Audit authority submissions rejected by Gate 1 (GPS), Gate 2 (Timestamp), or Gate 3 (Gemini 2.5 Flash).
                  </p>
                </div>
                <span className="text-xs font-mono font-semibold text-[#15427B]">
                  {manualQueue.filter((q) => q.reviewStatus === 'Pending Review').length} Pending Review
                </span>
              </div>

              <div className="p-4 sm:p-6 space-y-4">
                {loadingManualQueue ? (
                  <div className="space-y-3">
                    {[1, 2].map((i) => (
                      <div key={i} className="h-24 rounded-xl civic-skeleton" />
                    ))}
                  </div>
                ) : manualQueue.length === 0 ? (
                  <div className="py-12 text-center text-xs text-[#64748B] space-y-2">
                    <CheckCircle2 className="w-8 h-8 text-[#0E8A4E] mx-auto" />
                    <p className="font-semibold text-[#13345D]">Manual Verification Queue is Clear</p>
                    <p>No RVE-rejected submissions require administrative override or rework routing.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {manualQueue.map((item) => (
                      <div
                        key={item.id}
                        className="p-4 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                      >
                        <div className="space-y-1.5 min-w-0">
                          <div className="flex flex-wrap items-center gap-2 text-xs">
                            <span className="font-mono font-bold text-[#15427B]">{item.ticketId}</span>
                            <span className="font-semibold text-[#13345D]">{item.title || item.category}</span>
                            {item.failureGate && (
                              <span className="px-2 py-0.5 rounded bg-[#FEF2F2] border border-[#FCA5A5] text-[#DC2626] font-mono text-[10px] font-bold">
                                Failed {item.failureGate}
                              </span>
                            )}
                            {item.potentiallyTamperedEvidence && (
                              <span className="px-2 py-0.5 rounded bg-[#FFFBEB] border border-[#FDE68A] text-[#B45309] font-mono text-[10px] font-bold">
                                Timestamp Anomaly Flag
                              </span>
                            )}
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                item.reviewStatus === 'Pending Review'
                                  ? 'bg-[#FFFBEB] text-[#B45309]'
                                  : item.reviewStatus === 'Approved by Admin'
                                  ? 'bg-[#ECFDF5] text-[#0E8A4E]'
                                  : 'bg-[#EFF6FF] text-[#15427B]'
                              }`}
                            >
                              {item.reviewStatus}
                            </span>
                          </div>
                          <p className="text-xs text-[#475569] leading-relaxed">{item.rejectionReason}</p>
                          <p className="text-[11px] font-mono text-[#64748B]">
                            Authority: {item.authorityEmail || 'Unknown'} · {item.department || 'Municipal Dept'} ·{' '}
                            {new Date(item.createdAt).toLocaleString()}
                          </p>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              setReviewingQueueItem(item);
                              setReviewDecision('reject_rework');
                              setReviewNotes('');
                              setReviewPin('');
                              setReviewError('');
                            }}
                            className="px-4 py-2 bg-[#15427B] hover:bg-[#0F2F5A] text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>{item.reviewStatus === 'Pending Review' ? 'Audit Submission' : 'View Audit'}</span>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 6: GEOSPATIAL HEATMAP */}
          {activeTab === 'heatmap' && (() => {
            const geoIssues = issuesList.filter(
              (i) => typeof i.location?.latitude === 'number' && typeof i.location?.longitude === 'number'
            );
            const lats = geoIssues.map((i) => i.location!.latitude!);
            const lngs = geoIssues.map((i) => i.location!.longitude!);
            const minLat = lats.length ? Math.min(...lats) - 0.005 : 28.55;
            const maxLat = lats.length ? Math.max(...lats) + 0.005 : 28.7;
            const minLng = lngs.length ? Math.min(...lngs) - 0.005 : 77.1;
            const maxLng = lngs.length ? Math.max(...lngs) + 0.005 : 77.3;
            const latSpan = Math.max(0.001, maxLat - minLat);
            const lngSpan = Math.max(0.001, maxLng - minLng);

            const areaStats = Object.values(
              geoIssues.reduce<
                Record<string, { area: string; total: number; open: number; critical: number; resolved: number }>
              >((acc, cur) => {
                const area = cur.location?.area || cur.location?.address?.split(',')[0] || 'Civic Zone';
                if (!acc[area]) {
                  acc[area] = { area, total: 0, open: 0, critical: 0, resolved: 0 };
                }
                acc[area].total += 1;
                if (cur.status === 'Resolved' || cur.status === 'Closed') {
                  acc[area].resolved += 1;
                } else {
                  acc[area].open += 1;
                }
                if (cur.severity === 'Critical' || cur.severity === 'High') {
                  acc[area].critical += 1;
                }
                return acc;
              }, {})
            ).sort((a, b) => b.open - a.open || b.total - a.total);

            return (
              <div className="space-y-6">
                <div className="bg-white rounded-2xl border border-[#E2E8F0] shadow-[0_2px_12px_rgba(15,41,74,0.04)] overflow-hidden">
                  <div className="p-5 sm:p-6 border-b border-[#E2E8F0] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <h2 className="font-bold text-[#13345D] text-base flex items-center gap-2">
                        <MapPin className="w-4 h-4 text-[#15427B]" />
                        <span>Geospatial Complaint &amp; Hazard Heatmap</span>
                      </h2>
                      <p className="text-xs text-[#475569] mt-0.5">
                        Spatial clustering of {geoIssues.length} geotagged civic issues by severity &amp; resolution status.
                      </p>
                    </div>
                    <div className="flex items-center gap-4 text-[11px] font-medium text-[#475569]">
                      <span className="flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full bg-[#DC2626]" /> Critical / High Open
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full bg-[#F59E0B]" /> Open Standard
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full bg-[#0E8A4E]" /> RVE Resolved
                      </span>
                    </div>
                  </div>

                  <div className="p-5 sm:p-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="lg:col-span-2 relative h-80 rounded-2xl border border-[#DCE7F5] bg-[#0B2A52] overflow-hidden">
                      <div
                        className="absolute inset-0 opacity-20"
                        style={{
                          backgroundImage:
                            'linear-gradient(to right, #38BDF8 1px, transparent 1px), linear-gradient(to bottom, #38BDF8 1px, transparent 1px)',
                          backgroundSize: '32px 32px',
                        }}
                      />
                      {geoIssues.length === 0 ? (
                        <div className="absolute inset-0 flex items-center justify-center text-xs text-white/70">
                          No geotagged complaints available to plot.
                        </div>
                      ) : (
                        geoIssues.map((issue) => {
                          const xPct = 8 + ((issue.location!.longitude! - minLng) / lngSpan) * 84;
                          const yPct = 92 - ((issue.location!.latitude! - minLat) / latSpan) * 84;
                          const isClosed = issue.status === 'Resolved' || issue.status === 'Closed';
                          const isHigh = issue.severity === 'Critical' || issue.severity === 'High';
                          const dotColor = isClosed ? '#10B981' : isHigh ? '#EF4444' : '#F59E0B';
                          return (
                            <button
                              key={issue.id}
                              type="button"
                              onClick={() => setSelectedHeatmapIssue(issue)}
                              style={{ left: `${xPct}%`, top: `${yPct}%` }}
                              title={`${issue.ticketId} (${issue.severity}) - ${issue.location?.address}`}
                              className="absolute -translate-x-1/2 -translate-y-1/2 group focus:outline-none"
                            >
                              <span
                                className="block w-8 h-8 rounded-full opacity-30 group-hover:opacity-60 transition-opacity"
                                style={{ backgroundColor: dotColor }}
                              />
                              <span
                                className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-3 rounded-full border-2 border-white shadow-md"
                                style={{ backgroundColor: dotColor }}
                              />
                            </button>
                          );
                        })
                      )}
                      <div className="absolute bottom-3 left-3 bg-[#081F3D]/85 px-3 py-1.5 rounded-lg text-[10px] font-mono text-white/80 border border-white/10">
                        Bounds: {minLat.toFixed(3)}°–{maxLat.toFixed(3)}°N · {minLng.toFixed(3)}°–{maxLng.toFixed(3)}°E
                      </div>
                    </div>

                    <div className="space-y-3">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-[#64748B]">
                        Selected Hotspot Details
                      </h3>
                      {selectedHeatmapIssue ? (
                        <div className="p-4 rounded-xl bg-[#F4F8FD] border border-[#DCE7F5] space-y-2 text-xs">
                          <div className="flex items-center justify-between">
                            <span className="font-mono font-bold text-[#15427B]">{selectedHeatmapIssue.ticketId}</span>
                            <StatusDot status={selectedHeatmapIssue.status} />
                          </div>
                          <p className="font-bold text-[#13345D]">{selectedHeatmapIssue.title}</p>
                          <p className="text-[#475569]">{selectedHeatmapIssue.description}</p>
                          <p className="text-[11px] font-mono text-[#64748B]">
                            {selectedHeatmapIssue.location?.latitude?.toFixed(5)}°,{' '}
                            {selectedHeatmapIssue.location?.longitude?.toFixed(5)}°
                          </p>
                          <p className="text-[11px] text-[#475569]">
                            {selectedHeatmapIssue.department} · Severity: {selectedHeatmapIssue.severity}
                          </p>
                        </div>
                      ) : (
                        <div className="p-4 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] text-xs text-[#64748B]">
                          Click any plotted coordinate marker on the geospatial canvas to inspect its severity, department, and RVE status.
                        </div>
                      )}

                      <h3 className="text-xs font-bold uppercase tracking-wider text-[#64748B] pt-2">
                        Top Hotspot Zones
                      </h3>
                      <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                        {areaStats.map((z) => (
                          <div
                            key={z.area}
                            className="p-2.5 rounded-lg border border-[#E2E8F0] bg-white flex items-center justify-between text-xs"
                          >
                            <span className="font-semibold text-[#13345D] truncate pr-2">{z.area}</span>
                            <div className="flex items-center gap-2 font-mono text-[11px] shrink-0">
                              <span className="text-[#DC2626] font-bold">{z.open} open</span>
                              <span className="text-[#64748B]">/</span>
                              <span className="text-[#0E8A4E]">{z.resolved} fixed</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}

          </div>

          {/* INSTITUTIONAL FOOTER */}
          <footer className="bg-[#0B2A52] text-white py-5 px-4 sm:px-8 border-t border-[#15427B] mt-auto">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2">
                <span className="font-bold text-white">CrowdCivic </span>
                <span className="font-bold text-[#F59E0B]">AI</span>
                <span className="text-white/60 hidden sm:inline">· Executive Governance Center</span>
              </div>
              <span className="text-[11px] text-white/75">Role-Based Verification &amp; Immutable Audit Trail · © 2026</span>
            </div>
          </footer>
        </main>
      </div>

      {/* AUDIT LOG ENTRY DETAILS MODAL */}
      {selectedAuditLog && (
        <div className="fixed inset-0 z-50 bg-[#0B2A52]/55 backdrop-blur-xs flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className="bg-white border border-[#DCE7F5] w-full max-w-md rounded-2xl p-6 shadow-2xl space-y-4 relative"
          >
            <button
              type="button"
              onClick={() => setSelectedAuditLog(null)}
              className="absolute top-4 right-4 text-[#64748B] hover:text-[#13345D] p-1.5 rounded-lg hover:bg-[#F4F8FD]"
            >
              <X className="w-4 h-4" />
            </button>

            <div>
              <span className="text-[11px] font-bold text-[#15427B] uppercase tracking-wider block">Audit Ledger Entry</span>
              <h3 className="text-base font-bold text-[#13345D] font-mono mt-0.5">{selectedAuditLog.action}</h3>
            </div>

            <div className="bg-[#F4F8FD] border border-[#DCE7F5] rounded-xl p-4 space-y-2 text-xs">
              <div className="flex justify-between gap-2">
                <span className="text-[#64748B]">Actor</span>
                <span className="font-semibold text-[#13345D]">{selectedAuditLog.email}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-[#64748B]">Role · Portal</span>
                <span className="font-mono text-[#13345D] capitalize">
                  {selectedAuditLog.role} · {selectedAuditLog.portal}
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-[#64748B]">Outcome</span>
                <StatusDot status={selectedAuditLog.status === 'SUCCESS' ? 'ALLOWED' : selectedAuditLog.status} />
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-[#64748B]">Timestamp</span>
                <span className="font-mono text-[#13345D]">
                  {new Date(selectedAuditLog.timestamp).toLocaleString()}
                </span>
              </div>
            </div>

            <div className="space-y-1 text-xs">
              <span className="font-semibold text-[#13345D] block">Event Details</span>
              <p className="text-[#475569] leading-relaxed">{selectedAuditLog.details}</p>
              {selectedAuditLog.deviceInfo && (
                <p className="text-[11px] text-[#64748B] font-mono pt-1 break-all">
                  Device: {selectedAuditLog.deviceInfo}
                </p>
              )}
            </div>

            <button
              type="button"
              onClick={() => setSelectedAuditLog(null)}
              className="w-full py-2.5 bg-white hover:bg-[#F4F8FD] text-[#13345D] border border-[#CBD5E1] text-xs font-semibold rounded-lg"
            >
              Close
            </button>
          </motion.div>
        </div>
      )}

      {/* ADMIN 2FA PIN CONFIRMATION MODAL */}
      {showAdminPinModal && pendingUserUpdate && (
        <div className="fixed inset-0 z-50 bg-[#0B2A52]/55 backdrop-blur-xs flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className="bg-white border border-[#DCE7F5] w-full max-w-md rounded-2xl p-6 shadow-2xl space-y-5 relative"
          >
            <button
              onClick={() => setShowAdminPinModal(false)}
              className="absolute top-4 right-4 text-[#64748B] hover:text-[#13345D] p-1.5 rounded-lg hover:bg-[#F4F8FD]"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-3">
              <div className="w-11 h-11 bg-[#EFF6FF] rounded-xl flex items-center justify-center text-[#15427B] shrink-0">
                <KeyRound className="w-5 h-5" />
              </div>
              <div>
                <span className="text-[11px] font-bold text-[#15427B] uppercase tracking-wider block">System Governance 2FA</span>
                <h3 className="text-base font-bold text-[#13345D]">Municipal Security Verification</h3>
              </div>
            </div>

            <div className="bg-[#F4F8FD] p-3.5 rounded-xl border border-[#DCE7F5] text-xs space-y-1">
              <p className="font-semibold text-[#13345D]">Target Account</p>
              <p className="text-[#15427B] font-mono font-semibold">{pendingUserUpdate.targetEmail}</p>
              <p className="text-[#475569]">
                New access level:{' '}
                <span className="text-[#13345D] uppercase font-bold">{pendingUserUpdate.newRole}</span>
              </p>
            </div>

            <form onSubmit={handleConfirmRoleChange} className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <label className="font-semibold text-[#13345D]">Enter your six-digit municipal security PIN</label>
                  <span className="text-[11px] font-mono text-[#64748B]">PIN: {DEFAULT_PIN_ADMIN}</span>
                </div>
                <PinBoxInput value={adminPinInput} onChange={setAdminPinInput} autoFocus idPrefix="admin-pin" />
              </div>

              {adminPinError && (
                <div className="p-3 bg-[#FEF2F2] border border-[#FCA5A5] rounded-xl text-xs text-[#DC2626] flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{adminPinError}</span>
                </div>
              )}

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAdminPinModal(false)}
                  className="flex-1 py-2.5 bg-white hover:bg-[#F4F8FD] text-[#13345D] border border-[#CBD5E1] text-xs font-semibold rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-[#15427B] hover:bg-[#0F2F5A] text-white text-xs font-semibold rounded-lg flex items-center justify-center gap-2 transition-colors"
                >
                  <ShieldCheck className="w-4 h-4" />
                  <span>Verify &amp; Continue</span>
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* CITIZEN VERIFICATION COMMENTS INSPECTION MODAL */}
      {selectedIssueComments && (
        <div className="fixed inset-0 z-50 bg-[#0B2A52]/55 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-[#DCE7F5] w-full max-w-lg rounded-2xl p-6 shadow-2xl space-y-4 relative">
            <button
              onClick={() => setSelectedIssueComments(null)}
              className="absolute top-4 right-4 text-[#64748B] hover:text-[#13345D] p-1.5 rounded-lg hover:bg-[#F4F8FD]"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-[#EFF6FF] rounded-xl flex items-center justify-center text-[#15427B] shrink-0">
                <MessageSquare className="w-5 h-5" />
              </div>
              <div>
                <span className="text-[11px] font-bold text-[#15427B] uppercase tracking-wider block">Ground Verification Inspection</span>
                <h3 className="text-sm font-bold text-[#13345D]">
                  {selectedIssueComments.ticketId} · Community Feedback
                </h3>
              </div>
            </div>

            <p className="text-xs text-[#475569] bg-[#F4F8FD] p-3.5 rounded-xl border border-[#DCE7F5] leading-relaxed">
              {selectedIssueComments.description}
            </p>

            <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
              {!selectedIssueComments.communityVotes || selectedIssueComments.communityVotes.length === 0 ? (
                <div className="text-center py-6 text-xs text-[#64748B]">
                  No citizen ground comments submitted yet.
                </div>
              ) : (
                selectedIssueComments.communityVotes.map((v, idx) => (
                  <div key={idx} className="p-3 bg-white border border-[#E2E8F0] rounded-xl text-xs space-y-1">
                    <div className="flex items-center justify-between gap-2 text-[11px]">
                      <span className="font-mono text-[#13345D] font-medium truncate">{v.userEmail}</span>
                      <div className="flex items-center gap-2 shrink-0">
                        {v.distanceKm !== undefined && (
                          <span className="text-[10px] font-mono text-[#64748B]">{v.distanceKm} km away</span>
                        )}
                        {v.vote === 'yes' ? (
                          <span className="text-[#0E8A4E] font-semibold flex items-center gap-1">
                            <ThumbsUp className="w-3 h-3" /> Fixed
                          </span>
                        ) : (
                          <span className="text-[#DC2626] font-semibold flex items-center gap-1">
                            <ThumbsDown className="w-3 h-3" /> Unresolved
                          </span>
                        )}
                      </div>
                    </div>
                    {v.comment && <p className="text-[#475569] text-xs">{v.comment}</p>}
                  </div>
                ))
              )}
            </div>

            <button
              onClick={() => setSelectedIssueComments(null)}
              className="w-full py-2.5 bg-white hover:bg-[#F4F8FD] text-[#13345D] border border-[#CBD5E1] text-xs font-semibold rounded-lg transition-colors"
            >
              Close Inspector
            </button>
          </div>
        </div>
      )}

      {/* MANUAL VERIFICATION REVIEW MODAL */}
      {reviewingQueueItem && (
        <div className="fixed inset-0 z-50 bg-[#0B2A52]/55 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white border border-[#DCE7F5] w-full max-w-2xl rounded-2xl p-6 shadow-2xl space-y-4 my-8">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-[11px] font-bold text-[#DC2626] uppercase tracking-wider block">
                  Executive Admin Manual Verification Queue
                </span>
                <h3 className="text-base font-bold text-[#13345D]">
                  {reviewingQueueItem.ticketId} · {reviewingQueueItem.title || reviewingQueueItem.category}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setReviewingQueueItem(null)}
                className="p-1.5 rounded-lg hover:bg-[#F4F8FD] text-[#64748B]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3.5 rounded-xl bg-[#FEF2F2] border border-[#FCA5A5] text-xs space-y-1">
              <p className="font-bold text-[#DC2626]">
                Rejected at {reviewingQueueItem.failureGate || 'RVE Gate'}
                {reviewingQueueItem.potentiallyTamperedEvidence ? ' · Timestamp Tampering Flagged' : ''}
              </p>
              <p className="text-[#475569]">{reviewingQueueItem.rejectionReason}</p>
            </div>

            {reviewingQueueItem.sampleKeyframes && reviewingQueueItem.sampleKeyframes.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-[#13345D] mb-2">Submitted Video Keyframes</p>
                <div className="grid grid-cols-3 gap-2">
                  {reviewingQueueItem.sampleKeyframes.map((kf, idx) => (
                    <img
                      key={idx}
                      src={kf}
                      alt={`Keyframe ${idx + 1}`}
                      className="rounded-lg border border-[#E2E8F0] aspect-video object-cover"
                    />
                  ))}
                </div>
              </div>
            )}

            <form onSubmit={handleManualReviewSubmit} className="space-y-4 pt-2 border-t border-[#E2E8F0]">
              <div className="grid grid-cols-2 gap-3 text-xs">
                <button
                  type="button"
                  onClick={() => setReviewDecision('reject_rework')}
                  className={`p-3 rounded-xl border text-left font-semibold ${
                    reviewDecision === 'reject_rework'
                      ? 'border-[#DC2626] bg-[#FEF2F2] text-[#DC2626]'
                      : 'border-[#E2E8F0] bg-white text-[#475569]'
                  }`}
                >
                  Return for Field Rework
                </button>
                <button
                  type="button"
                  onClick={() => setReviewDecision('approve')}
                  className={`p-3 rounded-xl border text-left font-semibold ${
                    reviewDecision === 'approve'
                      ? 'border-[#0E8A4E] bg-[#ECFDF5] text-[#0E8A4E]'
                      : 'border-[#E2E8F0] bg-white text-[#475569]'
                  }`}
                >
                  Approve &amp; Close Complaint
                </button>
              </div>

              <div>
                <label className="text-xs font-semibold text-[#13345D] block mb-1">Admin Audit Notes</label>
                <textarea
                  rows={2}
                  value={reviewNotes}
                  onChange={(e) => setReviewNotes(e.target.value)}
                  placeholder="Document inspection findings and justification..."
                  className="w-full rounded-lg border border-[#CBD5E1] px-3 py-2 text-xs text-[#13345D] focus:border-[#15427B] outline-none"
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <label className="font-semibold text-[#13345D]">Executive Admin 2FA PIN</label>
                  <span className="text-[11px] font-mono text-[#64748B]">PIN: {DEFAULT_PIN_ADMIN}</span>
                </div>
                <PinBoxInput value={reviewPin} onChange={setReviewPin} idPrefix="manual-review-pin" />
              </div>

              {reviewError && (
                <div className="p-3 rounded-xl bg-[#FEF2F2] border border-[#FCA5A5] text-xs text-[#DC2626]">
                  {reviewError}
                </div>
              )}

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setReviewingQueueItem(null)}
                  className="flex-1 py-2.5 bg-white border border-[#CBD5E1] rounded-lg text-xs font-semibold text-[#13345D]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingReview}
                  className="flex-1 py-2.5 bg-[#15427B] hover:bg-[#0F2F5A] text-white rounded-lg text-xs font-semibold disabled:opacity-50"
                >
                  {submittingReview ? 'Submitting Decision...' : 'Commit Admin Decision'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* PROVISION FIELD AUTHORITY ACCOUNT MODAL */}
      {showProvisionModal && (
        <div className="fixed inset-0 z-50 bg-[#0B2A52]/55 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-[#DCE7F5] w-full max-w-md rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-[#EFF6FF] text-[#15427B] flex items-center justify-center">
                  <UserPlus className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-[#13345D]">Provision Field Authority</h3>
                  <p className="text-[11px] text-[#64748B]">Admin-controlled municipal officer onboarding</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowProvisionModal(false)}
                className="p-1.5 rounded-lg hover:bg-[#F4F8FD] text-[#64748B]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleProvisionAuthority} className="space-y-3 text-xs">
              <div>
                <label className="font-semibold text-[#13345D] block mb-1">Officer Full Name</label>
                <input
                  type="text"
                  required
                  value={provName}
                  onChange={(e) => setProvName(e.target.value)}
                  placeholder="e.g., Ward 4 Field Engineer"
                  className="w-full border border-[#CBD5E1] rounded-lg px-3 py-2 text-[#13345D] outline-none focus:border-[#15427B]"
                />
              </div>
              <div>
                <label className="font-semibold text-[#13345D] block mb-1">Official Email</label>
                <input
                  type="email"
                  required
                  value={provEmail}
                  onChange={(e) => setProvEmail(e.target.value)}
                  placeholder="officer.ward4@crowdcivic.org"
                  className="w-full border border-[#CBD5E1] rounded-lg px-3 py-2 text-[#13345D] outline-none focus:border-[#15427B]"
                />
              </div>
              <div>
                <label className="font-semibold text-[#13345D] block mb-1">Initial Password</label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={provPassword}
                  onChange={(e) => setProvPassword(e.target.value)}
                  placeholder="Minimum 6 characters"
                  className="w-full border border-[#CBD5E1] rounded-lg px-3 py-2 text-[#13345D] outline-none focus:border-[#15427B]"
                />
              </div>
              <div>
                <label className="font-semibold text-[#13345D] block mb-1">Municipal Department</label>
                <select
                  value={provDepartment}
                  onChange={(e) => setProvDepartment(e.target.value)}
                  className="w-full border border-[#CBD5E1] rounded-lg px-3 py-2 text-[#13345D] outline-none focus:border-[#15427B]"
                >
                  <option value="Roads & Highways Dept">Roads &amp; Highways Dept</option>
                  <option value="Sanitation & Solid Waste Dept">Sanitation &amp; Solid Waste Dept</option>
                  <option value="Water Supply & Drainage Board">Water Supply &amp; Drainage Board</option>
                  <option value="Electrical & Street Lighting Dept">Electrical &amp; Street Lighting Dept</option>
                  <option value="Traffic & Transit Authority">Traffic &amp; Transit Authority</option>
                  <option value="Municipal Operations Dept">Municipal Operations Dept</option>
                </select>
              </div>
              <div className="space-y-1.5 pt-1">
                <div className="flex items-center justify-between">
                  <label className="font-semibold text-[#13345D]">Admin 2FA PIN</label>
                  <span className="text-[11px] font-mono text-[#64748B]">PIN: {DEFAULT_PIN_ADMIN}</span>
                </div>
                <PinBoxInput value={provPin} onChange={setProvPin} idPrefix="prov-auth-pin" />
              </div>

              {provError && (
                <div className="p-2.5 rounded-lg bg-[#FEF2F2] border border-[#FCA5A5] text-[#DC2626]">
                  {provError}
                </div>
              )}

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowProvisionModal(false)}
                  className="flex-1 py-2.5 bg-white border border-[#CBD5E1] rounded-lg font-semibold text-[#13345D]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={provisioningAuth}
                  className="flex-1 py-2.5 bg-[#15427B] hover:bg-[#0F2F5A] text-white rounded-lg font-semibold disabled:opacity-50"
                >
                  {provisioningAuth ? 'Provisioning...' : 'Create Authority Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ADMIN DELETE COMPLAINT CONFIRMATION MODAL */}
      {adminDeleteModal && (
        <div className="fixed inset-0 z-50 bg-[#0B2A52]/55 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-[#DCE7F5] rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <h3 className="text-lg font-bold text-[#13345D]">Delete This Civic Record?</h3>
            <p className="text-sm text-[#475569] leading-relaxed">
              Record <span className="font-mono font-semibold text-[#13345D]">{adminDeleteModal.ticketId}</span> and
              its report history will be permanently removed. This cannot be undone.
            </p>

            <div className="flex items-center gap-6 pt-2">
              <button
                type="button"
                onClick={() => setAdminDeleteModal(null)}
                className="text-sm font-semibold text-[#64748B] hover:text-[#13345D] transition-colors"
                disabled={deletingIssue}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={executeDeleteIssue}
                disabled={deletingIssue}
                className="text-sm font-semibold text-[#DC2626] hover:text-[#B91C1C] transition-colors disabled:opacity-50"
              >
                {deletingIssue ? 'Deleting...' : 'Confirm Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
