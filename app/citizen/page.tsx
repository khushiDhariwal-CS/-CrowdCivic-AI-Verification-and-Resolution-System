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
  addDoc,
  getDocs,
  getDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
  doc,
  updateDoc,
  setDoc,
  deleteDoc,
} from 'firebase/firestore';
import { logSecurityEvent } from '@/lib/audit';
import { LanguageSelector, useLanguage } from '@/lib/LanguageContext';
import {
  LogOut,
  User,
  MapPin,
  Search,
  FileText,
  Camera,
  Upload,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  X,
  ChevronRight,
  Clock,
  ShieldAlert,
  Building2,
  Tag,
  Filter,
  Layers,
  Compass,
  ArrowLeft,
  Check,
  AlertCircle,
  Eye,
  Info,
  Mic,
  MicOff,
  ThumbsUp,
  ThumbsDown,
  MessageSquare,
  Users,
  Award,
  Trash2,
  Home,
  Plus,
  ShieldCheck,
  Bell,
} from 'lucide-react';
import { StatusDot, SeverityDot } from '@/components/StatusIndicator';
import { uploadComplaintImageToStorage } from '@/lib/storage';
import {
  createNotification,
  fetchUserNotifications,
  markNotificationRead,
  registerFcmPushToken,
} from '@/lib/notifications';
import { NotificationRecord } from '@/lib/types/civic';
import { motion } from 'motion/react';

interface LocationState {
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  address: string;
  city: string;
  area: string;
  loading: boolean;
  error: string | null;
}

interface AIAnalysis {
  isCivicIssue?: boolean;
  nonCivicReason?: string;
  aiTitle?: string;
  category: string;
  issueType: string;
  description: string;
  severity: string;
  department: string;
  publicSafetyAlert?: boolean;
  estimatedResolutionTime?: string;
  confidenceScore: number;
  keyObservations?: string[];
  customModelUsed?: boolean;
  customModelName?: string;
  customVisionDetectedClass?: string;
  customVisionDetectedLabel?: string;
  rfdetrDetections?: any[];
  rfdetrSupportedClasses?: string[];
  rfdetrUnsupportedClasses?: string[];
  rfdetrInferenceOk?: boolean;
  rfdetrError?: string;
  roboflowDetections?: any[];
  imageHash?: string;
}

interface CommunityVote {
  userId: string;
  userEmail: string;
  vote: 'yes' | 'no';
  comment: string;
  createdAt: string;
  distanceKm?: number;
}

interface IssueReport {
  id?: string;
  ticketId: string;
  userId: string;
  userEmail: string;
  title: string;
  category: string;
  issueType: string;
  description: string;
  severity: string;
  department: string;
  publicSafetyAlert?: boolean;
  estimatedResolutionTime?: string;
  imageHash?: string;
  imageStoragePath?: string;
  location: {
    latitude: number | null;
    longitude: number | null;
    address: string;
    city: string;
    area: string;
  };
  imageUrl: string;
  aiAnalysis: AIAnalysis;
  status: 'Submitted' | 'Assigned' | 'Acknowledged' | 'In Progress' | 'Under Verification' | 'Resolved' | 'Closed' | 'Rejected';
  createdAt: any;
  upvotes: number;
  parentId?: string | null;
  isDuplicate?: boolean;
  duplicateCount?: number;
  supportersCount?: number;
  supporters?: string[];
  evidencePhotos?: string[];
  duplicateMatchInfo?: any;
  resolutionProofUrl?: string;
  resolutionNotes?: string;
  resolvedAt?: any;
  communityVotes?: CommunityVote[];
  voteStats?: {
    yes: number;
    no: number;
  };
  isDisputed?: boolean;
}

function calculateDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth's radius in KM
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10;
}

const CATEGORIES = [
  'Roads & Infrastructure',
  'Waste & Sanitation',
  'Water & Drainage',
  'Power & Street Lighting',
  'Traffic & Public Transit',
  'Parks & Public Spaces',
  'Public Safety & Vandalism',
  'Other',
];

const SEVERITY_LEVELS = ['Low', 'Medium', 'High', 'Critical'];

