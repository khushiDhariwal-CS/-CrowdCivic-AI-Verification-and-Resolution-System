'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { auth, db } from '@/lib/firebase';
import {
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
  signOut,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  User as FirebaseUser,
} from 'firebase/auth';
import { collection, doc, getDoc, getDocs, query, setDoc, where } from 'firebase/firestore';
import { logSecurityEvent } from '@/lib/audit';
import { LANGUAGES, useLanguage } from '@/lib/LanguageContext';
import { SAMPLE_ACCOUNTS } from '@/lib/sampleAccounts';
import { motion } from 'motion/react';
import heroCitySkyline from '@/src/assets/images/hero_city_skyline_1794927740072.jpg';
import {
  Building2,
  User,
  Loader2,
  LogOut,
  ArrowRight,
  UserPlus,
  LogIn,
  ShieldCheck,
  MapPin,
  Clock,
  Eye,
  EyeOff,
  Check,
  Globe,
  Headphones,
  Accessibility as AccessibilityIcon,
  Sparkles,
  Users,
  BrainCircuit,
  MessageSquare,
  Search,
  FileText,
  ChevronRight,
  ChevronDown,
  X,
  Phone,
  Menu,
  Mail,
} from 'lucide-react';

const NAV_ITEMS = [
  { id: 'home', label: 'Home' },
  { id: 'about', label: 'About Us' },
  { id: 'how-it-works', label: 'How It Works' },
  { id: 'features', label: 'Features' },
  { id: 'faqs', label: 'FAQs' },
  { id: 'contact', label: 'Contact Us' },
] as const;

const FAQ_ITEMS = [
  {
    q: 'How does CrowdCivic AI classify civic complaints automatically?',
    a: 'When you upload or capture an infrastructure photo, our AI vision pipeline identifies defects such as potholes, open garbage, waterlogging, or damaged streetlights, suggests severity, and routes the ticket to the right municipal department.',
  },
  {
    q: 'What happens if multiple residents report the same issue?',
    a: 'CrowdCivic performs a 20-meter spatial proximity and visual similarity check. Related citizen complaints are linked to the primary ticket so residents can support it together without creating duplicate backlog.',
  },
  {
    q: 'How do citizens verify that a repair has actually been completed?',
    a: 'Municipal field teams must record a 30-second live resolution video within 50 meters of the reported GPS location. AI compares before-and-after repair evidence, and nearby residents can confirm or dispute the closure.',
  },
  {
    q: 'How does portal access work when I sign in?',
    a: 'Every account is verified using its registered credentials and automatically directed to the appropriate CrowdCivic workspace upon sign in.',
  },
];

