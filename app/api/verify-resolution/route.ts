import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb, verifyBearerIdToken } from '@/lib/firebase-admin';
import {
  executeRVE,
  extractKeyframesFromVideoBuffer,
  runGate1Geofence,
} from '@/lib/rve';
import { RFDETRDetection } from '@/lib/types/civic';
import defaultConfig from '../../../firebase-applet-config.json';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MAX_FFMPEG_VIDEO_BYTES = 12 * 1024 * 1024; // 12 MB ceiling for fast FFmpeg decode

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

/**
 * Recursively decodes a Firestore REST API Value object into a plain JS value.
 */
function decodeFirestoreValue(val: any): any {
  if (!val || typeof val !== 'object') return null;
  if ('stringValue' in val) return val.stringValue;
  if ('booleanValue' in val) return Boolean(val.booleanValue);
  if ('integerValue' in val) return Number(val.integerValue);
  if ('doubleValue' in val) return Number(val.doubleValue);
  if ('timestampValue' in val) return val.timestampValue;
  if ('nullValue' in val) return null;
  if ('arrayValue' in val) {
    const values = val.arrayValue?.values;
    return Array.isArray(values) ? values.map(decodeFirestoreValue) : [];
  }
  if ('mapValue' in val) {
    const fields = val.mapValue?.fields || {};
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(fields)) {
      out[k] = decodeFirestoreValue(v);
    }
    return out;
  }
  return null;
}

/**
 * Fetches an issue document via Firestore REST API using the caller's Firebase ID token.
 * Works on both Starter Tier (no IAM needed) and Blaze Tier while enforcing firestore.rules.
 */
