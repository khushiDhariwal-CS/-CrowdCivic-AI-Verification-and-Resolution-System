import { GoogleGenAI, Type } from '@google/genai';
import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import {
  RepairQuality,
  RFDETRDetection,
  RVEGate1Result,
  RVEGate2Result,
  RVEGate3GeminiPayload,
  RVEGate3Result,
  RVEResult,
} from '../types/civic';

const execFileAsync = promisify(execFile);

function calculateHaversineMeters(
  lat1?: number | null,
  lon1?: number | null,
  lat2?: number | null,
  lon2?: number | null
): number {
  if (
    lat1 === null || lat1 === undefined ||
    lon1 === null || lon1 === undefined ||
    lat2 === null || lat2 === undefined ||
    lon2 === null || lon2 === undefined ||
    Number.isNaN(Number(lat1)) || Number.isNaN(Number(lon1)) ||
    Number.isNaN(Number(lat2)) || Number.isNaN(Number(lon2))
  ) {
    return Infinity;
  }
  const R = 6371000;
  const radLat1 = (Number(lat1) * Math.PI) / 180;
  const radLat2 = (Number(lat2) * Math.PI) / 180;
  const dLat = ((Number(lat2) - Number(lat1)) * Math.PI) / 180;
  const dLon = ((Number(lon2) - Number(lon1)) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(radLat1) * Math.cos(radLat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

export const DEFAULT_RVE_GEOFENCE_MAX_METERS = Number(
  process.env.RVE_GEOFENCE_MAX_METERS || 20
);
export const DEFAULT_RVE_TIMESTAMP_TOLERANCE_SECONDS = Number(
  process.env.RVE_TIMESTAMP_TOLERANCE_SECONDS || 300
);
const MIN_REQUIRED_KEYFRAMES = 3;
const VALID_REPAIR_QUALITIES: RepairQuality[] = ['Excellent', 'Good', 'Partial', 'Poor'];

/**
 * Extracts representative keyframes from an uploaded 30-second video buffer using /usr/bin/ffmpeg.
 */
export async function extractKeyframesFromVideoBuffer(
  videoBuffer: Buffer,
  filename = 'resolution.webm',
  targetCount = 6
): Promise<{ ok: boolean; framesBase64: string[]; error?: string }> {
  if (!videoBuffer || videoBuffer.length === 0) {
    return { ok: false, framesBase64: [], error: 'Uploaded resolution video is empty.' };
  }

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'rve-frames-'));
  const ext = path.extname(filename) || '.webm';
  const inputPath = path.join(tmpDir, `input${ext}`);
  const outPattern = path.join(tmpDir, 'frame-%02d.jpg');

  try {
    await fs.writeFile(inputPath, videoBuffer);

    // Extract roughly 1 frame every 5s (0.2 fps) up to targetCount frames; fallback to fps=1 for short clips
    try {
      await execFileAsync(
        'ffmpeg',
        ['-nostdin', '-y', '-i', inputPath, '-vf', 'fps=0.2,scale=512:-1', '-vframes', String(targetCount), '-q:v', '5', outPattern],
        { timeout: 8000 }
      );
    } catch {
      await execFileAsync(
        'ffmpeg',
        ['-nostdin', '-y', '-i', inputPath, '-vf', 'fps=1,scale=512:-1', '-vframes', String(targetCount), '-q:v', '5', outPattern],
        { timeout: 6000 }
      );
    }

    const files = (await fs.readdir(tmpDir))
      .filter((f) => f.startsWith('frame-') && f.endsWith('.jpg'))
      .sort();

    if (files.length === 0) {
      return { ok: false, framesBase64: [], error: 'FFmpeg could not extract keyframes from uploaded video.' };
    }

    const framesBase64: string[] = [];
    for (const f of files) {
      const buf = await fs.readFile(path.join(tmpDir, f));
      framesBase64.push(buf.toString('base64'));
    }

    return { ok: true, framesBase64 };
  } catch (err: any) {
    return {
      ok: false,
      framesBase64: [],
      error: `Video keyframe extraction failed: ${err?.message || String(err)}`,
    };
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * GATE 1: GPS Geofencing (Strict <= 20 metres threshold)
 */
export function runGate1Geofence(params: {
  authorityLat?: number | null;
  authorityLon?: number | null;
  complaintLat?: number | null;
  complaintLon?: number | null;
  maxMeters?: number;
}): RVEGate1Result {
  const thresholdMeters = params.maxMeters ?? DEFAULT_RVE_GEOFENCE_MAX_METERS;
  const distanceMeters = calculateHaversineMeters(
    params.authorityLat,
    params.authorityLon,
    params.complaintLat,
    params.complaintLon
  );

  if (!Number.isFinite(distanceMeters)) {
    return {
      gateNumber: 1,
      name: 'GPS Geofencing',
      passed: false,
      distanceMeters: -1,
      thresholdMeters,
      reason: 'Missing valid GPS coordinates on authority submission or complaint record.',
    };
  }

  const passed = distanceMeters <= thresholdMeters;
  return {
    gateNumber: 1,
    name: 'GPS Geofencing',
    passed,
    distanceMeters,
    thresholdMeters,
    reason: passed
      ? `PASS: Authority GPS is ${distanceMeters}m from complaint site (within ${thresholdMeters}m geofence).`
      : `FAIL: Authority GPS is ${distanceMeters}m away, exceeding the strict ${thresholdMeters}m geofence limit.`,
  };
}

/**
 * GATE 2: Timestamp & Liveness Validation
 */
export function runGate2Timestamp(params: {
  videoTimestamp?: string | null;
  serverTimestampIso: string;
  frameCount: number;
  toleranceSeconds?: number;
}): RVEGate2Result {
  const toleranceSeconds = params.toleranceSeconds ?? DEFAULT_RVE_TIMESTAMP_TOLERANCE_SECONDS;

  if (!params.videoTimestamp || typeof params.videoTimestamp !== 'string') {
    return {
      gateNumber: 2,
      name: 'Timestamp & Liveness Validation',
      passed: false,
      executed: true,
      clientTimestamp: null,
      serverTimestamp: params.serverTimestampIso,
      driftSeconds: null,
      toleranceSeconds,
      potentiallyTamperedEvidence: true,
      frameCount: params.frameCount,
      reason: 'FAIL: Missing video capture timestamp metadata — flagged as potentially tampered evidence.',
    };
  }

  const clientMs = new Date(params.videoTimestamp).getTime();
  const serverMs = new Date(params.serverTimestampIso).getTime();

  if (Number.isNaN(clientMs) || Number.isNaN(serverMs)) {
    return {
      gateNumber: 2,
      name: 'Timestamp & Liveness Validation',
      passed: false,
      executed: true,
      clientTimestamp: params.videoTimestamp,
      serverTimestamp: params.serverTimestampIso,
      driftSeconds: null,
      toleranceSeconds,
      potentiallyTamperedEvidence: true,
      frameCount: params.frameCount,
      reason: 'FAIL: Malformed video timestamp metadata — flagged as potentially tampered evidence.',
    };
  }

  const driftSeconds = Math.round(Math.abs(serverMs - clientMs) / 1000);
  const withinTolerance = driftSeconds <= toleranceSeconds;
  const hasKeyframes = params.frameCount >= MIN_REQUIRED_KEYFRAMES;

  if (!withinTolerance) {
    return {
      gateNumber: 2,
      name: 'Timestamp & Liveness Validation',
      passed: false,
      executed: true,
      clientTimestamp: params.videoTimestamp,
      serverTimestamp: params.serverTimestampIso,
      driftSeconds,
      toleranceSeconds,
      potentiallyTamperedEvidence: true,
      frameCount: params.frameCount,
      reason: `FAIL: Timestamp drift ${driftSeconds}s exceeds ${toleranceSeconds}s tolerance — flagged as potentially tampered or replay evidence.`,
    };
  }

  if (!hasKeyframes) {
    return {
      gateNumber: 2,
      name: 'Timestamp & Liveness Validation',
      passed: false,
      executed: true,
      clientTimestamp: params.videoTimestamp,
      serverTimestamp: params.serverTimestampIso,
      driftSeconds,
      toleranceSeconds,
      potentiallyTamperedEvidence: false,
      frameCount: params.frameCount,
      reason: `FAIL: Insufficient keyframes (${params.frameCount}); minimum ${MIN_REQUIRED_KEYFRAMES} keyframes required from 30s live video.`,
    };
  }

  return {
    gateNumber: 2,
    name: 'Timestamp & Liveness Validation',
    passed: true,
    executed: true,
    clientTimestamp: params.videoTimestamp,
    serverTimestamp: params.serverTimestampIso,
    driftSeconds,
    toleranceSeconds,
    potentiallyTamperedEvidence: false,
    frameCount: params.frameCount,
    reason: `PASS: Timestamp drift ${driftSeconds}s is within ${toleranceSeconds}s tolerance with ${params.frameCount} live keyframes.`,
  };
}

/**
 * Strict runtime validator for Gate 3 Gemini 2.5 Flash JSON response
 */
export function parseAndValidateGate3Payload(rawText: string): {
  valid: boolean;
  payload?: RVEGate3GeminiPayload;
  error?: string;
} {
  try {
    const parsed = JSON.parse(rawText);
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      typeof parsed.defect_visible !== 'boolean' ||
      typeof parsed.manual_review_required !== 'boolean' ||
      typeof parsed.reasoning !== 'string' ||
      typeof parsed.location_match_confidence !== 'number' ||
      typeof parsed.frame_confidence !== 'number' ||
      !VALID_REPAIR_QUALITIES.includes(parsed.repair_quality)
    ) {
      return { valid: false, error: 'Gemini JSON response failed strict RVE schema field validation.' };
    }

    if (
      parsed.location_match_confidence < 0 ||
      parsed.location_match_confidence > 1 ||
      parsed.frame_confidence < 0 ||
      parsed.frame_confidence > 1
    ) {
      return { valid: false, error: 'Gemini confidence scores out of strict [0, 1] bounds.' };
    }

    if (!parsed.reasoning.trim()) {
      return { valid: false, error: 'Gemini reasoning cannot be empty.' };
    }

    return {
      valid: true,
      payload: {
        defect_visible: parsed.defect_visible,
        location_match_confidence: parsed.location_match_confidence,
        repair_quality: parsed.repair_quality,
        frame_confidence: parsed.frame_confidence,
        reasoning: parsed.reasoning.trim(),
        manual_review_required: parsed.manual_review_required,
      },
    };
  } catch (err: any) {
    return { valid: false, error: `Malformed JSON from Gemini: ${err?.message || String(err)}` };
  }
}

export function evaluateGate3Decision(payload: RVEGate3GeminiPayload): RVEGate3Result {
  const passed =
    payload.defect_visible === false &&
    payload.manual_review_required === false &&
    payload.location_match_confidence >= 0.65 &&
    payload.frame_confidence >= 0.6 &&
    (payload.repair_quality === 'Excellent' || payload.repair_quality === 'Good');

  let reason = '';
  if (passed) {
    reason = `PASS: Repair quality '${payload.repair_quality}', defect resolved, location match ${Math.round(
      payload.location_match_confidence * 100
    )}%. ${payload.reasoning}`;
  } else if (payload.manual_review_required) {
    reason = `FAIL: Gemini flagged submission for manual review (unclear/ambiguous or insufficient evidence). ${payload.reasoning}`;
  } else if (payload.defect_visible) {
    reason = `FAIL: Original civic defect is still visible (Repair quality: ${payload.repair_quality}). ${payload.reasoning}`;
  } else {
    reason = `FAIL: Location match (${Math.round(
      payload.location_match_confidence * 100
    )}%), frame confidence (${Math.round(payload.frame_confidence * 100)}%), or repair quality (${
      payload.repair_quality
    }) did not satisfy verification criteria.`;
  }

  return {
    gateNumber: 3,
    name: 'Gemini 2.5 Flash Keyframe Analysis',
    passed,
    executed: true,
    defect_visible: payload.defect_visible,
    location_match_confidence: payload.location_match_confidence,
    repair_quality: payload.repair_quality,
    frame_confidence: payload.frame_confidence,
    manual_review_required: payload.manual_review_required,
    reasoning: payload.reasoning,
    reason,
  };
}

export type Gate3ModelCaller = (params: {
  prompt: string;
  originalImageBase64?: string | null;
  keyframesBase64: string[];
}) => Promise<string>;

export async function defaultGeminiGate3Caller(params: {
  prompt: string;
  originalImageBase64?: string | null;
  keyframesBase64: string[];
}): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured on the server.');
  }

  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
  });

  const mediaParts: any[] = [];
  if (params.originalImageBase64) {
    const cleanOrig = params.originalImageBase64.replace(/^data:image\/\w+;base64,/, '').trim();
    if (cleanOrig) {
      mediaParts.push({ inlineData: { data: cleanOrig, mimeType: 'image/jpeg' } });
    }
  }
  // Evenly sample up to 4 representative frames across the recording to keep Gemini latency fast
  const totalFrames = params.keyframesBase64.length;
  const sampledFrames: string[] = [];
  if (totalFrames <= 4) {
    sampledFrames.push(...params.keyframesBase64);
  } else {
    const indices = [
      0,
      Math.floor((totalFrames - 1) / 3),
      Math.floor(((totalFrames - 1) * 2) / 3),
      totalFrames - 1,
    ];
    for (const idx of indices) {
      sampledFrames.push(params.keyframesBase64[idx]);
    }
  }

  for (const frame of sampledFrames) {
    const cleanFrame = frame.replace(/^data:image\/\w+;base64,/, '').trim();
    if (cleanFrame) {
      mediaParts.push({ inlineData: { data: cleanFrame, mimeType: 'image/jpeg' } });
    }
  }

  const GEMINI_TIMEOUT_MS = 25000;
  const response = await Promise.race([
    ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: { parts: [...mediaParts, { text: params.prompt }] },
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            defect_visible: { type: Type.BOOLEAN },
            location_match_confidence: { type: Type.NUMBER },
            repair_quality: {
              type: Type.STRING,
              enum: ['Excellent', 'Good', 'Partial', 'Poor'],
            },
            frame_confidence: { type: Type.NUMBER },
            reasoning: { type: Type.STRING },
            manual_review_required: { type: Type.BOOLEAN },
          },
          required: [
            'defect_visible',
            'location_match_confidence',
            'repair_quality',
            'frame_confidence',
            'reasoning',
            'manual_review_required',
          ],
        },
      },
    }),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Gemini 2.5 Flash verification timed out after 25 seconds.')), GEMINI_TIMEOUT_MS)
    ),
  ]);

  if (!response?.text) {
    throw new Error('Gemini 2.5 Flash returned an empty response.');
  }
  return response.text;
}