export default function LandingPage() {
  const router = useRouter();
  const { language, setLanguage } = useLanguage();

  // Navigation & utility popovers
  const [activeNav, setActiveNav] = useState<string>('home');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [langMenuOpen, setLangMenuOpen] = useState(false);
  const [accessibilityModalOpen, setAccessibilityModalOpen] = useState(false);
  const [helpModalOpen, setHelpModalOpen] = useState(false);
  const [largeTextMode, setLargeTextMode] = useState(false);
  const [highContrastMode, setHighContrastMode] = useState(false);
  const [openFaqIdx, setOpenFaqIdx] = useState<number | null>(0);

  // Auth modal & form state
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(null);
  const [existingRole, setExistingRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [authLoading, setAuthLoading] = useState(false);
  const [error, setError] = useState('');

  // Forgot Password state
  const [forgotPasswordMode, setForgotPasswordMode] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [resetSuccess, setResetSuccess] = useState('');
  const [resetError, setResetError] = useState('');

  const isSigningInRef = useRef(false);

  // Note: Demo account documents are created post-authentication to comply with Firestore security rules.

  const redirectByRole = useCallback(
    (userRole: string) => {
      if (userRole === 'authority') {
        router.push('/authority');
      } else if (userRole === 'admin') {
        router.push('/admin');
      } else {
        router.push('/citizen');
      }
    },
    [router]
  );

  const resolveRoleByCredentials = useCallback(
    async (activeUid: string, cleanEmail: string): Promise<'citizen' | 'authority' | 'admin'> => {
      const normalizeRole = (raw?: string | null): 'citizen' | 'authority' | 'admin' | null => {
        if (raw === 'admin' || raw === 'authority' || raw === 'citizen') return raw;
        return null;
      };

      try {
        const userDoc = await getDoc(doc(db, 'users', activeUid));
        if (userDoc.exists()) {
          const docRole = normalizeRole(userDoc.data()?.role);
          if (docRole) return docRole;
        }
      } catch (err) {
        console.warn('Notice checking user UID role:', err);
      }

      if (cleanEmail) {
        try {
          const emailQuery = query(collection(db, 'users'), where('email', '==', cleanEmail));
          const snap = await getDocs(emailQuery);
          if (!snap.empty) {
            for (const d of snap.docs) {
              const emailRole = normalizeRole(d.data()?.role);
              if (emailRole) return emailRole;
            }
          }
        } catch (err) {
          console.warn('Notice checking user email role:', err);
        }

        const matchedSample = SAMPLE_ACCOUNTS.find((a) => a.email.toLowerCase() === cleanEmail);
        if (matchedSample) return matchedSample.role;
      }

      // All users outside the 3 fixed sample accounts default to citizen until promoted by Admin
      return 'citizen';
    },
    []
  );

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (isSigningInRef.current) return;

      if (user) {
        setCurrentUser(user);
        const effEmail = (user.email || '').toLowerCase();
        try {
          const resolvedRole = await resolveRoleByCredentials(user.uid, effEmail);
          setExistingRole(resolvedRole);
          if (typeof window !== 'undefined') {
            localStorage.setItem('user_role', resolvedRole);
            localStorage.setItem('user_email', effEmail);
            localStorage.setItem('user_uid', user.uid);
          }
        } catch (err) {
          console.warn('Firestore offline notice fetching user document:', err);
          const cachedRole = typeof window !== 'undefined' ? localStorage.getItem('user_role') : null;
          if (cachedRole) {
            setExistingRole(cachedRole);
          }
        }
      } else {
        setCurrentUser(null);
        setExistingRole(null);
        if (typeof window !== 'undefined') {
          localStorage.removeItem('user_role');
          localStorage.removeItem('user_email');
          localStorage.removeItem('user_uid');
        }
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [resolveRoleByCredentials]);

  const openAuthModal = (targetMode: 'signin' | 'signup') => {
    setMode(targetMode);
    setForgotPasswordMode(false);
    setError('');
    setResetError('');
    setResetSuccess('');
    setAuthModalOpen(true);
    setMobileMenuOpen(false);
  };

  const scrollToSection = (sectionId: string) => {
    setActiveNav(sectionId);
    setMobileMenuOpen(false);
    if (typeof document !== 'undefined') {
      const el = document.getElementById(sectionId);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  };

  const handleSampleQuickSignIn = async (sampleEmail: string) => {
    const sampleAcc = SAMPLE_ACCOUNTS.find((a) => a.email.toLowerCase() === sampleEmail.toLowerCase());
    if (!sampleAcc) return;
    setMode('signin');
    setForgotPasswordMode(false);
    setFullName(sampleAcc.name);
    setEmail(sampleAcc.email);
    setPassword(sampleAcc.defaultPassword);
    setError('');
    setAuthLoading(true);
    isSigningInRef.current = true;

    try {
      let signedUser: FirebaseUser | null = null;
      try {
        const cred = await signInWithEmailAndPassword(auth, sampleAcc.email, sampleAcc.defaultPassword);
        signedUser = cred.user;
      } catch (signInErr: any) {
        const code = signInErr?.code || '';
        if (code === 'auth/operation-not-allowed' || code === 'auth/admin-restricted-operation') {
          throw new Error(
            'Email/Password sign-in is disabled in Firebase Console. Enable Email/Password under Authentication → Sign-in method in project jovial-folder-dlll2, or use Continue with Google.'
          );
        }
        try {
          const created = await createUserWithEmailAndPassword(auth, sampleAcc.email, sampleAcc.defaultPassword);
          signedUser = created.user;
        } catch (createErr: any) {
          const createCode = createErr?.code || '';
          if (createCode === 'auth/operation-not-allowed' || createCode === 'auth/admin-restricted-operation') {
            throw new Error(
              'Email/Password sign-in is disabled in Firebase Console. Enable Email/Password under Authentication → Sign-in method in project jovial-folder-dlll2, or use Continue with Google.'
            );
          }
          throw new Error(createErr?.message || 'Unable to sign in with sample account.');
        }
      }

      const activeUid = signedUser.uid;
      const existingProfile = await getDoc(doc(db, 'users', activeUid));
      const profilePayload: Record<string, any> = {
        uid: activeUid,
        name: sampleAcc.name,
        email: sampleAcc.email,
        role: sampleAcc.role,
        department: sampleAcc.department,
        updatedAt: new Date().toISOString(),
      };
      if (!existingProfile.exists()) {
        profilePayload.createdAt = new Date().toISOString();
      }
      await setDoc(doc(db, 'users', activeUid), profilePayload, { merge: true });

      if (typeof window !== 'undefined') {
        localStorage.setItem('user_role', sampleAcc.role);
        localStorage.setItem('user_email', sampleAcc.email);
        localStorage.setItem('user_uid', activeUid);
      }

      await logSecurityEvent({
        userId: activeUid,
        email: sampleAcc.email,
        role: sampleAcc.role,
        action: 'LOGIN_SUCCESS',
        portal: sampleAcc.role as any,
        status: 'SUCCESS',
        details: `Sample account signed in directly as ${sampleAcc.role.toUpperCase()}.`,
      });

      window.location.href = `/${sampleAcc.role}`;
    } catch (err: any) {
      setError(err?.message || 'Unable to sign in with sample account.');
      setAuthLoading(false);
      isSigningInRef.current = false;
    }
  };

  const handleForgotPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetError('');
    setResetSuccess('');
    const targetEmail = (resetEmail || email).trim().toLowerCase();
    if (!targetEmail) {
      setResetError('Please enter your registered email address.');
      return;
    }

    setResetLoading(true);
    try {
      await sendPasswordResetEmail(auth, targetEmail);
      setResetSuccess(`Password reset link sent to ${targetEmail}. Check your inbox and spam folder.`);
    } catch (err: any) {
      const code = err?.code || '';
      if (code === 'auth/user-not-found') {
        setResetError(`No Email/Password account exists for "${targetEmail}".`);
      } else if (code === 'auth/operation-not-allowed' || code === 'auth/admin-restricted-operation') {
        setResetError(
          'Email/Password authentication is disabled in Firebase Console. Enable Email/Password under Authentication → Sign-in method to reset passwords.'
        );
      } else if (code === 'auth/invalid-email') {
        setResetError('Please enter a valid email address.');
      } else {
        setResetError(err?.message || 'Failed to send password reset email.');
      }
    } finally {
      setResetLoading(false);
    }
  };

  const persistUserProfileSafely = async (
    activeUid: string,
    cleanEmail: string,
    displayName: string,
    assignedRole: 'citizen' | 'authority' | 'admin'
  ) => {
    const safeName = (displayName || cleanEmail.split('@')[0] || 'CrowdCivic User').trim().slice(0, 120);
    const nowIso = new Date().toISOString();
    try {
      const userRef = doc(db, 'users', activeUid);
      const userDoc = await getDoc(userRef);
      if (!userDoc.exists()) {
        await setDoc(userRef, {
          uid: activeUid,
          email: cleanEmail,
          name: safeName,
          role: assignedRole,
          createdAt: nowIso,
          updatedAt: nowIso,
        });
      } else {
        const existingData = userDoc.data();
        const updates: Record<string, any> = {};
        if (!existingData?.uid) updates.uid = activeUid;
        if (safeName && existingData?.name !== safeName) updates.name = safeName;
        if (Object.keys(updates).length > 0) {
          updates.updatedAt = nowIso;
          await setDoc(userRef, updates, { merge: true });
        }
      }
    } catch (err) {
      console.warn('Firestore profile sync notice (non-blocking):', err);
    }
  };

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setAuthLoading(true);
    isSigningInRef.current = true;

    const cleanName = fullName.trim();
    const cleanEmail = email.trim().toLowerCase();
    const cleanPass = password.trim();

    if (mode === 'signin' && !cleanName) {
      setError('Please enter your name, email ID, and password to sign in.');
      setAuthLoading(false);
      isSigningInRef.current = false;
      return;
    }

    if (!cleanEmail || !cleanPass) {
      setError('Please enter both email and password to proceed.');
      setAuthLoading(false);
      isSigningInRef.current = false;
      return;
    }

    // Clear any cached role from a previous account before authenticating
    if (typeof window !== 'undefined') {
      localStorage.removeItem('user_role');
      localStorage.removeItem('user_email');
      localStorage.removeItem('user_uid');
    }

    let user: FirebaseUser | null = null;
    let isNewlyRegistered = false;

    if (mode === 'signin') {
      const sampleAcc = SAMPLE_ACCOUNTS.find((a) => a.email.toLowerCase() === cleanEmail);
      if (sampleAcc) {
        const isPasswordValid =
          sampleAcc.passwords.some((p) => p.toLowerCase() === cleanPass.toLowerCase()) ||
          cleanPass === sampleAcc.defaultPassword;

        if (!isPasswordValid) {
          setError('Incorrect email or password. Please verify your credentials and try again.');
          setAuthLoading(false);
          isSigningInRef.current = false;
          return;
        }

        try {
          try {
            const cred = await signInWithEmailAndPassword(auth, cleanEmail, cleanPass);
            user = cred.user;
          } catch (signInErr: any) {
            const signInCode = signInErr?.code || '';
            if (signInCode === 'auth/operation-not-allowed' || signInCode === 'auth/admin-restricted-operation') {
              setError(
                'Email/Password sign-in is disabled in Firebase Console. Enable Email/Password under Authentication → Sign-in method in project jovial-folder-dlll2, or use Continue with Google.'
              );
              setAuthLoading(false);
              isSigningInRef.current = false;
              return;
            }
            try {
              const newCred = await createUserWithEmailAndPassword(auth, cleanEmail, sampleAcc.defaultPassword);
              user = newCred.user;
            } catch (createErr: any) {
              const createCode = createErr?.code || '';
              if (createCode === 'auth/operation-not-allowed' || createCode === 'auth/admin-restricted-operation') {
                setError(
                  'Email/Password sign-in is disabled in Firebase Console. Enable Email/Password under Authentication → Sign-in method in project jovial-folder-dlll2, or use Continue with Google.'
                );
              } else if (createCode === 'auth/email-already-in-use') {
                setError('Account password mismatch in Firebase Auth. Please use the registered password or Forgot Password.');
              } else {
                setError(createErr?.message || 'Unable to authenticate with Firebase Auth.');
              }
              setAuthLoading(false);
              isSigningInRef.current = false;
              return;
            }
          }

          const activeUid = user.uid;
          const assignedRole = sampleAcc.role;

          try {
            const existingProfile = await getDoc(doc(db, 'users', activeUid));
            const profilePayload: Record<string, any> = {
              uid: activeUid,
              name: (cleanName || sampleAcc.name).slice(0, 120),
              email: cleanEmail,
              role: assignedRole,
              department: sampleAcc.department,
              updatedAt: new Date().toISOString(),
            };
            if (!existingProfile.exists()) {
              profilePayload.createdAt = new Date().toISOString();
            }
            await setDoc(doc(db, 'users', activeUid), profilePayload, { merge: true });
          } catch (profileErr) {
            console.warn('Sample profile sync notice:', profileErr);
          }

          if (typeof window !== 'undefined') {
            localStorage.setItem('user_role', assignedRole);
            localStorage.setItem('user_email', cleanEmail);
            localStorage.setItem('user_uid', activeUid);
          }

          await logSecurityEvent({
            userId: activeUid,
            email: cleanEmail,
            role: assignedRole,
            action: 'LOGIN_SUCCESS',
            portal: assignedRole as any,
            status: 'SUCCESS',
            details: `User signed in as ${assignedRole.toUpperCase()}.`,
          }).catch(() => {});

          window.location.href = `/${assignedRole}`;
          return;
        } catch (err: any) {
          console.warn('Sign in notice:', err);
          setError(err?.message || 'Sign in error. Please verify your credentials and try again.');
          setAuthLoading(false);
          isSigningInRef.current = false;
          return;
        }
      }

      try {
        const cred = await signInWithEmailAndPassword(auth, cleanEmail, cleanPass);
        user = cred.user;
      } catch (err: any) {
        const errCode = err?.code || '';
        // If this is a brand-new user signing in directly with Name + Email + Password,
        // seamlessly create their Citizen account and divert them to the Citizen Portal.
        // If the email already exists with a different password, createUserWithEmailAndPassword
        // returns auth/email-already-in-use so wrong passwords are still strictly rejected.
        if (errCode === 'auth/user-not-found' || errCode === 'auth/invalid-credential') {
          try {
            const created = await createUserWithEmailAndPassword(auth, cleanEmail, cleanPass);
            user = created.user;
            isNewlyRegistered = true;
          } catch (createErr: any) {
            const createCode = createErr?.code || '';
            let errorMsg = 'Incorrect email or password. Please verify your credentials and try again.';
            if (createCode === 'auth/email-already-in-use') {
              errorMsg = 'Incorrect password for this account. Please try again or use Forgot Password.';
            } else if (createCode === 'auth/weak-password') {
              errorMsg = 'Password must be at least 6 characters to create a new account.';
            } else if (createCode === 'auth/invalid-email') {
              errorMsg = 'Please enter a valid email address.';
            } else if (createCode === 'auth/operation-not-allowed' || createCode === 'auth/admin-restricted-operation') {
              errorMsg =
                'Email/Password sign-in is disabled in Firebase Console. Enable Email/Password authentication or use Continue with Google.';
            }
            setError(errorMsg);
            setAuthLoading(false);
            isSigningInRef.current = false;
            return;
          }
        } else {
          let errorMsg = 'Failed to sign in. Please check your email and password.';
          if (errCode === 'auth/operation-not-allowed' || errCode === 'auth/admin-restricted-operation') {
            errorMsg =
              'Email/Password sign-in is disabled in Firebase Console. Enable Email/Password authentication or use Continue with Google.';
          } else if (errCode === 'auth/wrong-password') {
            errorMsg = 'Incorrect email or password. Please verify your credentials and try again.';
          } else if (errCode === 'auth/invalid-email') {
            errorMsg = 'Please enter a valid email address.';
          } else if (errCode === 'auth/too-many-requests') {
            errorMsg = 'Access disabled temporarily due to too many failed attempts. Try again later.';
          } else if (err?.message) {
            errorMsg = err.message;
          }
          setError(errorMsg);
          setAuthLoading(false);
          isSigningInRef.current = false;
          return;
        }
      }

      if (!user) {
        setError('Sign in failed. Please try again.');
        setAuthLoading(false);
        isSigningInRef.current = false;
        return;
      }

      const activeUid = user.uid;
      const assignedRole = isNewlyRegistered
        ? 'citizen'
        : await resolveRoleByCredentials(activeUid, cleanEmail);

      await persistUserProfileSafely(
        activeUid,
        cleanEmail,
        cleanName || cleanEmail.split('@')[0],
        assignedRole
      );

      if (typeof window !== 'undefined') {
        localStorage.setItem('user_role', assignedRole);
        localStorage.setItem('user_email', cleanEmail);
        localStorage.setItem('user_uid', activeUid);
      }

      await logSecurityEvent({
        userId: activeUid,
        email: cleanEmail,
        role: assignedRole,
        action: isNewlyRegistered ? 'SIGNUP_SUCCESS' : 'LOGIN_SUCCESS',
        portal: assignedRole as any,
        status: 'SUCCESS',
        details: isNewlyRegistered
          ? `New citizen account created and signed in.`
          : `User signed in successfully.`,
      }).catch(() => {});

      window.location.href = `/${assignedRole}`;
    } else {
      // Sign Up collects ONLY ID (email) and Password — no Name field required
      try {
        const cred = await createUserWithEmailAndPassword(auth, cleanEmail, cleanPass);
        user = cred.user;
      } catch (createErr: any) {
        const errCode = createErr?.code || '';
        if (errCode === 'auth/email-already-in-use') {
          setError(`An account with "${cleanEmail}" already exists. Please switch to "Sign In".`);
          setAuthLoading(false);
          isSigningInRef.current = false;
          return;
        } else {
          let errorMsg = 'Failed to create account. Please check your details.';
          if (errCode === 'auth/operation-not-allowed' || errCode === 'auth/admin-restricted-operation') {
            errorMsg =
              'Email/Password registration is disabled in Firebase Console. Enable Email/Password provider or use Continue with Google.';
          } else if (errCode === 'auth/weak-password') {
            errorMsg = 'Password is too weak. Please use at least 6 characters.';
          } else if (errCode === 'auth/invalid-email') {
            errorMsg = 'Please enter a valid email address.';
          } else if (createErr?.message) {
            errorMsg = createErr.message;
          }
          setError(errorMsg);
          setAuthLoading(false);
          isSigningInRef.current = false;
          return;
        }
      }

      if (!user) {
        setError('Account creation failed. Please try again.');
        setAuthLoading(false);
        isSigningInRef.current = false;
        return;
      }

      const activeUid = user.uid;
      const assignedRole = await resolveRoleByCredentials(activeUid, cleanEmail);

      await persistUserProfileSafely(activeUid, cleanEmail, cleanEmail.split('@')[0], assignedRole);

      if (typeof window !== 'undefined') {
        localStorage.setItem('user_role', assignedRole);
        localStorage.setItem('user_email', cleanEmail);
        localStorage.setItem('user_uid', activeUid);
      }

      await logSecurityEvent({
        userId: activeUid,
        email: cleanEmail,
        role: assignedRole,
        action: 'SIGNUP_SUCCESS',
        portal: assignedRole as any,
        status: 'SUCCESS',
        details: `New account registered (${assignedRole.toUpperCase()}).`,
      }).catch(() => {});

      window.location.href = `/${assignedRole}`;
    }
  };

  const handleGoogleAuth = async () => {
    setError('');
    setAuthLoading(true);
    isSigningInRef.current = true;

    // Clear any cached role from a previous session before Google sign-in
    if (typeof window !== 'undefined') {
      localStorage.removeItem('user_role');
      localStorage.removeItem('user_email');
      localStorage.removeItem('user_uid');
    }

    try {
      const provider = new GoogleAuthProvider();
      const userCredential = await signInWithPopup(auth, provider);
      const user = userCredential.user;

      if (!user || !user.email) {
        setError('Google sign in failed to retrieve user details.');
        setAuthLoading(false);
        isSigningInRef.current = false;
        return;
      }

      const googleEmail = user.email.toLowerCase();
      const assignedRole = await resolveRoleByCredentials(user.uid, googleEmail);

      await persistUserProfileSafely(
        user.uid,
        googleEmail,
        user.displayName || fullName || googleEmail.split('@')[0] || 'CrowdCivic User',
        assignedRole
      );

      if (typeof window !== 'undefined') {
        localStorage.setItem('user_role', assignedRole);
        localStorage.setItem('user_email', googleEmail);
        localStorage.setItem('user_uid', user.uid);
      }

      await logSecurityEvent({
        userId: user.uid,
        email: googleEmail,
        role: assignedRole,
        action: 'LOGIN_SUCCESS',
        portal: assignedRole as any,
        status: 'SUCCESS',
        details: `User signed in with Google as ${assignedRole.toUpperCase()}.`,
      }).catch(() => {});

      setAuthModalOpen(false);
      window.location.href = `/${assignedRole}`;
    } catch (err: any) {
      console.warn('Google Auth notice:', err?.code || err);
      const currentHost = typeof window !== 'undefined' ? window.location.hostname : '';
      if (err?.code === 'auth/popup-closed-by-user') {
        setError('Google sign-in window was closed before completion.');
      } else if (err?.code === 'auth/unauthorized-domain') {
        setError(
          `Domain "${currentHost}" is not authorized in Firebase Authentication. Add it under Firebase Console → Authentication → Settings → Authorized domains.`
        );
      } else {
        setError(err?.message || 'Google sign in failed.');
      }
      isSigningInRef.current = false;
      setAuthLoading(false);
    }
  };

  const handleSignOut = async () => {
    await signOut(auth);
    setCurrentUser(null);
    setExistingRole(null);
    if (typeof window !== 'undefined') {
      localStorage.removeItem('user_role');
      localStorage.removeItem('user_email');
      localStorage.removeItem('user_uid');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F4F8FD] flex items-center justify-center p-4">
        <div className="bg-white border border-[#DCE7F5] rounded-2xl px-6 py-5 flex items-center gap-3 shadow-xs">
          <Loader2 className="w-5 h-5 animate-spin text-[#15427B]" />
          <span className="text-sm text-[#13345D] font-medium">Connecting to CrowdCivic AI Portal...</span>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`min-h-screen bg-white text-[#13345D] flex flex-col font-sans ${
        largeTextMode ? 'text-[17px]' : ''
      } ${highContrastMode ? 'contrast-110' : ''}`}
    >
      {/* 1. TOP DARK NAVY GOVERNANCE UTILITY BAR (Screenshot Spec) */}
      <div className="w-full bg-[#0B2A52] text-white text-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-9 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5 truncate">
            <span className="font-semibold tracking-tight whitespace-nowrap">CrowdCivic AI</span>
            <span className="text-white/40" aria-hidden="true">
              |
            </span>
            <span className="text-white/85 hidden sm:inline truncate">Smart Civic Governance Portal</span>
          </div>

          <div className="flex items-center gap-4 sm:gap-5 shrink-0 relative">
            {/* Language Toggle / Dropdown */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setLangMenuOpen((prev) => !prev)}
                className="flex items-center gap-1.5 text-white/90 hover:text-white transition-colors whitespace-nowrap"
                aria-expanded={langMenuOpen}
                aria-label="Choose language"
              >
                <span className={language === 'en' ? 'font-bold text-white' : 'text-white/75'}>English</span>
                <span className="text-white/50">/</span>
                <span className={language === 'hi' ? 'font-bold text-white' : 'text-white/75'}>हिंदी</span>
                <ChevronDown className="w-3 h-3 text-white/70" />
              </button>

              {langMenuOpen && (
                <div className="absolute right-0 mt-2 w-48 bg-white text-[#13345D] rounded-xl border border-[#DCE7F5] shadow-lg py-1.5 z-50">
                  {LANGUAGES.map((lang) => (
                    <button
                      key={lang.code}
                      type="button"
                      onClick={() => {
                        setLanguage(lang.code);
                        setLangMenuOpen(false);
                      }}
                      className={`w-full px-3.5 py-2 text-left text-xs flex items-center justify-between hover:bg-[#F4F8FD] transition-colors ${
                        language === lang.code ? 'font-bold text-[#15427B] bg-[#F4F8FD]' : 'text-[#475569]'
                      }`}
                    >
                      <span>{lang.nativeName}</span>
                      <span className="text-[11px] text-[#64748B]">{lang.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => setAccessibilityModalOpen(true)}
              className="hidden sm:inline-flex items-center gap-1.5 text-white/85 hover:text-white transition-colors whitespace-nowrap"
            >
              <AccessibilityIcon className="w-3.5 h-3.5" />
              <span>Accessibility</span>
            </button>

            <button
              type="button"
              onClick={() => setHelpModalOpen(true)}
              className="inline-flex items-center gap-1.5 text-white/85 hover:text-white transition-colors whitespace-nowrap"
            >
              <Headphones className="w-3.5 h-3.5" />
              <span>Help &amp; Support</span>
            </button>
          </div>
        </div>
      </div>

      {/* 2. STICKY WHITE MAIN NAVIGATION BAR (Screenshot Spec) */}
      <header className="w-full bg-white border-b border-[#E2E8F0] sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-[72px] flex items-center justify-between gap-6">
          {/* Left Brand Lockup */}
          <a
            href="#home"
            onClick={(e) => {
              e.preventDefault();
              scrollToSection('home');
            }}
            className="flex items-center gap-3 shrink-0"
          >
            <div className="w-10 h-10 rounded-xl bg-[#133B6E] text-white flex items-center justify-center relative shadow-xs">
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
          </a>

          {/* Center Nav Links */}
          <nav className="hidden lg:flex items-center gap-7 text-[14px] font-medium text-[#334155]">
            {NAV_ITEMS.map((item) => {
              const isActive = activeNav === item.id;
              return (
                <a
                  key={item.id}
                  href={`#${item.id}`}
                  onClick={(e) => {
                    e.preventDefault();
                    scrollToSection(item.id);
                  }}
                  className={`py-2 border-b-2 transition-colors whitespace-nowrap shrink-0 ${
                    isActive
                      ? 'border-[#F59E0B] text-[#13345D] font-semibold'
                      : 'border-transparent hover:text-[#15427B]'
                  }`}
                >
                  {item.label}
                </a>
              );
            })}
          </nav>

          {/* Right Auth Actions */}
          <div className="hidden sm:flex items-center gap-3 shrink-0">
            {currentUser ? (
              <>
                <button
                  type="button"
                  onClick={() => redirectByRole(existingRole || 'citizen')}
                  className="bg-[#15427B] hover:bg-[#0F2F5A] text-white font-semibold text-sm px-5 py-2.5 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap"
                >
                  <span>Open Portal</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="text-[#475569] hover:text-[#DC2626] text-xs font-semibold px-3 py-2.5 rounded-lg border border-[#E2E8F0] hover:border-[#FCA5A5] transition-colors flex items-center gap-1.5 whitespace-nowrap"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Sign Out</span>
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => openAuthModal('signin')}
                  className="text-sm font-bold text-[#13345D] hover:text-[#15427B] px-3 py-2 rounded-lg transition-colors whitespace-nowrap"
                >
                  Sign In
                </button>
                <button
                  type="button"
                  onClick={() => openAuthModal('signup')}
                  className="bg-[#15427B] hover:bg-[#0F2F5A] text-white font-semibold text-sm px-5 py-2.5 rounded-lg transition-colors shadow-xs whitespace-nowrap"
                >
                  Sign Up
                </button>
              </>
            )}
          </div>

          {/* Mobile Menu Button */}
          <button
            type="button"
            onClick={() => setMobileMenuOpen((prev) => !prev)}
            className="lg:hidden p-2 rounded-lg border border-[#E2E8F0] text-[#13345D] hover:bg-[#F4F8FD]"
            aria-label="Toggle navigation menu"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>

        {/* Mobile Nav Drawer */}
        {mobileMenuOpen && (
          <div className="lg:hidden border-t border-[#E2E8F0] bg-white px-4 py-4 space-y-2">
            {NAV_ITEMS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => scrollToSection(item.id)}
                className={`block w-full text-left px-3 py-2.5 rounded-lg text-sm font-medium ${
                  activeNav === item.id ? 'bg-[#F4F8FD] text-[#15427B] font-semibold' : 'text-[#334155]'
                }`}
              >
                {item.label}
              </button>
            ))}
            <div className="pt-2 border-t border-[#E2E8F0] flex items-center gap-2.5">
              {currentUser ? (
                <>
                  <button
                    type="button"
                    onClick={() => redirectByRole(existingRole || 'citizen')}
                    className="flex-1 bg-[#15427B] text-white font-semibold text-sm py-2.5 rounded-lg"
                  >
                    Open Portal
                  </button>
                  <button
                    type="button"
                    onClick={handleSignOut}
                    className="px-4 py-2.5 border border-[#E2E8F0] rounded-lg text-sm font-semibold text-[#475569]"
                  >
                    Sign Out
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => openAuthModal('signin')}
                    className="flex-1 border border-[#CBD5E1] text-[#13345D] font-semibold text-sm py-2.5 rounded-lg"
                  >
                    Sign In
                  </button>
                  <button
                    type="button"
                    onClick={() => openAuthModal('signup')}
                    className="flex-1 bg-[#15427B] text-white font-semibold text-sm py-2.5 rounded-lg"
                  >
                    Sign Up
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </header>

      <motion.main
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
        className="flex-1"
      >
        {/* 3. HERO SECTION (#home) WITH CITYSCAPE & FLOATING VERIFICATION CARDS */}
        <section id="home" className="relative bg-[#F4F8FD] overflow-hidden">
          {/* Right Cityscape Photo Backdrop blended cleanly into #F4F8FD */}
          <div className="hidden lg:block absolute top-0 right-0 bottom-0 w-[56%] pointer-events-none select-none">
            <Image
              src={heroCitySkyline}
              alt="Modern metropolitan city skyline"
              fill
              priority
              referrerPolicy="no-referrer"
              className="object-cover object-center opacity-90"
            />
            {/* Smooth left fade + soft mist mask so hero text side remains clean */}
            <div className="absolute inset-0 bg-gradient-to-r from-[#F4F8FD] via-[#F4F8FD]/75 via-28% to-transparent" />
            <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-white to-transparent" />
          </div>

          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-12 pb-16 lg:pt-16 lg:pb-24 relative z-10">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-8 items-center">
              {/* Left Column: Headline, Copy & CTAs */}
              <div className="lg:col-span-6 space-y-6">
                <div>
                  <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white border border-[#DCE7F5] shadow-[0_2px_8px_rgba(15,41,74,0.04)] text-[11px] font-bold tracking-[0.09em] uppercase text-[#15427B]">
                    <Sparkles className="w-3.5 h-3.5 text-[#F59E0B]" />
                    AI-ENABLED CIVIC GOVERNANCE
                  </span>
                </div>

                <h1 className="text-4xl sm:text-5xl lg:text-[56px] font-extrabold text-[#13345D] tracking-tight leading-[1.08] text-balance">
                  Building Smarter Cities Through Citizen{' '}
                  <span className="inline-block relative pb-2">
                    Participation
                    <span
                      aria-hidden="true"
                      className="absolute left-0 right-0 bottom-0 h-[4px] bg-[#F59E0B] rounded-full"
                    />
                  </span>
                </h1>

                <p className="text-base sm:text-lg text-[#475569] leading-relaxed max-w-xl">
                  Empowering citizens to report civic issues while helping authorities monitor, verify and resolve
                  problems through intelligent technology.
                </p>

                <div className="flex flex-wrap items-center gap-3.5 pt-1">
                  {currentUser ? (
                    <button
                      type="button"
                      onClick={() => redirectByRole(existingRole || 'citizen')}
                      className="bg-[#F59E0B] hover:bg-[#D97706] text-[#0F294A] font-bold text-sm px-6 py-3.5 rounded-xl shadow-xs transition-colors inline-flex items-center gap-2 whitespace-nowrap"
                    >
                      <span>Open My Portal</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => openAuthModal('signin')}
                        className="bg-[#F59E0B] hover:bg-[#D97706] text-[#0F294A] font-bold text-sm px-6 py-3.5 rounded-xl shadow-xs transition-colors inline-flex items-center gap-2 whitespace-nowrap"
                      >
                        <span>Sign In</span>
                        <ArrowRight className="w-4 h-4" />
                      </button>

                      <button
                        type="button"
                        onClick={() => openAuthModal('signup')}
                        className="bg-white hover:bg-[#F8FAFC] text-[#13345D] border border-[#1E3A5F]/25 font-semibold text-sm px-6 py-3.5 rounded-xl shadow-xs transition-colors whitespace-nowrap"
                      >
                        Sign Up
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Right Column: Floating Civic Verification Showcase Cards */}
              <div className="lg:col-span-6 relative">
                {/* Mobile Skyline Frame */}
                <div className="lg:hidden relative rounded-2xl overflow-hidden h-56 mb-4 border border-[#DCE7F5]">
                  <Image
                    src={heroCitySkyline}
                    alt="Modern metropolitan city skyline"
                    fill
                    referrerPolicy="no-referrer"
                    className="object-cover object-center"
                  />
                </div>

                <div className="flex flex-col gap-5 lg:min-h-[380px] lg:justify-between lg:py-4">
                  {/* Floating Card 1: AI Issue Detection */}
                  <div className="bg-white/95 backdrop-blur-xs rounded-2xl border border-[#E2E8F0] shadow-[0_14px_34px_rgba(15,41,74,0.08)] px-4 py-3.5 flex items-center justify-between gap-4 max-w-[290px]">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-[#EFF6FF] text-[#15427B] flex items-center justify-center shrink-0">
                        <BrainCircuit className="w-5 h-5" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-[#13345D] leading-tight truncate">AI Issue Detection</p>
                        <p className="text-xs text-[#64748B] mt-0.5 truncate">Issue classified in seconds</p>
                      </div>
                    </div>
                    <span className="w-6 h-6 rounded-full bg-[#DCFCE7] text-[#16A34A] flex items-center justify-center shrink-0">
                      <Check className="w-3.5 h-3.5" />
                    </span>
                  </div>

                  {/* Floating Card 2: GPS Verified */}
                  <div className="bg-white/95 backdrop-blur-xs rounded-2xl border border-[#E2E8F0] shadow-[0_14px_34px_rgba(15,41,74,0.08)] px-4 py-3.5 flex items-center gap-3.5 max-w-[260px] self-end">
                    <div className="w-10 h-10 rounded-xl bg-[#FEF3C7] text-[#D97706] flex items-center justify-center shrink-0">
                      <MapPin className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-[#13345D] leading-tight">GPS Verified</p>
                      <p className="text-xs text-[#64748B] mt-0.5 tabular-nums">Ward 17 · 12m accuracy</p>
                    </div>
                  </div>

                  {/* Floating Card 3: Complaint Tracking */}
                  <div className="bg-white/95 backdrop-blur-xs rounded-2xl border border-[#E2E8F0] shadow-[0_14px_34px_rgba(15,41,74,0.08)] px-4 py-3.5 flex items-center justify-between gap-4 max-w-[300px] lg:ml-6">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-[#13345D] leading-tight">Complaint Tracking</p>
                      <p className="text-xs text-[#64748B] mt-0.5 font-mono">#CIV-10482 · Roads Dept</p>
                    </div>
                    <span className="px-2.5 py-1 rounded-full bg-[#DCFCE7] text-[#15803D] text-[10px] font-bold tracking-wider uppercase whitespace-nowrap shrink-0">
                      IN PROGRESS
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 4. THREE NUMBERED PILLARS ROW (#about) (Screenshot 2 Spec) */}
        <section id="about" className="bg-white py-14 sm:py-16 border-b border-[#E2E8F0]/70">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Pillar 01 */}
              <div className="bg-white rounded-2xl border border-[#E2E8F0] shadow-[0_2px_12px_rgba(15,41,74,0.04)] p-7 flex flex-col justify-between">
                <div>
                  <div className="flex items-start justify-between gap-4 mb-5">
                    <div className="w-11 h-11 rounded-xl bg-[#EFF6FF] text-[#15427B] flex items-center justify-center shrink-0">
                      <Users className="w-5 h-5" />
                    </div>
                    <span className="text-2xl font-bold text-[#E2E8F0] tabular-nums select-none">01</span>
                  </div>
                  <h2 className="text-lg font-bold text-[#13345D]">Citizen Participation</h2>
                  <p className="text-sm text-[#475569] mt-2 leading-relaxed">
                    Make reporting easy and accessible, giving every resident a meaningful role in improving their
                    neighbourhood.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => scrollToSection('how-it-works')}
                  className="mt-6 inline-flex items-center gap-1 text-xs font-bold text-[#15427B] hover:text-[#0B2A52] transition-colors self-start"
                >
                  <span>Learn how it works</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Pillar 02 */}
              <div className="bg-white rounded-2xl border border-[#E2E8F0] shadow-[0_2px_12px_rgba(15,41,74,0.04)] p-7 flex flex-col justify-between">
                <div>
                  <div className="flex items-start justify-between gap-4 mb-5">
                    <div className="w-11 h-11 rounded-xl bg-[#EFF6FF] text-[#15427B] flex items-center justify-center shrink-0">
                      <BrainCircuit className="w-5 h-5" />
                    </div>
                    <span className="text-2xl font-bold text-[#E2E8F0] tabular-nums select-none">02</span>
                  </div>
                  <h2 className="text-lg font-bold text-[#13345D]">Intelligent Issue Detection</h2>
                  <p className="text-sm text-[#475569] mt-2 leading-relaxed">
                    Use responsible AI to classify civic concerns, verify report details and help prioritise urgent
                    action.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => scrollToSection('how-it-works')}
                  className="mt-6 inline-flex items-center gap-1 text-xs font-bold text-[#15427B] hover:text-[#0B2A52] transition-colors self-start"
                >
                  <span>Learn how it works</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Pillar 03 */}
              <div className="bg-white rounded-2xl border border-[#E2E8F0] shadow-[0_2px_12px_rgba(15,41,74,0.04)] p-7 flex flex-col justify-between">
                <div>
                  <div className="flex items-start justify-between gap-4 mb-5">
                    <div className="w-11 h-11 rounded-xl bg-[#EFF6FF] text-[#15427B] flex items-center justify-center shrink-0">
                      <ShieldCheck className="w-5 h-5" />
                    </div>
                    <span className="text-2xl font-bold text-[#E2E8F0] tabular-nums select-none">03</span>
                  </div>
                  <h2 className="text-lg font-bold text-[#13345D]">Accountable Resolution</h2>
                  <p className="text-sm text-[#475569] mt-2 leading-relaxed">
                    Create a transparent trail from complaint submission to authority response and citizen
                    verification.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => scrollToSection('how-it-works')}
                  className="mt-6 inline-flex items-center gap-1 text-xs font-bold text-[#15427B] hover:text-[#0B2A52] transition-colors self-start"
                >
                  <span>Learn how it works</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* 5. HOW IT WORKS 4-STEP CONNECTED WORKFLOW (#how-it-works) (Screenshot 4 Spec) */}
        <section id="how-it-works" className="bg-[#F4F8FD] py-20">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center max-w-2xl mx-auto">
              <div className="inline-flex items-center gap-2.5 text-[11px] font-bold tracking-[0.14em] uppercase text-[#15427B]">
                <span className="w-6 h-[2px] bg-[#F59E0B]" />
                <span>HOW IT WORKS</span>
              </div>
              <h2 className="text-3xl sm:text-4xl font-extrabold text-[#13345D] tracking-tight mt-3 text-balance">
                From report to resolution in four clear steps
              </h2>
              <p className="text-sm sm:text-base text-[#475569] mt-3 leading-relaxed">
                A transparent workflow keeps citizens informed and helps civic teams act with accuracy.
              </p>
            </div>

            <div className="relative mt-14 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
              {/* Dashed Connector Line on Desktop */}
              <div
                aria-hidden="true"
                className="hidden lg:block absolute top-11 left-[12%] right-[12%] border-t-2 border-dashed border-[#BFDBFE] z-0"
              />

              {/* Step 1 */}
              <div className="relative z-10 text-center px-2">
                <div className="w-22 h-22 mx-auto rounded-full bg-white shadow-[0_8px_24px_rgba(15,41,74,0.08)] flex items-center justify-center relative">
                  <div className="w-14 h-14 rounded-full bg-[#15427B] text-white flex items-center justify-center">
                    <MessageSquare className="w-6 h-6" />
                  </div>
                  <span className="w-6 h-6 rounded-full bg-[#F59E0B] text-[#0F294A] text-xs font-bold flex items-center justify-center absolute -top-0.5 right-0.5 shadow-xs tabular-nums">
                    1
                  </span>
                </div>
                <h3 className="text-base font-bold text-[#13345D] mt-5">Report Issue</h3>
                <p className="text-xs sm:text-sm text-[#475569] mt-2 leading-relaxed max-w-[230px] mx-auto">
                  Share a photo, description and location through the citizen portal.
                </p>
              </div>

              {/* Step 2 */}
              <div className="relative z-10 text-center px-2">
                <div className="w-22 h-22 mx-auto rounded-full bg-white shadow-[0_8px_24px_rgba(15,41,74,0.08)] flex items-center justify-center relative">
                  <div className="w-14 h-14 rounded-full bg-[#15427B] text-white flex items-center justify-center">
                    <Search className="w-6 h-6" />
                  </div>
                  <span className="w-6 h-6 rounded-full bg-[#F59E0B] text-[#0F294A] text-xs font-bold flex items-center justify-center absolute -top-0.5 right-0.5 shadow-xs tabular-nums">
                    2
                  </span>
                </div>
                <h3 className="text-base font-bold text-[#13345D] mt-5">AI Analysis</h3>
                <p className="text-xs sm:text-sm text-[#475569] mt-2 leading-relaxed max-w-[230px] mx-auto">
                  AI classifies, validates and checks for duplicate complaints.
                </p>
              </div>

              {/* Step 3 */}
              <div className="relative z-10 text-center px-2">
                <div className="w-22 h-22 mx-auto rounded-full bg-white shadow-[0_8px_24px_rgba(15,41,74,0.08)] flex items-center justify-center relative">
                  <div className="w-14 h-14 rounded-full bg-[#15427B] text-white flex items-center justify-center">
                    <Building2 className="w-6 h-6" />
                  </div>
                  <span className="w-6 h-6 rounded-full bg-[#F59E0B] text-[#0F294A] text-xs font-bold flex items-center justify-center absolute -top-0.5 right-0.5 shadow-xs tabular-nums">
                    3
                  </span>
                </div>
                <h3 className="text-base font-bold text-[#13345D] mt-5">Authority Action</h3>
                <p className="text-xs sm:text-sm text-[#475569] mt-2 leading-relaxed max-w-[230px] mx-auto">
                  The relevant municipal team receives and acts on the issue.
                </p>
              </div>

              {/* Step 4 */}
              <div className="relative z-10 text-center px-2">
                <div className="w-22 h-22 mx-auto rounded-full bg-white shadow-[0_8px_24px_rgba(15,41,74,0.08)] flex items-center justify-center relative">
                  <div className="w-14 h-14 rounded-full bg-[#0E8A4E] text-white flex items-center justify-center">
                    <ShieldCheck className="w-6 h-6" />
                  </div>
                  <span className="w-6 h-6 rounded-full bg-[#F59E0B] text-[#0F294A] text-xs font-bold flex items-center justify-center absolute -top-0.5 right-0.5 shadow-xs tabular-nums">
                    4
                  </span>
                </div>
                <h3 className="text-base font-bold text-[#13345D] mt-5">Resolution Verification</h3>
                <p className="text-xs sm:text-sm text-[#475569] mt-2 leading-relaxed max-w-[230px] mx-auto">
                  Evidence is reviewed and citizens can confirm the outcome.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* 6. KEY FEATURES SECTION (#features) (Screenshot 5 Spec) */}
        <section id="features" className="bg-white py-20">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 mb-12">
              <div>
                <div className="inline-flex items-center gap-2.5 text-[11px] font-bold tracking-[0.14em] uppercase text-[#15427B]">
                  <span className="w-6 h-[2px] bg-[#F59E0B]" />
                  <span>KEY FEATURES</span>
                </div>
                <h2 className="text-3xl sm:text-4xl font-extrabold text-[#13345D] tracking-tight mt-2.5 text-balance">
                  Built for faster, fairer civic response
                </h2>
              </div>

              <p className="text-sm sm:text-base text-[#475569] max-w-md leading-relaxed">
                Purpose-built capabilities help municipal authorities focus resources where they matter, while keeping
                citizens connected to every update.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
              {/* Feature 1 */}
              <div className="bg-white rounded-2xl border border-[#E2E8F0] border-t-[3px] border-t-[#15427B] p-6 shadow-[0_2px_10px_rgba(15,41,74,0.03)]">
                <div className="w-10 h-10 rounded-xl bg-[#EFF6FF] text-[#15427B] flex items-center justify-center mb-5">
                  <BrainCircuit className="w-5 h-5" />
                </div>
                <h3 className="text-base font-bold text-[#13345D]">AI Issue Detection</h3>
                <p className="text-xs sm:text-sm text-[#475569] mt-2 leading-relaxed">
                  Intelligently identifies potholes, garbage overflow and water leakage from citizen reports.
                </p>
              </div>

              {/* Feature 2 */}
              <div className="bg-white rounded-2xl border border-[#E2E8F0] border-t-[3px] border-t-[#0E8A4E] p-6 shadow-[0_2px_10px_rgba(15,41,74,0.03)]">
                <div className="w-10 h-10 rounded-xl bg-[#ECFDF5] text-[#0E8A4E] flex items-center justify-center mb-5">
                  <MapPin className="w-5 h-5" />
                </div>
                <h3 className="text-base font-bold text-[#13345D]">GPS Verification</h3>
                <p className="text-xs sm:text-sm text-[#475569] mt-2 leading-relaxed">
                  Location-stamped reports help authorities validate issues and dispatch the right team.
                </p>
              </div>

              {/* Feature 3 */}
              <div className="bg-white rounded-2xl border border-[#E2E8F0] border-t-[3px] border-t-[#F59E0B] p-6 shadow-[0_2px_10px_rgba(15,41,74,0.03)]">
                <div className="w-10 h-10 rounded-xl bg-[#FEF3C7] text-[#D97706] flex items-center justify-center mb-5">
                  <FileText className="w-5 h-5" />
                </div>
                <h3 className="text-base font-bold text-[#13345D]">Duplicate Complaint Detection</h3>
                <p className="text-xs sm:text-sm text-[#475569] mt-2 leading-relaxed">
                  Smart matching combines related reports to reduce duplication and improve response time.
                </p>
              </div>

              {/* Feature 4 */}
              <div className="bg-white rounded-2xl border border-[#E2E8F0] border-t-[3px] border-t-[#0F294A] p-6 shadow-[0_2px_10px_rgba(15,41,74,0.03)]">
                <div className="w-10 h-10 rounded-xl bg-[#F1F5F9] text-[#0F294A] flex items-center justify-center mb-5">
                  <Clock className="w-5 h-5" />
                </div>
                <h3 className="text-base font-bold text-[#13345D]">Transparent Resolution Monitoring</h3>
                <p className="text-xs sm:text-sm text-[#475569] mt-2 leading-relaxed">
                  Track every update from acknowledgement to closure through a clear public workflow.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* 7. FAQS ACCORDION SECTION (#faqs) */}
        <section id="faqs" className="bg-[#F4F8FD] py-20 border-t border-[#E2E8F0]/70">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12">
              <div className="inline-flex items-center gap-2.5 text-[11px] font-bold tracking-[0.14em] uppercase text-[#15427B]">
                <span className="w-6 h-[2px] bg-[#F59E0B]" />
                <span>FREQUENTLY ASKED QUESTIONS</span>
              </div>
              <h2 className="text-3xl font-extrabold text-[#13345D] tracking-tight mt-2.5">
                Common questions about civic reporting
              </h2>
            </div>

            <div className="space-y-3">
              {FAQ_ITEMS.map((item, idx) => {
                const isOpen = openFaqIdx === idx;
                return (
                  <div
                    key={item.q}
                    className="bg-white rounded-2xl border border-[#E2E8F0] overflow-hidden"
                  >
                    <button
                      type="button"
                      onClick={() => setOpenFaqIdx(isOpen ? null : idx)}
                      className="w-full px-6 py-4 text-left flex items-center justify-between gap-4 hover:bg-[#F8FBFF] transition-colors"
                      aria-expanded={isOpen}
                    >
                      <span className="text-sm sm:text-base font-bold text-[#13345D]">{item.q}</span>
                      <ChevronDown
                        className={`w-4 h-4 text-[#15427B] shrink-0 transition-transform ${
                          isOpen ? 'rotate-180' : ''
                        }`}
                      />
                    </button>
                    {isOpen && (
                      <div className="px-6 pb-5 text-xs sm:text-sm text-[#475569] leading-relaxed border-t border-[#F1F5F9] pt-3">
                        {item.a}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* 8. PORTAL ACCESS & HELPLINE BAND (#contact) */}
        <section id="contact" className="bg-white py-16 border-t border-[#E2E8F0]">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="bg-[#0B2A52] rounded-3xl p-8 sm:p-10 text-white flex flex-col lg:flex-row lg:items-center justify-between gap-8">
              <div className="max-w-xl space-y-2.5">
                <div className="inline-flex items-center gap-2 text-[11px] font-bold tracking-[0.14em] uppercase text-[#FCD34D]">
                  <span className="w-5 h-[2px] bg-[#F59E0B]" />
                  <span>READY TO PARTICIPATE</span>
                </div>
                <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-balance">
                  Help keep city infrastructure safe, accountable, and verified.
                </h2>
                <p className="text-sm text-white/80 leading-relaxed">
                  Access your CrowdCivic workspace to submit reports, verify repairs, and track city updates.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3.5 shrink-0">
                {currentUser ? (
                  <button
                    type="button"
                    onClick={() => redirectByRole(existingRole || 'citizen')}
                    className="bg-[#F59E0B] hover:bg-[#D97706] text-[#0F294A] font-bold text-sm px-6 py-3.5 rounded-xl transition-colors inline-flex items-center gap-2 whitespace-nowrap"
                  >
                    <span>Open Portal</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => openAuthModal('signin')}
                      className="bg-[#F59E0B] hover:bg-[#D97706] text-[#0F294A] font-bold text-sm px-6 py-3.5 rounded-xl transition-colors inline-flex items-center gap-2 whitespace-nowrap"
                    >
                      <span>Sign In</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => openAuthModal('signup')}
                      className="bg-white/10 hover:bg-white/15 border border-white/25 text-white font-semibold text-sm px-5 py-3.5 rounded-xl transition-colors whitespace-nowrap"
                    >
                      Sign Up
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </section>
      </motion.main>

      {/* 9. INSTITUTIONAL FOOTER */}
      <footer className="bg-[#0B2A52] text-white pt-12 pb-8 border-t border-[#15427B]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 text-xs">
            <div className="space-y-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-[#15427B] flex items-center justify-center">
                  <Building2 className="w-4 h-4 text-white" />
                </div>
                <div>
                  <span className="font-bold text-sm text-white">CrowdCivic </span>
                  <span className="font-bold text-sm text-[#F59E0B]">AI</span>
                </div>
              </div>
              <p className="text-white/75 leading-relaxed max-w-xs">
                Smart Civic Governance Portal connecting residents with municipal engineering divisions through AI issue
                triage and 3-gate repair verification.
              </p>
            </div>

            <div>
              <h3 className="font-bold text-white text-xs uppercase tracking-wider mb-3">
                Civic Emergency Helplines
              </h3>
              <ul className="space-y-1.5 text-white/80">
                <li>Public Works &amp; Roads · Dial 311</li>
                <li>Emergency Response · Dial 112</li>
                <li>Water &amp; Sewerage · 1916</li>
                <li>Power &amp; Street Lighting · 1912</li>
              </ul>
            </div>

            <div>
              <h3 className="font-bold text-white text-xs uppercase tracking-wider mb-3">Portal Links</h3>
              <ul className="space-y-1.5 text-white/80">
                <li>
                  <button
                    type="button"
                    onClick={() => openAuthModal('signin')}
                    className="hover:text-white transition-colors"
                  >
                    Sign In
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={() => openAuthModal('signup')}
                    className="hover:text-white transition-colors"
                  >
                    Sign Up
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={() => scrollToSection('how-it-works')}
                    className="hover:text-white transition-colors"
                  >
                    4-Step Verification Process
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={() => setHelpModalOpen(true)}
                    className="hover:text-white transition-colors"
                  >
                    Municipal Support Desk
                  </button>
                </li>
              </ul>
            </div>
          </div>

          <div className="border-t border-white/15 pt-5 flex flex-col sm:flex-row items-center justify-between gap-2 text-[11px] text-white/70">
            <span>© 2026 CrowdCivic AI · Smart Civic Governance Portal.</span>
            <span>Role-Based Verification &amp; Immutable Audit Trail</span>
          </div>
        </div>
      </footer>

      {/* AUTHENTICATION MODAL (Preserves 100% Firebase Auth & Role Routing) */}
      {authModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-[#0B2A52]/55 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setAuthModalOpen(false)}
        >
          <div
            className="bg-white rounded-2xl border border-[#DCE7F5] shadow-2xl max-w-md w-full overflow-hidden max-h-[92vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-5 border-b border-[#E2E8F0] flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] font-bold text-[#15427B] uppercase tracking-wider">
                  Portal Access
                </p>
                <h2 className="text-xl font-bold text-[#13345D] mt-0.5">
                  {mode === 'signin' ? 'Sign In to CrowdCivic' : 'Create Your Account'}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setAuthModalOpen(false)}
                className="p-2 rounded-lg text-[#64748B] hover:text-[#13345D] hover:bg-[#F4F8FD] transition-colors"
                aria-label="Close sign in modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-5">
              {/* Active Session Banner */}
              {currentUser && (
                <div className="p-4 rounded-xl bg-[#F4F8FD] border border-[#BFDBFE] text-xs flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <span className="text-[#64748B] text-[11px] block">Signed in as</span>
                    <span className="font-bold text-[#13345D] truncate block">{currentUser.email}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => redirectByRole(existingRole || 'citizen')}
                      className="text-xs font-semibold bg-[#15427B] hover:bg-[#0F2F5A] text-white px-3.5 py-2 rounded-lg transition-colors"
                    >
                      Open Portal
                    </button>
                    <button
                      type="button"
                      onClick={handleSignOut}
                      className="text-[#64748B] hover:text-[#DC2626] p-2 rounded-lg border border-[#DCE7F5] bg-white transition-colors"
                      title="Sign out"
                    >
                      <LogOut className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}

              {/* Mode Switcher */}
              <div className="grid grid-cols-2 p-1 bg-[#F4F8FD] border border-[#DCE7F5] rounded-xl text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => {
                    setMode('signin');
                    setForgotPasswordMode(false);
                    setError('');
                    setResetError('');
                    setResetSuccess('');
                  }}
                  className={`py-2 rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                    mode === 'signin'
                      ? 'bg-white text-[#13345D] shadow-xs border border-[#E2E8F0]'
                      : 'text-[#64748B] hover:text-[#13345D]'
                  }`}
                >
                  <LogIn className="w-3.5 h-3.5 text-[#15427B]" />
                  <span>Sign In</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMode('signup');
                    setForgotPasswordMode(false);
                    setError('');
                    setResetError('');
                    setResetSuccess('');
                  }}
                  className={`py-2 rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                    mode === 'signup'
                      ? 'bg-white text-[#13345D] shadow-xs border border-[#E2E8F0]'
                      : 'text-[#64748B] hover:text-[#13345D]'
                  }`}
                >
                  <UserPlus className="w-3.5 h-3.5 text-[#15427B]" />
                  <span>Sign Up</span>
                </button>
              </div>

              {forgotPasswordMode ? (
                <form onSubmit={handleForgotPasswordSubmit} className="space-y-4">
                  <div className="p-3.5 rounded-xl bg-[#F4F8FD] border border-[#DCE7F5] text-xs text-[#475569]">
                    Enter your registered email ID to receive a Firebase password reset link.
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#13345D] mb-1.5">
                      Registered Email ID <span className="text-[#DC2626]">*</span>
                    </label>
                    <input
                      type="email"
                      required
                      value={resetEmail}
                      onChange={(e) => setResetEmail(e.target.value)}
                      placeholder="name@example.com"
                      className="w-full bg-white border border-[#CBD5E1] rounded-xl px-3.5 py-2.5 text-sm text-[#13345D] placeholder-[#64748B]/70 focus:outline-none focus:border-[#15427B] focus:ring-2 focus:ring-[#15427B]/15 transition-all"
                    />
                  </div>

                  {resetError && (
                    <div className="text-xs text-[#DC2626] bg-[#FEF2F2] border border-[#FCA5A5] p-3 rounded-xl leading-relaxed">
                      {resetError}
                    </div>
                  )}

                  {resetSuccess && (
                    <div className="text-xs text-[#0E8A4E] bg-[#ECFDF5] border border-[#BBF7D0] p-3 rounded-xl leading-relaxed">
                      {resetSuccess}
                    </div>
                  )}

                  <div className="flex items-center gap-2.5">
                    <button
                      type="button"
                      onClick={() => {
                        setForgotPasswordMode(false);
                        setResetError('');
                        setResetSuccess('');
                      }}
                      className="px-4 py-2.5 border border-[#CBD5E1] rounded-xl text-xs font-semibold text-[#475569] hover:text-[#13345D]"
                    >
                      Back to Sign In
                    </button>
                    <button
                      type="submit"
                      disabled={resetLoading}
                      className="flex-1 text-white font-semibold text-sm py-2.5 rounded-xl transition-colors disabled:opacity-60 flex justify-center items-center gap-2 bg-[#15427B] hover:bg-[#0F2F5A]"
                    >
                      {resetLoading ? <Loader2 className="w-4 h-4 animate-spin text-white" /> : 'Send Reset Link'}
                    </button>
                  </div>
                </form>
              ) : (
                <>
                  <form onSubmit={handleAuthSubmit} className="space-y-4">
                    {mode === 'signin' && (
                      <div>
                        <label className="block text-xs font-semibold text-[#13345D] mb-1.5">
                          Full Name <span className="text-[#DC2626]">*</span>
                        </label>
                        <input
                          type="text"
                          required
                          value={fullName}
                          onChange={(e) => setFullName(e.target.value)}
                          placeholder="e.g. Aarav Mehta"
                          className="w-full bg-white border border-[#CBD5E1] rounded-xl px-3.5 py-2.5 text-sm text-[#13345D] placeholder-[#64748B]/70 focus:outline-none focus:border-[#15427B] focus:ring-2 focus:ring-[#15427B]/15 transition-all"
                        />
                      </div>
                    )}

                    <div>
                      <label className="block text-xs font-semibold text-[#13345D] mb-1.5">
                        Email Address <span className="text-[#DC2626]">*</span>
                      </label>
                      <input
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="name@example.com"
                        className="w-full bg-white border border-[#CBD5E1] rounded-xl px-3.5 py-2.5 text-sm text-[#13345D] placeholder-[#64748B]/70 focus:outline-none focus:border-[#15427B] focus:ring-2 focus:ring-[#15427B]/15 transition-all"
                      />
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="block text-xs font-semibold text-[#13345D]">
                          Password <span className="text-[#DC2626]">*</span>
                        </label>
                        {mode === 'signin' && (
                          <button
                            type="button"
                            onClick={() => {
                              setResetEmail(email);
                              setResetError('');
                              setResetSuccess('');
                              setForgotPasswordMode(true);
                            }}
                            className="text-[11px] font-semibold text-[#15427B] hover:text-[#0B2A52]"
                          >
                            Forgot Password?
                          </button>
                        )}
                      </div>
                      <div className="relative">
                        <input
                          type={showPassword ? 'text' : 'password'}
                          required
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="Enter your password"
                          className="w-full bg-white border border-[#CBD5E1] rounded-xl pl-3.5 pr-10 py-2.5 text-sm text-[#13345D] placeholder-[#64748B]/70 focus:outline-none focus:border-[#15427B] focus:ring-2 focus:ring-[#15427B]/15 transition-all"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-[#64748B] hover:text-[#13345D]"
                          aria-label={showPassword ? 'Hide password' : 'Show password'}
                        >
                          {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>

                    {mode === 'signup' && (
                      <p className="text-[11px] text-[#64748B] leading-snug">
                        New accounts are registered as <span className="font-semibold text-[#13345D]">Citizen</span> by default until promoted to Authority by Admin.
                      </p>
                    )}

                    {error && (
                      <div className="text-xs text-[#DC2626] bg-[#FEF2F2] border border-[#FCA5A5] p-3.5 rounded-xl leading-relaxed">
                        {error}
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={authLoading}
                      className="w-full text-white font-semibold text-sm py-3 rounded-xl transition-colors disabled:opacity-60 flex justify-center items-center gap-2 bg-[#15427B] hover:bg-[#0F2F5A]"
                    >
                      {authLoading ? (
                        <Loader2 className="w-4 h-4 animate-spin text-white" />
                      ) : (
                        <>
                          <span>{mode === 'signin' ? 'Sign In' : 'Sign Up'}</span>
                          <ArrowRight className="w-4 h-4" />
                        </>
                      )}
                    </button>
                  </form>

                  {/* Fixed Sample Accounts for Direct Module Access */}
                  <div className="p-3.5 rounded-xl bg-[#F4F8FD] border border-[#DCE7F5] space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-[#15427B]">
                        Fixed Sample Accounts
                      </span>
                      <span className="text-[10px] text-[#64748B]">1-Click Direct Portal</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      {SAMPLE_ACCOUNTS.map((acc) => (
                        <button
                          key={acc.role}
                          type="button"
                          disabled={authLoading}
                          onClick={() => handleSampleQuickSignIn(acc.email)}
                          className="p-2 rounded-lg bg-white border border-[#DCE7F5] hover:border-[#15427B] hover:bg-[#EFF6FF] transition-colors text-left disabled:opacity-60"
                        >
                          <span className="text-[11px] font-bold text-[#13345D] capitalize block">{acc.role}</span>
                          <span className="text-[10px] text-[#64748B] font-mono truncate block mt-0.5">
                            {acc.defaultPassword}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="relative flex items-center justify-center">
                    <div className="border-t border-[#E2E8F0] w-full" />
                    <span className="bg-white px-3 text-[11px] text-[#64748B] uppercase font-medium">Or</span>
                  </div>

                  <button
                    type="button"
                    onClick={handleGoogleAuth}
                    disabled={authLoading}
                    className="w-full bg-white hover:bg-[#F4F8FD] border border-[#CBD5E1] text-[#13345D] font-semibold text-xs py-3 rounded-xl transition-colors flex items-center justify-center gap-2"
                  >
                    <Globe className="w-4 h-4 text-[#15427B]" />
                    <span>Continue with Google</span>
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ACCESSIBILITY MODAL */}
      {accessibilityModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-[#0B2A52]/55 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setAccessibilityModalOpen(false)}
        >
          <div
            className="bg-white rounded-2xl border border-[#DCE7F5] shadow-xl max-w-md w-full p-6 space-y-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-bold text-[#13345D]">Accessibility Preferences</h3>
                <p className="text-xs text-[#64748B] mt-0.5">Adjust readability controls for CrowdCivic AI.</p>
              </div>
              <button
                type="button"
                onClick={() => setAccessibilityModalOpen(false)}
                className="p-2 rounded-lg text-[#64748B] hover:bg-[#F4F8FD]"
                aria-label="Close accessibility modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <button
                type="button"
                onClick={() => setLargeTextMode((prev) => !prev)}
                className={`w-full p-4 rounded-xl border text-left flex items-center justify-between gap-3 transition-colors ${
                  largeTextMode ? 'border-[#15427B] bg-[#EFF6FF]' : 'border-[#E2E8F0] hover:bg-[#F8FAFC]'
                }`}
              >
                <div>
                  <span className="text-sm font-bold text-[#13345D] block">Larger Text Scale</span>
                  <span className="text-xs text-[#64748B]">Increases base body copy size across the portal</span>
                </div>
                <span className="text-xs font-bold text-[#15427B]">{largeTextMode ? 'ON' : 'OFF'}</span>
              </button>

              <button
                type="button"
                onClick={() => setHighContrastMode((prev) => !prev)}
                className={`w-full p-4 rounded-xl border text-left flex items-center justify-between gap-3 transition-colors ${
                  highContrastMode ? 'border-[#15427B] bg-[#EFF6FF]' : 'border-[#E2E8F0] hover:bg-[#F8FAFC]'
                }`}
              >
                <div>
                  <span className="text-sm font-bold text-[#13345D] block">Enhanced Visual Contrast</span>
                  <span className="text-xs text-[#64748B]">Boosts foreground contrast for bright outdoor viewing</span>
                </div>
                <span className="text-xs font-bold text-[#15427B]">{highContrastMode ? 'ON' : 'OFF'}</span>
              </button>
            </div>

            <button
              type="button"
              onClick={() => setAccessibilityModalOpen(false)}
              className="w-full py-2.5 bg-[#15427B] text-white text-sm font-semibold rounded-xl"
            >
              Done
            </button>
          </div>
        </div>
      )}

      {/* HELP & SUPPORT MODAL */}
      {helpModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-[#0B2A52]/55 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setHelpModalOpen(false)}
        >
          <div
            className="bg-white rounded-2xl border border-[#DCE7F5] shadow-xl max-w-md w-full p-6 space-y-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-bold text-[#13345D]">Municipal Help &amp; Support</h3>
                <p className="text-xs text-[#64748B] mt-0.5">24×7 civic emergency &amp; grievance helplines</p>
              </div>
              <button
                type="button"
                onClick={() => setHelpModalOpen(false)}
                className="p-2 rounded-lg text-[#64748B] hover:bg-[#F4F8FD]"
                aria-label="Close help modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2.5 text-xs">
              <div className="p-3.5 rounded-xl bg-[#F4F8FD] border border-[#DCE7F5] flex items-center justify-between">
                <span className="font-semibold text-[#13345D] flex items-center gap-2">
                  <Phone className="w-3.5 h-3.5 text-[#15427B]" /> Public Works Grievances
                </span>
                <span className="font-mono font-bold text-[#15427B]">Dial 311</span>
              </div>
              <div className="p-3.5 rounded-xl bg-[#F4F8FD] border border-[#DCE7F5] flex items-center justify-between">
                <span className="font-semibold text-[#13345D] flex items-center gap-2">
                  <Phone className="w-3.5 h-3.5 text-[#15427B]" /> Emergency &amp; Disaster Safety
                </span>
                <span className="font-mono font-bold text-[#15427B]">Dial 112</span>
              </div>
              <div className="p-3.5 rounded-xl bg-[#F4F8FD] border border-[#DCE7F5] flex items-center justify-between">
                <span className="font-semibold text-[#13345D] flex items-center gap-2">
                  <Phone className="w-3.5 h-3.5 text-[#15427B]" /> Water &amp; Drainage Control
                </span>
                <span className="font-mono font-bold text-[#15427B]">Dial 1916</span>
              </div>
              <div className="p-3.5 rounded-xl bg-[#F4F8FD] border border-[#DCE7F5] flex items-center justify-between">
                <span className="font-semibold text-[#13345D] flex items-center gap-2">
                  <Mail className="w-3.5 h-3.5 text-[#15427B]" /> Civic Desk Email
                </span>
                <span className="font-mono text-[#475569]">support@crowdcivic.org</span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setHelpModalOpen(false)}
              className="w-full py-2.5 bg-[#15427B] text-white text-sm font-semibold rounded-xl"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
