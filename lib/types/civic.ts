export type UserRole = 'citizen' | 'authority' | 'admin';

export type CivicSeverity = 'Critical' | 'High' | 'Medium' | 'Low';

export type ComplaintStatus =
  | 'Submitted'
  | 'Assigned'
  | 'Acknowledged'
  | 'In Progress'
  | 'Under Verification'
  | 'Resolved'
  | 'Closed'
  | 'Rejected';

export type RepairQuality = 'Excellent' | 'Good' | 'Partial' | 'Poor';

export interface RFDETRBoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface RFDETRDetection {
  class: string;
  normalizedClass: 'pothole' | 'garbage' | 'water_logging' | 'unsupported';
  confidence: number; // 0 to 1
  bbox: RFDETRBoundingBox;
}

export interface RFDETRResult {
  ok: boolean;
  modelId: string;
  endpointUsed?: string;
  supportedClasses: string[];
  unsupportedClasses: string[];
  detections: RFDETRDetection[];
  inferenceTimeMs?: number;
  imageWidth?: number;
  imageHeight?: number;
  error?: string;
}

export interface GeminiComplaintMetadata {
  isCivicIssue: boolean;
  nonCivicReason?: string;
  aiTitle: string;
  category: string;
  issueType: string;
  severity: CivicSeverity;
  department: string;
  description: string;
  publicSafetyAlert: boolean;
  estimatedResolutionTime: string;
  confidenceScore: number;
  keyObservations: string[];
}

export interface GeoLocationData {
  latitude: number | null;
  longitude: number | null;
  address: string;
  city?: string;
  area?: string;
}

export interface DuplicateCandidateMatch {
  candidateId: string;
  ticketId: string;
  title: string;
  category: string;
  description: string;
  imageUrl: string;
  status: string;
  distanceMeters: number;
  locationScore: number; // 0-100
  imageScore: number; // 0-100 (pHash similarity)
  temporalScore: number; // 0-100
  textualScore: number; // 0-100 (TF-IDF cosine)
  overallScore: number; // 0-100 composite
  reason: string;
  supportersCount: number;
  createdAt?: any;
}

export interface RVEGate1Result {
  gateNumber: 1;
  name: 'GPS Geofencing';
  passed: boolean;
  distanceMeters: number;
  thresholdMeters: number;
  reason: string;
}

export interface RVEGate2Result {
  gateNumber: 2;
  name: 'Timestamp & Liveness Validation';
  passed: boolean;
  executed: boolean;
  clientTimestamp: string | null;
  serverTimestamp: string;
  driftSeconds: number | null;
  toleranceSeconds: number;
  potentiallyTamperedEvidence: boolean;
  frameCount: number;
  reason: string;
}

export interface RVEGate3GeminiPayload {
  defect_visible: boolean;
  location_match_confidence: number;
  repair_quality: RepairQuality;
  frame_confidence: number;
  reasoning: string;
  manual_review_required: boolean;
}

export interface RVEGate3Result {
  gateNumber: 3;
  name: 'Gemini 2.5 Flash Keyframe Analysis';
  passed: boolean;
  executed: boolean;
  defect_visible: boolean | null;
  location_match_confidence: number | null;
  repair_quality: RepairQuality | null;
  frame_confidence: number | null;
  manual_review_required: boolean;
  reasoning: string;
  reason: string;
}

export interface RVEResult {
  finalOutcome: 'Verified' | 'Rejected';
  allGatesPassed: boolean;
  failureGate: string | null;
  summary: string;
  gates: {
    gate1_geofence: RVEGate1Result;
    gate2_timestamp: RVEGate2Result;
    gate3_gemini_keyframe: RVEGate3Result;
  };
  extractedKeyframesCount: number;
  verificationTimestamp: string;
}

export interface NotificationRecord {
  id?: string;
  recipientUid: string;
  recipientRole: UserRole;
  complaintId: string;
  ticketId: string;
  title: string;
  message: string;
  type:
    | 'COMPLAINT_REGISTERED'
    | 'COMPLAINT_ASSIGNED'
    | 'WORK_STARTED'
    | 'RVE_VERIFIED'
    | 'RVE_REJECTED'
    | 'MANUAL_REVIEW_REQUIRED'
    | 'MANUAL_REVIEW_DECISION';
  read: boolean;
  createdAt: string;
}