async function fetchIssueViaRest(
  issueId: string,
  authHeader: string | null
): Promise<Record<string, any> | null> {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || defaultConfig.projectId;
  const databaseId = process.env.NEXT_PUBLIC_FIREBASE_DATABASE_ID || defaultConfig.firestoreDatabaseId || '(default)';
  const encodedId = encodeURIComponent(issueId);
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${encodeURIComponent(databaseId)}/documents/issues/${encodedId}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { Authorization: authHeader },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const json = await res.json();
    if (!json || !json.fields) return null;
    return decodeFirestoreValue({ mapValue: { fields: json.fields } });
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Resolution Verification Engine (RVE) API Route (Phase 6 & 7)
 * Accepts:
 *  - multipart/form-data: includes recorded 30s resolution video Blob/File + metadata JSON
 *  - application/json: includes pre-extracted keyframes or storage metadata
 *
 * Strictly executes 3 sequential binary gates via lib/rve:
 *  Gate 1: GPS Geofencing (Haversine <= 20m) -> FAIL stops immediately (before FFmpeg/Gemini)
 *  Gate 2: Timestamp Validation (drift <= tolerance) -> FAIL stops immediately
 *  Gate 3: Gemini 2.5 Flash Keyframe Analysis -> Strict JSON schema validation
 *
 * Decision:
 *  PASS + PASS + PASS = VERIFIED -> Resolved & Closed
 *  ANY FAIL = REJECTED -> Manual Verification Queue
 */
export async function POST(req: NextRequest) {
  try {
    const serverTimestampIso = new Date().toISOString();
    const contentType = req.headers.get('content-type') || '';
    const authHeader = req.headers.get('authorization');

    // Verify caller Firebase ID Token when provided (bounded timeout)
    const authCheck = await withTimeout(
      verifyBearerIdToken(authHeader),
      4000,
      'ID token verification'
    ).catch(() => ({ verified: false, decoded: null }));

    let issueId = '';
    let authorityUid = authCheck.decoded?.uid || '';
    let authorityEmail = authCheck.decoded?.email || '';
    let authorityLocation: { latitude?: number | null; longitude?: number | null; address?: string; timestamp?: string } = {};
    let citizenLocation: { latitude?: number | null; longitude?: number | null; address?: string } = {};
    let issueDetails: any = {};
    let captureTimestamp: string | null = null;
    let videoStorageUrl: string | null = null;
    let videoStoragePath: string | null = null;
    let clientFramesBase64: string[] = [];
    let uploadedVideoFile: File | null = null;
    let keyframesBase64: string[] = [];
    let keyframeExtractionError: string | null = null;

    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      const metadataRaw = formData.get('metadata');
      const meta = typeof metadataRaw === 'string' ? JSON.parse(metadataRaw) : {};

      issueId = String(meta.issueId || meta.complaintId || '');
      authorityUid = authorityUid || String(meta.authorityUid || '');
      authorityEmail = authorityEmail || String(meta.authorityEmail || 'authority@crowdcivic.org');
      authorityLocation = meta.authorityLocation || {};
      citizenLocation = meta.citizenLocation || {};
      issueDetails = meta.issueDetails || {};
      captureTimestamp = meta.captureTimestamp ?? authorityLocation?.timestamp ?? null;
      videoStorageUrl = meta.videoStorageUrl || null;
      videoStoragePath = meta.videoStoragePath || null;

      if (Array.isArray(meta.videoFramesBase64)) {
        clientFramesBase64 = meta.videoFramesBase64
          .filter((f: unknown): f is string => typeof f === 'string' && f.length > 200)
          .map((f: string) => f.replace(/^data:image\/\w+;base64,/, '').trim());
      }

      const videoFile = formData.get('video');
      if (videoFile && typeof (videoFile as Blob).arrayBuffer === 'function') {
        uploadedVideoFile = videoFile as File;
      }
    } else {
      const body = await req.json();
      issueId = String(body.issueId || body.complaintId || body.issueDetails?.id || '');
      authorityUid = authorityUid || String(body.authorityUid || '');
      authorityEmail = authorityEmail || String(body.authorityEmail || 'authority@crowdcivic.org');
      authorityLocation = body.authorityLocation || {};
      citizenLocation = body.citizenLocation || {};
      issueDetails = body.issueDetails || {};
      captureTimestamp = body.captureTimestamp ?? authorityLocation?.timestamp ?? null;
      videoStorageUrl = body.videoStorageUrl || null;
      videoStoragePath = body.videoStoragePath || null;
      if (Array.isArray(body.videoFramesBase64)) {
        clientFramesBase64 = body.videoFramesBase64
          .filter((f: unknown): f is string => typeof f === 'string' && f.length > 200)
          .map((f: string) => f.replace(/^data:image\/\w+;base64,/, '').trim());
      }
    }

    if (!issueId) {
      return NextResponse.json(
        { success: false, error: 'Missing complaint/issue ID for RVE verification.' },
        { status: 400 }
      );
    }

    // Fetch authoritative complaint snapshot from Firestore via REST (authenticated as caller) or Admin SDK
    let dbIssueData: any = await fetchIssueViaRest(issueId, authHeader);
    if (!dbIssueData) {
      try {
        const adminSnap = await withTimeout(
          getAdminDb().collection('issues').doc(issueId).get(),
          2500,
          'Admin Firestore read'
        );
        if (adminSnap.exists) dbIssueData = adminSnap.data();
      } catch {
        // Starter Tier without IAM falls back gracefully to submitted complaint snapshot
      }
    }

    const effectiveTicketId = dbIssueData?.ticketId || issueDetails?.ticketId || issueId;
    const previousStatus = dbIssueData?.status || 'In Progress';
    const effectiveCategory = dbIssueData?.category || issueDetails?.category || 'Civic Issue';
    const effectiveTitle = dbIssueData?.title || issueDetails?.title || 'Reported Issue';
    const effectiveDescription = dbIssueData?.description || issueDetails?.description || '';
    const originalImageUrl = dbIssueData?.imageUrl || issueDetails?.imageUrl || '';
    const originalDetections: RFDETRDetection[] =
      dbIssueData?.aiAnalysis?.rfdetrDetections ||
      dbIssueData?.aiAnalysis?.roboflowDetections ||
      issueDetails?.rfdetrDetections ||
      [];
    const detectedDefectClass =
      dbIssueData?.aiAnalysis?.customVisionDetectedClass || issueDetails?.detectedDefectClass || effectiveCategory;

    const authoritativeComplaintLoc = dbIssueData?.location || citizenLocation;

    // Fast pre-check Gate 1 BEFORE running FFmpeg or downloading original image
    // so out-of-geofence (>20m) or missing-GPS submissions return immediately in <300ms.
    const gate1Preview = runGate1Geofence({
      authorityLat: authorityLocation?.latitude ?? null,
      authorityLon: authorityLocation?.longitude ?? null,
      complaintLat: authoritativeComplaintLoc?.latitude ?? null,
      complaintLon: authoritativeComplaintLoc?.longitude ?? null,
    });

    let originalImageBase64: string | null = null;

    if (gate1Preview.passed) {
      // Only decode video / download original image if Gate 1 passed
      if (uploadedVideoFile) {
        if (uploadedVideoFile.size > MAX_FFMPEG_VIDEO_BYTES && clientFramesBase64.length >= 3) {
          keyframesBase64 = clientFramesBase64;
        } else {
          const videoBuffer = Buffer.from(await uploadedVideoFile.arrayBuffer());
          const extracted = await extractKeyframesFromVideoBuffer(
            videoBuffer,
            uploadedVideoFile.name || 'resolution.webm',
            6
          );
          if (extracted.ok && extracted.framesBase64.length >= 3) {
            keyframesBase64 = extracted.framesBase64;
          } else {
            keyframeExtractionError = extracted.error || 'FFmpeg keyframe extraction returned insufficient frames.';
            keyframesBase64 =
              clientFramesBase64.length >= extracted.framesBase64.length
                ? clientFramesBase64
                : extracted.framesBase64;
          }
        }
      } else {
        keyframesBase64 = clientFramesBase64;
      }

      // Fetch original photo bytes if URL is remote Firebase Storage (strict 5s timeout)
      if (originalImageUrl.startsWith('data:image/')) {
        originalImageBase64 = originalImageUrl;
      } else if (originalImageUrl.startsWith('http')) {
        const imgController = new AbortController();
        const imgTimer = setTimeout(() => imgController.abort(), 5000);
        try {
          const imgRes = await fetch(originalImageUrl, { signal: imgController.signal });
          if (imgRes.ok) {
            originalImageBase64 = Buffer.from(await imgRes.arrayBuffer()).toString('base64');
          }
        } catch {
          // non-fatal
        } finally {
          clearTimeout(imgTimer);
        }
      }
    } else {
      // Keep any client keyframes for audit/manual queue preview without spending time on FFmpeg
      keyframesBase64 = clientFramesBase64;
    }

    // Execute strict sequential 3-Gate RVE
    const rveResult = await executeRVE({
      complaintId: issueId,
      ticketId: effectiveTicketId,
      category: effectiveCategory,
      title: effectiveTitle,
      description: effectiveDescription,
      originalImageBase64,
      originalDetections,
      detectedDefectClass,
      complaintLocation: {
        latitude: authoritativeComplaintLoc?.latitude ?? null,
        longitude: authoritativeComplaintLoc?.longitude ?? null,
        address: authoritativeComplaintLoc?.address || '',
      },
      authorityLocation: {
        latitude: authorityLocation?.latitude ?? null,
        longitude: authorityLocation?.longitude ?? null,
        address: authorityLocation?.address || '',
      },
      videoTimestamp: captureTimestamp,
      serverTimestampIso,
      keyframesBase64,
    });

    const isVerified = rveResult.finalOutcome === 'Verified';
    const newStatus = isVerified ? 'Resolved' : 'Rejected';

    const verificationRecord = {
      complaintId: issueId,
      ticketId: effectiveTicketId,
      authorityUid: authorityUid || 'authority_official',
      authorityEmail,
      videoStorageUrl,
      videoStoragePath,
      uploadGps: {
        latitude: authorityLocation?.latitude ?? null,
        longitude: authorityLocation?.longitude ?? null,
        address: authorityLocation?.address || '',
      },
      videoTimestamp: captureTimestamp,
      serverReceiptTimestamp: serverTimestampIso,
      extractedKeyframesCount: keyframesBase64.length,
      keyframeExtractionError,
      rveResult,
      finalOutcome: rveResult.finalOutcome,
      createdAt: serverTimestampIso,
    };

    const backwardCompatibleAudit = {
      ...rveResult,
      final_outcome: rveResult.finalOutcome,
      isAuthentic: isVerified,
      visualResolutionMatch: isVerified,
      confidenceScore:
        rveResult.gates.gate3_gemini_keyframe.frame_confidence !== null
          ? Math.round(rveResult.gates.gate3_gemini_keyframe.frame_confidence * 100)
          : 0,
      locationMatchScore:
        rveResult.gates.gate3_gemini_keyframe.location_match_confidence !== null
          ? Math.round(rveResult.gates.gate3_gemini_keyframe.location_match_confidence * 100)
          : 0,
      verificationSummary: rveResult.summary,
      detectedFixes: isVerified
        ? [
            `Gate 1 GPS Geofence: ${rveResult.gates.gate1_geofence.distanceMeters}m (≤ ${rveResult.gates.gate1_geofence.thresholdMeters}m)`,
            `Gate 2 Timestamp Drift: ${rveResult.gates.gate2_timestamp.driftSeconds}s`,
            `Gate 3 Repair Quality: ${rveResult.gates.gate3_gemini_keyframe.repair_quality}`,
          ]
        : [],
      rejectionReason: isVerified ? null : rveResult.summary,
    };

    const issueUpdatePayload: Record<string, any> = {
      status: newStatus,
      rveOutcome: rveResult.finalOutcome,
      resolutionAiAudit: backwardCompatibleAudit,
      manualReviewQueue: !isVerified,
      isDisputed: !isVerified,
      resolutionVideoUrl: videoStorageUrl,
      resolutionVideoPath: videoStoragePath,
      updatedAt: serverTimestampIso,
    };

    if (isVerified) {
      issueUpdatePayload.resolvedAt = serverTimestampIso;
      issueUpdatePayload.resolvedBy = authorityEmail;
      if (keyframesBase64.length > 0) {
        issueUpdatePayload.resolutionVideoFrames = [`data:image/jpeg;base64,${keyframesBase64[0]}`];
      }
    }

    const auditEntry = {
      timestamp: serverTimestampIso,
      userId: authorityUid || authorityEmail,
      actorId: authorityUid || authorityEmail,
      email: authorityEmail,
      role: 'authority',
      actorRole: 'authority',
      complaintId: issueId,
      ticketId: effectiveTicketId,
      previousState: previousStatus,
      newState: newStatus,
      action: isVerified ? 'RVE_VERIFIED' : 'RVE_REJECTED',
      portal: 'rve',
      status: isVerified ? 'SUCCESS' : 'DENIED',
      details: String(rveResult.summary || '').slice(0, 1800),
      verificationDetails: {
        gate1Passed: rveResult.gates.gate1_geofence.passed,
        gate1DistanceMeters: rveResult.gates.gate1_geofence.distanceMeters,
        gate2Passed: rveResult.gates.gate2_timestamp.passed,
        gate2Executed: rveResult.gates.gate2_timestamp.executed,
        gate3Passed: rveResult.gates.gate3_gemini_keyframe.passed,
        gate3Executed: rveResult.gates.gate3_gemini_keyframe.executed,
        failureGate: rveResult.failureGate,
      },
    };

    const manualQueueItem = !isVerified
      ? {
          complaintId: issueId,
          ticketId: effectiveTicketId,
          title: effectiveTitle,
          category: effectiveCategory,
          department: dbIssueData?.department || 'Municipal Dept',
          authorityUid: authorityUid || 'authority_official',
          authorityEmail,
          failureGate: rveResult.failureGate,
          rejectionReason: rveResult.summary,
          potentiallyTamperedEvidence: rveResult.gates.gate2_timestamp.potentiallyTamperedEvidence,
          rveResult,
          videoStorageUrl,
          originalImageUrl,
          sampleKeyframes: keyframesBase64.slice(0, 3).map((k) => `data:image/jpeg;base64,${k}`),
          reviewStatus: 'Pending Review',
          createdAt: serverTimestampIso,
        }
      : null;

    const citizenUid = dbIssueData?.userId || '';
    const notificationsToCreate: any[] = [];
    if (citizenUid) {
      notificationsToCreate.push({
        recipientUid: citizenUid,
        recipientRole: 'citizen',
        complaintId: issueId,
        ticketId: effectiveTicketId,
        title: (isVerified
          ? `Issue ${effectiveTicketId} Verified & Resolved`
          : `Resolution Check Rejected for ${effectiveTicketId}`
        ).slice(0, 190),
        message: isVerified
          ? `The 3-gate AI Resolution Verification Engine verified the repair for "${effectiveTitle}".`
          : `An authority closure submission for "${effectiveTitle}" failed RVE (${rveResult.failureGate}) and was routed to Admin Manual Review.`,
        type: isVerified ? 'RVE_VERIFIED' : 'RVE_REJECTED',
        read: false,
        createdAt: serverTimestampIso,
      });
    }
    notificationsToCreate.push({
      recipientUid: authorityUid || 'ALL_AUTHORITIES',
      recipientRole: 'authority',
      complaintId: issueId,
      ticketId: effectiveTicketId,
      title: (isVerified
        ? `RVE Approved: ${effectiveTicketId}`
        : `RVE Rejected: ${effectiveTicketId}`
      ).slice(0, 190),
      message: rveResult.summary,
      type: isVerified ? 'RVE_VERIFIED' : 'RVE_REJECTED',
      read: false,
      createdAt: serverTimestampIso,
    });

    // Attempt server-side Admin SDK persistence with a strict 3s timeout.
    // On Starter Tier projects without IAM permissions, immediately delegate persistence
    // to the authenticated Authority client instead of hanging on unauthenticated Node SDK calls.
    let persistedVia: 'admin' | 'client_required' = 'admin';
    try {
      const adminDb = getAdminDb();
      await withTimeout(
        Promise.all([
          adminDb.collection('issues').doc(issueId).update(issueUpdatePayload),
          adminDb.collection('resolutionVerifications').add(verificationRecord),
          adminDb.collection('auditLogs').add(auditEntry),
          ...(manualQueueItem ? [adminDb.collection('manualVerificationQueue').add(manualQueueItem)] : []),
          ...notificationsToCreate.map((n) => adminDb.collection('notifications').add(n)),
        ]),
        3000,
        'Admin Firestore persistence'
      );
    } catch {
      persistedVia = 'client_required';
    }

    return NextResponse.json({
      success: true,
      verification: backwardCompatibleAudit,
      rveResult,
      finalOutcome: rveResult.finalOutcome,
      statusUpdated: newStatus,
      distanceMeters: rveResult.gates.gate1_geofence.distanceMeters,
      extractedKeyframesCount: keyframesBase64.length,
      persistedVia,
      ...(persistedVia === 'client_required'
        ? {
            persistencePayloads: {
              issueUpdatePayload,
              verificationRecord,
              auditEntry,
              manualQueueItem,
              notificationsToCreate,
            },
          }
        : {}),
    });
  } catch (err: any) {
    console.error('Error in /api/verify-resolution:', err);
    return NextResponse.json(
      {
        success: false,
        error: err?.message || 'Server error during Resolution Verification Engine execution.',
      },
      { status: 500 }
    );
  }
}