export interface ExecuteRVEInput {
  complaintId: string;
  ticketId: string;
  category: string;
  title: string;
  description: string;
  originalImageBase64?: string | null;
  originalDetections?: RFDETRDetection[];
  detectedDefectClass?: string;
  complaintLocation: { latitude?: number | null; longitude?: number | null; address?: string };
  authorityLocation: { latitude?: number | null; longitude?: number | null; address?: string };
  videoTimestamp?: string | null;
  serverTimestampIso?: string;
  keyframesBase64: string[];
  geofenceMaxMeters?: number;
  timestampToleranceSeconds?: number;
  gate3Caller?: Gate3ModelCaller;
}

/**
 * Strictly executes the THREE SEQUENTIAL BINARY CHECKS of the Resolution Verification Engine (RVE).
 * - Short-circuits immediately if Gate 1 fails (does NOT execute Gate 2 or Gate 3).
 * - Short-circuits immediately if Gate 2 fails (does NOT execute Gate 3).
 * - Zero weighted scoring: ALL 3 PASS = Verified; ANY FAIL = Rejected -> Manual Review Queue.
 */
export async function executeRVE(input: ExecuteRVEInput): Promise<RVEResult> {
  const serverTimestampIso = input.serverTimestampIso || new Date().toISOString();

  const skippedGate2: RVEGate2Result = {
    gateNumber: 2,
    name: 'Timestamp & Liveness Validation',
    passed: false,
    executed: false,
    clientTimestamp: input.videoTimestamp || null,
    serverTimestamp: serverTimestampIso,
    driftSeconds: null,
    toleranceSeconds: input.timestampToleranceSeconds ?? DEFAULT_RVE_TIMESTAMP_TOLERANCE_SECONDS,
    potentiallyTamperedEvidence: false,
    frameCount: input.keyframesBase64.length,
    reason: 'Not executed: RVE halted at Gate 1 (GPS Geofencing failed).',
  };

  const skippedGate3: RVEGate3Result = {
    gateNumber: 3,
    name: 'Gemini 2.5 Flash Keyframe Analysis',
    passed: false,
    executed: false,
    defect_visible: null,
    location_match_confidence: null,
    repair_quality: null,
    frame_confidence: null,
    manual_review_required: true,
    reasoning: 'Not executed: RVE halted at an earlier sequential verification gate.',
    reason: 'Not executed: RVE halted before Gate 3.',
  };

  // CHECK 1: GPS GEOFENCING
  const gate1 = runGate1Geofence({
    authorityLat: input.authorityLocation.latitude,
    authorityLon: input.authorityLocation.longitude,
    complaintLat: input.complaintLocation.latitude,
    complaintLon: input.complaintLocation.longitude,
    maxMeters: input.geofenceMaxMeters,
  });

  if (!gate1.passed) {
    return {
      finalOutcome: 'Rejected',
      allGatesPassed: false,
      failureGate: 'Gate 1: GPS Geofencing',
      summary: `RVE Rejected at Gate 1 (GPS Geofencing): ${gate1.reason}`,
      gates: {
        gate1_geofence: gate1,
        gate2_timestamp: skippedGate2,
        gate3_gemini_keyframe: skippedGate3,
      },
      extractedKeyframesCount: input.keyframesBase64.length,
      verificationTimestamp: serverTimestampIso,
    };
  }

  // CHECK 2: TIMESTAMP VALIDATION
  const gate2 = runGate2Timestamp({
    videoTimestamp: input.videoTimestamp,
    serverTimestampIso,
    frameCount: input.keyframesBase64.length,
    toleranceSeconds: input.timestampToleranceSeconds,
  });

  if (!gate2.passed) {
    return {
      finalOutcome: 'Rejected',
      allGatesPassed: false,
      failureGate: 'Gate 2: Timestamp & Liveness Validation',
      summary: `RVE Rejected at Gate 2 (Timestamp Validation): ${gate2.reason}`,
      gates: {
        gate1_geofence: gate1,
        gate2_timestamp: gate2,
        gate3_gemini_keyframe: skippedGate3,
      },
      extractedKeyframesCount: input.keyframesBase64.length,
      verificationTimestamp: serverTimestampIso,
    };
  }

  // CHECK 3: GEMINI 2.5 FLASH KEYFRAME ANALYSIS
  const bboxSummary =
    input.originalDetections && input.originalDetections.length > 0
      ? input.originalDetections
          .map(
            (d) =>
              `${d.class} (conf ${(d.confidence * 100).toFixed(1)}%, bbox [x1:${d.bbox.x1}, y1:${d.bbox.y1}, x2:${d.bbox.x2}, y2:${d.bbox.y2}])`
          )
          .join('; ')
      : 'No RF-DETR bounding box recorded';

  const prompt = `You are the Resolution Verification Engine (RVE) for CrowdCivic AI.

TASK:
1. First image (if attached): Original Citizen Complaint Photo (BEFORE repair).
2. Remaining images: Extracted keyframes from the Field Authority's mandatory 30-second live verification video (AFTER repair).
3. Compare ONLY what is visibly observable in the images against the complaint context:
   - Ticket: ${input.ticketId}
   - Category: ${input.category}
   - Title: ${input.title}
   - Description: ${input.description}
   - Original RF-DETR Detected Defect Class: ${input.detectedDefectClass || input.category}
   - Original RF-DETR Bounding Boxes: ${bboxSummary}
   - Complaint Location: ${input.complaintLocation.address || 'N/A'} (${input.complaintLocation.latitude}, ${input.complaintLocation.longitude})
   - Authority Capture GPS: ${input.authorityLocation.latitude}, ${input.authorityLocation.longitude} (Distance: ${gate1.distanceMeters}m)
   - Capture Timestamp: ${input.videoTimestamp} (Server: ${serverTimestampIso})

STRICT INSTRUCTIONS:
- Never assume an issue has been repaired without clear visual evidence.
- Never infer missing information.
- Do not treat an unclear, blurry, dark, or occluded video as successful evidence.
- If keyframes are insufficient or cannot be reliably compared to the original complaint location/defect, return "manual_review_required": true.
- Set "defect_visible": true if the original defect is still present or only partially fixed.
- "repair_quality" must be strictly one of: "Excellent", "Good", "Partial", "Poor".
- Return strictly valid JSON with fields: defect_visible, location_match_confidence (0..1), repair_quality, frame_confidence (0..1), reasoning, manual_review_required.`;

  let gate3: RVEGate3Result;
  try {
    const caller = input.gate3Caller ?? defaultGeminiGate3Caller;
    const rawJson = await caller({
      prompt,
      originalImageBase64: input.originalImageBase64,
      keyframesBase64: input.keyframesBase64,
    });

    const validation = parseAndValidateGate3Payload(rawJson);
    if (!validation.valid || !validation.payload) {
      gate3 = {
        gateNumber: 3,
        name: 'Gemini 2.5 Flash Keyframe Analysis',
        passed: false,
        executed: true,
        defect_visible: null,
        location_match_confidence: null,
        repair_quality: null,
        frame_confidence: null,
        manual_review_required: true,
        reasoning: validation.error || 'Malformed Gemini JSON response.',
        reason: `FAIL: ${validation.error || 'Gemini response failed schema validation.'}`,
      };
    } else {
      gate3 = evaluateGate3Decision(validation.payload);
    }
  } catch (err: any) {
    gate3 = {
      gateNumber: 3,
      name: 'Gemini 2.5 Flash Keyframe Analysis',
      passed: false,
      executed: true,
      defect_visible: null,
      location_match_confidence: null,
      repair_quality: null,
      frame_confidence: null,
      manual_review_required: true,
      reasoning: err?.message || 'Gemini 2.5 Flash service failure.',
      reason: `FAIL: AI keyframe verification could not complete (${err?.message || 'service unavailable'}). Routed to Manual Review.`,
    };
  }

  const allGatesPassed = gate1.passed && gate2.passed && gate3.passed;
  return {
    finalOutcome: allGatesPassed ? 'Verified' : 'Rejected',
    allGatesPassed,
    failureGate: allGatesPassed ? null : 'Gate 3: Gemini 2.5 Flash Keyframe Analysis',
    summary: allGatesPassed
      ? 'RVE Verified: All 3 sequential binary gates passed (GPS <= 20m, Live Timestamp valid, Gemini 2.5 Flash confirmed repair). Issue automatically resolved and closed.'
      : `RVE Rejected at Gate 3 (Gemini Keyframe Analysis): ${gate3.reason}`,
    gates: {
      gate1_geofence: gate1,
      gate2_timestamp: gate2,
      gate3_gemini_keyframe: gate3,
    },
    extractedKeyframesCount: input.keyframesBase64.length,
    verificationTimestamp: serverTimestampIso,
  };
}
