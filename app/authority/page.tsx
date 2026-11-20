'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  ALL_ISSUE_STATUSES,
  auth,
  buildFirestoreErrorInfo,
  db,
  OperationType,
} from '@/lib/firebase';
import { signOut, onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import {
  collection,
  getDocs,
  doc,
  deleteDoc,
  getDoc,
  query,
  where,
  setDoc,
  addDoc,
  updateDoc,
} from 'firebase/firestore';
import { logSecurityEvent, DEFAULT_PIN_AUTHORITY } from '@/lib/audit';
import { LanguageSelector, useLanguage } from '@/lib/LanguageContext';
import { PinBoxInput } from '@/components/PinBoxInput';
import { StatusDot, SeverityDot } from '@/components/StatusIndicator';
import { motion } from 'motion/react';
import {
  Building2,
  LogOut,
  Video,
  CheckCircle2,
  AlertTriangle,
  MapPin,
  RefreshCw,
  Search,
  X,
  RotateCcw,
  ShieldCheck,
  ShieldAlert,
  Users,
  ThumbsUp,
  ThumbsDown,
  AlertCircle,
  KeyRound,
  Clock,
  Check,
  Trash2,
  Bell,
  VideoOff,
} from 'lucide-react';
import { uploadResolutionVideoToStorage } from '@/lib/storage';
import { fetchRoleNotifications, markNotificationRead } from '@/lib/notifications';
import { NotificationRecord, RVEResult } from '@/lib/types/civic';

interface AIAnalysis {
  category: string;
  issueType: string;
  description: string;
  severity: string;
  department: string;
  confidenceScore: number;
  keyObservations?: string[];
}

interface IssueReport {
  id: string;
  ticketId: string;
  userId: string;
  userEmail: string;
  title: string;
  category: string;
  issueType: string;
  description: string;
  severity: string;
  department: string;
  location: {
    latitude: number | null;
    longitude: number | null;
    address: string;
    city: string;
    area: string;
  };
  imageUrl: string;
  aiAnalysis: AIAnalysis;
  status:
    | 'Submitted'
    | 'Assigned'
    | 'Acknowledged'
    | 'In Progress'
    | 'Under Verification'
    | 'Resolved'
    | 'Closed'
    | 'Rejected'
    | 'Resolution Failed';
  createdAt: any;
  upvotes?: number;
  parentId?: string | null;
  isDuplicate?: boolean;
  duplicateCount?: number;
  supportersCount?: number;
  supporters?: string[];
  evidencePhotos?: string[];
  duplicateMatchInfo?: any;

  // Resolution proof fields
  resolvedAt?: string;
  resolvedBy?: string;
  resolutionVideoUrl?: string;
  resolutionVideoFrames?: string[];
  resolutionAiAudit?: {
    isAuthentic: boolean;
    confidenceScore: number;
    locationMatchScore: number;
    visualResolutionMatch: boolean;
    verificationSummary: string;
    detectedFixes: string[];
    rejectionReason?: string;
    finalOutcome?: 'Verified' | 'Rejected';
    failureGate?: string | null;
    gates?: RVEResult['gates'];
  };
  communityVotes?: Array<{
    userId: string;
    userEmail: string;
    vote: 'yes' | 'no';
    comment: string;
    createdAt: string;
    distanceKm?: number;
  }>;
  voteStats?: {
    yes: number;
    no: number;
  };
  isDisputed?: boolean;
}

const CATEGORIES = [
  'All Categories',
  'Roads & Infrastructure',
  'Waste & Sanitation',
  'Water & Drainage',
  'Power & Street Lighting',
  'Traffic & Public Transit',
  'Parks & Public Spaces',
  'Public Safety & Vandalism',
  'Other',
];

function formatCreatedDate(createdAt: any) {
  if (createdAt?.seconds) {
    return new Date(createdAt.seconds * 1000).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  }
  if (createdAt) {
    const d = new Date(createdAt);
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });
    }
  }
  return 'Recent';
}

