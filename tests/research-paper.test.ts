import { describe, it, expect, vi, beforeEach } from 'vitest';
import sharp from 'sharp';
import { executeRVE, runGate1Geofence, runGate2Timestamp, parseAndValidateGate3Payload } from '../lib/rve';
import {
  calculateHaversineMeters,
  computePerceptualHash,
  evaluateDuplicates,
} from '../lib/duplicates';
import { validateStatusTransition } from '../lib/lifecycle';

const storageMocks = vi.hoisted(() => ({
  uploadBytes: vi.fn(),
  getDownloadURL: vi.fn(),
  ref: vi.fn((_storage: any, path: string) => ({ fullPath: path })),
  getStorage: vi.fn(() => ({})),
}));

vi.mock('firebase/storage', () => ({
  getStorage: storageMocks.getStorage,
  ref: storageMocks.ref,
  uploadBytes: storageMocks.uploadBytes,
  getDownloadURL: storageMocks.getDownloadURL,
}));

async function createSampleJpegBase64(seed = 1): Promise<string> {
  const width = 64;
  const height = 64;
  const buf = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 3;
      const pattern = ((x * seed + y * (seed + 2)) % 255);
      buf[idx] = pattern;
      buf[idx + 1] = (pattern + 60 * seed) % 255;
      buf[idx + 2] = (255 - pattern);
    }
  }
  const jpg = await sharp(buf, { raw: { width, height, channels: 3 } }).jpeg().toBuffer();
  return `data:image/jpeg;base64,${jpg.toString('base64')}`;
}

const SAMPLE_FRAME = 'AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDEAAAAIZnJlZQ==';
const SAMPLE_FRAMES = [SAMPLE_FRAME, SAMPLE_FRAME, SAMPLE_FRAME, SAMPLE_FRAME];
const BASE_LAT = 28.6139;
const BASE_LON = 77.209;