export default function CitizenDashboard() {
  const router = useRouter();
  const { t } = useLanguage();
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'home' | 'report' | 'reports' | 'explore'>('home');

  // Issue Form State
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [imageMime, setImageMime] = useState<string>('image/jpeg');
  const [analyzingImage, setAnalyzingImage] = useState(false);
  const [aiResult, setAiResult] = useState<AIAnalysis | null>(null);

  // Editable Form Fields
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [issueType, setIssueType] = useState('');
  const [severity, setSeverity] = useState('Medium');
  const [department, setDepartment] = useState('Public Works Dept');
  const [description, setDescription] = useState('');
  const [manualAddress, setManualAddress] = useState('');

  // Geolocation
  const [location, setLocation] = useState<LocationState>({
    latitude: null,
    longitude: null,
    accuracy: null,
    address: '',
    city: '',
    area: '',
    loading: false,
    error: null,
  });

  // Camera Modal State
  const [showCamera, setShowCamera] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const cameraRequestIdRef = useRef(0);
  const [mediaStream, setMediaStream] = useState<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraLoading, setCameraLoading] = useState(false);

  // Submitting
  const [submitting, setSubmitting] = useState(false);
  const [submittedTicket, setSubmittedTicket] = useState<IssueReport | null>(null);

  // User Reports List
  const [myReports, setMyReports] = useState<IssueReport[]>([]);
  const [loadingReports, setLoadingReports] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>('All');
  const [selectedReportDetail, setSelectedReportDetail] = useState<IssueReport | null>(null);

  // Delete Modal State
  const [deleteConfirmModal, setDeleteConfirmModal] = useState<{ reportId: string; ticketId: string } | null>(null);
  const [deleting, setDeleting] = useState(false);

  // AI Duplicate Detection Modal State
  const [duplicateModal, setDuplicateModal] = useState<{
    isOpen: boolean;
    match: any;
    newReportData: any;
    compressedImage: string;
  } | null>(null);

  // Security Access Banner State
  const [accessDeniedAlert, setAccessDeniedAlert] = useState(false);

  // Inline Feedback Banner State (replaces window.alert)
  const [portalBanner, setPortalBanner] = useState<{
    type: 'success' | 'error' | 'info';
    message: string;
  } | null>(null);

  // All Reports for Explore
  const [allReports, setAllReports] = useState<IssueReport[]>([]);
  const [loadingExplore, setLoadingExplore] = useState(false);
  const [exploreSearch, setExploreSearch] = useState('');

  // Speech-to-Text / Voice Input State
  const [isListening, setIsListening] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(true);
  const [voiceLang, setVoiceLang] = useState<'hi-IN' | 'en-IN' | 'en-US'>('hi-IN');
  const recognitionRef = useRef<any>(null);

  // Editable Form Fields additions
  const [publicSafetyAlert, setPublicSafetyAlert] = useState(false);
  const [estimatedResolutionTime, setEstimatedResolutionTime] = useState('48-72 hours');
  const [capturedImageHash, setCapturedImageHash] = useState<string | null>(null);

  // Notification Layer State
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const [notifOpen, setNotifOpen] = useState(false);

  // Community Resolution Verification Voting State
  const [voteOption, setVoteOption] = useState<'yes' | 'no' | null>(null);
  const [voteComment, setVoteComment] = useState('');
  const [submittingVote, setSubmittingVote] = useState(false);
  const [voteSuccessMessage, setVoteSuccessMessage] = useState<string | null>(null);

  const handleCommunityVote = async () => {
    if (!selectedReportDetail || !selectedReportDetail.id || !voteOption) return;
    setSubmittingVote(true);
    setVoteSuccessMessage(null);

    try {
      let distKm: number | undefined = undefined;
      if (location.latitude && selectedReportDetail.location?.latitude) {
        distKm = calculateDistanceKm(
          location.latitude,
          location.longitude!,
          selectedReportDetail.location.latitude,
          selectedReportDetail.location.longitude!
        );
      }

      const newVote: CommunityVote = {
        userId: user?.uid || 'anon',
        userEmail: user?.email || 'citizen@civic.org',
        vote: voteOption,
        comment: voteComment.trim(),
        createdAt: new Date().toISOString(),
      };

      if (distKm !== undefined && !isNaN(distKm)) {
        newVote.distanceKm = distKm;
      }

      const existingVotes = selectedReportDetail.communityVotes || [];
      const filteredVotes = existingVotes.filter((v) => v.userId !== user?.uid);
      const updatedVotes = [...filteredVotes, newVote];

      const yesCount = updatedVotes.filter((v) => v.vote === 'yes').length;
      const noCount = updatedVotes.filter((v) => v.vote === 'no').length;
      const isDisputed = noCount >= 2 && noCount >= yesCount;

      // Record supplementary vote ONLY — never alters official RVE status or outcome
      await updateDoc(doc(db, 'issues', selectedReportDetail.id), {
        communityVotes: updatedVotes,
        voteStats: { yes: yesCount, no: noCount },
        isDisputed: isDisputed,
      });

      await addDoc(collection(db, 'communityVerifications'), {
        complaintId: selectedReportDetail.id,
        ticketId: selectedReportDetail.ticketId,
        userId: user?.uid || 'anon',
        userEmail: user?.email || 'citizen@civic.org',
        vote: voteOption,
        comment: voteComment.trim(),
        distanceKm: distKm ?? null,
        createdAt: new Date().toISOString(),
      }).catch(() => {});

      // Award +5 Karma points to the voting citizen
      if (user?.uid) {
        try {
          await setDoc(doc(db, 'users', user.uid), { karmaPoints: 105 }, { merge: true });
        } catch (e) {
          console.warn('Karma update:', e);
        }
      }

      const updatedDetail: IssueReport = {
        ...selectedReportDetail,
        communityVotes: updatedVotes,
        voteStats: { yes: yesCount, no: noCount },
        isDisputed: isDisputed,
      };

      setSelectedReportDetail(updatedDetail);
      setVoteSuccessMessage('Verification vote recorded! You earned +5 Karma Points.');
      setVoteComment('');
      setVoteOption(null);

      if (user) fetchUserReports(user.uid);
      fetchAllReports();
    } catch (err) {
      console.error('Error submitting community vote:', err);
      setPortalBanner({
        type: 'error',
        message: 'Failed to submit verification vote. Check your connection, then retry.',
      });
    } finally {
      setSubmittingVote(false);
    }
  };

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const SpeechRecognition =
        (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (!SpeechRecognition) {
        setSpeechSupported(false);
      }
    }
  }, []);

  const toggleVoiceInput = () => {
    if (typeof window === 'undefined') return;
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setPortalBanner({
        type: 'info',
        message: 'Voice input is not supported in this browser. Please type your description or use Chrome, Edge, or Safari.',
      });
      return;
    }

    if (isListening) {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {
          // ignore
        }
      }
      setIsListening(false);
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = voiceLang;

      recognition.onstart = () => {
        setIsListening(true);
      };

      recognition.onresult = (event: any) => {
        let currentTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            currentTranscript += transcript + ' ';
          }
        }
        if (currentTranscript.trim()) {
          setDescription((prev) =>
            prev ? `${prev.trim()} ${currentTranscript.trim()}` : currentTranscript.trim()
          );
        }
      };

      recognition.onerror = (event: any) => {
        console.warn('Speech recognition error:', event.error);
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (err) {
      console.warn('Failed to start speech recognition:', err);
      setIsListening(false);
    }
  };

  // Automatically turn camera off when tab is hidden, page hides, or component unmounts
  useEffect(() => {
    const releaseCameraHardware = () => {
      cameraRequestIdRef.current += 1;
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((track) => track.stop());
        mediaStreamRef.current = null;
      }
      setMediaStream((prev) => {
        if (prev) prev.getTracks().forEach((track) => track.stop());
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
      setShowCamera(false);
    };

    const handleVisibilityChange = () => {
      if (typeof document !== 'undefined' && document.hidden) {
        releaseCameraHardware();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pagehide', releaseCameraHardware);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pagehide', releaseCameraHardware);
      releaseCameraHardware();
    };
  }, []);

  // Automatically turn camera off if user switches away from the report tab
  useEffect(() => {
    if (activeTab !== 'report' && (showCamera || mediaStreamRef.current)) {
      stopCamera();
    }
  }, [activeTab]);

  // Check URL params for security alert
  useEffect(() => {
    if (typeof window !== 'undefined' && window.location.search.includes('access_denied=1')) {
      setAccessDeniedAlert(true);
    }
  }, []);

  // Auth Listener
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
            await setDoc(doc(db, 'users', effUser.uid), {
              uid: effUser.uid,
              email: (effUser.email || 'citizen@user.org').toLowerCase(),
              name: (effUser.displayName || (effUser.email || 'citizen').split('@')[0]).slice(0, 120),
              role: 'citizen',
              createdAt: nowIso,
              updatedAt: nowIso,
            }, { merge: true });
          } catch (setErr) {
            console.warn('Notice: Firestore profile setDoc offline:', setErr);
          }
        }

        if (typeof window !== 'undefined') {
          localStorage.setItem('user_role', userRole);
          localStorage.setItem('user_uid', effUser.uid);
          if (effUser.email) localStorage.setItem('user_email', effUser.email.toLowerCase());
        }

        if (userRole === 'authority') {
          router.push('/authority');
          return;
        } else if (userRole === 'admin') {
          router.push('/admin');
          return;
        }
      } catch (e) {
        console.warn('Citizen role verification error:', e);
      }

      setLoading(false);
      fetchUserReports(effUser.uid);
      fetchAllReports();
      fetchUserNotifications(effUser.uid).then(setNotifications);
    });

    return () => unsubscribe();
  }, [router]);

  // Request Geolocation
  const getGeolocation = () => {
    if (!navigator.geolocation) {
      setLocation((prev) => ({
        ...prev,
        error: 'Geolocation is not supported by your browser',
      }));
      return;
    }

    setLocation((prev) => ({ ...prev, loading: true, error: null }));

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const acc = pos.coords.accuracy;

        try {
          // Reverse geocode via Nominatim with timeout and graceful fallback
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 3500);

          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`,
            {
              headers: { 'Accept-Language': 'en' },
              signal: controller.signal,
            }
          );
          clearTimeout(timeoutId);

          if (res.ok) {
            const data = await res.json();
            const addr = data.address || {};
            const road = addr.road || addr.pedestrian || addr.suburb || addr.neighbourhood || '';
            const city = addr.city || addr.town || addr.village || addr.county || 'Metropolis';
            const state = addr.state || '';
            const formatted =
              [road, city, state].filter(Boolean).join(', ') ||
              data.display_name ||
              `${lat.toFixed(4)}°, ${lng.toFixed(4)}°`;

            setLocation({
              latitude: lat,
              longitude: lng,
              accuracy: acc,
              address: formatted,
              city,
              area: road || 'Local Area',
              loading: false,
              error: null,
            });
            setManualAddress(formatted);
            return;
          }
        } catch {
          // Graceful fallback on network block / timeout / CORS error
        }

        // Fallback
        const fallbackAddr = `GPS Pin (${lat.toFixed(4)}° N, ${lng.toFixed(4)}° E)`;
        setLocation({
          latitude: lat,
          longitude: lng,
          accuracy: acc,
          address: fallbackAddr,
          city: 'City Zone',
          area: 'Geotagged Area',
          loading: false,
          error: null,
        });
        setManualAddress(fallbackAddr);
      },
      (err) => {
        console.warn('Geolocation error:', err);
        setLocation((prev) => ({
          ...prev,
          loading: false,
          error: 'Location access denied or unavailable. Please specify address manually.',
        }));
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
    );
  };

  // Run geolocation when user navigates to report tab or selects image
  useEffect(() => {
    if (activeTab === 'report' && !location.latitude && !location.loading) {
      getGeolocation();
    }
  }, [activeTab]);

  // Helper to compress base64 images before saving to Firestore (prevents 1MB document size limit error)
  const compressImageBase64 = (dataUrl: string, maxDim = 800, quality = 0.65): Promise<string> => {
    return new Promise((resolve) => {
      if (!dataUrl || !dataUrl.startsWith('data:image')) {
        resolve(dataUrl);
        return;
      }
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', quality));
        } else {
          resolve(dataUrl);
        }
      };
      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
    });
  };

  // Handle File Upload
  const handleImageSelect = async (file: File) => {
    if (!file) return;

    // Reset previous report state so old categories or pothole details don't contaminate new image
    setAiResult(null);
    setTitle('');
    setDescription('');
    setIssueType('');
    setCategory('');

    // Trigger Geolocation simultaneously
    if (!location.latitude) {
      getGeolocation();
    }

    const reader = new FileReader();
    reader.onload = async (e) => {
      const rawBase64 = e.target?.result as string;
      const compressed = await compressImageBase64(rawBase64, 800, 0.65);
      setSelectedImage(compressed);
      setImageMime('image/jpeg');

      // Trigger AI Analysis
      analyzeImageWithGemini(compressed, 'image/jpeg');
    };
    reader.readAsDataURL(file);
  };

  // Camera handling (strictly on only while modal is open and actively used)
  const startCamera = async () => {
    const requestId = ++cameraRequestIdRef.current;
    setCameraError(null);
    setCameraLoading(true);
    setShowCamera(true);

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
      setMediaStream(null);
    }

    if (
      typeof navigator === 'undefined' ||
      !navigator.mediaDevices ||
      !navigator.mediaDevices.getUserMedia
    ) {
      setCameraLoading(false);
      setCameraError(
        'Live camera preview is not supported in this browser context. You can upload a photo from your device below.'
      );
      return;
    }

    try {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
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

      // Guard against modal closing or tab hiding before getUserMedia resolved
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
      console.warn('Camera access unavailable:', err?.name || err);
      const errName = err?.name || '';
      if (errName === 'NotAllowedError' || errName === 'PermissionDeniedError') {
        setCameraError(
          'Camera permission was denied. Allow camera access in your browser site settings and tap Retry, or upload a photo from your device below.'
        );
      } else if (errName === 'NotFoundError' || errName === 'DevicesNotFoundError') {
        setCameraError(
          'No camera was detected on this device. Upload a photo from your device below instead.'
        );
      } else if (errName === 'NotReadableError' || errName === 'TrackStartError') {
        setCameraError(
          'Your camera is currently busy in another app. Close the other app and tap Retry, or upload a photo below.'
        );
      } else {
        setCameraError(
          'Could not start the live camera preview. Check camera permissions and tap Retry, or upload a photo below.'
        );
      }
    } finally {
      if (requestId === cameraRequestIdRef.current) {
        setCameraLoading(false);
      }
    }
  };

  const stopCamera = () => {
    cameraRequestIdRef.current += 1;
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
    setMediaStream((prev) => {
      if (prev) prev.getTracks().forEach((track) => track.stop());
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
    setCameraError(null);
    setCameraLoading(false);
    setShowCamera(false);
  };

  const captureCameraPhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;

      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        setSelectedImage(dataUrl);
        setImageMime('image/jpeg');

        // Reset previous report state
        setAiResult(null);
        setTitle('');
        setDescription('');
        setIssueType('');
        setCategory('');

        stopCamera();

        // Trigger Geolocation and AI
        if (!location.latitude) {
          getGeolocation();
        }
        analyzeImageWithGemini(dataUrl, 'image/jpeg');
      }
    }
  };

  // Analyze Image using RF-DETR + Gemini 2.5 Flash Server Endpoint (Zero Fake Fallbacks)
  const analyzeImageWithGemini = async (base64Img: string, mime: string) => {
    setAnalyzingImage(true);
    setAiResult(null);
    setPortalBanner(null);

    try {
      const compressedImg = await compressImageBase64(base64Img, 800, 0.72);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);

      const res = await fetch('/api/analyze-issue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: compressedImg, mimeType: mime }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      const data = await res.json();

      if (res.ok && data.success && data.analysis) {
        const analysis: AIAnalysis = data.analysis;
        setAiResult(analysis);
        setCapturedImageHash(data.imageHash || analysis.imageHash || null);

        if (analysis.isCivicIssue === false) {
          setTitle('');
          setDescription('');
          setIssueType('Non-Civic / Personal Photo Detected');
          setCategory(analysis.category || 'Other');
          setSeverity('Low');
          setDepartment('N/A');
          setPublicSafetyAlert(false);
          setEstimatedResolutionTime('N/A');
        } else {
          const finalTitle = analysis.aiTitle || analysis.issueType || 'Civic Infrastructure Defect';
          setCategory(analysis.category || 'Other');
          setIssueType(analysis.issueType || finalTitle);
          setTitle(finalTitle);
          setSeverity(analysis.severity || 'Medium');
          setDepartment(analysis.department || 'Municipal General Civic Works');
          setDescription(analysis.description || '');
          setPublicSafetyAlert(Boolean(analysis.publicSafetyAlert));
          setEstimatedResolutionTime(analysis.estimatedResolutionTime || '48-72 hours');
        }
      } else {
        setCapturedImageHash(data.imageHash || null);
        setPortalBanner({
          type: 'error',
          message:
            data.error ||
            'AI analysis could not be completed. Please retry or fill in the complaint details manually.',
        });
      }
    } catch (err: any) {
      setPortalBanner({
        type: 'error',
        message:
          err?.name === 'AbortError'
            ? 'AI analysis timed out. Please retry or enter details manually.'
            : 'Unable to reach AI analysis service. Please retry or enter details manually.',
      });
    } finally {
      setAnalyzingImage(false);
    }
  };

  // Fetch User Reports
  const fetchUserReports = async (uid: string) => {
    setLoadingReports(true);
    try {
      const q = query(collection(db, 'issues'), where('userId', '==', uid));
      const snapshot = await getDocs(q);
      const reports: IssueReport[] = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...(doc.data() as Omit<IssueReport, 'id'>),
      }));
      // Sort manually by date
      reports.sort((a, b) => {
        const timeA = a.createdAt?.seconds ? a.createdAt.seconds * 1000 : new Date(a.createdAt || 0).getTime();
        const timeB = b.createdAt?.seconds ? b.createdAt.seconds * 1000 : new Date(b.createdAt || 0).getTime();
        return timeB - timeA;
      });
      setMyReports(reports);
    } catch (err) {
      const errInfo = buildFirestoreErrorInfo(err, OperationType.LIST, 'issues');
      console.error('Firestore Error: ', JSON.stringify(errInfo));
    } finally {
      setLoadingReports(false);
    }
  };

  // Fetch All Reports (explicit status filter satisfies Firestore query rules)
  const fetchAllReports = async () => {
    setLoadingExplore(true);
    try {
      const q = query(collection(db, 'issues'), where('status', 'in', [...ALL_ISSUE_STATUSES]));
      const snapshot = await getDocs(q);
      const reports: IssueReport[] = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...(doc.data() as Omit<IssueReport, 'id'>),
      }));
      reports.sort((a, b) => {
        const timeA = a.createdAt?.seconds ? a.createdAt.seconds * 1000 : new Date(a.createdAt || 0).getTime();
        const timeB = b.createdAt?.seconds ? b.createdAt.seconds * 1000 : new Date(b.createdAt || 0).getTime();
        return timeB - timeA;
      });
      setAllReports(reports);
    } catch (err) {
      const errInfo = buildFirestoreErrorInfo(err, OperationType.LIST, 'issues');
      console.error('Firestore Error: ', JSON.stringify(errInfo));
    } finally {
      setLoadingExplore(false);
    }
  };

  // Open Custom Delete Confirmation Modal
  const handleDeleteReport = (e: React.MouseEvent | undefined, reportId: string, ticketId: string) => {
    if (e) e.stopPropagation();
    setDeleteConfirmModal({ reportId, ticketId });
  };

  // Execute Delete Report permanently
  const executeDeleteReport = async () => {
    if (!deleteConfirmModal) return;
    const { reportId, ticketId } = deleteConfirmModal;
    setDeleting(true);
    try {
      await deleteDoc(doc(db, 'issues', reportId));
      setMyReports((prev) => prev.filter((r) => r.id !== reportId));
      setAllReports((prev) => prev.filter((r) => r.id !== reportId));
      if (selectedReportDetail?.id === reportId) {
        setSelectedReportDetail(null);
      }
      setDeleteConfirmModal(null);
    } catch (err: any) {
      console.error('Error deleting report:', err);
      setPortalBanner({
        type: 'error',
        message: `Failed to delete record: ${err.message}`,
      });
    } finally {
      setDeleting(false);
    }
  };

  // Handle Form Submission
  const handleSubmitReport = async (e: React.FormEvent) => {
    e.preventDefault();
    setPortalBanner(null);
    if (!selectedImage) {
      setPortalBanner({
        type: 'error',
        message: 'Please add or capture a photograph of the civic issue first.',
      });
      return;
    }
    if (aiResult?.isCivicIssue === false || aiResult?.confidenceScore === 0) {
      setPortalBanner({
        type: 'error',
        message: 'We could not identify a civic issue in this photo. Try a clear photograph of the affected public area.',
      });
      return;
    }
    if (!user) return;

    setSubmitting(true);

    try {
      // Compress image to ensure document size is well under 100KB
      const compressedImage = await compressImageBase64(selectedImage, 800, 0.6);

      const randomTicketNum = Math.floor(10000 + Math.random() * 90000);
      const generatedTicketId = `CIV-${randomTicketNum}`;

      const reportData: Omit<IssueReport, 'id'> = {
        ticketId: generatedTicketId,
        userId: user.uid,
        userEmail: user.email || 'anonymous@citizen.gov',
        title: title.trim() || issueType || 'Civic Issue',
        category,
        issueType: issueType || 'Civic Defect',
        description: description.trim() || 'Reported civic issue requiring verification and resolution.',
        severity,
        department,
        publicSafetyAlert,
        estimatedResolutionTime,
        imageHash: capturedImageHash || aiResult?.imageHash || undefined,
        location: {
          latitude: location.latitude,
          longitude: location.longitude,
          address: manualAddress || location.address || 'Location Tagged',
          city: location.city || 'City District',
          area: location.area || 'Neighborhood',
        },
        imageUrl: compressedImage,
        aiAnalysis: aiResult || {
          category,
          issueType: issueType || 'General Issue',
          description,
          severity,
          department,
          confidenceScore: 0,
        },
        status: 'Submitted',
        createdAt: new Date().toISOString(),
        upvotes: 1,
        supportersCount: 1,
        supporters: [user.uid],
        duplicateCount: 0,
        evidencePhotos: [compressedImage],
      };

      // RUN 4-DIMENSIONAL DUPLICATE CHECK (Haversine <= 20m, pHash, Temporal, TF-IDF Cosine)
      try {
        const dupCheckRes = await fetch('/api/check-duplicates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            newIssue: {
              latitude: location.latitude,
              longitude: location.longitude,
              title: title || issueType,
              description: description || title || issueType,
              category,
              issueType,
              imageBase64: compressedImage,
              imageHash: capturedImageHash || aiResult?.imageHash || null,
            },
            candidateIssues: allReports.filter((r) => r.status !== 'Resolved' && r.status !== 'Closed' && !r.isDuplicate),
          }),
        });

        if (dupCheckRes.ok) {
          const dupData = await dupCheckRes.json();
          if (dupData.duplicateFound && dupData.topMatch) {
            setDuplicateModal({
              isOpen: true,
              match: dupData.topMatch,
              newReportData: reportData,
              compressedImage,
            });
            setSubmitting(false);
            return;
          }
        }
      } catch (dupErr) {
        console.warn('Duplicate detection call failed:', dupErr);
      }

      // If no duplicate match, upload media to Firebase Storage and commit to Firestore
      await createNewReport(reportData);
    } catch (err) {
      console.error('Error submitting report to Firestore:', err);
      setPortalBanner({
        type: 'error',
        message: "Couldn't submit the report. Check your connection, then retry.",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const createNewReport = async (reportData: Omit<IssueReport, 'id'>) => {
    const finalReport = { ...reportData };

    // Upload citizen photograph cleanly to Firebase Storage path: complaints/{ticketId}/...
    const storageUpload = await uploadComplaintImageToStorage({
      complaintId: finalReport.ticketId,
      imageDataUrl: finalReport.imageUrl,
    });
    if (storageUpload.ok && storageUpload.url) {
      finalReport.imageUrl = storageUpload.url;
      finalReport.imageStoragePath = storageUpload.storagePath;
      finalReport.evidencePhotos = [storageUpload.url];
    }

    const docRef = await addDoc(collection(db, 'issues'), finalReport);
    const createdObj: IssueReport = {
      id: docRef.id,
      ...finalReport,
    };

    await createNotification({
      recipientUid: user!.uid,
      recipientRole: 'citizen',
      complaintId: docRef.id,
      ticketId: finalReport.ticketId,
      title: `Complaint Registered: ${finalReport.ticketId}`,
      message: `Your report "${finalReport.title}" has been routed to ${finalReport.department}.`,
      type: 'COMPLAINT_REGISTERED',
    });

    await logSecurityEvent({
      userId: user!.uid,
      actorId: user!.uid,
      email: user!.email || 'citizen@crowdcivic.org',
      role: 'citizen',
      actorRole: 'citizen',
      complaintId: docRef.id,
      ticketId: finalReport.ticketId,
      previousState: 'NEW',
      newState: 'Submitted',
      action: 'COMPLAINT_REGISTERED',
      portal: 'citizen',
      status: 'SUCCESS',
      details: `Registered ${finalReport.ticketId} (${finalReport.category}) routed to ${finalReport.department}. Storage: ${storageUpload.ok ? storageUpload.storagePath : 'inline-fallback'}`,
    });

    setSubmittedTicket(createdObj);
    fetchUserReports(user!.uid);
    fetchAllReports();
    fetchUserNotifications(user!.uid).then(setNotifications);
  };

  // Join Existing Duplicate Complaint
  const handleJoinExistingComplaint = async () => {
    if (!duplicateModal || !user) return;
    const { match, compressedImage, newReportData } = duplicateModal;
    setSubmitting(true);

    try {
      const parentRef = doc(db, 'issues', match.candidateId);
      const parentSnap = await getDoc(parentRef);

      if (parentSnap.exists()) {
        const parentData = parentSnap.data();
        const existingSupporters: string[] = parentData.supporters || [];
        const existingPhotos: string[] = parentData.evidencePhotos || [parentData.imageUrl || compressedImage];

        const newSupporters = Array.from(new Set([...existingSupporters, user.uid]));
        const updatedSupportersCount = newSupporters.length;
        const updatedDuplicateCount = (parentData.duplicateCount || 0) + 1;
        const updatedPhotos = Array.from(new Set([...existingPhotos, compressedImage]));

        let newSeverity = parentData.severity || 'Medium';
        if (updatedSupportersCount >= 15) {
          newSeverity = 'Critical';
        } else if (updatedSupportersCount >= 5 && newSeverity !== 'Critical') {
          newSeverity = 'High';
        }

        // Update parent issue with +1 supporter, extra photo, auto-escalated priority
        await updateDoc(parentRef, {
          supporters: newSupporters,
          supportersCount: updatedSupportersCount,
          upvotes: updatedSupportersCount,
          duplicateCount: updatedDuplicateCount,
          evidencePhotos: updatedPhotos,
          severity: newSeverity,
          updatedAt: new Date().toISOString(),
        });

        // Add duplicate child document to Firestore for complete audit log
        const childTicketId = `CIV-DUP-${Math.floor(10000 + Math.random() * 90000)}`;
        await addDoc(collection(db, 'issues'), {
          ...newReportData,
          ticketId: childTicketId,
          parentId: match.candidateId,
          isDuplicate: true,
          duplicateMatchInfo: {
            overallScore: match.overallScore,
            locationScore: match.locationScore,
            imageScore: match.imageScore,
            textScore: match.textScore,
            reason: match.reason,
          },
        });

        setPortalBanner({
          type: 'success',
          message: `Joined ${match.ticketId}! Your support (+1) and photo evidence were added. Priority updated to ${newSeverity}.`,
        });

        setSubmittedTicket({
          id: match.candidateId,
          ...parentData,
          ticketId: match.ticketId,
          supportersCount: updatedSupportersCount,
          severity: newSeverity,
        } as IssueReport);

        setDuplicateModal(null);
        resetForm();
        fetchUserReports(user.uid);
        fetchAllReports();
      }
    } catch (err: any) {
      console.error('Error joining complaint:', err);
      setPortalBanner({
        type: 'error',
        message: `Failed to join existing report: ${err.message}`,
      });
    } finally {
      setSubmitting(false);
    }
  };

  // Upvote / Support Issue from Feed
  const handleUpvoteIssue = async (issueId: string) => {
    if (!user) return;
    try {
      const issueRef = doc(db, 'issues', issueId);
      const snap = await getDoc(issueRef);
      if (snap.exists()) {
        const data = snap.data();
        const existingSupporters: string[] = data.supporters || [];
        if (existingSupporters.includes(user.uid)) {
          setPortalBanner({
            type: 'info',
            message: 'You have already supported this report.',
          });
          return;
        }
        const updatedSupporters = [...existingSupporters, user.uid];
        const updatedCount = updatedSupporters.length;

        let newSeverity = data.severity || 'Medium';
        if (updatedCount >= 15) {
          newSeverity = 'Critical';
        } else if (updatedCount >= 5 && newSeverity !== 'Critical') {
          newSeverity = 'High';
        }

        await updateDoc(issueRef, {
          supporters: updatedSupporters,
          supportersCount: updatedCount,
          upvotes: updatedCount,
          severity: newSeverity,
        });

        setAllReports((prev) =>
          prev.map((r) =>
            r.id === issueId
              ? {
                  ...r,
                  supporters: updatedSupporters,
                  supportersCount: updatedCount,
                  upvotes: updatedCount,
                  severity: newSeverity,
                }
              : r
          )
        );
      }
    } catch (err) {
      console.error('Error upvoting issue:', err);
    }
  };

  const resetForm = () => {
    if (recognitionRef.current && isListening) {
      try {
        recognitionRef.current.stop();
      } catch {
        // ignore
      }
      setIsListening(false);
    }
    setSelectedImage(null);
    setAiResult(null);
    setTitle('');
    setIssueType('');
    setDescription('');
    setSubmittedTicket(null);
    setManualAddress('');
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

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F4F8FD] flex items-center justify-center p-4">
        <div className="bg-white border border-[#DCE7F5] rounded-2xl px-6 py-5 flex items-center gap-3 shadow-xs">
          <RefreshCw className="w-5 h-5 animate-spin text-[#15427B]" />
          <span className="text-sm font-medium text-[#13345D]">Loading Citizen Portal...</span>
        </div>
      </div>
    );
  }

  const formatShortDate = (createdAt: any) => {
    try {
      if (createdAt?.seconds) {
        return new Date(createdAt.seconds * 1000).toLocaleDateString('en-GB', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
        });
      }
      if (createdAt) {
        const d = new Date(createdAt);
        if (!isNaN(d.getTime())) {
          return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
        }
      }
    } catch {
      // ignore
    }
    return 'Recent';
  };

  const getPipelineStageIndex = (status: string, isDisputed?: boolean) => {
    if (status === 'Resolved') return 5;
    if (isDisputed) return 4;
    if (status === 'In Progress') return 2;
    if (status === 'Under Verification' || status === 'Assigned') return 1;
    return 0;
  };

  const PIPELINE_STEPS = [
    'Submitted',
    'Under review',
    'In progress',
    'Resolution submitted',
    'Community verification',
    'Closed',
  ];

  return (
    <div className="min-h-screen bg-[#F4F8FD] text-[#13345D] flex flex-col font-sans pb-16 sm:pb-0">
      {/* ACCESS DENIED SECURITY BANNER */}
      {accessDeniedAlert && (
        <div className="bg-white border-b border-[#FCA5A5] text-[#DC2626] py-3 px-4 text-xs font-medium flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 max-w-7xl mx-auto">
            <ShieldAlert className="w-4 h-4 text-[#DC2626] shrink-0" />
            <div>
              <span className="font-bold text-[#13345D] block">Access Blocked: Municipal Portal Guard</span>
              <span className="text-[#475569]">
                Your account is authenticated as a Citizen. Direct access to Municipal Authority or Admin Governance portals is restricted.
              </span>
            </div>
          </div>
          <button onClick={() => setAccessDeniedAlert(false)} className="text-[#64748B] hover:text-[#13345D] p-1 rounded-lg">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* TOP DARK NAVY GOVERNANCE UTILITY BAR (Matches Landing Page) */}
      <div className="hidden sm:block w-full bg-[#0B2A52] text-white text-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-9 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5 truncate">
            <span className="font-semibold tracking-tight whitespace-nowrap">CrowdCivic AI</span>
            <span className="text-white/40" aria-hidden="true">
              |
            </span>
            <span className="text-white/85 truncate">Citizen Grievance &amp; Verification Portal</span>
          </div>
          <div className="flex items-center gap-4 text-white/85 shrink-0">
            <span className="hidden md:inline">Public Works Helpline · 311</span>
            <span className="text-white/40 hidden md:inline">|</span>
            <span className="font-medium text-white truncate max-w-[200px]">{user?.email}</span>
          </div>
        </div>
      </div>

      {/* STICKY WHITE HEADER BAR (Matches Landing Page Brand Lockup & Nav Underline) */}
      <header className="w-full bg-white border-b border-[#E2E8F0] sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="h-[68px] flex items-center justify-between gap-4">
            <div
              onClick={() => {
                setActiveTab('home');
                resetForm();
              }}
              className="flex items-center gap-3 cursor-pointer shrink-0"
            >
              <div className="w-10 h-10 rounded-xl bg-[#133B6E] text-white flex items-center justify-center relative shadow-xs shrink-0">
                <Building2 className="w-5 h-5" />
                <span className="w-2 h-2 rounded-full bg-[#F59E0B] absolute top-1.5 right-1.5" />
              </div>
              <div>
                <div className="text-[17px] font-bold tracking-tight leading-tight flex items-center gap-1">
                  <span className="text-[#13345D]">CrowdCivic</span>
                  <span className="text-[#F59E0B]">AI</span>
                </div>
                <span className="text-[9px] font-bold tracking-[0.16em] text-[#64748B] uppercase block mt-0.5">
                  SMARTER CITIES, TOGETHER
                </span>
              </div>
            </div>

            {/* Center Nav Links with Landing Page Amber Underline */}
            <nav className="hidden lg:flex items-center gap-7 text-[14px] font-medium text-[#334155]">
              <button
                type="button"
                onClick={() => {
                  setActiveTab('home');
                  resetForm();
                }}
                className={`py-2 border-b-2 transition-colors whitespace-nowrap ${
                  activeTab === 'home'
                    ? 'border-[#F59E0B] text-[#13345D] font-semibold'
                    : 'border-transparent hover:text-[#15427B]'
                }`}
              >
                {t('citizen_portal', 'Dashboard')}
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveTab('report');
                  resetForm();
                }}
                className={`py-2 border-b-2 transition-colors whitespace-nowrap ${
                  activeTab === 'report'
                    ? 'border-[#F59E0B] text-[#13345D] font-semibold'
                    : 'border-transparent hover:text-[#15427B]'
                }`}
              >
                {t('report_issue', 'Report Issue')}
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('reports')}
                className={`py-2 border-b-2 transition-colors whitespace-nowrap ${
                  activeTab === 'reports'
                    ? 'border-[#F59E0B] text-[#13345D] font-semibold'
                    : 'border-transparent hover:text-[#15427B]'
                }`}
              >
                {t('my_issues', 'My Reports')} ({myReports.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('explore')}
                className={`py-2 border-b-2 transition-colors whitespace-nowrap ${
                  activeTab === 'explore'
                    ? 'border-[#F59E0B] text-[#13345D] font-semibold'
                    : 'border-transparent hover:text-[#15427B]'
                }`}
              >
                {t('public_feed', 'Explore Map')}
              </button>
            </nav>

            <div className="flex items-center gap-2 sm:gap-3 text-xs shrink-0 relative">
              <button
                type="button"
                onClick={async () => {
                  const next = !notifOpen;
                  setNotifOpen(next);
                  if (user?.uid) {
                    const list = await fetchUserNotifications(user.uid);
                    setNotifications(list);
                  }
                }}
                className="relative p-2 rounded-lg border border-[#E2E8F0] hover:border-[#BFDBFE] bg-white text-[#13345D] transition-colors"
                aria-label="Citizen Notifications"
              >
                <Bell className="w-4 h-4 text-[#15427B]" />
                {notifications.filter((n) => !n.read).length > 0 && (
                  <span className="w-2 h-2 rounded-full bg-[#F59E0B] absolute top-1.5 right-1.5" />
                )}
              </button>

              {notifOpen && (
                <div className="absolute right-0 top-12 w-80 bg-white border border-[#DCE7F5] rounded-2xl shadow-2xl p-4 z-50 space-y-3">
                  <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-2">
                    <span className="text-xs font-bold text-[#13345D]">Notifications</span>
                    <div className="flex items-center gap-2">
                      {user?.uid && (
                        <button
                          type="button"
                          onClick={async () => {
                            const r = await registerFcmPushToken(user.uid);
                            setPortalBanner({
                              type: r.ok ? 'success' : 'info',
                              message: r.ok ? 'Push notifications enabled.' : r.reason || 'Using in-app alerts.',
                            });
                          }}
                          className="text-[11px] font-semibold text-[#15427B] hover:underline"
                        >
                          Enable Push
                        </button>
                      )}
                      <button type="button" onClick={() => setNotifOpen(false)} className="text-[#64748B]">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  {notifications.length === 0 ? (
                    <p className="text-xs text-[#64748B] py-4 text-center">No notifications yet.</p>
                  ) : (
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {notifications.map((n) => (
                        <div
                          key={n.id}
                          onClick={() => {
                            if (n.id && !n.read) {
                              markNotificationRead(n.id);
                              setNotifications((prev) =>
                                prev.map((x) => (x.id === n.id ? { ...x, read: true } : x))
                              );
                            }
                          }}
                          className={`p-2.5 rounded-xl border text-xs cursor-pointer ${
                            n.read ? 'bg-white border-[#E2E8F0]' : 'bg-[#EFF6FF] border-[#BFDBFE]'
                          }`}
                        >
                          <p className="font-semibold text-[#13345D]">{n.title}</p>
                          <p className="text-[#475569] mt-0.5 leading-snug">{n.message}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <LanguageSelector />

              <button
                type="button"
                onClick={handleSignOut}
                className="text-xs font-semibold text-[#475569] hover:text-[#DC2626] px-3 py-2 rounded-lg border border-[#E2E8F0] hover:border-[#FCA5A5] bg-white transition-colors flex items-center gap-1.5 whitespace-nowrap"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{t('signOut', 'Sign Out')}</span>
              </button>
            </div>
          </div>

          {/* Tablet secondary nav row */}
          <nav className="hidden sm:flex lg:hidden items-center gap-6 py-2 border-t border-[#E2E8F0] text-xs">
            <button
              type="button"
              onClick={() => {
                setActiveTab('home');
                resetForm();
              }}
              className={`py-1 border-b-2 transition-colors ${
                activeTab === 'home' ? 'border-[#F59E0B] font-semibold text-[#13345D]' : 'border-transparent text-[#475569] font-medium'
              }`}
            >
              Dashboard
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab('report');
                resetForm();
              }}
              className={`py-1 border-b-2 transition-colors ${
                activeTab === 'report' ? 'border-[#F59E0B] font-semibold text-[#13345D]' : 'border-transparent text-[#475569] font-medium'
              }`}
            >
              Report Issue
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('reports')}
              className={`py-1 border-b-2 transition-colors ${
                activeTab === 'reports' ? 'border-[#F59E0B] font-semibold text-[#13345D]' : 'border-transparent text-[#475569] font-medium'
              }`}
            >
              My Reports ({myReports.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('explore')}
              className={`py-1 border-b-2 transition-colors ${
                activeTab === 'explore' ? 'border-[#F59E0B] font-semibold text-[#13345D]' : 'border-transparent text-[#475569] font-medium'
              }`}
            >
              Explore Map
            </button>
          </nav>
        </div>
      </header>

      {/* Mobile Bottom Navigation */}
      <nav
        aria-label="Mobile Navigation"
        className="sm:hidden fixed bottom-0 inset-x-0 bg-white border-t border-[#E2E8F0] z-40 grid grid-cols-4 px-2 shadow-[0_-2px_10px_rgba(15,41,74,0.06)]"
      >
        <button
          type="button"
          onClick={() => {
            setActiveTab('home');
            resetForm();
          }}
          className={`flex flex-col items-center justify-center gap-0.5 py-2 text-[11px] border-t-2 ${
            activeTab === 'home' ? 'border-[#F59E0B] font-bold text-[#13345D]' : 'border-transparent text-[#64748B] font-medium'
          }`}
        >
          <Home className={`w-4 h-4 ${activeTab === 'home' ? 'text-[#15427B]' : 'text-[#64748B]'}`} />
          <span>Home</span>
        </button>
        <button
          type="button"
          onClick={() => {
            setActiveTab('report');
            resetForm();
          }}
          className={`flex flex-col items-center justify-center gap-0.5 py-2 text-[11px] border-t-2 ${
            activeTab === 'report' ? 'border-[#F59E0B] font-bold text-[#13345D]' : 'border-transparent text-[#64748B] font-medium'
          }`}
        >
          <Plus className={`w-4 h-4 ${activeTab === 'report' ? 'text-[#15427B]' : 'text-[#64748B]'}`} />
          <span>Report</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('reports')}
          className={`flex flex-col items-center justify-center gap-0.5 py-2 text-[11px] border-t-2 ${
            activeTab === 'reports' ? 'border-[#F59E0B] font-bold text-[#13345D]' : 'border-transparent text-[#64748B] font-medium'
          }`}
        >
          <FileText className={`w-4 h-4 ${activeTab === 'reports' ? 'text-[#15427B]' : 'text-[#64748B]'}`} />
          <span>My Reports</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('explore')}
          className={`flex flex-col items-center justify-center gap-0.5 py-2 text-[11px] border-t-2 ${
            activeTab === 'explore' ? 'border-[#F59E0B] font-bold text-[#13345D]' : 'border-transparent text-[#64748B] font-medium'
          }`}
        >
          <Compass className={`w-4 h-4 ${activeTab === 'explore' ? 'text-[#15427B]' : 'text-[#64748B]'}`} />
          <span>Explore</span>
        </button>
      </nav>

      {/* Main Content */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {portalBanner && (
          <div
            className={`mb-6 bg-white rounded-xl border p-4 flex items-center justify-between gap-3 text-xs shadow-xs ${
              portalBanner.type === 'error' ? 'border-[#FCA5A5]' : 'border-[#DCE7F5]'
            }`}
          >
            <p
              className={`font-semibold ${
                portalBanner.type === 'error'
                  ? 'text-[#DC2626]'
                  : portalBanner.type === 'success'
                  ? 'text-[#0E8A4E]'
                  : 'text-[#13345D]'
              }`}
            >
              {portalBanner.message}
            </p>
            <button
              type="button"
              onClick={() => setPortalBanner(null)}
              className="text-[#64748B] hover:text-[#13345D] font-medium shrink-0"
            >
              Dismiss
            </button>
          </div>
        )}
        {/* VIEW 1: HOME DASHBOARD */}
        {activeTab === 'home' && (
          <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <div className="inline-flex items-center gap-2 text-[11px] font-bold tracking-wider uppercase text-[#15427B] mb-1">
                  <span className="w-5 h-[2px] bg-[#F59E0B]" />
                  <span>Citizen Redressal Workspace</span>
                </div>
                <h1 className="text-2xl sm:text-3xl font-bold text-[#13345D] tracking-tight">
                  {t('citizen_portal', 'Citizen Dashboard')}
                </h1>
                <p className="text-sm text-[#475569] mt-1">
                  Report civic problems with automatic GPS tagging and AI inspection.
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  setActiveTab('report');
                  resetForm();
                }}
                className="px-5 py-3 bg-[#F59E0B] hover:bg-[#D97706] text-[#0F294A] text-xs font-bold rounded-xl flex items-center justify-center gap-2 transition-colors shadow-xs self-start md:self-auto"
              >
                <Camera className="w-4 h-4" />
                <span>{t('report_issue', 'Report Issue')}</span>
              </button>
            </div>

            {/* Horizontal Verification Stepper Card */}
            <div className="bg-white rounded-2xl border border-[#E2E8F0] shadow-[0_2px_12px_rgba(15,41,74,0.04)] p-5 sm:p-6">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div>
                  <h2 className="text-base font-bold text-[#13345D]">
                    Your report, from first photo to verified repair
                  </h2>
                  <p className="text-xs text-[#475569] mt-1">
                    Every submission passes automated classification, spatial deduplication, and 3-gate repair audit.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab('report');
                      resetForm();
                    }}
                    className="px-4 py-2.5 bg-[#15427B] hover:bg-[#0F2F5A] text-white text-xs font-semibold rounded-lg flex items-center gap-2 transition-colors"
                  >
                    <Camera className="w-4 h-4" />
                    <span>Upload or Capture</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('explore')}
                    className="px-4 py-2.5 bg-white hover:bg-[#F4F8FD] text-[#13345D] text-xs font-semibold rounded-lg border border-[#CBD5E1] flex items-center gap-2 transition-colors"
                  >
                    <MapPin className="w-4 h-4 text-[#15427B]" />
                    <span>Explore Map</span>
                  </button>
                </div>
              </div>

              <div className="mt-4 pt-4 border-t border-[#E2E8F0] flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-xs">
                <span className="inline-flex items-center gap-1 font-semibold text-[#13345D]">
                  <Check className="w-3.5 h-3.5 text-[#0E8A4E]" /> Submitted
                </span>
                <span className="text-[#94A3B8]">→</span>
                <span className="inline-flex items-center gap-1 font-semibold text-[#13345D]">
                  <Check className="w-3.5 h-3.5 text-[#0E8A4E]" /> Under review
                </span>
                <span className="text-[#94A3B8]">→</span>
                <span className="inline-flex items-center gap-1 font-semibold text-[#13345D]">
                  <Check className="w-3.5 h-3.5 text-[#15427B]" /> In progress
                </span>
                <span className="text-[#94A3B8]">→</span>
                <span className="text-[#64748B]">Resolution submitted</span>
                <span className="text-[#94A3B8]">→</span>
                <span className="text-[#64748B]">Community verification</span>
                <span className="text-[#94A3B8]">→</span>
                <span className="text-[#64748B]">Closed</span>
              </div>
            </div>

            {/* 3 Feature Action Cards Matching Landing Page Top-Accent Borders */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div
                onClick={() => {
                  setActiveTab('report');
                  resetForm();
                }}
                className="bg-white p-6 rounded-2xl border border-[#E2E8F0] border-t-[3px] border-t-[#F59E0B] shadow-[0_2px_12px_rgba(15,41,74,0.04)] hover:border-[#CBD5E1] transition-all cursor-pointer group"
              >
                <div className="w-10 h-10 bg-[#FEF3C7] text-[#D97706] rounded-xl flex items-center justify-center mb-4">
                  <Camera className="w-5 h-5" />
                </div>
                <h3 className="font-bold text-[#13345D] text-base mb-1 flex items-center justify-between">
                  <span>{t('report_issue', 'Report Issue')}</span>
                  <ChevronRight className="w-4 h-4 text-[#64748B] group-hover:text-[#15427B] transition-colors" />
                </h3>
                <p className="text-xs text-[#475569] leading-relaxed">
                  Capture or upload a clear photograph with GPS coordinates for automated civic routing.
                </p>
              </div>

              <div
                onClick={() => setActiveTab('reports')}
                className="bg-white p-6 rounded-2xl border border-[#E2E8F0] border-t-[3px] border-t-[#15427B] shadow-[0_2px_12px_rgba(15,41,74,0.04)] hover:border-[#CBD5E1] transition-all cursor-pointer group"
              >
                <div className="w-10 h-10 bg-[#EFF6FF] text-[#15427B] rounded-xl flex items-center justify-center mb-4">
                  <FileText className="w-5 h-5" />
                </div>
                <h3 className="font-bold text-[#13345D] text-base mb-1 flex items-center justify-between">
                  <span>
                    {t('my_issues', 'My Reports')} ({myReports.length})
                  </span>
                  <ChevronRight className="w-4 h-4 text-[#64748B] group-hover:text-[#15427B] transition-colors" />
                </h3>
                <p className="text-xs text-[#475569] leading-relaxed">
                  Track status updates, municipal assignments, and repair proof for your submitted tickets.
                </p>
              </div>

              <div
                onClick={() => setActiveTab('explore')}
                className="bg-white p-6 rounded-2xl border border-[#E2E8F0] border-t-[3px] border-t-[#0E8A4E] shadow-[0_2px_12px_rgba(15,41,74,0.04)] hover:border-[#CBD5E1] transition-all cursor-pointer group"
              >
                <div className="w-10 h-10 bg-[#ECFDF5] text-[#0E8A4E] rounded-xl flex items-center justify-center mb-4">
                  <Compass className="w-5 h-5" />
                </div>
                <h3 className="font-bold text-[#13345D] text-base mb-1 flex items-center justify-between">
                  <span>{t('public_feed', 'Explore Map')}</span>
                  <ChevronRight className="w-4 h-4 text-[#64748B] group-hover:text-[#15427B] transition-colors" />
                </h3>
                <p className="text-xs text-[#475569] leading-relaxed">
                  Review neighborhood reports, support open issues, and vote on completed repairs.
                </p>
              </div>
            </div>

            {/* Recent Reports Summary */}
            <div className="bg-white rounded-2xl border border-[#E2E8F0] shadow-[0_2px_12px_rgba(15,41,74,0.04)] p-6">
              <div className="flex items-center justify-between mb-5">
                <div>
                  <h3 className="text-base font-bold text-[#13345D]">Your Recent Incident Submissions</h3>
                  <p className="text-xs text-[#64748B] mt-0.5">Live status of reports filed under your account</p>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab('reports')}
                  className="text-xs text-[#15427B] hover:text-[#0F2F5A] font-semibold flex items-center gap-1"
                >
                  <span>View All ({myReports.length})</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>

              {loadingReports ? (
                <div className="space-y-3 p-4 rounded-xl border border-[#E2E8F0]">
                  <div className="h-3 w-32 rounded-full civic-skeleton" />
                  <div className="h-3 w-full rounded-full civic-skeleton" />
                  <div className="h-3 w-4/5 rounded-full civic-skeleton" />
                </div>
              ) : myReports.length === 0 ? (
                <div className="p-6 border border-[#DCE7F5] rounded-xl bg-[#F4F8FD]">
                  <h4 className="text-base font-bold text-[#13345D]">No reports yet</h4>
                  <p className="text-xs text-[#475569] mt-1 mb-4">
                    Noticed something that needs attention? Your first report can help.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab('report');
                      resetForm();
                    }}
                    className="px-5 py-2.5 bg-[#15427B] hover:bg-[#0F2F5A] text-white text-xs font-semibold rounded-lg transition-colors"
                  >
                    Report an issue
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {myReports.slice(0, 4).map((item) => (
                    <div
                      key={item.id || item.ticketId}
                      onClick={() => {
                        setSelectedReportDetail(item);
                        setActiveTab('reports');
                      }}
                      className="flex gap-4 p-4 rounded-xl bg-white hover:bg-[#F4F8FD] border border-[#E2E8F0] transition-colors cursor-pointer"
                    >
                      <img
                        src={item.imageUrl}
                        alt={item.title}
                        className="w-20 h-20 object-cover rounded-xl border border-[#E2E8F0] shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] font-mono text-[#64748B] mb-0.5">
                          {item.ticketId} · {formatShortDate(item.createdAt)}
                        </p>
                        <h4 className="text-sm font-bold text-[#13345D] truncate">{item.title}</h4>
                        <div className="flex items-center gap-2 mt-1">
                          <StatusDot status={item.status} isDisputed={item.isDisputed} />
                          <span className="text-[#94A3B8] text-xs">·</span>
                          <SeverityDot severity={item.severity} />
                        </div>
                        <p className="text-[11px] text-[#64748B] truncate mt-1">
                          {item.location?.address || 'Location tagged'}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* VIEW 2: REPORT ISSUE MODULE */}
        {activeTab === 'report' && (
          <div className="max-w-3xl mx-auto">
            <div className="flex items-center justify-between mb-5">
              <button
                type="button"
                onClick={() => setActiveTab('home')}
                className="text-xs text-[#15427B] hover:text-[#0F2F5A] font-semibold flex items-center gap-1.5 transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Back to Dashboard</span>
              </button>
              <span className="text-xs text-[#64748B] font-medium">Automatic Civic Classification</span>
            </div>

            {/* Submission Success Card */}
            {submittedTicket ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                className="bg-white border border-[#E2E8F0] border-t-[3px] border-t-[#0E8A4E] rounded-2xl p-6 sm:p-8 shadow-[0_2px_12px_rgba(15,41,74,0.04)]"
              >
                <div className="w-10 h-10 rounded-xl bg-[#ECFDF5] text-[#0E8A4E] flex items-center justify-center mb-4">
                  <Check className="w-5 h-5" strokeWidth={2.5} />
                </div>
                <h2 className="text-2xl font-bold text-[#13345D] mb-1">Your Report Has Been Submitted!</h2>
                <p className="text-sm text-[#475569] mb-6">
                  The right municipal team can now review your report.
                </p>

                <div className="space-y-1 text-sm text-[#13345D] bg-[#F4F8FD] border border-[#DCE7F5] rounded-xl p-4 mb-6 leading-relaxed">
                  <p className="font-mono font-bold text-[#15427B]">{submittedTicket.ticketId}</p>
                  <p className="font-semibold">{submittedTicket.issueType || submittedTicket.title}</p>
                  <p className="text-[#475569]">{submittedTicket.department}</p>
                  <p className="text-[#475569]">{submittedTicket.location.address}</p>
                  <p className="pt-1">
                    Current status: <span className="font-semibold text-[#13345D]">{submittedTicket.status}</span>
                  </p>
                </div>

                <div className="space-y-2.5">
                  <button
                    type="button"
                    onClick={() => setActiveTab('reports')}
                    className="w-full py-3 bg-[#15427B] hover:bg-[#0F2F5A] text-white text-sm font-semibold rounded-lg transition-colors"
                  >
                    Track My Report
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      resetForm();
                      setActiveTab('home');
                    }}
                    className="w-full py-3 bg-white hover:bg-[#F4F8FD] text-[#13345D] text-sm font-semibold rounded-lg border border-[#CBD5E1] transition-colors"
                  >
                    Return to Dashboard
                  </button>
                  <button
                    type="button"
                    onClick={() => resetForm()}
                    className="w-full py-2 text-xs font-semibold text-[#15427B] hover:text-[#0F2F5A] text-center"
                  >
                    Report Another Issue
                  </button>
                </div>
              </motion.div>
            ) : (
              /* REPORT FORM */
              <form onSubmit={handleSubmitReport} className="space-y-6">
                <div className="bg-white border border-[#E2E8F0] rounded-2xl p-6 sm:p-8 shadow-[0_2px_12px_rgba(15,41,74,0.04)] space-y-6">
                  <div>
                    <h1 className="text-xl sm:text-2xl font-bold text-[#13345D]">File a Civic Incident Report</h1>
                    <p className="text-xs sm:text-sm text-[#475569] mt-1">
                      Upload or capture a photo of the defect. GPS location and issue categorization populate automatically.
                    </p>
                  </div>

                  {/* SECTION 1: PHOTO UPLOAD / CAMERA CAPTURE */}
                  <div>
                    <label className="block text-xs font-semibold text-[#13345D] mb-2">
                      1. Photograph Evidence <span className="text-[#DC2626]">*</span>
                    </label>

                    {!selectedImage ? (
                      <div className="border-2 border-dashed border-[#CBD5E1] hover:border-[#15427B] bg-[#F4F8FD]/50 rounded-2xl p-8 text-center transition-colors">
                        <div className="flex flex-col items-center justify-center">
                          <div className="inline-flex items-center gap-2 text-[#15427B] font-bold text-lg mb-2">
                            <Upload className="w-5 h-5" />
                            <span>Add a photograph</span>
                          </div>
                          <p className="text-xs text-[#475569] mb-1">
                            Drag and drop an image, or choose a photo from your device.
                          </p>
                          <p className="text-[11px] text-[#64748B] mb-5">JPG, PNG or WebP · up to 10 MB</p>

                          <div className="flex flex-wrap items-center justify-center gap-2 text-xs font-semibold text-[#13345D]">
                            <label className="cursor-pointer hover:text-[#15427B] underline-offset-4 hover:underline px-2 py-1">
                              <span>Browse Files</span>
                              <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={(e) => {
                                  if (e.target.files && e.target.files[0]) {
                                    handleImageSelect(e.target.files[0]);
                                  }
                                }}
                              />
                            </label>
                            <span className="text-[#94A3B8]">/</span>
                            <button
                              type="button"
                              onClick={startCamera}
                              className="hover:text-[#15427B] underline-offset-4 hover:underline px-2 py-1"
                            >
                              Capture Using Camera
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="relative rounded-2xl overflow-hidden border border-[#E2E8F0] bg-[#F4F8FD]">
                          <img src={selectedImage} alt="Reported Issue Preview" className="w-full h-72 sm:h-80 object-cover" />

                          <button
                            type="button"
                            onClick={() => {
                              setSelectedImage(null);
                              setAiResult(null);
                            }}
                            className="absolute top-3 right-3 p-2 rounded-full bg-white border border-[#CBD5E1] text-[#13345D] hover:text-[#DC2626] transition-colors shadow-xs"
                            aria-label="Remove image"
                          >
                            <X className="w-4 h-4" />
                          </button>

                          {analyzingImage && (
                            <div className="absolute inset-0 bg-white/95 flex flex-col items-center justify-center text-[#13345D] p-6 text-center">
                              <RefreshCw className="w-7 h-7 text-[#15427B] animate-spin mb-3" />
                              <p className="text-sm font-bold">Analyzing Photo Evidence...</p>
                              <p className="text-xs text-[#475569] mt-1 max-w-sm">
                                Verifying defect category, severity level, and routing department.
                              </p>
                            </div>
                          )}
                        </div>

                        {/* RF-DETR + Gemini 2.5 Flash Analysis Feedback Card */}
                        {!analyzingImage && aiResult && (
                          aiResult.isCivicIssue === false ? (
                            <div className="p-4 rounded-xl bg-white border border-[#FCA5A5] text-xs">
                              <p className="font-bold text-[#DC2626] text-sm">
                                We couldn&apos;t identify a civic issue
                              </p>
                              <p className="text-[#475569] mt-1 leading-relaxed">
                                {aiResult.nonCivicReason || 'Try a clear photograph of the affected public area.'}
                              </p>
                            </div>
                          ) : (
                            <div className="p-4 rounded-xl bg-[#EFF6FF] border border-[#BFDBFE] space-y-2 text-xs">
                              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                <div className="flex items-start gap-2.5">
                                  <Check className="w-4 h-4 text-[#0E8A4E] shrink-0 mt-0.5" />
                                  <div>
                                    <span className="font-bold text-[#13345D] block">
                                      RF-DETR &amp; Gemini 2.5 Flash: {aiResult.customVisionDetectedLabel || aiResult.issueType}
                                    </span>
                                    <span className="text-[#475569]">
                                      Confidence: {aiResult.confidenceScore}% · Department: {aiResult.department} · SLA: {aiResult.estimatedResolutionTime || estimatedResolutionTime}
                                    </span>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  {aiResult.publicSafetyAlert && (
                                    <span className="px-2 py-0.5 rounded bg-[#FEF2F2] border border-[#FCA5A5] text-[#DC2626] font-bold text-[11px]">
                                      Public Safety Alert
                                    </span>
                                  )}
                                  <span className="font-semibold text-[#15427B]">{aiResult.category}</span>
                                </div>
                              </div>

                              {Array.isArray(aiResult.rfdetrDetections) && aiResult.rfdetrDetections.length > 0 && (
                                <div className="pt-2 border-t border-[#BFDBFE]/70 text-[11px] font-mono text-[#13345D] flex flex-wrap gap-2">
                                  {aiResult.rfdetrDetections.map((det: any, i: number) => (
                                    <span key={i} className="bg-white px-2 py-1 rounded border border-[#DCE7F5]">
                                      {det.class} ({Math.round((det.confidence || 0) * 100)}%) bbox:[{det.bbox?.x1},{det.bbox?.y1},{det.bbox?.x2},{det.bbox?.y2}]
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          )
                        )}
                      </div>
                    )}
                  </div>

                  {/* SECTION 2: GPS LOCATION CONFIRMED */}
                  <div className="p-4 rounded-xl bg-[#F4F8FD] border border-[#DCE7F5] space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-xs font-bold text-[#13345D]">
                        <MapPin className="w-4 h-4 text-[#15427B]" />
                        <span>
                          {location.loading
                            ? 'Acquiring GPS coordinates...'
                            : location.latitude
                            ? 'GPS location confirmed'
                            : 'Geolocation'}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={getGeolocation}
                        disabled={location.loading}
                        className="text-xs text-[#15427B] hover:text-[#0F2F5A] flex items-center gap-1 font-semibold disabled:opacity-50"
                      >
                        <RefreshCw className={`w-3 h-3 ${location.loading ? 'animate-spin' : ''}`} />
                        <span>Refresh GPS</span>
                      </button>
                    </div>

                    {location.error ? (
                      <p className="text-xs text-[#DC2626]">{location.error}</p>
                    ) : location.latitude ? (
                      <p className="text-xs font-mono text-[#475569]">
                        {location.latitude.toFixed(4)}° N, {location.longitude?.toFixed(4)}° E
                        {location.accuracy ? ` · ±${Math.round(location.accuracy)}m accuracy` : ''}
                      </p>
                    ) : null}

                    <div>
                      <label className="block text-xs font-medium text-[#475569] mb-1">
                        Street Address or Landmark
                      </label>
                      <input
                        type="text"
                        value={manualAddress}
                        onChange={(e) => setManualAddress(e.target.value)}
                        placeholder="Enter or refine street address, ward, or nearby landmark"
                        className="w-full bg-white border border-[#CBD5E1] rounded-lg px-3.5 py-2.5 text-sm text-[#13345D] placeholder-[#94A3B8] focus:outline-none focus:border-[#15427B] focus:ring-2 focus:ring-[#15427B]/15"
                      />
                    </div>
                  </div>

                  {/* SECTION 3: ISSUE DETAILS */}
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-[#13345D]">3. Issue Details &amp; Categorization</span>
                      {aiResult && aiResult.isCivicIssue !== false && (
                        <span className="text-xs text-[#0E8A4E] font-medium inline-flex items-center gap-1">
                          <Check className="w-3.5 h-3.5" /> Auto-filled (editable)
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-[#13345D] mb-1.5">
                          Issue Name / Type <span className="text-[#DC2626]">*</span>
                        </label>
                        <input
                          type="text"
                          value={issueType}
                          onChange={(e) => {
                            setIssueType(e.target.value);
                            if (!title) setTitle(e.target.value);
                          }}
                          placeholder="e.g. Pothole near Aundh Road"
                          required
                          className="w-full bg-white border border-[#CBD5E1] rounded-lg px-3.5 py-2.5 text-sm text-[#13345D] placeholder-[#94A3B8] focus:outline-none focus:border-[#15427B] focus:ring-2 focus:ring-[#15427B]/15"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-[#13345D] mb-1.5">
                          Category <span className="text-[#DC2626]">*</span>
                        </label>
                        <select
                          value={category}
                          onChange={(e) => setCategory(e.target.value)}
                          className="w-full bg-white border border-[#CBD5E1] rounded-lg px-3.5 py-2.5 text-sm text-[#13345D] focus:outline-none focus:border-[#15427B] focus:ring-2 focus:ring-[#15427B]/15"
                        >
                          {CATEGORIES.map((cat) => (
                            <option key={cat} value={cat}>
                              {cat}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-[#13345D] mb-1.5">
                          Severity <span className="text-[#DC2626]">*</span>
                        </label>
                        <select
                          value={severity}
                          onChange={(e) => setSeverity(e.target.value)}
                          className="w-full bg-white border border-[#CBD5E1] rounded-lg px-3.5 py-2.5 text-sm text-[#13345D] focus:outline-none focus:border-[#15427B] focus:ring-2 focus:ring-[#15427B]/15"
                        >
                          {SEVERITY_LEVELS.map((sev) => (
                            <option key={sev} value={sev}>
                              {sev}
                            </option>
                          ))}
                        </select>
                        <p className="text-[11px] text-[#64748B] mt-1">Critical · High · Medium · Low</p>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-[#13345D] mb-1.5">Assigned Department</label>
                        <input
                          type="text"
                          value={department}
                          onChange={(e) => setDepartment(e.target.value)}
                          placeholder="Roads Department"
                          className="w-full bg-white border border-[#CBD5E1] rounded-lg px-3.5 py-2.5 text-sm text-[#13345D] focus:outline-none focus:border-[#15427B] focus:ring-2 focus:ring-[#15427B]/15"
                        />
                      </div>
                    </div>

                    {/* Description + Voice Input */}
                    <div>
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-1.5">
                        <label className="text-xs font-semibold text-[#13345D]">
                          Detailed Description <span className="text-[#DC2626]">*</span>
                        </label>

                        <div className="flex items-center gap-2">
                          <div className="flex bg-[#F4F8FD] border border-[#E2E8F0] rounded-lg p-0.5 text-[11px]">
                            <button
                              type="button"
                              onClick={() => setVoiceLang('hi-IN')}
                              className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                                voiceLang === 'hi-IN' ? 'bg-[#15427B] text-white' : 'text-[#64748B] hover:text-[#13345D]'
                              }`}
                            >
                              हिन्दी
                            </button>
                            <button
                              type="button"
                              onClick={() => setVoiceLang('en-IN')}
                              className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                                voiceLang === 'en-IN' ? 'bg-[#15427B] text-white' : 'text-[#64748B] hover:text-[#13345D]'
                              }`}
                            >
                              English
                            </button>
                          </div>

                          <button
                            type="button"
                            onClick={toggleVoiceInput}
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 border transition-colors ${
                              isListening
                                ? 'bg-[#DC2626] text-white border-[#DC2626]'
                                : 'bg-white hover:bg-[#F4F8FD] border-[#CBD5E1] text-[#13345D]'
                            }`}
                          >
                            {isListening ? (
                              <>
                                <MicOff className="w-3.5 h-3.5" />
                                <span>Stop</span>
                              </>
                            ) : (
                              <>
                                <Mic className="w-3.5 h-3.5 text-[#15427B]" />
                                <span>Voice Input</span>
                              </>
                            )}
                          </button>
                        </div>
                      </div>

                      {isListening && (
                        <div className="mb-2 p-2.5 bg-[#EFF6FF] border border-[#BFDBFE] rounded-lg text-xs text-[#13345D] flex items-center justify-between">
                          <span className="font-medium">
                            Listening ({voiceLang === 'hi-IN' ? 'Hindi' : 'English'}) — speak clearly into your microphone
                          </span>
                          <button
                            type="button"
                            onClick={toggleVoiceInput}
                            className="text-xs font-semibold text-[#DC2626]"
                          >
                            Stop
                          </button>
                        </div>
                      )}

                      <textarea
                        rows={4}
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder={
                          isListening
                            ? 'Speak now to transcribe your report...'
                            : 'Describe the civic defect, exact landmark, and any public safety risk.'
                        }
                        required
                        className={`w-full bg-white border text-sm text-[#13345D] placeholder-[#94A3B8] focus:outline-none leading-relaxed rounded-lg p-3.5 transition-all ${
                          isListening
                            ? 'border-[#DC2626] ring-2 ring-[#DC2626]/20'
                            : 'border-[#CBD5E1] focus:border-[#15427B] focus:ring-2 focus:ring-[#15427B]/15'
                        }`}
                      />
                    </div>

                    {aiResult?.keyObservations && aiResult.keyObservations.length > 0 && (
                      <div className="bg-[#EFF6FF] border border-[#BFDBFE] rounded-xl p-4 space-y-1.5">
                        <span className="text-xs font-semibold text-[#13345D] block">Inspection Observations</span>
                        <ul className="list-disc list-inside space-y-1 text-xs text-[#475569]">
                          {aiResult.keyObservations.map((obs, idx) => (
                            <li key={idx}>{obs}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>

                  <div className="pt-4 border-t border-[#E2E8F0] flex flex-col-reverse sm:flex-row sm:items-center justify-end gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        setActiveTab('home');
                        resetForm();
                      }}
                      className="px-5 py-2.5 text-xs font-semibold text-[#475569] hover:text-[#13345D] rounded-lg border border-[#CBD5E1] bg-white transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={submitting || !selectedImage || aiResult?.isCivicIssue === false || aiResult?.confidenceScore === 0}
                      className={`px-6 py-2.5 text-xs font-semibold rounded-lg flex items-center justify-center gap-2 transition-colors ${
                        aiResult?.isCivicIssue === false || aiResult?.confidenceScore === 0
                          ? 'bg-[#E2E8F0] text-[#64748B] cursor-not-allowed'
                          : 'bg-[#15427B] hover:bg-[#0F2F5A] text-white disabled:opacity-50'
                      }`}
                    >
                      {submitting ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          <span>Submitting Report...</span>
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="w-4 h-4" />
                          <span>Submit Report</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </form>
            )}
          </div>
        )}

        {/* VIEW 3: MY REPORTS LIST */}
        {activeTab === 'reports' && (
          <div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
              <div>
                <h1 className="text-2xl font-bold text-[#13345D] tracking-tight">My Incident Reports</h1>
                <p className="text-xs text-[#475569] mt-1">
                  Track resolution progress and municipal updates for issues you reported.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="bg-white border border-[#CBD5E1] rounded-lg px-3.5 py-2 text-xs text-[#13345D] focus:outline-none focus:border-[#15427B]"
                >
                  <option value="All">All Statuses</option>
                  <option value="Submitted">Submitted</option>
                  <option value="In Progress">In Progress</option>
                  <option value="Resolved">Resolved</option>
                </select>

                <button
                  type="button"
                  onClick={() => {
                    if (user) fetchUserReports(user.uid);
                  }}
                  className="p-2 rounded-lg bg-white hover:bg-[#F4F8FD] border border-[#CBD5E1] text-[#13345D]"
                  title="Refresh Reports"
                >
                  <RefreshCw className={`w-4 h-4 ${loadingReports ? 'animate-spin text-[#15427B]' : ''}`} />
                </button>
              </div>
            </div>

            {loadingReports ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {[1, 2, 3].map((n) => (
                  <div key={n} className="bg-white rounded-2xl border border-[#E2E8F0] p-5 space-y-3">
                    <div className="h-40 rounded-xl civic-skeleton" />
                    <div className="h-3 w-28 rounded-full civic-skeleton" />
                    <div className="h-4 w-3/4 rounded-full civic-skeleton" />
                  </div>
                ))}
              </div>
            ) : myReports.length === 0 ? (
              <div className="bg-white rounded-2xl border border-[#E2E8F0] shadow-[0_2px_12px_rgba(15,41,74,0.04)] p-8 sm:p-10 max-w-lg">
                <h3 className="text-base font-bold text-[#13345D] mb-1">No reports yet</h3>
                <p className="text-xs text-[#475569] mb-5">
                  Noticed something that needs attention? Your first report can help.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('report');
                    resetForm();
                  }}
                  className="px-5 py-2.5 bg-[#15427B] hover:bg-[#0F2F5A] text-white text-xs font-semibold rounded-lg transition-colors"
                >
                  Report an issue
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {myReports
                  .filter((item) => filterStatus === 'All' || item.status === filterStatus)
                  .map((item) => (
                    <div
                      key={item.id || item.ticketId}
                      className="bg-white rounded-2xl border border-[#E2E8F0] shadow-[0_2px_12px_rgba(15,41,74,0.04)] hover:border-[#BFDBFE] transition-colors p-4 flex flex-col justify-between gap-3"
                    >
                      <div className="space-y-3">
                        <div className="h-44 rounded-xl bg-[#F4F8FD] border border-[#E2E8F0] overflow-hidden">
                          <img src={item.imageUrl} alt={item.title} className="w-full h-full object-cover" />
                        </div>

                        <div className="space-y-2">
                          <p className="text-xs font-mono text-[#64748B]">
                            {item.ticketId} · {formatShortDate(item.createdAt)}
                          </p>
                          <h3 className="font-bold text-[#13345D] text-base leading-snug">{item.title}</h3>
                          <div className="flex flex-wrap items-center gap-2">
                            <StatusDot status={item.status} isDisputed={item.isDisputed} />
                            <span className="text-[#94A3B8] text-xs">·</span>
                            <SeverityDot severity={item.severity} />
                          </div>
                          <p className="text-xs text-[#475569] line-clamp-2 leading-relaxed">{item.description}</p>
                        </div>
                      </div>

                      <div className="pt-3 border-t border-[#E2E8F0] space-y-2">
                        <p className="text-xs text-[#64748B] truncate">
                          {item.location?.address} · {item.department}
                        </p>
                        <div className="flex items-center justify-between pt-1">
                          <button
                            type="button"
                            onClick={() => setSelectedReportDetail(item)}
                            className="text-xs font-semibold text-[#15427B] hover:text-[#0F2F5A]"
                          >
                            View details
                          </button>
                          {item.id && (
                            <button
                              type="button"
                              onClick={(e) => handleDeleteReport(e, item.id!, item.ticketId)}
                              className="text-xs font-semibold text-[#DC2626] hover:underline"
                            >
                              Delete
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>
        )}

        {/* VIEW 4: EXPLORE MAP & COMMUNITY FEED */}
        {activeTab === 'explore' && (
          <div>
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
              <div>
                <h1 className="text-2xl font-bold text-[#13345D] tracking-tight">Community Incident Feed</h1>
                <p className="text-xs text-[#475569] mt-1">
                  Browse local civic issues, lend support, and verify completed municipal repairs.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <div className="relative flex-1 md:w-72">
                  <Search className="w-4 h-4 text-[#64748B] absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={exploreSearch}
                    onChange={(e) => setExploreSearch(e.target.value)}
                    placeholder="Category or location"
                    className="w-full bg-white border border-[#CBD5E1] rounded-lg pl-9 pr-3.5 py-2 text-xs text-[#13345D] placeholder-[#94A3B8] focus:outline-none focus:border-[#15427B] focus:ring-2 focus:ring-[#15427B]/15"
                  />
                </div>
                <button
                  type="button"
                  onClick={fetchAllReports}
                  className="p-2 rounded-lg bg-white hover:bg-[#F4F8FD] border border-[#CBD5E1] text-[#13345D]"
                  title="Refresh Feed"
                >
                  <RefreshCw className={`w-4 h-4 ${loadingExplore ? 'animate-spin text-[#15427B]' : ''}`} />
                </button>
              </div>
            </div>

            {loadingExplore ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {[1, 2, 3].map((n) => (
                  <div key={n} className="bg-white rounded-2xl border border-[#E2E8F0] p-5 space-y-3">
                    <div className="h-40 rounded-xl civic-skeleton" />
                    <div className="h-3 w-28 rounded-full civic-skeleton" />
                    <div className="h-4 w-3/4 rounded-full civic-skeleton" />
                  </div>
                ))}
              </div>
            ) : allReports.length === 0 ? (
              <div className="bg-white rounded-2xl border border-[#E2E8F0] shadow-[0_2px_12px_rgba(15,41,74,0.04)] p-8 sm:p-10 max-w-lg">
                <h3 className="text-base font-bold text-[#13345D] mb-1">No reports yet</h3>
                <p className="text-xs text-[#475569] mb-5">
                  Noticed something that needs attention? Your first report can help.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('report');
                    resetForm();
                  }}
                  className="px-5 py-2.5 bg-[#15427B] hover:bg-[#0F2F5A] text-white text-xs font-semibold rounded-lg transition-colors"
                >
                  Report an issue
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {allReports
                  .filter(
                    (item) =>
                      !exploreSearch ||
                      item.title.toLowerCase().includes(exploreSearch.toLowerCase()) ||
                      item.category.toLowerCase().includes(exploreSearch.toLowerCase()) ||
                      item.location.address.toLowerCase().includes(exploreSearch.toLowerCase())
                  )
                  .map((item) => (
                    <div
                      key={item.id || item.ticketId}
                      className="bg-white rounded-2xl border border-[#E2E8F0] shadow-[0_2px_12px_rgba(15,41,74,0.04)] hover:border-[#BFDBFE] transition-colors p-4 flex flex-col justify-between gap-3"
                    >
                      <div className="space-y-3">
                        <div className="h-44 rounded-xl bg-[#F4F8FD] border border-[#E2E8F0] overflow-hidden">
                          <img src={item.imageUrl} alt={item.title} className="w-full h-full object-cover" />
                        </div>

                        <div className="space-y-2">
                          <p className="text-xs font-mono text-[#64748B]">
                            {item.ticketId} · {formatShortDate(item.createdAt)}
                          </p>
                          <h3 className="font-bold text-[#13345D] text-base leading-snug">{item.title}</h3>
                          <div className="flex flex-wrap items-center gap-2">
                            <StatusDot status={item.status} isDisputed={item.isDisputed} />
                            <span className="text-[#94A3B8] text-xs">·</span>
                            <SeverityDot severity={item.severity} />
                          </div>
                          <p className="text-xs text-[#475569] line-clamp-2 leading-relaxed">{item.description}</p>
                          <p className="text-xs text-[#64748B]">
                            {item.category} · {item.supportersCount || item.upvotes || 1} citizens
                            {item.duplicateCount && item.duplicateCount > 0 ? ` · ${item.duplicateCount} merged` : ''}
                          </p>
                        </div>
                      </div>

                      <div className="pt-3 border-t border-[#E2E8F0] space-y-3">
                        <p className="text-xs text-[#64748B] truncate">{item.location?.address}</p>

                        <div className="flex items-center justify-between gap-2">
                          <button
                            type="button"
                            onClick={() => item.id && handleUpvoteIssue(item.id)}
                            className={`px-3 py-1.5 rounded-lg border text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                              user && item.supporters?.includes(user.uid)
                                ? 'bg-[#EFF6FF] text-[#15427B] border-[#15427B]'
                                : 'bg-white hover:bg-[#F4F8FD] text-[#13345D] border-[#CBD5E1]'
                            }`}
                          >
                            <ThumbsUp className="w-3.5 h-3.5 text-[#15427B]" />
                            <span>{user && item.supporters?.includes(user.uid) ? 'Supported' : 'Support (+1)'}</span>
                          </button>

                          <div className="flex items-center gap-3">
                            <button
                              type="button"
                              onClick={() => setSelectedReportDetail(item)}
                              className="text-xs font-semibold text-[#15427B] hover:text-[#0F2F5A]"
                            >
                              View details
                            </button>
                            {item.id && (
                              <button
                                type="button"
                                onClick={(e) => handleDeleteReport(e, item.id!, item.ticketId)}
                                className="text-xs font-semibold text-[#DC2626] hover:underline"
                                title="Delete Complaint"
                              >
                                Delete
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>
        )}
      </main>

      {/* INSTITUTIONAL FOOTER (Matches Landing Page) */}
      <footer className="bg-[#0B2A52] text-white py-6 border-t border-[#15427B] mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-[#15427B] flex items-center justify-center">
              <Building2 className="w-3.5 h-3.5 text-white" />
            </div>
            <div>
              <span className="font-bold text-white">CrowdCivic </span>
              <span className="font-bold text-[#F59E0B]">AI</span>
              <span className="text-white/60 ml-2 hidden sm:inline">· Citizen Redressal Portal</span>
            </div>
          </div>
          <div className="text-[11px] text-white/75 flex flex-wrap items-center justify-center gap-4">
            <span>Public Works · Dial 311</span>
            <span>Emergency · Dial 112</span>
            <span>© 2026 CrowdCivic AI</span>
          </div>
        </div>
      </footer>

      {/* MODAL 1: CAMERA STREAM MODAL */}
      {showCamera && (
        <div className="fixed inset-0 z-50 bg-[#0B2A52]/55 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-[#DCE7F5] rounded-2xl p-6 max-w-lg w-full shadow-2xl space-y-4">
            <div>
              <h3 className="text-xl font-bold text-[#13345D]">Capture the issue</h3>
              <p className="text-xs text-[#64748B] mt-0.5">Live camera preview</p>
            </div>

            {cameraError ? (
              <div className="p-4 rounded-xl bg-[#FEF2F2] border border-[#FCA5A5] space-y-3">
                <div className="flex items-start gap-2.5 text-xs">
                  <AlertTriangle className="w-4 h-4 text-[#DC2626] shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="font-semibold text-[#DC2626]">Camera permission unavailable</p>
                    <p className="text-[#475569] leading-relaxed">{cameraError}</p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="relative rounded-xl overflow-hidden bg-[#0B2A52] border border-[#E2E8F0] aspect-video flex items-center justify-center">
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
                {cameraLoading && !mediaStream && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-white/90 text-xs">
                    <RefreshCw className="w-5 h-5 animate-spin text-[#F59E0B]" />
                    <span>Starting camera preview...</span>
                  </div>
                )}
              </div>
            )}
            <canvas ref={canvasRef} className="hidden" />

            <p className="text-xs text-[#475569] flex items-center gap-1.5 font-mono">
              <MapPin className="w-3.5 h-3.5 text-[#15427B] shrink-0" />
              <span>
                {location.latitude
                  ? `GPS confirmed · ${location.latitude.toFixed(4)}° N, ${location.longitude?.toFixed(4)}° E`
                  : 'Acquiring GPS coordinates...'}
              </span>
            </p>

            <div className="space-y-2.5 pt-1">
              {mediaStream && !cameraError ? (
                <button
                  type="button"
                  onClick={captureCameraPhoto}
                  disabled={cameraLoading}
                  className="w-full py-3 bg-[#15427B] hover:bg-[#0F2F5A] disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors"
                >
                  Capture
                </button>
              ) : (
                <>
                  <label className="w-full py-3 bg-[#15427B] hover:bg-[#0F2F5A] text-white text-sm font-semibold rounded-lg transition-colors flex items-center justify-center gap-2 cursor-pointer">
                    <Upload className="w-4 h-4" />
                    <span>Upload Photo from Device</span>
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="sr-only"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          stopCamera();
                          handleImageSelect(file);
                        }
                      }}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={startCamera}
                    disabled={cameraLoading}
                    className="w-full py-3 bg-[#EFF6FF] hover:bg-[#DBEAFE] disabled:opacity-50 text-[#15427B] text-sm font-semibold rounded-lg border border-[#BFDBFE] flex items-center justify-center gap-2 transition-colors"
                  >
                    <RefreshCw className={`w-4 h-4 ${cameraLoading ? 'animate-spin' : ''}`} />
                    <span>{cameraLoading ? 'Requesting Camera...' : 'Retry Camera'}</span>
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={stopCamera}
                className="w-full py-3 bg-white hover:bg-[#F4F8FD] text-[#13345D] text-sm font-semibold rounded-lg border border-[#CBD5E1] transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: TICKET DETAILS MODAL */}
      {selectedReportDetail && (
        <div className="fixed inset-0 z-50 bg-[#0B2A52]/55 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-[#DCE7F5] rounded-2xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto relative shadow-2xl space-y-5">
            <button
              type="button"
              onClick={() => setSelectedReportDetail(null)}
              className="absolute top-4 right-4 p-2 rounded-lg bg-[#F4F8FD] hover:bg-[#E2E8F0] text-[#13345D]"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex flex-wrap items-center justify-between gap-2 mr-10">
              <div className="flex items-center gap-2.5">
                <span className="font-mono text-xs font-bold text-[#15427B]">{selectedReportDetail.ticketId}</span>
                <span className="text-[#94A3B8]">·</span>
                <StatusDot status={selectedReportDetail.status} isDisputed={selectedReportDetail.isDisputed} />
                <span className="text-[#94A3B8]">·</span>
                <SeverityDot severity={selectedReportDetail.severity} />
              </div>

              {selectedReportDetail.id && (
                <button
                  type="button"
                  onClick={(e) => handleDeleteReport(e, selectedReportDetail.id!, selectedReportDetail.ticketId)}
                  className="px-3 py-1.5 bg-white hover:bg-[#FEF2F2] text-[#DC2626] border border-[#FCA5A5] rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete</span>
                </button>
              )}
            </div>

            <h2 className="text-xl font-bold text-[#13345D]">{selectedReportDetail.title}</h2>

            {/* Horizontal 6-Step Verification Pipeline */}
            <div className="p-4 rounded-xl bg-[#F4F8FD] border border-[#DCE7F5]">
              <p className="text-xs font-bold text-[#13345D] mb-2">Your report, from first photo to verified repair</p>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-xs">
                {PIPELINE_STEPS.map((step, i) => {
                  const currentIdx = getPipelineStageIndex(selectedReportDetail.status, selectedReportDetail.isDisputed);
                  const reached = i <= currentIdx;
                  return (
                    <span key={step} className="inline-flex items-center gap-1.5">
                      {i > 0 && <span className="text-[#94A3B8]">→</span>}
                      <span
                        className={`inline-flex items-center gap-1 ${
                          reached ? 'font-semibold text-[#13345D]' : 'text-[#64748B]'
                        }`}
                      >
                        {reached && <Check className="w-3.5 h-3.5 text-[#0E8A4E]" />}
                        {step}
                      </span>
                    </span>
                  );
                })}
              </div>
            </div>

            <div className="rounded-xl overflow-hidden border border-[#E2E8F0] max-h-72 bg-[#F4F8FD]">
              <img src={selectedReportDetail.imageUrl} alt={selectedReportDetail.title} className="w-full h-full object-cover" />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div className="bg-[#F4F8FD] p-3 rounded-xl border border-[#DCE7F5]">
                <span className="text-[#64748B] block mb-1">Category</span>
                <span className="font-semibold text-[#13345D]">{selectedReportDetail.category}</span>
              </div>
              <div className="bg-[#F4F8FD] p-3 rounded-xl border border-[#DCE7F5]">
                <span className="text-[#64748B] block mb-1">Severity</span>
                <SeverityDot severity={selectedReportDetail.severity} suffix="" />
              </div>
              <div className="bg-[#F4F8FD] p-3 rounded-xl border border-[#DCE7F5]">
                <span className="text-[#64748B] block mb-1">Department</span>
                <span className="font-semibold text-[#13345D]">{selectedReportDetail.department}</span>
              </div>
            </div>

            <div className="bg-[#F4F8FD] p-4 rounded-xl border border-[#DCE7F5] space-y-2 text-xs">
              <div>
                <span className="font-semibold text-[#13345D] block mb-1">Description</span>
                <p className="text-[#475569] leading-relaxed">{selectedReportDetail.description}</p>
              </div>
              <div className="pt-2 border-t border-[#E2E8F0] flex items-start gap-2 text-[#475569]">
                <MapPin className="w-4 h-4 text-[#15427B] shrink-0 mt-0.5" />
                <span>{selectedReportDetail.location.address}</span>
              </div>
            </div>

            {/* COMMUNITY RESOLUTION VERIFICATION SECTION */}
            <div className="border-t border-[#E2E8F0] pt-5 space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-[#EFF6FF] text-[#15427B] flex items-center justify-center">
                    <Users className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-[#13345D] flex items-center gap-2">
                      <span>Community Verification (Supplementary Only)</span>
                      {selectedReportDetail.isDisputed && <StatusDot status="Disputed" isDisputed />}
                    </h3>
                    <p className="text-xs text-[#64748B]">
                      Optional transparency feedback from nearby residents. Never alters or overrides the official 3-gate RVE decision.
                    </p>
                  </div>
                </div>

                {selectedReportDetail.voteStats && (
                  <div className="text-right shrink-0">
                    <span className="text-xs font-bold text-[#13345D] block">
                      {Math.round(
                        (selectedReportDetail.voteStats.yes /
                          Math.max(1, selectedReportDetail.voteStats.yes + selectedReportDetail.voteStats.no)) *
                          100
                      )}
                      % Verified
                    </span>
                    <span className="text-[11px] text-[#64748B]">
                      {selectedReportDetail.voteStats.yes} Fixed · {selectedReportDetail.voteStats.no} Unresolved
                    </span>
                  </div>
                )}
              </div>

              {selectedReportDetail.voteStats &&
                selectedReportDetail.voteStats.yes + selectedReportDetail.voteStats.no > 0 && (
                  <div className="w-full bg-[#E2E8F0] rounded-full h-2 overflow-hidden flex">
                    <div
                      className="bg-[#0E8A4E] h-full"
                      style={{
                        width: `${
                          (selectedReportDetail.voteStats.yes /
                            (selectedReportDetail.voteStats.yes + selectedReportDetail.voteStats.no)) *
                          100
                        }%`,
                      }}
                    />
                    <div
                      className="bg-[#DC2626] h-full"
                      style={{
                        width: `${
                          (selectedReportDetail.voteStats.no /
                            (selectedReportDetail.voteStats.yes + selectedReportDetail.voteStats.no)) *
                          100
                        }%`,
                      }}
                    />
                  </div>
                )}

              {selectedReportDetail.resolutionProofUrl && (
                <div className="p-3.5 bg-[#EFF6FF] border border-[#BFDBFE] rounded-xl space-y-2">
                  <span className="text-xs font-semibold text-[#13345D] flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-[#0E8A4E]" /> Authority Live Proof Photo
                  </span>
                  <img
                    src={selectedReportDetail.resolutionProofUrl}
                    alt="Resolution Proof"
                    className="w-full h-40 object-cover rounded-xl border border-[#DCE7F5]"
                  />
                  {selectedReportDetail.resolutionNotes && (
                    <p className="text-xs text-[#475569] italic">&ldquo;{selectedReportDetail.resolutionNotes}&rdquo;</p>
                  )}
                </div>
              )}

              {voteSuccessMessage && (
                <div className="p-3 bg-[#EFF6FF] border border-[#15427B] rounded-xl text-xs text-[#13345D] flex items-center gap-2 font-medium">
                  <Award className="w-4 h-4 text-[#F59E0B] shrink-0" />
                  <span>{voteSuccessMessage}</span>
                </div>
              )}

              <div className="bg-[#F4F8FD] border border-[#DCE7F5] rounded-2xl p-4 space-y-3">
                {selectedReportDetail.communityVotes?.some((v) => v.userId === user?.uid) ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-[#64748B] font-medium">Your Verification Vote</span>
                      {selectedReportDetail.communityVotes?.find((v) => v.userId === user?.uid)?.vote === 'yes' ? (
                        <span className="font-semibold text-[#0E8A4E] flex items-center gap-1">
                          <ThumbsUp className="w-3.5 h-3.5" /> Verified Fixed
                        </span>
                      ) : (
                        <span className="font-semibold text-[#DC2626] flex items-center gap-1">
                          <ThumbsDown className="w-3.5 h-3.5" /> Still Unresolved
                        </span>
                      )}
                    </div>
                    {selectedReportDetail.communityVotes?.find((v) => v.userId === user?.uid)?.comment && (
                      <p className="text-xs text-[#13345D] bg-white p-3 rounded-xl border border-[#E2E8F0] italic">
                        &ldquo;{selectedReportDetail.communityVotes?.find((v) => v.userId === user?.uid)?.comment}&rdquo;
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-[#13345D]">Is this issue actually resolved on ground?</span>
                      <span className="text-xs font-semibold text-[#15427B]">+5 Karma</span>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => setVoteOption('yes')}
                        className={`p-3 rounded-lg border text-xs font-semibold flex items-center justify-center gap-2 transition-colors ${
                          voteOption === 'yes'
                            ? 'bg-[#15427B] text-white border-[#15427B]'
                            : 'bg-white hover:bg-[#EFF6FF] text-[#13345D] border-[#CBD5E1]'
                        }`}
                      >
                        <ThumbsUp className="w-4 h-4" />
                        <span>Yes, Fixed</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setVoteOption('no')}
                        className={`p-3 rounded-lg border text-xs font-semibold flex items-center justify-center gap-2 transition-colors ${
                          voteOption === 'no'
                            ? 'bg-[#DC2626] text-white border-[#DC2626]'
                            : 'bg-white hover:bg-[#FEF2F2] text-[#DC2626] border-[#FCA5A5]'
                        }`}
                      >
                        <ThumbsDown className="w-4 h-4" />
                        <span>Still Unresolved</span>
                      </button>
                    </div>

                    {voteOption && (
                      <div className="space-y-3">
                        <textarea
                          rows={2}
                          value={voteComment}
                          onChange={(e) => setVoteComment(e.target.value)}
                          placeholder="Add ground observation (e.g. 'Pothole filled properly' or 'Water still leaking')..."
                          className="w-full bg-white border border-[#CBD5E1] rounded-lg p-3 text-xs text-[#13345D] placeholder-[#94A3B8] focus:outline-none focus:border-[#15427B] focus:ring-2 focus:ring-[#15427B]/15"
                        />

                        <button
                          type="button"
                          onClick={handleCommunityVote}
                          disabled={submittingVote}
                          className="w-full py-2.5 bg-[#15427B] hover:bg-[#0F2F5A] text-white text-xs font-semibold rounded-lg flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                        >
                          {submittingVote ? (
                            <>
                              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                              <span>Recording Vote...</span>
                            </>
                          ) : (
                            <span>Submit Verification Vote</span>
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {selectedReportDetail.communityVotes && selectedReportDetail.communityVotes.length > 0 && (
                  <div className="pt-3 border-t border-[#E2E8F0]">
                    <span className="text-xs font-semibold text-[#13345D] block mb-2">
                      Recent Verifications ({selectedReportDetail.communityVotes.length})
                    </span>
                    <div className="space-y-2 max-h-40 overflow-y-auto">
                      {selectedReportDetail.communityVotes.map((v, idx) => (
                        <div key={idx} className="p-3 bg-white rounded-xl border border-[#E2E8F0] text-xs space-y-1">
                          <div className="flex items-center justify-between text-[#64748B]">
                            <span className="font-mono text-[#13345D] truncate max-w-[180px]">{v.userEmail}</span>
                            <div className="flex items-center gap-2">
                              {v.distanceKm !== undefined && <span className="font-mono">{v.distanceKm} km away</span>}
                              {v.vote === 'yes' ? (
                                <span className="text-[#0E8A4E] font-semibold">Fixed</span>
                              ) : (
                                <span className="text-[#DC2626] font-semibold">Unresolved</span>
                              )}
                            </div>
                          </div>
                          {v.comment && <p className="text-[#475569] italic">&ldquo;{v.comment}&rdquo;</p>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: AI DUPLICATE COMPLAINT DETECTION MODAL */}
      {duplicateModal && duplicateModal.isOpen && duplicateModal.match && (
        <div className="fixed inset-0 z-50 bg-[#0B2A52]/55 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white border border-[#DCE7F5] rounded-2xl p-6 sm:p-7 max-w-xl w-full relative my-8 shadow-2xl space-y-5">
            <button
              type="button"
              onClick={() => setDuplicateModal(null)}
              className="absolute top-4 right-4 p-2 rounded-lg bg-[#F4F8FD] hover:bg-[#E2E8F0] text-[#13345D]"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="pr-8">
              <p className="text-xs font-semibold text-[#15427B] mb-1">
                Duplicate Match Detected · {duplicateModal.match.overallScore}% similarity
              </p>
              <h3 className="text-xl font-bold text-[#13345D]">An active complaint already exists nearby</h3>
              <p className="text-xs text-[#475569] mt-1 leading-relaxed">
                Spatial-temporal verification found an open ticket {duplicateModal.match.distanceMeters}m away with
                matching visual features.
              </p>
            </div>

            <div className="bg-[#F4F8FD] border border-[#DCE7F5] rounded-2xl p-4 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-[#E2E8F0] text-xs">
                <div>
                  <span className="text-[#64748B] block">Existing Ticket</span>
                  <span className="font-bold font-mono text-[#15427B] text-sm">
                    {duplicateModal.match.ticketId}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-[#64748B] block">Supporters</span>
                  <span className="font-bold text-[#13345D] text-sm">
                    {duplicateModal.match.supportersCount || 1} Citizens
                  </span>
                </div>
              </div>

              <div>
                <h4 className="text-xs font-bold text-[#13345D] mb-1">{duplicateModal.match.title}</h4>
                <p className="text-xs text-[#475569] line-clamp-2 bg-white p-2.5 rounded-xl border border-[#E2E8F0]">
                  &ldquo;{duplicateModal.match.description}&rdquo;
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <span className="text-[11px] text-[#64748B] font-medium block mb-1">Your photo</span>
                  <div className="h-28 rounded-xl overflow-hidden border border-[#E2E8F0] bg-white">
                    <img src={duplicateModal.compressedImage} alt="Uploaded" className="w-full h-full object-cover" />
                  </div>
                </div>
                <div>
                  <span className="text-[11px] text-[#64748B] font-medium block mb-1">Existing ticket photo</span>
                  <div className="h-28 rounded-xl overflow-hidden border border-[#E2E8F0] bg-white">
                    <img src={duplicateModal.match.imageUrl} alt="Existing" className="w-full h-full object-cover" />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-xs">
                <div className="bg-white p-2.5 rounded-xl border border-[#E2E8F0]">
                  <span className="text-[#64748B] block text-[11px]">Distance (≤20m)</span>
                  <span className="font-bold text-[#13345D] font-mono">{duplicateModal.match.distanceMeters}m</span>
                </div>
                <div className="bg-white p-2.5 rounded-xl border border-[#E2E8F0]">
                  <span className="text-[#64748B] block text-[11px]">Photo pHash</span>
                  <span className="font-bold text-[#13345D] font-mono">{duplicateModal.match.imageScore}%</span>
                </div>
                <div className="bg-white p-2.5 rounded-xl border border-[#E2E8F0]">
                  <span className="text-[#64748B] block text-[11px]">Text TF-IDF</span>
                  <span className="font-bold text-[#13345D] font-mono">
                    {duplicateModal.match.textualScore ?? duplicateModal.match.textScore ?? 0}%
                  </span>
                </div>
                <div className="bg-white p-2.5 rounded-xl border border-[#E2E8F0]">
                  <span className="text-[#64748B] block text-[11px]">Temporal</span>
                  <span className="font-bold text-[#13345D] font-mono">{duplicateModal.match.temporalScore ?? 100}%</span>
                </div>
              </div>
            </div>

            <div className="space-y-2.5">
              <button
                type="button"
                onClick={handleJoinExistingComplaint}
                disabled={submitting}
                className="w-full py-3 px-4 bg-[#15427B] hover:bg-[#0F2F5A] text-white font-semibold text-xs rounded-lg flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
              >
                {submitting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Joining Complaint...</span>
                  </>
                ) : (
                  <>
                    <Users className="w-4 h-4" />
                    <span>Join Existing Complaint (+1 Support &amp; Merge Photo)</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => {
                  setDuplicateModal(null);
                  createNewReport(duplicateModal.newReportData);
                }}
                disabled={submitting}
                className="w-full py-3 px-4 bg-white hover:bg-[#F4F8FD] text-[#13345D] font-semibold text-xs rounded-lg border border-[#CBD5E1] transition-colors"
              >
                No, Submit as Separate Issue
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: DELETE COMPLAINT CONFIRMATION MODAL */}
      {deleteConfirmModal && (
        <div className="fixed inset-0 z-50 bg-[#0B2A52]/55 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-[#DCE7F5] rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <h3 className="text-xl font-bold text-[#13345D]">Delete This Civic Record?</h3>
            <p className="text-sm text-[#475569] leading-relaxed">
              Record <span className="font-mono font-semibold text-[#13345D]">{deleteConfirmModal.ticketId}</span> and
              its report history will be permanently removed. This cannot be undone.
            </p>

            <div className="flex items-center gap-6 pt-2">
              <button
                type="button"
                onClick={() => setDeleteConfirmModal(null)}
                className="text-sm font-semibold text-[#64748B] hover:text-[#13345D]"
                disabled={deleting}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={executeDeleteReport}
                disabled={deleting}
                className="text-sm font-semibold text-[#DC2626] hover:underline flex items-center gap-1.5 disabled:opacity-50"
              >
                {deleting ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Deleting...</span>
                  </>
                ) : (
                  <span>Confirm Delete</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