export default function AuthorityDashboard() {
  const router = useRouter();
  const { t } = useLanguage();
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [loading, setLoading] = useState(true);

  // Issues list
  const [issues, setIssues] = useState<IssueReport[]>([]);
  const [loadingIssues, setLoadingIssues] = useState(false);
  const [portalError, setPortalError] = useState<string | null>(null);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [categoryFilter, setCategoryFilter] = useState<string>('All Categories');
  const [severityFilter, setSeverityFilter] = useState<string>('All');
  const [portalNotice, setPortalNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [deleteConfirmIssue, setDeleteConfirmIssue] = useState<IssueReport | null>(null);
  const [deletingIssue, setDeletingIssue] = useState(false);

  // Selected Issue for inspection
  const [selectedIssue, setSelectedIssue] = useState<IssueReport | null>(null);
  const [inspectModalOpen, setInspectModalOpen] = useState(false);

  // Resolution Recording Studio Modal
  const [resolveModalOpen, setResolveModalOpen] = useState(false);
  const [targetIssue, setTargetIssue] = useState<IssueReport | null>(null);

  // Camera & Geolocation State for Resolution
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cameraRequestIdRef = useRef(0);
  const [mediaStream, setMediaStream] = useState<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraLoading, setCameraLoading] = useState(false);

  const [authorityGps, setAuthorityGps] = useState<{
    latitude: number | null;
    longitude: number | null;
    address: string;
    loading: boolean;
    error: string | null;
  }>({
    latitude: null,
    longitude: null,
    address: '',
    loading: false,
    error: null,
  });

  // Timetag live timer
  const [liveTimestamp, setLiveTimestamp] = useState<string>('');

  // Government Security PIN Verification State
  const [showPinModal, setShowPinModal] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState('');
  const [pinPendingAction, setPinPendingAction] = useState<(() => Promise<void>) | null>(null);
  const [pinActionTitle, setPinActionTitle] = useState('');

  // Recording timer (30 seconds requirement)
  const [recording, setRecording] = useState(false);
  const [recordSecondsLeft, setRecordSecondsLeft] = useState(30);
  const [recordedFrames, setRecordedFrames] = useState<string[]>([]);
  const [recordedVideoBlobUrl, setRecordedVideoBlobUrl] = useState<string | null>(null);
  const [recordedVideoBlob, setRecordedVideoBlob] = useState<Blob | null>(null);

  // Notifications
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);

  // AI Verification execution state
  const [verifyingWithAi, setVerifyingWithAi] = useState(false);
  const [verifyingStage, setVerifyingStage] = useState('');
  const [aiAuditResult, setAiAuditResult] = useState<{
    isAuthentic: boolean;
    confidenceScore: number;
    locationMatchScore: number;
    visualResolutionMatch: boolean;
    verificationSummary: string;
    detectedFixes: string[];
    rejectionReason?: string;
    gates?: RVEResult['gates'];
    failureGate?: string | null;
    finalOutcome?: 'Verified' | 'Rejected';
  } | null>(null);

  const [auditError, setAuditError] = useState<string | null>(null);
  const [updatingFirestore, setUpdatingFirestore] = useState(false);

  // Helper to request PIN verification before high-level authority actions
  const requireSecurityPin = (actionTitle: string, actionFn: () => Promise<void>) => {
    setPinActionTitle(actionTitle);
    setPinPendingAction(() => actionFn);
    setPinInput('');
    setPinError('');
    setShowPinModal(true);
  };

  const handleVerifyPinAndExecute = async (e: React.FormEvent) => {
    e.preventDefault();
    setPinError('');

    if (pinInput.trim() !== DEFAULT_PIN_AUTHORITY) {
      await logSecurityEvent({
        userId: user?.uid || 'authority_official',
        email: user?.email || 'authority@crowdcivic.org',
        role: 'authority',
        action: 'SECURITY_PIN_FAILED',
        portal: 'authority',
        status: 'DENIED',
        details: `Failed 2FA Security PIN attempt for action: "${pinActionTitle}"`,
      });
      setPinError('Invalid Municipal Passkey PIN. Please check your credentials.');
      return;
    }

    await logSecurityEvent({
      userId: user?.uid || 'authority_official',
      email: user?.email || 'authority@crowdcivic.org',
      role: 'authority',
      action: 'SECURITY_PIN_VERIFIED',
      portal: 'authority',
      status: 'SUCCESS',
      details: `2FA Municipal Security Passkey verified for action: "${pinActionTitle}"`,
    });

    setShowPinModal(false);
    if (pinPendingAction) {
      await pinPendingAction();
      setPinPendingAction(null);
    }
  };

  // Check auth and authority role
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
      setUser(effUser);

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

        if (userRole !== 'authority') {
          router.push(userRole === 'admin' ? '/admin' : '/citizen');
          return;
        }
      } catch (e) {
        console.warn('Authority role verification error:', e);
      }

      setLoading(false);
      fetchIssues();
      fetchRoleNotifications('authority', effUser.uid).then(setNotifications);
    });

    return () => unsubscribe();
  }, [router]);

  // Attach mediaStream cleanly whenever modal mounts <video>
  useEffect(() => {
    if (resolveModalOpen && mediaStream && videoRef.current) {
      videoRef.current.srcObject = mediaStream;
    }
  }, [resolveModalOpen, mediaStream]);

  // Clock tick for live timetag overlay
  useEffect(() => {
    const interval = setInterval(() => {
      setLiveTimestamp(new Date().toISOString().replace('T', ' ').substring(0, 19) + ' UTC');
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Fetch all issues from Firestore (explicit status filter satisfies Firestore query rules)
  const fetchIssues = async () => {
    setLoadingIssues(true);
    setPortalError(null);
    try {
      const q = query(collection(db, 'issues'), where('status', 'in', [...ALL_ISSUE_STATUSES]));
      const snapshot = await getDocs(q);
      const list: IssueReport[] = snapshot.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<IssueReport, 'id'>),
      }));

      list.sort((a, b) => {
        const timeA = a.createdAt?.seconds ? a.createdAt.seconds * 1000 : new Date(a.createdAt || 0).getTime();
        const timeB = b.createdAt?.seconds ? b.createdAt.seconds * 1000 : new Date(b.createdAt || 0).getTime();
        return timeB - timeA;
      });

      setIssues(list);
    } catch (err) {
      const errInfo = buildFirestoreErrorInfo(err, OperationType.LIST, 'issues');
      console.error('Firestore Error: ', JSON.stringify(errInfo));
      if (!auth.currentUser) {
        setPortalError('Session expired or Firebase Auth is inactive. Please sign out and sign in again.');
      } else {
        setPortalError('Unable to load municipal incidents right now. Try refreshing.');
      }
    } finally {
      setLoadingIssues(false);
    }
  };

  // Get Authority's Live Geolocation
  const getAuthorityLocation = () => {
    if (!navigator.geolocation) {
      setAuthorityGps({
        latitude: null,
        longitude: null,
        address: '',
        loading: false,
        error: 'Geolocation not supported by device. Live GPS is required to record verification video.',
      });
      return;
    }

    setAuthorityGps((prev) => ({ ...prev, loading: true, error: null }));

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;

        try {
          const MAX_MULTIPART_BYTES = 3 * 1024 * 1024;

      const sendJsonFallback = async (): Promise<Response> => {
        const jsonController = new AbortController();
        const jsonTimer = setTimeout(() => jsonController.abort(), 50000);
        try {
          return await fetch('/api/verify-resolution', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
            },
            body: JSON.stringify(metadata),
            signal: jsonController.signal,
          });
        } finally {
          clearTimeout(jsonTimer);
        }
      };

      let res: Response;
      if (recordedVideoBlob && recordedVideoBlob.size <= MAX_MULTIPART_BYTES) {
        const mpController = new AbortController();
        const mpTimer = setTimeout(() => mpController.abort(), 50000);
        try {
          const formData = new FormData();
          formData.append('video', recordedVideoBlob, `resolution_${targetIssue.ticketId}.webm`);
          formData.append('metadata', JSON.stringify(metadata));
          res = await fetch('/api/verify-resolution', {
            method: 'POST',
            headers: idToken ? { Authorization: `Bearer ${idToken}` } : undefined,
            body: formData,
            signal: mpController.signal,
          });
          if (res.status === 413 && recordedFrames.length >= 3) {
            res = await sendJsonFallback();
          }
        } catch (mpErr: any) {
          clearTimeout(mpTimer);
          if (mpErr?.name !== 'AbortError' && recordedFrames.length >= 3) {
            setVerifyingStage('Retrying with compact keyframe payload...');
            res = await sendJsonFallback();
          } else {
            throw mpErr;
          }
        } finally {
          clearTimeout(mpTimer);
        }
      } else {
        res = await sendJsonFallback();
      }

      const rawText = await res.text();
      let data: any = {};
      try {
        data = rawText ? JSON.parse(rawText) : {};
      } catch {
        data = {
          success: false,
          error: `Verification server returned unexpected response (HTTP ${res.status}). Please retry.`,
        };
      }
            const addr = data.address || {};
            const road = addr.road || addr.suburb || addr.neighbourhood || '';
            const city = addr.city || addr.town || addr.village || 'City Zone';
            const formatted =
              [road, city].filter(Boolean).join(', ') || data.display_name || `${lat.toFixed(4)}°, ${lng.toFixed(4)}°`;

            setAuthorityGps({
              latitude: lat,
              longitude: lng,
              address: formatted,
              loading: false,
              error: null,
            });
            return;
          }
        } catch {
          // Silent fallback
        }

        setAuthorityGps({
          latitude: lat,
          longitude: lng,
          address: `Authority On-Site Pin (${lat.toFixed(4)}°, ${lng.toFixed(4)}°)`,
          loading: false,
          error: null,
        });
      },
      (err) => {
        console.warn('Authority geolocation error:', err);
        setAuthorityGps({
          latitude: null,
          longitude: null,
          address: '',
          loading: false,
          error:
            err?.code === 1
              ? 'Location permission denied. Allow GPS access in browser settings and click "Refresh GPS" to unlock recording.'
              : 'Unable to lock live GPS coordinates. Enable device GPS and click "Refresh GPS".',
        });
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
    );
  };

  // Strictly release camera hardware tracks and detach video element
  const stopAuthorityCamera = (cancelActiveRecording = false) => {
    // Invalidate any pending getUserMedia request so late resolutions cannot turn camera back on
    cameraRequestIdRef.current += 1;

    if (recordIntervalRef.current) {
      clearInterval(recordIntervalRef.current);
      recordIntervalRef.current = null;
    }

    if (mediaRecorderRef.current) {
      const rec = mediaRecorderRef.current;
      mediaRecorderRef.current = null;
      if (cancelActiveRecording) {
        rec.onstop = null;
        rec.ondataavailable = null;
      }
      if (rec.state !== 'inactive') {
        try {
          rec.stop();
        } catch {
          // ignore
        }
      }
    }

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }

    setMediaStream((prev) => {
      if (prev) {
        prev.getTracks().forEach((track) => track.stop());
      }
      return null;
    });

    if (videoRef.current) {
      try {
        videoRef.current.pause();
        videoRef.current.srcObject = null;
        videoRef.current.load();
      } catch {
        // ignore
      }
    }

    setCameraLoading(false);
    if (cancelActiveRecording) {
      setRecording(false);
    }
  };

  // Automatically turn camera off when tab is hidden, page unloads, or component unmounts
  useEffect(() => {
    const handleVisibilityOrHide = () => {
      if (typeof document !== 'undefined' && document.hidden) {
        stopAuthorityCamera(true);
      }
    };
    const handlePageHide = () => {
      stopAuthorityCamera(true);
    };

    document.addEventListener('visibilitychange', handleVisibilityOrHide);
    window.addEventListener('pagehide', handlePageHide);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityOrHide);
      window.removeEventListener('pagehide', handlePageHide);
      stopAuthorityCamera(true);
    };
  }, []);

  const requestAuthorityCamera = async () => {
    // Stop any previous stream cleanly before starting a fresh request
    stopAuthorityCamera(true);

    const requestId = ++cameraRequestIdRef.current;
    setCameraError(null);
    setCameraLoading(true);

    if (
      typeof navigator === 'undefined' ||
      !navigator.mediaDevices ||
      !navigator.mediaDevices.getUserMedia
    ) {
      setCameraLoading(false);
      setCameraError(
        'Live camera capture is unavailable in this browser context. Please open the portal in a standard HTTPS browser tab with camera support.'
      );
      return;
    }

    try {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 640 }, height: { ideal: 480 } },
          audio: false,
        });
      } catch (constraintErr: any) {
        if (
          constraintErr?.name === 'OverconstrainedError' ||
          constraintErr?.name === 'NotFoundError'
        ) {
          stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        } else {
          throw constraintErr;
        }
      }

      // Guard against modal closing or user cancelling before getUserMedia resolved
      if (requestId !== cameraRequestIdRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      mediaStreamRef.current = stream;
      setMediaStream(stream);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err: any) {
      if (requestId !== cameraRequestIdRef.current) return;
      console.warn('Authority camera access unavailable:', err?.name || err);
      const errName = err?.name || '';
      if (errName === 'NotAllowedError' || errName === 'PermissionDeniedError') {
        setCameraError(
          'Camera permission was denied. Allow Camera access in your browser site settings (or open outside an embedded preview) and click Turn On Camera.'
        );
      } else if (errName === 'NotFoundError' || errName === 'DevicesNotFoundError') {
        setCameraError(
          'No active camera was found on this device. Connect a camera and click Turn On Camera.'
        );
      } else if (errName === 'NotReadableError' || errName === 'TrackStartError') {
        setCameraError(
          'Your camera is currently in use by another application. Close it and click Turn On Camera.'
        );
      } else {
        setCameraError('Camera permission is required to record the 30-second live verification video.');
      }
    } finally {
      if (requestId === cameraRequestIdRef.current) {
        setCameraLoading(false);
      }
    }
  };

  // Open Resolution Camera Studio (camera stays OFF until user explicitly turns it on)
  const openResolutionStudio = (issue: IssueReport) => {
    stopAuthorityCamera(true);
    if (recordedVideoBlobUrl) {
      URL.revokeObjectURL(recordedVideoBlobUrl);
    }
    setTargetIssue(issue);
    setResolveModalOpen(true);
    setAiAuditResult(null);
    setAuditError(null);
    setCameraError(null);
    setRecordedFrames([]);
    setRecordedVideoBlobUrl(null);
    setRecordedVideoBlob(null);
    setRecording(false);
    setRecordSecondsLeft(30);
    setVerifyingStage('');

    getAuthorityLocation();
  };

  // Close Resolution Studio and immediately turn off camera hardware
  const closeResolutionStudio = () => {
    stopAuthorityCamera(true);
    if (recordedVideoBlobUrl) {
      URL.revokeObjectURL(recordedVideoBlobUrl);
    }
    setRecordedVideoBlobUrl(null);
    setRecordedVideoBlob(null);
    setCameraError(null);
    setResolveModalOpen(false);
    setTargetIssue(null);
    setRecording(false);
    setVerifyingStage('');
  };

  // Start 30-Second Video Recording (automatically turns camera OFF as soon as recording completes)
  const start30SecRecording = () => {
    const activeStream = mediaStreamRef.current || mediaStream;
    if (!activeStream) {
      setCameraError('Camera is currently off. Click "Turn On Camera" first to start recording.');
      return;
    }

    if (authorityGps.latitude === null || authorityGps.longitude === null) {
      setAuditError(
        'Live GPS lock is mandatory before starting the 30-second video. Allow location access and click "Refresh GPS".'
      );
      getAuthorityLocation();
      return;
    }

    const currentDelta = getDeltaDistanceDisplay(targetIssue);
    if (!currentDelta) {
      setAuditError(
        'Complaint GPS coordinates are missing, so the mandatory 20m geofence check cannot be verified.'
      );
      return;
    }

    if (currentDelta.meters > 20) {
      setAuditError(
        `Recording blocked by Gate 1 Geofence: You are ${
          currentDelta.meters < 1000 ? `${currentDelta.meters}m` : `${currentDelta.km.toFixed(2)}km`
        } away from the complaint site. Move within 20m and click "Refresh GPS" to unlock recording.`
      );
      return;
    }

    if (recordedVideoBlobUrl) {
      URL.revokeObjectURL(recordedVideoBlobUrl);
    }
    setRecordedFrames([]);
    setRecordedVideoBlobUrl(null);
    setRecordedVideoBlob(null);
    setAiAuditResult(null);
    setAuditError(null);
    setRecording(true);
    setRecordSecondsLeft(30);

    const chunks: Blob[] = [];
    const framesAcc: string[] = [];

    captureFrameSnapshot(framesAcc);

    let recorder: MediaRecorder;
    try {
      const preferredMime =
        typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported('video/webm;codecs=vp8')
          ? 'video/webm;codecs=vp8'
          : 'video/webm';
      recorder = new MediaRecorder(activeStream, {
        mimeType: preferredMime,
        videoBitsPerSecond: 350_000,
      });
    } catch {
      try {
        recorder = new MediaRecorder(activeStream, { videoBitsPerSecond: 350_000 });
      } catch {
        recorder = new MediaRecorder(activeStream);
      }
    }

    mediaRecorderRef.current = recorder;

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };

    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: 'video/webm' });
      const url = URL.createObjectURL(blob);
      setRecordedVideoBlob(blob);
      setRecordedVideoBlobUrl(url);
      setRecordedFrames([...framesAcc]);
      setRecording(false);
      // Automatically turn off hardware camera immediately once recording finishes
      stopAuthorityCamera(false);
    };

    recorder.start(1000);

    let seconds = 30;
    if (recordIntervalRef.current) {
      clearInterval(recordIntervalRef.current);
    }
    recordIntervalRef.current = setInterval(() => {
      seconds -= 1;
      setRecordSecondsLeft(seconds);

      if (seconds % 5 === 0) {
        captureFrameSnapshot(framesAcc);
      }

      if (seconds <= 0) {
        if (recordIntervalRef.current) {
          clearInterval(recordIntervalRef.current);
          recordIntervalRef.current = null;
        }
        if (recorder && recorder.state !== 'inactive') {
          recorder.stop();
        } else {
          setRecording(false);
          setRecordedFrames([...framesAcc]);
          stopAuthorityCamera(false);
        }
      }
    }, 1000);
  };

  // Re-record handler: explicitly turns camera back on only when user requests a new take
  const handleStartRerecord = async () => {
    if (recordedVideoBlobUrl) {
      URL.revokeObjectURL(recordedVideoBlobUrl);
    }
    setRecordedFrames([]);
    setRecordedVideoBlobUrl(null);
    setRecordedVideoBlob(null);
    setAiAuditResult(null);
    setAuditError(null);
    await requestAuthorityCamera();
  };

  // Helper to capture canvas frame with burned-in timetag & GPS overlay
  const captureFrameSnapshot = (container: string[]) => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      canvas.width = 480;
      canvas.height = 360;

      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        ctx.fillStyle = 'rgba(8, 48, 75, 0.85)';
        ctx.fillRect(10, canvas.height - 60, canvas.width - 20, 50);

        ctx.font = 'bold 12px monospace';
        ctx.fillStyle = '#38BDF8';
        ctx.fillText(`TIMETAG: ${new Date().toISOString()}`, 15, canvas.height - 38);

        ctx.font = '10px sans-serif';
        ctx.fillStyle = '#FFFFFF';
        const gpsStr = authorityGps.latitude
          ? `GPS: ${authorityGps.latitude.toFixed(5)}°N, ${authorityGps.longitude?.toFixed(5)}°E | ${authorityGps.address}`
          : 'GPS: Location Tagged';
        ctx.fillText(gpsStr, 15, canvas.height - 18);

        const dataUrl = canvas.toDataURL('image/jpeg', 0.6);
        container.push(dataUrl);
      }
    }
  };

  // Submit Video to 3-Gate Resolution Verification Engine (RVE) API
  const handleVerifyResolution = async () => {
    if (!targetIssue) return;
    if (recordedFrames.length === 0 && !recordedVideoBlob) {
      setAuditError('Please complete the 30-second live video recording first.');
      return;
    }

    // Guarantee camera is off before submitting verification
    stopAuthorityCamera(true);
    setVerifyingWithAi(true);
    setVerifyingStage('Uploading video evidence...');
    setAuditError(null);

    try {
      const captureTimestamp = new Date().toISOString();
      let videoStorageUrl: string | null = null;
      let videoStoragePath: string | null = null;

      if (recordedVideoBlob) {
        const uploadRes = await uploadResolutionVideoToStorage({
          complaintId: targetIssue.id,
          videoBlob: recordedVideoBlob,
          authorityUid: user?.uid || 'authority_official',
        });
        if (uploadRes.ok && uploadRes.url) {
          videoStorageUrl = uploadRes.url;
          videoStoragePath = uploadRes.storagePath || null;
        }
      }

      setVerifyingStage('Running 3-Gate AI Verification (GPS, Timestamp, Gemini)...');

      const metadata = {
        issueId: targetIssue.id,
        complaintId: targetIssue.id,
        authorityUid: user?.uid || 'authority_official',
        authorityEmail: user?.email || 'Authority Official',
        captureTimestamp,
        videoStorageUrl,
        videoStoragePath,
        videoFramesBase64: recordedFrames,
        authorityLocation: {
          latitude: authorityGps.latitude,
          longitude: authorityGps.longitude,
          address: authorityGps.address,
          timestamp: captureTimestamp,
        },
        citizenLocation: {
          latitude: targetIssue.location.latitude,
          longitude: targetIssue.location.longitude,
          address: targetIssue.location.address,
        },
        issueDetails: {
          id: targetIssue.id,
          ticketId: targetIssue.ticketId,
          title: targetIssue.title,
          category: targetIssue.category,
          description: targetIssue.description,
          imageUrl: targetIssue.imageUrl,
        },
      };

      const idToken = auth.currentUser ? await auth.currentUser.getIdToken().catch(() => null) : null;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 45000);
      let res: Response;

      try {
        if (recordedVideoBlob && recordedVideoBlob.size <= 4 * 1024 * 1024) {
          const formData = new FormData();
          formData.append('video', recordedVideoBlob, `resolution_${targetIssue.ticketId}.webm`);
          formData.append('metadata', JSON.stringify(metadata));
          res = await fetch('/api/verify-resolution', {
            method: 'POST',
            headers: idToken ? { Authorization: `Bearer ${idToken}` } : undefined,
            body: formData,
            signal: controller.signal,
          });
        } else {
          res = await fetch('/api/verify-resolution', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
            },
            body: JSON.stringify(metadata),
            signal: controller.signal,
          });
        }
      } finally {
        clearTimeout(timeoutId);
      }

      const data = await res.json();

      if (res.ok && data.success && data.verification) {
        // On Starter Tier projects where Admin SDK write lacks IAM permissions,
        // persist RVE outcome and structured records using the authenticated Authority client SDK.
        if (data.persistedVia === 'client_required' && data.persistencePayloads) {
          setVerifyingStage('Saving verification audit records...');
          const {
            issueUpdatePayload,
            verificationRecord,
            auditEntry,
            manualQueueItem,
            notificationsToCreate,
          } = data.persistencePayloads;

          const writes: Promise<unknown>[] = [
            updateDoc(doc(db, 'issues', targetIssue.id), issueUpdatePayload),
            addDoc(collection(db, 'resolutionVerifications'), verificationRecord),
            addDoc(collection(db, 'auditLogs'), auditEntry),
          ];
          if (manualQueueItem) {
            writes.push(addDoc(collection(db, 'manualVerificationQueue'), manualQueueItem));
          }
          if (Array.isArray(notificationsToCreate)) {
            for (const notif of notificationsToCreate) {
              writes.push(addDoc(collection(db, 'notifications'), notif));
            }
          }
          const results = await Promise.allSettled(writes);
          const failed = results.filter((r) => r.status === 'rejected');
          if (failed.length > 0) {
            console.warn('Some RVE Firestore client writes failed:', failed);
          }
        }

        setAiAuditResult({
          ...data.verification,
          gates: data.rveResult?.gates,
          failureGate: data.rveResult?.failureGate,
          finalOutcome: data.finalOutcome,
        });
        fetchIssues();
        fetchRoleNotifications('authority', user?.uid).then(setNotifications);
      } else {
        setAuditError(data.error || 'Failed to analyze video verification proof.');
      }
    } catch (err: any) {
      console.warn('Notice verifying video with RVE:', err?.message || err);
      if (err?.name === 'AbortError') {
        setAuditError('Verification timed out after 45 seconds. Please check your connection and try submitting again.');
      } else {
        setAuditError('Network or server error during 3-Gate Resolution Verification.');
      }
    } finally {
      setVerifyingWithAi(false);
      setVerifyingStage('');
    }
  };

  // Acknowledge or update status via backend lifecycle transition API (cannot mark Resolved directly)
  const transitionIssueStatus = (issue: IssueReport, targetStatus: 'Acknowledged' | 'In Progress') => {
    requireSecurityPin(`Transition Ticket #${issue.ticketId} status to "${targetStatus}"`, async () => {
      setUpdatingFirestore(true);
      setPortalError(null);
      setPortalNotice(null);
      try {
        const idToken = auth.currentUser ? await auth.currentUser.getIdToken().catch(() => null) : null;
        const res = await fetch('/api/complaints/transition', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
          },
          body: JSON.stringify({
            complaintId: issue.id,
            targetStatus,
            actorUid: user?.uid || 'authority_official',
            actorEmail: user?.email || 'authority@crowdcivic.org',
            actorRole: 'authority',
          }),
        });

        const data = await res.json();
        if (!res.ok || !data.success) {
          setPortalError(data.error || `Could not transition ticket to ${targetStatus}.`);
          return;
        }

        setPortalNotice({
          type: 'success',
          message: `Ticket #${issue.ticketId} transitioned from "${data.previousStatus}" to "${data.newStatus}".`,
        });
        fetchIssues();
      } catch (err) {
        console.error('Error updating ticket lifecycle:', err);
        setPortalError('Could not update ticket status. Please check your connection and try again.');
      } finally {
        setUpdatingFirestore(false);
      }
    });
  };

  // Delete AI Resolved issue from Firestore
  const executeDeleteResolvedIssue = async () => {
    if (!deleteConfirmIssue || deleteConfirmIssue.status !== 'Resolved') return;
    setDeletingIssue(true);
    setPortalError(null);
    setPortalNotice(null);
    try {
      await deleteDoc(doc(db, 'issues', deleteConfirmIssue.id));
      await logSecurityEvent({
        userId: user?.uid || 'authority_official',
        email: user?.email || 'authority@crowdcivic.org',
        role: 'authority',
        action: 'AUTHORITY_DELETE_RESOLVED_ISSUE',
        portal: 'authority',
        status: 'SUCCESS',
        details: `Authority deleted AI Resolved ticket #${deleteConfirmIssue.ticketId} (${deleteConfirmIssue.title})`,
      });

      setIssues((prev) => prev.filter((item) => item.id !== deleteConfirmIssue.id));
      if (selectedIssue?.id === deleteConfirmIssue.id) {
        setInspectModalOpen(false);
        setSelectedIssue(null);
      }
      setPortalNotice({
        type: 'success',
        message: `AI Resolved report #${deleteConfirmIssue.ticketId} was permanently deleted.`,
      });
      setDeleteConfirmIssue(null);
    } catch (err: any) {
      const errInfo = buildFirestoreErrorInfo(err, OperationType.DELETE, `issues/${deleteConfirmIssue.id}`);
      console.error('Firestore Error: ', JSON.stringify(errInfo));
      setPortalError(`Could not delete resolved report: ${err?.message || 'Please try again.'}`);
    } finally {
      setDeletingIssue(false);
    }
  };

  const handleCardStatusFilter = (targetStatus: string) => {
    if (targetStatus === 'All') {
      setStatusFilter('All');
      return;
    }
    setStatusFilter((prev) => (prev === targetStatus ? 'All' : targetStatus));
  };

  // Filtered issues calculation
  const filteredIssues = issues.filter((issue) => {
    const q = searchQuery.toLowerCase();
    const matchesSearch =
      issue.ticketId.toLowerCase().includes(q) ||
      issue.title.toLowerCase().includes(q) ||
      issue.category.toLowerCase().includes(q) ||
      issue.description.toLowerCase().includes(q) ||
      (issue.location?.address || '').toLowerCase().includes(q);

    const matchesStatus =
      statusFilter === 'All' ||
      (statusFilter === 'Pending Review'
        ? issue.status === 'Submitted' ||
          issue.status === 'Assigned' ||
          issue.status === 'Acknowledged' ||
          issue.status === 'Under Verification'
        : statusFilter === 'Resolution Failed'
        ? issue.status === 'Rejected' || issue.status === 'Resolution Failed'
        : statusFilter === 'Resolved'
        ? issue.status === 'Resolved' || issue.status === 'Closed'
        : issue.status === statusFilter);
    const matchesCategory = categoryFilter === 'All Categories' || issue.category === categoryFilter;
    const matchesSeverity = severityFilter === 'All' || issue.severity === severityFilter;

    return matchesSearch && matchesStatus && matchesCategory && matchesSeverity;
  });

  // Calculate stats
  const totalCount = issues.length;
  const pendingCount = issues.filter(
    (i) =>
      i.status === 'Submitted' ||
      i.status === 'Assigned' ||
      i.status === 'Acknowledged' ||
      i.status === 'Under Verification'
  ).length;
  const progressCount = issues.filter((i) => i.status === 'In Progress').length;
  const resolvedCount = issues.filter((i) => i.status === 'Resolved' || i.status === 'Closed').length;
  const failedCount = issues.filter(
    (i) => i.status === 'Rejected' || i.status === 'Resolution Failed'
  ).length;

  const handleSignOut = async () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('user_role');
      localStorage.removeItem('user_email');
      localStorage.removeItem('user_uid');
    }
    await signOut(auth);
    window.location.href = '/';
  };

  const getDeltaDistanceDisplay = (issue: IssueReport | null) => {
    if (
      !issue ||
      authorityGps.latitude === null ||
      authorityGps.longitude === null ||
      issue.location?.latitude === null ||
      issue.location?.latitude === undefined ||
      issue.location?.longitude === null ||
      issue.location?.longitude === undefined
    ) {
      return null;
    }
    const R = 6371000;
    const radLat1 = (authorityGps.latitude * Math.PI) / 180;
    const radLat2 = (issue.location.latitude * Math.PI) / 180;
    const dLat = ((issue.location.latitude - authorityGps.latitude) * Math.PI) / 180;
    const dLon = ((issue.location.longitude - authorityGps.longitude) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(radLat1) * Math.cos(radLat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const meters = Math.round(R * c);
    return { km: meters / 1000, meters };
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F4F8FD] flex items-center justify-center text-[#13345D]">
        <div className="bg-white border border-[#DCE7F5] rounded-2xl px-6 py-5 flex items-center gap-3 shadow-xs">
          <RefreshCw className="w-5 h-5 animate-spin text-[#15427B]" />
          <span className="text-sm font-medium">Loading Authority Portal...</span>
        </div>
      </div>
    );
  }

  const distanceInfo = getDeltaDistanceDisplay(targetIssue);
  const hasLiveAuthorityGps = authorityGps.latitude !== null && authorityGps.longitude !== null;
  const isGeofenceReady = hasLiveAuthorityGps && distanceInfo !== null && distanceInfo.meters <= 20;

  return (
    <div className="min-h-screen bg-[#F4F8FD] text-[#13345D] flex flex-col font-sans">
      {/* Hidden Canvas for Video Snapshots */}
      <canvas ref={canvasRef} className="hidden" />

      {/* TOP DARK NAVY GOVERNANCE UTILITY BAR */}
      <div className="hidden sm:block w-full bg-[#0B2A52] text-white text-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-9 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5 truncate">
            <span className="font-semibold tracking-tight whitespace-nowrap">CrowdCivic AI</span>
            <span className="text-white/40" aria-hidden="true">
              |
            </span>
            <span className="text-white/85 truncate">Municipal Authority Operations Portal</span>
          </div>
          <div className="flex items-center gap-4 text-white/85 shrink-0">
            <span className="hidden md:inline">3-Gate AI Resolution Audit Active</span>
            <span className="text-white/40 hidden md:inline">|</span>
            <span className="font-medium text-white truncate max-w-[200px]">{user?.email}</span>
          </div>
        </div>
      </div>

      {/* STICKY WHITE HEADER BAR (Matches Landing Page Brand Lockup) */}
      <header className="bg-white border-b border-[#E2E8F0] sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-[68px] flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-[#133B6E] text-white flex items-center justify-center relative shadow-xs shrink-0">
              <Building2 className="w-5 h-5" />
              <span className="w-2 h-2 rounded-full bg-[#F59E0B] absolute top-1.5 right-1.5" />
            </div>
            <div className="min-w-0">
              <div className="text-[17px] font-bold tracking-tight leading-tight flex items-center gap-1.5 truncate">
                <span className="text-[#13345D]">CrowdCivic</span>
                <span className="text-[#F59E0B]">AI</span>
                <span className="text-[#CBD5E1] font-normal hidden sm:inline">/</span>
                <span className="text-xs font-semibold text-[#15427B] hidden sm:inline">
                  {t('authority_portal', 'Authority Portal')}
                </span>
              </div>
              <span className="text-[9px] font-bold tracking-[0.16em] text-[#64748B] uppercase block mt-0.5 truncate">
                SMARTER CITIES, TOGETHER · {t('ai_verification_enabled', 'AI VERIFICATION')}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <LanguageSelector />

            <div className="relative">
              <button
                type="button"
                onClick={async () => {
                  setShowNotifications((prev) => !prev);
                  const list = await fetchRoleNotifications('authority', user?.uid);
                  setNotifications(list);
                }}
                aria-label="Authority notifications"
                className="relative p-2 rounded-lg border border-[#E2E8F0] hover:border-[#15427B] bg-white text-[#475569] hover:text-[#13345D] transition-colors"
              >
                <Bell className="w-4 h-4" />
                {notifications.filter((n) => !n.read).length > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[#DC2626] text-white text-[10px] font-bold flex items-center justify-center">
                    {notifications.filter((n) => !n.read).length}
                  </span>
                )}
              </button>

              {showNotifications && (
                <div className="absolute right-0 mt-2 w-80 bg-white border border-[#DCE7F5] rounded-2xl shadow-xl z-50 p-3 space-y-2">
                  <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-2">
                    <span className="text-xs font-bold text-[#13345D]">Dispatch &amp; RVE Alerts</span>
                    <button
                      type="button"
                      onClick={() => setShowNotifications(false)}
                      className="text-[#64748B] hover:text-[#13345D]"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="max-h-64 overflow-y-auto space-y-2">
                    {notifications.length === 0 ? (
                      <p className="text-xs text-[#64748B] py-4 text-center">No notifications yet.</p>
                    ) : (
                      notifications.map((n) => (
                        <button
                          key={n.id}
                          type="button"
                          onClick={async () => {
                            if (n.id && !n.read) {
                              await markNotificationRead(n.id);
                              setNotifications((prev) =>
                                prev.map((item) => (item.id === n.id ? { ...item, read: true } : item))
                              );
                            }
                          }}
                          className={`w-full text-left p-2.5 rounded-xl border text-xs transition-colors ${
                            n.read
                              ? 'bg-white border-[#E2E8F0] text-[#475569]'
                              : 'bg-[#EFF6FF]/70 border-[#BFDBFE] text-[#13345D]'
                          }`}
                        >
                          <p className="font-semibold">{n.title}</p>
                          <p className="text-[11px] text-[#64748B] mt-0.5 leading-snug">{n.message}</p>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            <button
              onClick={handleSignOut}
              className="text-xs font-semibold text-[#475569] hover:text-[#DC2626] flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[#E2E8F0] hover:border-[#FCA5A5] bg-white transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{t('signOut', 'Sign Out')}</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Body */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Title Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 text-[11px] font-bold tracking-wider uppercase text-[#15427B] mb-1">
              <span className="w-5 h-[2px] bg-[#F59E0B]" />
              <span>Municipal Field Dispatch</span>
            </div>
            <h1 className="text-2xl font-bold text-[#13345D] tracking-tight">
              {t('incidents_command', 'Incidents & Resolution Queue')}
            </h1>
            <p className="text-sm text-[#475569] mt-1">
              {t(
                'authority_subtitle',
                'Review citizen reports, update field progress, and record 30-second live video proof for AI verification.'
              )}
            </p>
          </div>

          <button
            onClick={fetchIssues}
            className="px-4 py-2.5 bg-white hover:bg-[#F4F8FD] text-[#13345D] text-xs font-semibold rounded-lg border border-[#CBD5E1] flex items-center gap-2 transition-colors self-start sm:self-auto shadow-xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-[#15427B] ${loadingIssues ? 'animate-spin' : ''}`} />
            <span>{t('refresh_incidents', 'Refresh Incidents')}</span>
          </button>
        </div>

        {portalError && (
          <div className="bg-white border border-[#FCA5A5] rounded-xl p-4 flex items-center justify-between gap-3">
            <div className="text-xs">
              <p className="font-semibold text-[#DC2626]">Action could not be completed</p>
              <p className="text-[#475569] mt-0.5">{portalError}</p>
            </div>
            <button
              onClick={() => setPortalError(null)}
              className="text-xs font-semibold text-[#64748B] hover:text-[#13345D]"
            >
              Dismiss
            </button>
          </div>
        )}

        {portalNotice && (
          <div
            className={`bg-white rounded-xl p-4 flex items-center justify-between gap-3 border ${
              portalNotice.type === 'success' ? 'border-[#BBF7D0] bg-[#ECFDF5]/60' : 'border-[#FCA5A5]'
            }`}
          >
            <div className="flex items-center gap-2.5 text-xs">
              <CheckCircle2
                className={`w-4 h-4 shrink-0 ${
                  portalNotice.type === 'success' ? 'text-[#0E8A4E]' : 'text-[#DC2626]'
                }`}
              />
              <p className="font-semibold text-[#13345D]">{portalNotice.message}</p>
            </div>
            <button
              type="button"
              onClick={() => setPortalNotice(null)}
              className="text-xs font-semibold text-[#64748B] hover:text-[#13345D]"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Top 5 Clickable Metric Cards with Landing Page Colored Top Borders */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <button
            type="button"
            onClick={() => handleCardStatusFilter('All')}
            aria-pressed={statusFilter === 'All'}
            className={`text-left bg-white p-4 rounded-2xl border border-[#E2E8F0] border-t-[3px] border-t-[#15427B] shadow-[0_2px_12px_rgba(15,41,74,0.04)] flex flex-col justify-between transition-all cursor-pointer hover:border-[#BFDBFE] hover:-translate-y-0.5 ${
              statusFilter === 'All' ? 'ring-2 ring-[#15427B] bg-[#EFF6FF]/60' : ''
            }`}
          >
            <div className="flex items-center justify-between gap-2 w-full">
              <span className="text-xs font-medium text-[#64748B]">{t('total_reports', 'Total Reports')}</span>
              {statusFilter === 'All' && (
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#15427B]">Active</span>
              )}
            </div>
            <span className="text-2xl font-bold font-mono tabular-nums text-[#13345D] mt-2">{totalCount}</span>
          </button>

          <button
            type="button"
            onClick={() => handleCardStatusFilter('Pending Review')}
            aria-pressed={statusFilter === 'Pending Review'}
            className={`text-left bg-white p-4 rounded-2xl border border-[#E2E8F0] border-t-[3px] border-t-[#F59E0B] shadow-[0_2px_12px_rgba(15,41,74,0.04)] flex flex-col justify-between transition-all cursor-pointer hover:border-[#FDE68A] hover:-translate-y-0.5 ${
              statusFilter === 'Pending Review' ? 'ring-2 ring-[#F59E0B] bg-[#FFFBEB]/70' : ''
            }`}
          >
            <div className="flex items-center justify-between gap-2 w-full">
              <span className="text-xs font-medium text-[#64748B]">{t('pending_review', 'Pending Review')}</span>
              {statusFilter === 'Pending Review' && (
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#D97706]">Active</span>
              )}
            </div>
            <span className="text-2xl font-bold font-mono tabular-nums text-[#D97706] mt-2">{pendingCount}</span>
          </button>

          <button
            type="button"
            onClick={() => handleCardStatusFilter('In Progress')}
            aria-pressed={statusFilter === 'In Progress'}
            className={`text-left bg-white p-4 rounded-2xl border border-[#E2E8F0] border-t-[3px] border-t-[#15427B] shadow-[0_2px_12px_rgba(15,41,74,0.04)] flex flex-col justify-between transition-all cursor-pointer hover:border-[#BFDBFE] hover:-translate-y-0.5 ${
              statusFilter === 'In Progress' ? 'ring-2 ring-[#15427B] bg-[#EFF6FF]/60' : ''
            }`}
          >
            <div className="flex items-center justify-between gap-2 w-full">
              <span className="text-xs font-medium text-[#64748B]">{t('status_in_progress', 'In Progress')}</span>
              {statusFilter === 'In Progress' && (
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#15427B]">Active</span>
              )}
            </div>
            <span className="text-2xl font-bold font-mono tabular-nums text-[#15427B] mt-2">{progressCount}</span>
          </button>

          <button
            type="button"
            onClick={() => handleCardStatusFilter('Resolved')}
            aria-pressed={statusFilter === 'Resolved'}
            className={`text-left bg-white p-4 rounded-2xl border border-[#E2E8F0] border-t-[3px] border-t-[#0E8A4E] shadow-[0_2px_12px_rgba(15,41,74,0.04)] flex flex-col justify-between transition-all cursor-pointer hover:border-[#BBF7D0] hover:-translate-y-0.5 ${
              statusFilter === 'Resolved' ? 'ring-2 ring-[#0E8A4E] bg-[#ECFDF5]/70' : ''
            }`}
          >
            <div className="flex items-center justify-between gap-2 w-full">
              <span className="text-xs font-medium text-[#64748B]">{t('ai_resolved', 'AI Resolved')}</span>
              {statusFilter === 'Resolved' && (
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#0E8A4E]">Active</span>
              )}
            </div>
            <span className="text-2xl font-bold font-mono tabular-nums text-[#0E8A4E] mt-2">{resolvedCount}</span>
          </button>

          <button
            type="button"
            onClick={() => handleCardStatusFilter('Resolution Failed')}
            aria-pressed={statusFilter === 'Resolution Failed'}
            className={`text-left bg-white p-4 rounded-2xl border border-[#E2E8F0] border-t-[3px] border-t-[#DC2626] shadow-[0_2px_12px_rgba(15,41,74,0.04)] flex flex-col justify-between col-span-2 md:col-span-1 transition-all cursor-pointer hover:border-[#FCA5A5] hover:-translate-y-0.5 ${
              statusFilter === 'Resolution Failed' ? 'ring-2 ring-[#DC2626] bg-[#FEF2F2]/70' : ''
            }`}
          >
            <div className="flex items-center justify-between gap-2 w-full">
              <span className="text-xs font-medium text-[#64748B]">{t('audit_failed', 'Audit Failed')}</span>
              {statusFilter === 'Resolution Failed' && (
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#DC2626]">Active</span>
              )}
            </div>
            <span className="text-2xl font-bold font-mono tabular-nums text-[#DC2626] mt-2">{failedCount}</span>
          </button>
        </div>

        {/* Filter & Search Toolbar */}
        <div className="bg-white p-4 rounded-2xl border border-[#E2E8F0] shadow-[0_2px_12px_rgba(15,41,74,0.04)] space-y-3">
          <div className="flex flex-col lg:flex-row gap-3 justify-between items-stretch lg:items-center">
            <div className="relative flex-1 lg:max-w-md">
              <Search className="w-4 h-4 text-[#64748B] absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t('search_authority_placeholder', 'Category or location')}
                className="w-full bg-white border border-[#CBD5E1] rounded-lg pl-10 pr-3 py-2 text-sm text-[#13345D] placeholder:text-[#94A3B8] focus:outline-none focus:border-[#15427B] focus:ring-2 focus:ring-[#15427B]/15"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="bg-white border border-[#CBD5E1] rounded-lg px-3 py-2 text-xs font-medium text-[#13345D] focus:outline-none focus:border-[#15427B]"
              >
                <option value="All">Status: All ({totalCount})</option>
                <option value="Pending Review">Pending Review ({pendingCount})</option>
                <option value="Submitted">Submitted Only</option>
                <option value="Under Verification">Under Verification Only</option>
                <option value="In Progress">In Progress ({progressCount})</option>
                <option value="Resolved">AI Resolved ({resolvedCount})</option>
                <option value="Resolution Failed">Audit Failed ({failedCount})</option>
              </select>

              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="bg-white border border-[#CBD5E1] rounded-lg px-3 py-2 text-xs font-medium text-[#13345D] focus:outline-none focus:border-[#15427B]"
              >
                {CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>

              <select
                value={severityFilter}
                onChange={(e) => setSeverityFilter(e.target.value)}
                className="bg-white border border-[#CBD5E1] rounded-lg px-3 py-2 text-xs font-medium text-[#13345D] focus:outline-none focus:border-[#15427B]"
              >
                <option value="All">Severity: All</option>
                <option value="Critical">Critical</option>
                <option value="High">High</option>
                <option value="Medium">Medium</option>
                <option value="Low">Low</option>
              </select>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[#E2E8F0] text-xs text-[#64748B]">
            <span>
              Showing <span className="font-bold text-[#13345D] font-mono">{filteredIssues.length}</span> of{' '}
              <span className="font-bold text-[#13345D] font-mono">{issues.length}</span> reports
              {statusFilter !== 'All' && (
                <>
                  {' '}
                  · Filtered by{' '}
                  <span className="font-semibold text-[#15427B]">
                    {statusFilter === 'Resolved'
                      ? 'AI Resolved'
                      : statusFilter === 'Resolution Failed'
                      ? 'Audit Failed'
                      : statusFilter}
                  </span>
                </>
              )}
            </span>
            {(statusFilter !== 'All' ||
              categoryFilter !== 'All Categories' ||
              severityFilter !== 'All' ||
              searchQuery.trim() !== '') && (
              <button
                type="button"
                onClick={() => {
                  setStatusFilter('All');
                  setCategoryFilter('All Categories');
                  setSeverityFilter('All');
                  setSearchQuery('');
                }}
                className="font-semibold text-[#15427B] hover:text-[#0F2F5A] transition-colors"
              >
                Show All Reports
              </button>
            )}
          </div>
        </div>

        {/* Incident Cards Grid */}
        {loadingIssues ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map((idx) => (
              <div key={idx} className="bg-white border border-[#E2E8F0] rounded-2xl p-5 space-y-3">
                <div className="h-44 w-full rounded-xl civic-skeleton" />
                <div className="h-4 w-1/3 rounded civic-skeleton" />
                <div className="h-5 w-3/4 rounded civic-skeleton" />
                <div className="h-3 w-full rounded civic-skeleton" />
                <div className="h-10 w-full rounded-lg civic-skeleton mt-2" />
              </div>
            ))}
          </div>
        ) : filteredIssues.length === 0 ? (
          <div className="bg-white border border-[#E2E8F0] rounded-2xl p-10 text-center space-y-2 shadow-[0_2px_12px_rgba(15,41,74,0.04)]">
            <AlertCircle className="w-8 h-8 text-[#64748B] mx-auto" />
            <h3 className="text-base font-bold text-[#13345D]">No matching incidents</h3>
            <p className="text-sm text-[#475569]">Try adjusting your search or filter selections.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredIssues.map((issue) => {
              const totalVotes = (issue.voteStats?.yes || 0) + (issue.voteStats?.no || 0);
              const approvalPct = totalVotes > 0 ? Math.round(((issue.voteStats?.yes || 0) / totalVotes) * 100) : null;

              return (
                <article
                  key={issue.id}
                  className="bg-white rounded-2xl border border-[#E2E8F0] shadow-[0_2px_12px_rgba(15,41,74,0.04)] p-4 flex flex-col justify-between gap-4 hover:border-[#BFDBFE] transition-colors"
                >
                  <div className="space-y-3">
                    <div className="h-44 w-full rounded-xl overflow-hidden bg-[#F4F8FD] border border-[#E2E8F0]">
                      <img
                        src={issue.imageUrl}
                        alt={issue.title}
                        className="w-full h-full object-cover"
                      />
                    </div>

                    <div className="flex items-center flex-wrap gap-1.5 text-xs">
                      <span className="font-mono font-bold text-[#15427B]">{issue.ticketId}</span>
                      <span className="text-[#94A3B8]">·</span>
                      <StatusDot
                        status={issue.status === 'Submitted' ? 'Pending review' : issue.status}
                        isDisputed={issue.isDisputed}
                      />
                    </div>

                    <div>
                      <h3 className="font-bold text-[#13345D] text-base leading-snug line-clamp-1">
                        {issue.title}
                      </h3>
                      <div className="flex items-center flex-wrap gap-1.5 text-xs text-[#64748B] mt-1">
                        <span>{issue.category}</span>
                        <span>·</span>
                        <SeverityDot severity={issue.severity} suffix="" />
                      </div>
                    </div>

                    <p className="text-xs text-[#475569] line-clamp-2 leading-relaxed">
                      {issue.description}
                    </p>

                    <div className="text-[11px] text-[#64748B] space-y-0.5 pt-2 border-t border-[#E2E8F0]">
                      <p className="truncate font-medium text-[#13345D]">
                        {issue.location?.address || 'Location tagged'}
                      </p>
                      {issue.location?.latitude && (
                        <p className="font-mono text-[11px]">
                          {issue.location.latitude.toFixed(4)}° N, {issue.location.longitude?.toFixed(4)}° E
                        </p>
                      )}
                      <p>{issue.department}</p>
                      <p>{formatCreatedDate(issue.createdAt)}</p>
                    </div>

                    <div className="text-xs pt-1">
                      {totalVotes > 0 ? (
                        <div className="flex items-center flex-wrap gap-1.5">
                          <span className="font-medium text-[#13345D]">Ground verification</span>
                          <span className="text-[#94A3B8]">·</span>
                          {issue.isDisputed ? (
                            <span className="font-semibold text-[#DC2626]">
                              Disputed ({issue.voteStats?.no} unresolved / {issue.voteStats?.yes} verified)
                            </span>
                          ) : (
                            <span className="font-semibold text-[#0E8A4E]">
                              {approvalPct}% approved ({issue.voteStats?.yes} fixed / {issue.voteStats?.no} unresolved)
                            </span>
                          )}
                        </div>
                      ) : (
                        <p className="text-[#64748B]">Ground verification · No feedback yet</p>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2 pt-2">
                    {issue.status === 'Resolved' || issue.status === 'Closed' ? (
                      <div className="p-3 rounded-lg bg-[#ECFDF5] border border-[#BBF7D0] text-xs space-y-1">
                        <div className="flex items-center gap-1.5 font-semibold text-[#0E8A4E]">
                          <ShieldCheck className="w-4 h-4" />
                          <span>3-Gate RVE Verified</span>
                        </div>
                        <p className="text-[11px] text-[#475569]">
                          Resolved by {issue.resolvedBy || 'Municipal Official'}
                        </p>
                      </div>
                    ) : (
                      <>
                        {(issue.status === 'Submitted' || issue.status === 'Assigned') && (
                          <button
                            type="button"
                            onClick={() => transitionIssueStatus(issue, 'Acknowledged')}
                            disabled={updatingFirestore}
                            className="w-full py-2 bg-[#EFF6FF] hover:bg-[#DBEAFE] text-[#15427B] text-xs font-semibold rounded-lg border border-[#BFDBFE] transition-colors"
                          >
                            Acknowledge Assignment
                          </button>
                        )}
                        {(issue.status === 'Submitted' ||
                          issue.status === 'Assigned' ||
                          issue.status === 'Acknowledged') && (
                          <button
                            type="button"
                            onClick={() => transitionIssueStatus(issue, 'In Progress')}
                            disabled={updatingFirestore}
                            className="w-full py-2 bg-white hover:bg-[#F4F8FD] text-[#13345D] text-xs font-semibold rounded-lg border border-[#CBD5E1] transition-colors"
                          >
                            Mark as In Progress
                          </button>
                        )}
                        {(issue.status === 'Rejected' || issue.status === 'Resolution Failed') && (
                          <div className="p-2.5 rounded-lg bg-[#FEF2F2] border border-[#FCA5A5] text-[11px] text-[#DC2626] font-medium">
                            Previous RVE failed ({issue.resolutionAiAudit?.failureGate || 'Audit'}). Record a fresh 30s on-site video.
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={() => openResolutionStudio(issue)}
                          className="w-full py-2.5 bg-[#15427B] hover:bg-[#0F2F5A] text-white text-xs font-semibold rounded-lg flex items-center justify-center gap-2 transition-colors"
                        >
                          <Video className="w-4 h-4" />
                          <span>Resolve Issue (30s Live Video)</span>
                        </button>
                      </>
                    )}

                    <div className="flex items-center justify-between gap-3 pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedIssue(issue);
                          setInspectModalOpen(true);
                        }}
                        className="text-xs font-semibold text-[#15427B] hover:text-[#0F2F5A] transition-colors inline-block"
                      >
                        View incident
                      </button>

                      {issue.status === 'Resolved' && (
                        <button
                          type="button"
                          onClick={() => setDeleteConfirmIssue(issue)}
                          className="text-xs font-semibold text-[#DC2626] hover:text-[#B91C1C] hover:bg-[#FEF2F2] px-2.5 py-1.5 rounded-lg border border-[#FCA5A5] inline-flex items-center gap-1.5 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Delete</span>
                        </button>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </main>

      {/* INSTITUTIONAL FOOTER */}
      <footer className="bg-[#0B2A52] text-white py-6 border-t border-[#15427B] mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-[#15427B] flex items-center justify-center">
              <Building2 className="w-3.5 h-3.5 text-white" />
            </div>
            <div>
              <span className="font-bold text-white">CrowdCivic </span>
              <span className="font-bold text-[#F59E0B]">AI</span>
              <span className="text-white/60 ml-2 hidden sm:inline">· Municipal Authority Portal</span>
            </div>
          </div>
          <div className="text-[11px] text-white/75 flex flex-wrap items-center justify-center gap-4">
            <span>3-Gate GPS &amp; Video Audit</span>
            <span>Helpline · Dial 311</span>
            <span>© 2026 CrowdCivic AI</span>
          </div>
        </div>
      </footer>

      {/* MODAL: VIEW INCIDENT DETAILS */}
      {inspectModalOpen && selectedIssue && (
        <div className="fixed inset-0 z-50 bg-[#0B2A52]/55 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white border border-[#DCE7F5] rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl my-8">
            <div className="px-6 py-4 border-b border-[#E2E8F0] flex items-center justify-between">
              <div>
                <span className="text-xs font-mono font-bold text-[#15427B]">{selectedIssue.ticketId}</span>
                <h3 className="text-base font-bold text-[#13345D] mt-0.5">{selectedIssue.title}</h3>
              </div>
              <button
                onClick={() => setInspectModalOpen(false)}
                className="p-1.5 rounded-lg hover:bg-[#F4F8FD] text-[#64748B] hover:text-[#13345D]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-5 max-h-[80vh] overflow-y-auto">
              <div className="h-56 w-full rounded-xl overflow-hidden bg-[#F4F8FD] border border-[#E2E8F0]">
                <img src={selectedIssue.imageUrl} alt={selectedIssue.title} className="w-full h-full object-cover" />
              </div>

              <div className="flex flex-wrap items-center gap-2 text-xs">
                <StatusDot status={selectedIssue.status} isDisputed={selectedIssue.isDisputed} />
                <span className="text-[#94A3B8]">·</span>
                <SeverityDot severity={selectedIssue.severity} />
                <span className="text-[#94A3B8]">·</span>
                <span className="text-[#475569]">{selectedIssue.category}</span>
                <span className="text-[#94A3B8]">·</span>
                <span className="text-[#475569]">{selectedIssue.department}</span>
              </div>

              <div className="space-y-1.5">
                <h4 className="text-xs font-semibold text-[#13345D]">Citizen Description</h4>
                <p className="text-sm text-[#475569] leading-relaxed">{selectedIssue.description}</p>
              </div>

              <div className="p-3.5 rounded-xl bg-[#F4F8FD] border border-[#DCE7F5] text-xs space-y-1">
                <div className="flex items-center gap-1.5 font-semibold text-[#13345D]">
                  <MapPin className="w-3.5 h-3.5 text-[#15427B]" />
                  <span>{selectedIssue.location?.address || 'Reported Location'}</span>
                </div>
                {selectedIssue.location?.latitude && (
                  <p className="font-mono text-[11px] text-[#64748B] pl-5">
                    {selectedIssue.location.latitude.toFixed(5)}° N, {selectedIssue.location.longitude?.toFixed(5)}° E
                  </p>
                )}
                <p className="text-[11px] text-[#64748B] pl-5">
                  Submitted by {selectedIssue.userEmail} on {formatCreatedDate(selectedIssue.createdAt)}
                </p>
              </div>

              {selectedIssue.aiAnalysis?.keyObservations && selectedIssue.aiAnalysis.keyObservations.length > 0 && (
                <div className="p-3.5 rounded-xl bg-white border border-[#E2E8F0] space-y-1.5">
                  <p className="text-xs font-semibold text-[#13345D]">
                    AI Triage Observations ({selectedIssue.aiAnalysis.confidenceScore}% confidence)
                  </p>
                  <ul className="list-disc list-inside text-xs text-[#475569] space-y-0.5">
                    {selectedIssue.aiAnalysis.keyObservations.map((obs, i) => (
                      <li key={i}>{obs}</li>
                    ))}
                  </ul>
                </div>
              )}

              {selectedIssue.communityVotes && selectedIssue.communityVotes.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold text-[#13345D] flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5 text-[#15427B]" />
                    <span>Community Ground Feedback ({selectedIssue.communityVotes.length})</span>
                  </h4>
                  <div className="space-y-2">
                    {selectedIssue.communityVotes.map((v, idx) => (
                      <div key={idx} className="p-3 rounded-xl bg-[#F4F8FD] border border-[#DCE7F5] text-xs space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-[#13345D]">{v.userEmail}</span>
                          {v.vote === 'yes' ? (
                            <span className="inline-flex items-center gap-1 font-semibold text-[#0E8A4E]">
                              <ThumbsUp className="w-3 h-3" /> Verified Fixed
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 font-semibold text-[#DC2626]">
                              <ThumbsDown className="w-3 h-3" /> Unresolved
                            </span>
                          )}
                        </div>
                        {v.comment && <p className="text-[#475569]">{v.comment}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex flex-wrap items-center justify-end gap-3 pt-3 border-t border-[#E2E8F0]">
                <button
                  type="button"
                  onClick={() => setInspectModalOpen(false)}
                  className="px-4 py-2 bg-white hover:bg-[#F4F8FD] text-[#13345D] text-xs font-semibold rounded-lg border border-[#CBD5E1]"
                >
                  Close
                </button>
                {selectedIssue.status === 'Resolved' ? (
                  <button
                    type="button"
                    onClick={() => setDeleteConfirmIssue(selectedIssue)}
                    className="px-4 py-2 bg-[#FEF2F2] hover:bg-[#FEE2E2] text-[#DC2626] border border-[#FCA5A5] text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete Resolved Report</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      const issue = selectedIssue;
                      setInspectModalOpen(false);
                      openResolutionStudio(issue);
                    }}
                    className="px-4 py-2 bg-[#15427B] hover:bg-[#0F2F5A] text-white text-xs font-semibold rounded-lg flex items-center gap-1.5"
                  >
                    <Video className="w-3.5 h-3.5" />
                    <span>Open 30s Resolution Studio</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: 30-SECOND LIVE CAMERA RESOLUTION STUDIO */}
      {resolveModalOpen && targetIssue && (
        <div className="fixed inset-0 z-50 bg-[#0B2A52]/55 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white border border-[#DCE7F5] rounded-2xl w-full max-w-3xl overflow-hidden shadow-2xl relative my-8">
            <div className="px-6 py-4 bg-white border-b border-[#E2E8F0] flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-[#EFF6FF] text-[#15427B] flex items-center justify-center">
                  <Video className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-[#13345D]">Issue Resolution Studio</h3>
                  <p className="text-xs text-[#64748B] font-mono">
                    {targetIssue.ticketId} · {targetIssue.title}
                  </p>
                </div>
              </div>

              <button
                onClick={closeResolutionStudio}
                className="p-1.5 rounded-lg hover:bg-[#F4F8FD] text-[#64748B] hover:text-[#13345D] transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-5 max-h-[85vh] overflow-y-auto">
              <div className="bg-[#F4F8FD] p-3.5 rounded-xl border border-[#DCE7F5] flex items-center gap-4">
                <img
                  src={targetIssue.imageUrl}
                  alt="Citizen original"
                  className="w-16 h-16 rounded-lg object-cover border border-[#E2E8F0] shrink-0"
                />
                <div className="text-xs space-y-1 min-w-0">
                  <span className="font-semibold text-[#13345D] block">Original Reported Evidence</span>
                  <p className="text-[#475569] truncate">{targetIssue.location?.address}</p>
                  {targetIssue.location?.latitude && (
                    <p className="text-[11px] font-mono text-[#64748B]">
                      Reported GPS: {targetIssue.location.latitude.toFixed(5)}° N, {targetIssue.location.longitude?.toFixed(5)}° E
                    </p>
                  )}
                </div>
              </div>

              {cameraError && (
                <div className="p-3.5 rounded-xl bg-[#FEF2F2] border border-[#FCA5A5] text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-start gap-2.5">
                    <AlertTriangle className="w-4 h-4 text-[#DC2626] shrink-0 mt-0.5" />
                    <span className="text-[#DC2626] font-medium leading-relaxed">{cameraError}</span>
                  </div>
                  <button
                    type="button"
                    onClick={requestAuthorityCamera}
                    disabled={cameraLoading}
                    className="px-3.5 py-2 bg-white hover:bg-[#FEF2F2] border border-[#FCA5A5] text-[#DC2626] font-semibold rounded-lg flex items-center justify-center gap-1.5 shrink-0 transition-colors"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${cameraLoading ? 'animate-spin' : ''}`} />
                    <span>{cameraLoading ? 'Retrying...' : 'Retry Camera'}</span>
                  </button>
                </div>
              )}

              {/* Live Camera Viewfinder */}
              <div className="relative rounded-2xl overflow-hidden bg-[#0B2A52] border border-[#E2E8F0] aspect-video">
                <video
                  ref={(el) => {
                    videoRef.current = el;
                    if (el && mediaStream && el.srcObject !== mediaStream) {
                      el.srcObject = mediaStream;
                    }
                  }}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />
                {!mediaStream && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2.5 px-6 text-center bg-[#0B2A52]/95">
                    {cameraLoading ? (
                      <>
                        <RefreshCw className="w-7 h-7 text-[#F59E0B] animate-spin" />
                        <p className="text-xs font-medium text-white">Requesting camera permission...</p>
                      </>
                    ) : recordedFrames.length > 0 ? (
                      <>
                        <VideoOff className="w-7 h-7 text-[#0E8A4E]" />
                        <p className="text-xs font-semibold text-white">
                          Camera Automatically Turned Off
                        </p>
                        <p className="text-[11px] text-white/75 max-w-sm">
                          30s recording captured. Hardware camera stays off until you explicitly turn it on again.
                        </p>
                        <button
                          type="button"
                          onClick={handleStartRerecord}
                          className="mt-1 px-4 py-2 bg-[#F59E0B] hover:bg-[#D97706] text-[#0F294A] text-xs font-bold rounded-lg flex items-center gap-1.5 transition-colors"
                        >
                          <Video className="w-3.5 h-3.5" />
                          <span>Turn On Camera to Re-record</span>
                        </button>
                      </>
                    ) : (
                      <>
                        <VideoOff className="w-7 h-7 text-[#F59E0B]" />
                        <p className="text-xs font-semibold text-white">Camera is Off</p>
                        <p className="text-[11px] text-white/75 max-w-sm">
                          Camera activates only when you turn it on and shuts off automatically as soon as recording ends.
                        </p>
                        <button
                          type="button"
                          onClick={requestAuthorityCamera}
                          disabled={cameraLoading}
                          className="mt-1 px-4 py-2 bg-[#F59E0B] hover:bg-[#D97706] text-[#0F294A] text-xs font-bold rounded-lg flex items-center gap-1.5 transition-colors"
                        >
                          <Video className="w-3.5 h-3.5" />
                          <span>Turn On Camera</span>
                        </button>
                      </>
                    )}
                  </div>
                )}

                {/* Top Dark Navy Translucent Telemetry Bar */}
                <div className="absolute top-3 left-3 right-3 bg-[#0B2A52]/85 backdrop-blur-xs text-white rounded-lg px-3.5 py-2.5 text-[11px] font-mono flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1.5">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2 font-bold">
                      <span
                        className={`w-2 h-2 rounded-full ${
                          recording
                            ? 'bg-[#EF4444] animate-ping'
                            : mediaStream
                            ? 'bg-[#F59E0B]'
                            : 'bg-[#64748B]'
                        }`}
                      />
                      <span>
                        {recording
                          ? `LIVE RECORDING · ${recordSecondsLeft}s REMAINING`
                          : recordedFrames.length > 0 && !mediaStream
                          ? `CAMERA OFF · ${recordedFrames.length} KEYFRAMES CAPTURED`
                          : mediaStream
                          ? 'CAMERA ON · READY FOR 30S VERIFICATION'
                          : 'CAMERA OFF · STANDBY'}
                      </span>
                    </div>
                    <p className="text-white/75 text-[10px]">
                      {liveTimestamp || 'Syncing UTC timestamp...'}
                    </p>
                  </div>

                  <div className="sm:text-right text-[10px] text-white/90 space-y-0.5">
                    <p>
                      {authorityGps.latitude
                        ? `${authorityGps.latitude.toFixed(4)}° N, ${authorityGps.longitude?.toFixed(4)}° E`
                        : authorityGps.loading
                        ? 'Acquiring GPS...'
                        : 'GPS pending'}
                      {distanceInfo ? ` · Δ ${distanceInfo.meters < 1000 ? `${distanceInfo.meters}m` : `${distanceInfo.km.toFixed(2)}km`}` : ''}
                    </p>
                    <p className="text-[#F59E0B] truncate max-w-[240px]">
                      {authorityGps.address || authorityGps.error || 'Awaiting location lock'}
                    </p>
                  </div>
                </div>

                {recording && (
                  <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-[#0B2A52]">
                    <div
                      className="h-full bg-[#F59E0B] transition-all duration-1000 ease-linear"
                      style={{ width: `${((30 - recordSecondsLeft) / 30) * 100}%` }}
                    />
                  </div>
                )}
              </div>

              {/* Sequential 3-Gate RVE Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div
                  className={`bg-white border rounded-xl p-3.5 space-y-1 border-t-2 ${
                    isGeofenceReady
                      ? 'border-[#E2E8F0] border-t-[#0E8A4E]'
                      : hasLiveAuthorityGps && distanceInfo && distanceInfo.meters > 20
                      ? 'border-[#FECACA] border-t-[#DC2626]'
                      : 'border-[#E2E8F0] border-t-[#15427B]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-1.5 text-xs font-semibold text-[#13345D]">
                    <div className="flex items-center gap-1.5">
                      {aiAuditResult?.gates ? (
                        aiAuditResult.gates.gate1_geofence.passed ? (
                          <Check className="w-3.5 h-3.5 text-[#0E8A4E]" />
                        ) : (
                          <AlertTriangle className="w-3.5 h-3.5 text-[#DC2626]" />
                        )
                      ) : isGeofenceReady ? (
                        <Check className="w-3.5 h-3.5 text-[#0E8A4E]" />
                      ) : hasLiveAuthorityGps && distanceInfo && distanceInfo.meters > 20 ? (
                        <AlertTriangle className="w-3.5 h-3.5 text-[#DC2626]" />
                      ) : (
                        <Clock className="w-3.5 h-3.5 text-[#15427B]" />
                      )}
                      <span>Gate 1 · GPS Geofence (&le;20m)</span>
                    </div>
                    <button
                      type="button"
                      onClick={getAuthorityLocation}
                      disabled={authorityGps.loading || recording}
                      className="text-[11px] font-semibold text-[#15427B] hover:text-[#0F2F5A] inline-flex items-center gap-1 disabled:opacity-50"
                    >
                      <RefreshCw className={`w-3 h-3 ${authorityGps.loading ? 'animate-spin' : ''}`} />
                      <span>Refresh GPS</span>
                    </button>
                  </div>
                  <p
                    className={`text-[11px] leading-relaxed ${
                      !aiAuditResult?.gates && (!isGeofenceReady && (authorityGps.error || (distanceInfo && distanceInfo.meters > 20)))
                        ? 'text-[#DC2626] font-medium'
                        : 'text-[#475569]'
                    }`}
                  >
                    {aiAuditResult?.gates
                      ? aiAuditResult.gates.gate1_geofence.reason
                      : isGeofenceReady && distanceInfo
                      ? `Geofence locked (${distanceInfo.meters}m ≤ 20m). Ready to record live verification video.`
                      : distanceInfo
                      ? `Outside 20m geofence (${distanceInfo.meters < 1000 ? `${distanceInfo.meters}m` : `${distanceInfo.km.toFixed(2)}km`} away). Move within 20m to unlock recording.`
                      : authorityGps.error || 'Acquiring live GPS coordinates — recording unlocks once GPS & 20m geofence are verified.'}
                  </p>
                </div>

                <div className="bg-white border border-[#E2E8F0] border-t-2 border-t-[#F59E0B] rounded-xl p-3.5 space-y-1">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-[#13345D]">
                    {aiAuditResult?.gates ? (
                      !aiAuditResult.gates.gate2_timestamp.executed ? (
                        <Clock className="w-3.5 h-3.5 text-[#94A3B8]" />
                      ) : aiAuditResult.gates.gate2_timestamp.passed ? (
                        <Check className="w-3.5 h-3.5 text-[#0E8A4E]" />
                      ) : (
                        <AlertTriangle className="w-3.5 h-3.5 text-[#DC2626]" />
                      )
                    ) : recordedFrames.length > 0 && !recording ? (
                      <Check className="w-3.5 h-3.5 text-[#0E8A4E]" />
                    ) : (
                      <Clock className="w-3.5 h-3.5 text-[#D97706]" />
                    )}
                    <span>Gate 2 · Timestamp Sync</span>
                  </div>
                  <p className="text-[11px] text-[#475569] leading-relaxed">
                    {aiAuditResult?.gates
                      ? !aiAuditResult.gates.gate2_timestamp.executed
                        ? 'Skipped (short-circuited at Gate 1).'
                        : aiAuditResult.gates.gate2_timestamp.reason
                      : recording
                      ? `Capturing live keyframes... ${recordSecondsLeft}s left.`
                      : recordedFrames.length > 0
                      ? `${recordedFrames.length} timestamped keyframes captured.`
                      : 'Hold camera steady for 30s to record live video metadata.'}
                  </p>
                </div>

                <div className="bg-white border border-[#E2E8F0] border-t-2 border-t-[#0E8A4E] rounded-xl p-3.5 space-y-1">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-[#13345D]">
                    {aiAuditResult?.gates ? (
                      !aiAuditResult.gates.gate3_gemini_keyframe.executed ? (
                        <Clock className="w-3.5 h-3.5 text-[#94A3B8]" />
                      ) : aiAuditResult.gates.gate3_gemini_keyframe.passed ? (
                        <Check className="w-3.5 h-3.5 text-[#0E8A4E]" />
                      ) : (
                        <AlertTriangle className="w-3.5 h-3.5 text-[#DC2626]" />
                      )
                    ) : (
                      <Clock className="w-3.5 h-3.5 text-[#0E8A4E]" />
                    )}
                    <span>Gate 3 · Gemini 2.5 Flash</span>
                  </div>
                  <p className="text-[11px] text-[#475569] leading-relaxed">
                    {aiAuditResult?.gates
                      ? !aiAuditResult.gates.gate3_gemini_keyframe.executed
                        ? `Skipped (short-circuited at ${aiAuditResult.failureGate}).`
                        : `${aiAuditResult.gates.gate3_gemini_keyframe.repair_quality || 'Evaluated'}: ${aiAuditResult.gates.gate3_gemini_keyframe.reasoning || aiAuditResult.verificationSummary}`
                      : 'Server extracts keyframes via FFmpeg and evaluates repair visually.'}
                  </p>
                </div>
              </div>

              {/* Camera Controls */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#F4F8FD] p-4 rounded-xl border border-[#DCE7F5]">
                <div className="text-xs">
                  <p className="font-semibold text-[#13345D]">30-Second Live Video &amp; Geofence Requirement</p>
                  <p className={`mt-0.5 ${isGeofenceReady ? 'text-[#0E8A4E] font-medium' : 'text-[#DC2626] font-medium'}`}>
                    {isGeofenceReady && distanceInfo
                      ? `Live GPS locked (${distanceInfo.meters}m from site — inside 20m geofence). Ready to start 30s recording.`
                      : !hasLiveAuthorityGps
                      ? 'GPS pending: Live location permission & GPS lock are required before recording can start.'
                      : distanceInfo
                      ? `Outside 20m geofence (${distanceInfo.meters < 1000 ? `${distanceInfo.meters}m` : `${distanceInfo.km.toFixed(2)}km`} away). Move within 20m and refresh GPS.`
                      : 'Complaint GPS coordinates missing — geofence cannot be verified.'}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                  {!recording ? (
                    <>
                      {!isGeofenceReady && (
                        <button
                          type="button"
                          onClick={getAuthorityLocation}
                          disabled={authorityGps.loading}
                          className="px-3.5 py-2.5 bg-white hover:bg-[#EFF6FF] border border-[#15427B] text-[#15427B] text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50"
                        >
                          <RefreshCw className={`w-3.5 h-3.5 ${authorityGps.loading ? 'animate-spin' : ''}`} />
                          <span>{authorityGps.loading ? 'Locking GPS...' : 'Refresh Live GPS'}</span>
                        </button>
                      )}
                      {mediaStream ? (
                        <>
                          <button
                            type="button"
                            onClick={() => stopAuthorityCamera(true)}
                            className="px-3.5 py-2.5 bg-white hover:bg-[#FEF2F2] border border-[#CBD5E1] text-[#475569] hover:text-[#DC2626] text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition-colors"
                          >
                            <VideoOff className="w-3.5 h-3.5" />
                            <span>Turn Off Camera</span>
                          </button>
                          <button
                            type="button"
                            onClick={start30SecRecording}
                            disabled={!isGeofenceReady}
                            className={`w-full sm:w-auto px-5 py-2.5 text-xs font-semibold rounded-lg flex items-center justify-center gap-2 transition-colors ${
                              isGeofenceReady
                                ? 'bg-[#15427B] hover:bg-[#0F2F5A] text-white'
                                : 'bg-[#E2E8F0] text-[#64748B] cursor-not-allowed'
                            }`}
                          >
                            <Video className="w-4 h-4" />
                            <span>
                              {!hasLiveAuthorityGps
                                ? 'Waiting for Live GPS...'
                                : !isGeofenceReady
                                ? 'Outside 20m Geofence'
                                : recordedFrames.length > 0
                                ? 'Re-record 30s Video'
                                : 'Start 30s Recording'}
                            </span>
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={requestAuthorityCamera}
                          disabled={cameraLoading}
                          className="w-full sm:w-auto px-5 py-2.5 bg-[#15427B] hover:bg-[#0F2F5A] disabled:opacity-50 text-white text-xs font-semibold rounded-lg flex items-center justify-center gap-2 transition-colors"
                        >
                          <Video className="w-4 h-4" />
                          <span>{cameraLoading ? 'Starting Camera...' : 'Turn On Camera'}</span>
                        </button>
                      )}
                    </>
                  ) : (
                    <>
                      <div className="px-4 py-2.5 bg-[#FEF2F2] border border-[#FCA5A5] text-[#DC2626] text-xs font-bold rounded-lg flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-[#DC2626] animate-ping" />
                        <span>Recording ({recordSecondsLeft}s left)</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => stopAuthorityCamera(true)}
                        className="px-3.5 py-2.5 bg-white hover:bg-[#FEF2F2] border border-[#FCA5A5] text-[#DC2626] text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors"
                      >
                        <VideoOff className="w-3.5 h-3.5" />
                        <span>Cancel &amp; Off</span>
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Recorded Preview & AI Submission */}
              {recordedFrames.length > 0 && !recording && (
                <div className="bg-white p-5 rounded-xl border border-[#E2E8F0] space-y-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-5 h-5 text-[#0E8A4E]" />
                      <div>
                        <h4 className="text-xs font-bold text-[#13345D]">30-Second Video Recording Captured</h4>
                        <p className="text-[11px] text-[#64748B]">Camera turned off automatically · Keyframes tagged with live timestamp &amp; GPS</p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={handleStartRerecord}
                      className="text-xs font-semibold text-[#475569] hover:text-[#13345D] flex items-center gap-1"
                    >
                      <RotateCcw className="w-3.5 h-3.5" /> Re-record
                    </button>
                  </div>

                  {recordedVideoBlobUrl && (
                    <video
                      src={recordedVideoBlobUrl}
                      controls
                      className="w-full max-h-48 rounded-lg border border-[#E2E8F0] bg-[#0B2A52]"
                    />
                  )}

                  <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                    {recordedFrames.map((frame, idx) => (
                      <div key={idx} className="relative rounded-lg overflow-hidden border border-[#E2E8F0] aspect-video">
                        <img src={frame} alt={`Frame ${idx + 1}`} className="w-full h-full object-cover" />
                        <span className="absolute bottom-1 right-1 text-[9px] bg-[#0B2A52]/85 px-1 text-white font-mono rounded">
                          F{idx + 1}
                        </span>
                      </div>
                    ))}
                  </div>

                  {aiAuditResult && (
                    <div
                      className={`p-4 rounded-xl border ${
                        aiAuditResult.isAuthentic && aiAuditResult.visualResolutionMatch
                          ? 'bg-[#ECFDF5] border-[#BBF7D0]'
                          : 'bg-[#FEF2F2] border-[#FCA5A5]'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        {aiAuditResult.isAuthentic && aiAuditResult.visualResolutionMatch ? (
                          <ShieldCheck className="w-5 h-5 text-[#0E8A4E] shrink-0 mt-0.5" />
                        ) : (
                          <ShieldAlert className="w-5 h-5 text-[#DC2626] shrink-0 mt-0.5" />
                        )}

                        <div className="space-y-1.5 text-xs">
                          <h5
                            className={`font-bold text-sm ${
                              aiAuditResult.isAuthentic && aiAuditResult.visualResolutionMatch
                                ? 'text-[#13345D]'
                                : 'text-[#DC2626]'
                            }`}
                          >
                            {aiAuditResult.isAuthentic && aiAuditResult.visualResolutionMatch
                              ? 'AI Verification Passed: Issue Resolved!'
                              : 'AI Verification Failed: Incomplete or Invalid Proof'}
                          </h5>

                          <p className="text-[#475569] leading-relaxed">{aiAuditResult.verificationSummary}</p>

                          {aiAuditResult.rejectionReason && (
                            <p className="text-[#DC2626] font-medium pt-1">
                              Rejection reason: {aiAuditResult.rejectionReason}
                            </p>
                          )}

                          {aiAuditResult.detectedFixes && aiAuditResult.detectedFixes.length > 0 && (
                            <div className="pt-2 border-t border-[#E2E8F0]">
                              <span className="text-[11px] text-[#13345D] font-semibold block">
                                Detected Improvements
                              </span>
                              <ul className="list-disc list-inside text-[11px] text-[#475569] mt-1 space-y-0.5">
                                {aiAuditResult.detectedFixes.map((fix, i) => (
                                  <li key={i}>{fix}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {auditError && (
                    <div className="p-3 bg-[#FEF2F2] border border-[#FCA5A5] rounded-xl text-xs text-[#DC2626] flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      <span>{auditError}</span>
                    </div>
                  )}

                  <button
                    type="button"
                    disabled={verifyingWithAi || updatingFirestore}
                    onClick={handleVerifyResolution}
                    className="w-full py-2.5 bg-[#15427B] hover:bg-[#0F2F5A] text-white text-xs font-semibold rounded-lg flex items-center justify-center gap-2 disabled:opacity-50 transition-colors"
                  >
                    {verifyingWithAi ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>{verifyingStage || 'Verifying Video Proof & Timetags...'}</span>
                      </>
                    ) : (
                      <>
                        <ShieldCheck className="w-4 h-4" />
                        <span>Submit Video for Resolution Verification</span>
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MUNICIPAL SECURITY PIN 2FA VERIFICATION MODAL */}
      {showPinModal && (
        <div className="fixed inset-0 z-50 bg-[#0B2A52]/55 backdrop-blur-xs flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className="bg-white border border-[#DCE7F5] w-full max-w-md rounded-2xl p-6 shadow-2xl space-y-5 relative"
          >
            <button
              onClick={() => setShowPinModal(false)}
              className="absolute top-4 right-4 text-[#64748B] hover:text-[#13345D] p-1.5 rounded-lg hover:bg-[#F4F8FD]"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-3">
              <div className="w-11 h-11 bg-[#EFF6FF] rounded-xl flex items-center justify-center text-[#15427B] shrink-0">
                <KeyRound className="w-5 h-5" />
              </div>
              <div>
                <span className="text-[11px] font-bold text-[#15427B] uppercase tracking-wider block">Government Security 2FA</span>
                <h3 className="text-base font-bold text-[#13345D]">Municipal Security Verification</h3>
              </div>
            </div>

            <div className="bg-[#F4F8FD] p-3.5 rounded-xl border border-[#DCE7F5] text-xs space-y-1">
              <p className="font-semibold text-[#13345D]">Authorization Required</p>
              <p className="text-[#475569]">{pinActionTitle}</p>
            </div>

            <form onSubmit={handleVerifyPinAndExecute} className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <label className="font-semibold text-[#13345D]">Enter your six-digit municipal security PIN</label>
                  <span className="text-[11px] font-mono text-[#64748B]">PIN: {DEFAULT_PIN_AUTHORITY}</span>
                </div>
                <PinBoxInput value={pinInput} onChange={setPinInput} autoFocus idPrefix="authority-pin" />
              </div>

              {pinError && (
                <div className="p-3 bg-[#FEF2F2] border border-[#FCA5A5] rounded-xl text-xs text-[#DC2626] flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{pinError}</span>
                </div>
              )}

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowPinModal(false)}
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

      {/* DELETE AI RESOLVED REPORT CONFIRMATION MODAL */}
      {deleteConfirmIssue && (
        <div className="fixed inset-0 z-50 bg-[#0B2A52]/55 backdrop-blur-xs flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className="bg-white border border-[#DCE7F5] w-full max-w-md rounded-2xl p-6 shadow-2xl space-y-5 relative"
          >
            <button
              type="button"
              onClick={() => !deletingIssue && setDeleteConfirmIssue(null)}
              className="absolute top-4 right-4 text-[#64748B] hover:text-[#13345D] p-1.5 rounded-lg hover:bg-[#F4F8FD]"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-3">
              <div className="w-11 h-11 bg-[#FEF2F2] border border-[#FCA5A5] rounded-xl flex items-center justify-center text-[#DC2626] shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <span className="text-[11px] font-bold text-[#DC2626] uppercase tracking-wider block">
                  Delete Resolved Record
                </span>
                <h3 className="text-base font-bold text-[#13345D]">Remove AI Resolved Report?</h3>
              </div>
            </div>

            <div className="bg-[#F4F8FD] p-3.5 rounded-xl border border-[#DCE7F5] text-xs space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono font-bold text-[#15427B]">{deleteConfirmIssue.ticketId}</span>
                <span className="text-[11px] font-semibold text-[#0E8A4E]">AI Resolved</span>
              </div>
              <p className="font-semibold text-[#13345D]">{deleteConfirmIssue.title}</p>
              <p className="text-[#475569] leading-relaxed">
                This report has already been marked as AI Resolved. Confirming will permanently remove it from the municipal incident queue.
              </p>
            </div>

            <div className="flex items-center gap-3 pt-1">
              <button
                type="button"
                disabled={deletingIssue}
                onClick={() => setDeleteConfirmIssue(null)}
                className="flex-1 py-2.5 bg-white hover:bg-[#F4F8FD] text-[#13345D] border border-[#CBD5E1] text-xs font-semibold rounded-lg transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deletingIssue}
                onClick={executeDeleteResolvedIssue}
                className="flex-1 py-2.5 bg-[#DC2626] hover:bg-[#B91C1C] text-white text-xs font-semibold rounded-lg flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
              >
                {deletingIssue ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Deleting...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Confirm Delete</span>
                  </>
                )}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