describe('CrowdCivic AI — Research Paper Architecture Test Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // TEST 1: GPS <= 20m (Gate 1 PASS)
  it('1. Gate 1 PASS when authority GPS is within <= 20m Haversine geofence', () => {
    // Shift latitude by ~11m north (0.0001 deg ~ 11.1m)
    const gate1 = runGate1Geofence({
      complaintLat: BASE_LAT,
      complaintLon: BASE_LON,
      authorityLat: BASE_LAT + 0.0001,
      authorityLon: BASE_LON,
      maxMeters: 20,
    });
    expect(gate1.passed).toBe(true);
    expect(gate1.distanceMeters).toBeLessThanOrEqual(20);
  });

  // TEST 2: GPS > 20m (Gate 1 FAIL -> Short-circuit Gate 2 & Gate 3)
  it('2. Gate 1 FAIL (> 20m) immediately stops RVE and skips Gate 2 & Gate 3', async () => {
    const gate3Spy = vi.fn();
    const res = await executeRVE({
      complaintId: 'cmp_gps_fail',
      ticketId: 'CIV-10002',
      category: 'Roads & Infrastructure',
      title: 'Deep road pothole',
      description: 'Large pothole causing traffic hazard',
      complaintLocation: { latitude: BASE_LAT, longitude: BASE_LON },
      // ~222m north
      authorityLocation: { latitude: BASE_LAT + 0.002, longitude: BASE_LON },
      videoTimestamp: new Date().toISOString(),
      serverTimestampIso: new Date().toISOString(),
      keyframesBase64: SAMPLE_FRAMES,
      gate3Caller: gate3Spy,
    });

    expect(res.finalOutcome).toBe('Rejected');
    expect(res.failureGate).toBe('Gate 1: GPS Geofencing');
    expect(res.gates.gate1_geofence.passed).toBe(false);
    expect(res.gates.gate1_geofence.distanceMeters).toBeGreaterThan(20);
    expect(res.gates.gate2_timestamp.executed).toBe(false);
    expect(res.gates.gate3_gemini_keyframe.executed).toBe(false);
    expect(gate3Spy).not.toHaveBeenCalled();
  });

  // TEST 3: Valid timestamp (Gate 2 PASS)
  it('3. Gate 2 PASS when timestamp drift is within configured tolerance and keyframes >= 3', () => {
    const now = new Date('2026-11-18T12:00:00.000Z');
    const capture = new Date('2026-11-18T11:59:25.000Z'); // 35s ago
    const gate2 = runGate2Timestamp({
      videoTimestamp: capture.toISOString(),
      serverTimestampIso: now.toISOString(),
      frameCount: 6,
      toleranceSeconds: 300,
    });
    expect(gate2.executed).toBe(true);
    expect(gate2.passed).toBe(true);
    expect(gate2.potentiallyTamperedEvidence).toBe(false);
    expect(gate2.driftSeconds).toBe(35);
  });

  // TEST 4: Invalid/expired timestamp (Gate 2 FAIL, tampering flag, Gate 3 skipped)
  it('4. Gate 2 FAIL on expired/replay timestamp flags tampering and short-circuits Gate 3', async () => {
    const gate3Spy = vi.fn();
    const serverIso = '2026-11-18T12:00:00.000Z';
    const staleCaptureIso = '2026-11-18T10:00:00.000Z'; // 2 hours stale

    const res = await executeRVE({
      complaintId: 'cmp_ts_fail',
      ticketId: 'CIV-10004',
      category: 'Waste & Sanitation',
      title: 'Garbage pile',
      description: 'Open waste accumulation near corner',
      complaintLocation: { latitude: BASE_LAT, longitude: BASE_LON },
      authorityLocation: { latitude: BASE_LAT, longitude: BASE_LON },
      videoTimestamp: staleCaptureIso,
      serverTimestampIso: serverIso,
      keyframesBase64: SAMPLE_FRAMES,
      gate3Caller: gate3Spy,
    });

    expect(res.finalOutcome).toBe('Rejected');
    expect(res.failureGate).toBe('Gate 2: Timestamp & Liveness Validation');
    expect(res.gates.gate1_geofence.passed).toBe(true);
    expect(res.gates.gate2_timestamp.executed).toBe(true);
    expect(res.gates.gate2_timestamp.passed).toBe(false);
    expect(res.gates.gate2_timestamp.potentiallyTamperedEvidence).toBe(true);
    expect(res.gates.gate3_gemini_keyframe.executed).toBe(false);
    expect(gate3Spy).not.toHaveBeenCalled();
  });

  // TEST 5: Missing video metadata/timestamp (Gate 2 FAIL)
  it('5. Gate 2 FAIL when video timestamp metadata is missing', async () => {
    const gate3Spy = vi.fn();
    const res = await executeRVE({
      complaintId: 'cmp_ts_missing',
      ticketId: 'CIV-10005',
      category: 'Water & Drainage',
      title: 'Water logging',
      description: 'Blocked drain causing stagnation',
      complaintLocation: { latitude: BASE_LAT, longitude: BASE_LON },
      authorityLocation: { latitude: BASE_LAT, longitude: BASE_LON },
      videoTimestamp: null,
      serverTimestampIso: '2026-11-18T12:00:00.000Z',
      keyframesBase64: SAMPLE_FRAMES,
      gate3Caller: gate3Spy,
    });

    expect(res.finalOutcome).toBe('Rejected');
    expect(res.failureGate).toBe('Gate 2: Timestamp & Liveness Validation');
    expect(res.gates.gate2_timestamp.potentiallyTamperedEvidence).toBe(true);
    expect(gate3Spy).not.toHaveBeenCalled();
  });

  // TEST 6: Correctly repaired issue (ALL 3 PASS -> Verified)
  it('6. Gate 3 PASS when repaired cleanly -> finalOutcome Verified', async () => {
    const nowIso = new Date().toISOString();
    const res = await executeRVE({
      complaintId: 'cmp_verified',
      ticketId: 'CIV-10006',
      category: 'Roads & Infrastructure',
      title: 'Pothole near gate 2',
      description: 'Road pothole repaired with fresh asphalt patch',
      complaintLocation: { latitude: BASE_LAT, longitude: BASE_LON },
      authorityLocation: { latitude: BASE_LAT + 0.00005, longitude: BASE_LON },
      videoTimestamp: nowIso,
      serverTimestampIso: nowIso,
      keyframesBase64: SAMPLE_FRAMES,
      gate3Caller: async () =>
        JSON.stringify({
          defect_visible: false,
          location_match_confidence: 0.92,
          repair_quality: 'Excellent',
          frame_confidence: 0.9,
          reasoning: 'Pothole is completely resurfaced and leveled cleanly at the matching curb corner.',
          manual_review_required: false,
        }),
    });

    expect(res.finalOutcome).toBe('Verified');
    expect(res.allGatesPassed).toBe(true);
    expect(res.failureGate).toBeNull();
    expect(res.gates.gate3_gemini_keyframe.passed).toBe(true);
  });

  // TEST 7: Unresolved issue (defect_visible: true -> Rejected)
  it('7. Gate 3 FAIL when defect_visible is true -> finalOutcome Rejected', async () => {
    const nowIso = new Date().toISOString();
    const res = await executeRVE({
      complaintId: 'cmp_unresolved',
      ticketId: 'CIV-10007',
      category: 'Waste & Sanitation',
      title: 'Garbage dump',
      description: 'Uncollected garbage bags',
      complaintLocation: { latitude: BASE_LAT, longitude: BASE_LON },
      authorityLocation: { latitude: BASE_LAT, longitude: BASE_LON },
      videoTimestamp: nowIso,
      serverTimestampIso: nowIso,
      keyframesBase64: SAMPLE_FRAMES,
      gate3Caller: async () =>
        JSON.stringify({
          defect_visible: true,
          location_match_confidence: 0.88,
          repair_quality: 'Poor',
          frame_confidence: 0.85,
          reasoning: 'Plastic waste and debris bags are still visibly piled next to the wall.',
          manual_review_required: false,
        }),
    });

    expect(res.finalOutcome).toBe('Rejected');
    expect(res.failureGate).toBe('Gate 3: Gemini 2.5 Flash Keyframe Analysis');
    expect(res.gates.gate3_gemini_keyframe.passed).toBe(false);
  });

  // TEST 8: Partially repaired issue (repair_quality: 'Partial' -> Rejected)
  it('8. Gate 3 FAIL when repair_quality is Partial -> finalOutcome Rejected', async () => {
    const nowIso = new Date().toISOString();
    const res = await executeRVE({
      complaintId: 'cmp_partial',
      ticketId: 'CIV-10008',
      category: 'Roads & Infrastructure',
      title: 'Road cavity',
      description: 'Deep asphalt cavity',
      complaintLocation: { latitude: BASE_LAT, longitude: BASE_LON },
      authorityLocation: { latitude: BASE_LAT, longitude: BASE_LON },
      videoTimestamp: nowIso,
      serverTimestampIso: nowIso,
      keyframesBase64: SAMPLE_FRAMES,
      gate3Caller: async () =>
        JSON.stringify({
          defect_visible: false,
          location_match_confidence: 0.85,
          repair_quality: 'Partial',
          frame_confidence: 0.82,
          reasoning: 'Only loose gravel was poured; no permanent asphalt compaction applied.',
          manual_review_required: false,
        }),
    });

    expect(res.finalOutcome).toBe('Rejected');
    expect(res.gates.gate3_gemini_keyframe.passed).toBe(false);
    expect(res.gates.gate3_gemini_keyframe.repair_quality).toBe('Partial');
  });

  // TEST 9: Ambiguous video evidence (manual_review_required: true -> Rejected)
  it('9. Gate 3 FAIL when Gemini flags manual_review_required -> finalOutcome Rejected', async () => {
    const nowIso = new Date().toISOString();
    const res = await executeRVE({
      complaintId: 'cmp_ambiguous',
      ticketId: 'CIV-10009',
      category: 'Water & Drainage',
      title: 'Standing water',
      description: 'Flooded alley',
      complaintLocation: { latitude: BASE_LAT, longitude: BASE_LON },
      authorityLocation: { latitude: BASE_LAT, longitude: BASE_LON },
      videoTimestamp: nowIso,
      serverTimestampIso: nowIso,
      keyframesBase64: SAMPLE_FRAMES,
      gate3Caller: async () =>
        JSON.stringify({
          defect_visible: false,
          location_match_confidence: 0.45,
          repair_quality: 'Good',
          frame_confidence: 0.4,
          reasoning: 'Keyframes are too dark and blurry to verify the surrounding landmarks.',
          manual_review_required: true,
        }),
    });

    expect(res.finalOutcome).toBe('Rejected');
    expect(res.gates.gate3_gemini_keyframe.passed).toBe(false);
    expect(res.gates.gate3_gemini_keyframe.manual_review_required).toBe(true);
  });

  // TEST 10: Malformed Gemini JSON response -> strict validation failure -> Rejected
  it('10. Gate 3 FAIL safely when Gemini returns malformed JSON', async () => {
    const validation = parseAndValidateGate3Payload('{not valid json');
    expect(validation.valid).toBe(false);

    const nowIso = new Date().toISOString();
    const res = await executeRVE({
      complaintId: 'cmp_malformed',
      ticketId: 'CIV-10010',
      category: 'Waste & Sanitation',
      title: 'Overflowing bin',
      description: 'Trash spill',
      complaintLocation: { latitude: BASE_LAT, longitude: BASE_LON },
      authorityLocation: { latitude: BASE_LAT, longitude: BASE_LON },
      videoTimestamp: nowIso,
      serverTimestampIso: nowIso,
      keyframesBase64: SAMPLE_FRAMES,
      gate3Caller: async () => '{"defect_visible": "maybe"}',
    });

    expect(res.finalOutcome).toBe('Rejected');
    expect(res.gates.gate3_gemini_keyframe.passed).toBe(false);
    expect(res.gates.gate3_gemini_keyframe.manual_review_required).toBe(true);
  });

  // TEST 11: Duplicate complaint (<=20m + matching pHash + TF-IDF + recent -> duplicateFound: true)
  it('11. 4D Duplicate Detection flags open complaint within 20m with matching pHash & TF-IDF', async () => {
    const imgDataUrl = await createSampleJpegBase64(2);
    const pHash = await computePerceptualHash(imgDataUrl);
    expect(pHash).toBeTruthy();

    const nowMs = Date.now();
    const res = await evaluateDuplicates(
      {
        latitude: BASE_LAT + 0.00008, // ~9m away
        longitude: BASE_LON,
        title: 'Large road pothole near Market Gate',
        category: 'Roads & Infrastructure',
        description: 'Severe deep pothole on Main Market road beside metro pillar',
        imageBase64: imgDataUrl,
        imageHash: pHash,
        nowMs,
      },
      [
        {
          id: 'doc_open_1',
          ticketId: 'CIV-20011',
          title: 'Large road pothole near Market Gate',
          category: 'Roads & Infrastructure',
          description: 'Severe deep pothole on Main Market road beside metro pillar',
          status: 'Submitted',
          location: { latitude: BASE_LAT, longitude: BASE_LON },
          imageHash: pHash!,
          createdAt: new Date(nowMs - 3600 * 1000).toISOString(),
        },
      ]
    );

    expect(res.duplicateFound).toBe(true);
    expect(res.topMatch?.ticketId).toBe('CIV-20011');
    expect(res.topMatch?.distanceMeters).toBeLessThanOrEqual(20);
    expect(res.topMatch?.overallScore).toBeGreaterThanOrEqual(res.threshold);
  });

  // TEST 12: Non-duplicate complaint (>20m or distinct issue -> duplicateFound: false)
  it('12. 4D Duplicate Detection does NOT flag complaints outside 20m or already Resolved', async () => {
    const imgA = await createSampleJpegBase64(1);
    const res = await evaluateDuplicates(
      {
        latitude: BASE_LAT,
        longitude: BASE_LON,
        title: 'Flooded storm drain',
        category: 'Water & Drainage',
        description: 'Water logging blocking pedestrian crosswalk',
        imageBase64: imgA,
      },
      [
        {
          id: 'doc_far',
          ticketId: 'CIV-20012',
          title: 'Flooded storm drain',
          category: 'Water & Drainage',
          description: 'Water logging blocking pedestrian crosswalk',
          status: 'Submitted',
          location: { latitude: BASE_LAT + 0.001, longitude: BASE_LON }, // ~111m > 20m
        },
        {
          id: 'doc_closed',
          ticketId: 'CIV-20013',
          title: 'Flooded storm drain',
          category: 'Water & Drainage',
          description: 'Water logging blocking pedestrian crosswalk',
          status: 'Resolved', // Already resolved -> excluded!
          location: { latitude: BASE_LAT, longitude: BASE_LON },
        },
      ]
    );

    expect(res.duplicateFound).toBe(false);
    expect(res.topMatch).toBeNull();
    expect(calculateHaversineMeters(BASE_LAT, BASE_LON, BASE_LAT + 0.001, BASE_LON)).toBeGreaterThan(20);
  });

  // TEST 13: Unauthorized status transition (Citizen attempting transition -> blocked)
  it('13. Lifecycle guard blocks unauthorized status transitions by Citizen or invalid jump', () => {
    const citizenAttempt = validateStatusTransition({
      actorRole: 'citizen',
      currentStatus: 'Submitted',
      targetStatus: 'In Progress',
    });
    expect(citizenAttempt.allowed).toBe(false);

    const invalidJump = validateStatusTransition({
      actorRole: 'authority',
      currentStatus: 'Submitted',
      targetStatus: 'Under Verification',
    });
    expect(invalidJump.allowed).toBe(false);
  });

  // TEST 14: Unauthorized RVE bypass attempt (Authority marking Resolved directly -> blocked)
  it('14. Lifecycle guard blocks Field Authority from marking Resolved or Closed without RVE', () => {
    const bypassResolved = validateStatusTransition({
      actorRole: 'authority',
      currentStatus: 'In Progress',
      targetStatus: 'Resolved',
      viaRve: false,
    });
    expect(bypassResolved.allowed).toBe(false);
    expect(bypassResolved.reason).toContain('RVE Policy Violation');

    const bypassClosed = validateStatusTransition({
      actorRole: 'authority',
      currentStatus: 'In Progress',
      targetStatus: 'Closed',
      viaRve: false,
    });
    expect(bypassClosed.allowed).toBe(false);

    // Valid RVE-backed transition IS allowed
    const viaRvePass = validateStatusTransition({
      actorRole: 'rve',
      currentStatus: 'In Progress',
      targetStatus: 'Resolved',
      viaRve: true,
    });
    expect(viaRvePass.allowed).toBe(true);
  });

  // TEST 15: Storage upload failure handling (graceful structured error)
  it('15. Storage upload failure returns structured { ok: false, error } without throwing unhandled exception', async () => {
    storageMocks.uploadBytes.mockRejectedValueOnce(new Error('storage/unauthorized: Bucket rules denied'));
    const { uploadResolutionVideoToStorage, uploadComplaintImageToStorage } = await import('../lib/storage');

    const imgDataUrl = await createSampleJpegBase64(3);
    const imgResult = await uploadComplaintImageToStorage({
      complaintId: 'cmp_err_1',
      imageDataUrl: imgDataUrl,
    });
    expect(imgResult.ok).toBe(false);
    expect(imgResult.error).toContain('Bucket rules denied');

    storageMocks.uploadBytes.mockRejectedValueOnce(new Error('network timeout'));
    const vidResult = await uploadResolutionVideoToStorage({
      complaintId: 'cmp_err_1',
      videoBlob: new Blob(['fake-video'], { type: 'video/webm' }),
      authorityUid: 'auth_1',
    });
    expect(vidResult.ok).toBe(false);
    expect(vidResult.error).toContain('network timeout');
  });
});
