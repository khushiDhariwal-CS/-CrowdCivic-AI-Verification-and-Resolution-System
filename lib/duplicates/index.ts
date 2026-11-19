import sharp from 'sharp';
import { DuplicateCandidateMatch } from '../types/civic';

/**
 * Research Paper Phase 4: Multi-Modal Duplicate Detection Engine
 *
 * Four independent dimensions:
 * A. Geospatial Proximity (Haversine formula, strictly OPEN complaints within <= 20m)
 * B. Image Similarity (64-bit Perceptual Hash pHash via 32x32 grayscale 2D-DCT + Hamming similarity)
 * C. Temporal Proximity (Configurable recency window decay)
 * D. Textual Similarity (TF-IDF vectorization + Cosine Similarity)
 *
 * Documented Composite Score Formula & Threshold:
 *   composite = 0.35 * geospatial + 0.30 * image_pHash + 0.25 * textual_tfidf + 0.10 * temporal
 *   Default threshold: 0.72 (72 / 100) — configurable via DUPLICATE_THRESHOLD env var or config arg.
 * Rationale:
 *   Two open reports within 20m with similar pHash visual structure and matching TF-IDF terms
 *   within the recency window cross 0.72, while distinct defects at the same intersection (<0.65)
 *   do not get falsely merged.
 */

export interface DuplicateConfig {
  radiusMeters: number;
  recencyHours: number;
  threshold: number; // 0 to 1
  weights: {
    geospatial: number;
    image: number;
    textual: number;
    temporal: number;
  };
}

export function getDuplicateConfig(overrides?: Partial<DuplicateConfig>): DuplicateConfig {
  const radiusMeters = Number(process.env.DUPLICATE_RADIUS_METERS || 20);
  const recencyHours = Number(process.env.DUPLICATE_RECENCY_HOURS || 168); // 7 days default
  const threshold = Number(process.env.DUPLICATE_THRESHOLD || 0.72);
  return {
    radiusMeters: overrides?.radiusMeters ?? (Number.isFinite(radiusMeters) ? radiusMeters : 20),
    recencyHours: overrides?.recencyHours ?? (Number.isFinite(recencyHours) ? recencyHours : 168),
    threshold: overrides?.threshold ?? (Number.isFinite(threshold) ? threshold : 0.72),
    weights: overrides?.weights ?? {
      geospatial: 0.35,
      image: 0.3,
      textual: 0.25,
      temporal: 0.1,
    },
  };
}

/**
 * Haversine spherical distance in meters.
 */
export function calculateHaversineMeters(
  lat1?: number | null,
  lon1?: number | null,
  lat2?: number | null,
  lon2?: number | null
): number {
  if (
    lat1 === null ||
    lat1 === undefined ||
    lon1 === null ||
    lon1 === undefined ||
    lat2 === null ||
    lat2 === undefined ||
    lon2 === null ||
    lon2 === undefined ||
    Number.isNaN(Number(lat1)) ||
    Number.isNaN(Number(lon1)) ||
    Number.isNaN(Number(lat2)) ||
    Number.isNaN(Number(lon2))
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

/**
 * Geospatial normalized similarity score [0, 1] inside radiusMeters.
 */
export function computeGeospatialScore(distanceMeters: number, radiusMeters: number): number {
  if (!Number.isFinite(distanceMeters) || distanceMeters > radiusMeters) return 0;
  // Linear-smooth decay from 1.0 at 0m to 0.70 at boundary radiusMeters
  return Number((1 - 0.3 * (distanceMeters / Math.max(radiusMeters, 1))).toFixed(4));
}

/**
 * Temporal proximity score [0, 1] within configurable recency window (default 168h).
 */
export function computeTemporalScore(
  createdAtMs: number | null | undefined,
  nowMs: number,
  recencyHours: number
): number {
  if (!createdAtMs || !Number.isFinite(createdAtMs)) return 0.5;
  const diffHours = Math.abs(nowMs - createdAtMs) / (1000 * 60 * 60);
  if (diffHours > recencyHours) return 0;
  return Number(Math.max(0, 1 - diffHours / Math.max(recencyHours, 1)).toFixed(4));
}

/**
 * 2D Type-II DCT on a 32x32 grayscale matrix, returning top-left 8x8 AC/low-frequency values
 * converted into a 64-bit hexadecimal perceptual hash (pHash).
 */
export async function computePerceptualHash(imageInput: string | Buffer): Promise<string | null> {
  try {
    let buffer: Buffer;
    if (Buffer.isBuffer(imageInput)) {
      buffer = imageInput;
    } else if (typeof imageInput === 'string' && imageInput.trim().length > 0) {
      if (imageInput.startsWith('http://') || imageInput.startsWith('https://')) {
        const res = await fetch(imageInput);
        if (!res.ok) return null;
        buffer = Buffer.from(await res.arrayBuffer());
      } else {
        const clean = imageInput.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, '').trim();
        buffer = Buffer.from(clean, 'base64');
      }
    } else {
      return null;
    }

    if (!buffer || buffer.length < 16) return null;

    const N = 32;
    const { data } = await sharp(buffer)
      .grayscale()
      .resize(N, N, { fit: 'fill' })
      .raw()
      .toBuffer({ resolveWithObject: true });

    if (data.length < N * N) return null;

    // Precompute cosine table for 32x32 2D DCT (only need k = 0..7)
    const K = 8;
    const dctRow: number[][] = Array.from({ length: K }, () => new Array(N).fill(0));
    for (let u = 0; u < K; u++) {
      for (let y = 0; y < N; y++) {
        let sum = 0;
        for (let x = 0; x < N; x++) {
          sum += data[y * N + x] * Math.cos(((2 * x + 1) * u * Math.PI) / (2 * N));
        }
        dctRow[u][y] = sum;
      }
    }

    const lowFreq: number[] = [];
    for (let u = 0; u < K; u++) {
      for (let v = 0; v < K; v++) {
        let sum = 0;
        for (let y = 0; y < N; y++) {
          sum += dctRow[u][y] * Math.cos(((2 * y + 1) * v * Math.PI) / (2 * N));
        }
        lowFreq.push(sum);
      }
    }

    // Exclude DC coefficient (index 0) when computing median threshold
    const acCoeffs = lowFreq.slice(1).sort((a, b) => a - b);
    const median = acCoeffs[Math.floor(acCoeffs.length / 2)];

    let bits = '';
    for (let i = 0; i < 64; i++) {
      bits += lowFreq[i] >= median ? '1' : '0';
    }

    let hex = '';
    for (let i = 0; i < 64; i += 4) {
      hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
    }
    return hex;
  } catch {
    return null;
  }
}

export function computeHammingSimilarity(hashA: string | null, hashB: string | null): number {
  if (!hashA || !hashB || hashA.length !== hashB.length) return 0;
  let differingBits = 0;
  const totalBits = hashA.length * 4;
  for (let i = 0; i < hashA.length; i++) {
    const xor = parseInt(hashA[i], 16) ^ parseInt(hashB[i], 16);
    differingBits +=
      ((xor & 8) >> 3) + ((xor & 4) >> 2) + ((xor & 2) >> 1) + (xor & 1);
  }
  return Number(Math.max(0, 1 - differingBits / totalBits).toFixed(4));
}

const STOPWORDS = new Set([
  'the', 'is', 'a', 'an', 'of', 'in', 'on', 'at', 'to', 'for', 'and', 'or', 'with',
  'this', 'that', 'near', 'by', 'from', 'as', 'are', 'be', 'been', 'was', 'were',
  'has', 'have', 'it', 'its', 'public', 'area', 'issue', 'reported', 'civic',
]);

export function tokenizeText(text: string): string[] {
  return (text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOPWORDS.has(w));
}

/**
 * Pure TypeScript TF-IDF Vectorization + Cosine Similarity between two documents
 * over an optional background corpus (defaults to the two documents).
 */
export function computeTfIdfCosineSimilarity(
  textA: string,
  textB: string,
  extraCorpus: string[] = []
): number {
  const tokensA = tokenizeText(textA);
  const tokensB = tokenizeText(textB);
  if (tokensA.length === 0 || tokensB.length === 0) return 0;

  const docs = [tokensA, tokensB, ...extraCorpus.map(tokenizeText)];
  const totalDocs = docs.length;

  const vocab = new Set<string>([...tokensA, ...tokensB]);
  const idf = new Map<string, number>();

  for (const term of vocab) {
    let df = 0;
    for (const d of docs) {
      if (d.includes(term)) df++;
    }
    // Smooth IDF so terms appearing in both of 2 docs still retain positive weight
    idf.set(term, Math.log((totalDocs + 1) / (df + 1)) + 1);
  }

  const buildVector = (tokens: string[]): Map<string, number> => {
    const tf = new Map<string, number>();
    for (const t of tokens) tf.set(t, (tf.get(t) || 0) + 1);
    const vec = new Map<string, number>();
    for (const term of vocab) {
      const count = tf.get(term) || 0;
      if (count > 0) {
        vec.set(term, (count / tokens.length) * (idf.get(term) || 1));
      }
    }
    return vec;
  };

  const vecA = buildVector(tokensA);
  const vecB = buildVector(tokensB);

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (const term of vocab) {
    const a = vecA.get(term) || 0;
    const b = vecB.get(term) || 0;
    dot += a * b;
    normA += a * a;
    normB += b * b;
  }

  if (normA === 0 || normB === 0) return 0;
  return Number(Math.min(1, Math.max(0, dot / (Math.sqrt(normA) * Math.sqrt(normB)))).toFixed(4));
}

export interface DuplicateCandidateInput {
  id: string;
  ticketId?: string;
  title?: string;
  issueType?: string;
  category?: string;
  description?: string;
  status?: string;
  isDuplicate?: boolean;
  imageUrl?: string;
  imageHash?: string;
  location?: { latitude?: number | null; longitude?: number | null };
  latitude?: number | null;
  longitude?: number | null;
  createdAt?: any;
  supportersCount?: number;
  upvotes?: number;
}

export interface NewComplaintInput {
  latitude: number | null;
  longitude: number | null;
  description: string;
  title?: string;
  category?: string;
  issueType?: string;
  imageBase64?: string | null;
  imageHash?: string | null;
  nowMs?: number;
}

function parseTimestampMs(raw: any): number | null {
  if (!raw) return null;
  if (typeof raw === 'number') return raw;
  if (raw?.seconds) return raw.seconds * 1000;
  const parsed = new Date(raw).getTime();
  return Number.isNaN(parsed) ? null : parsed;
}

export async function evaluateDuplicates(
  newIssue: NewComplaintInput,
  candidateIssues: DuplicateCandidateInput[],
  configOverrides?: Partial<DuplicateConfig>
): Promise<{
  duplicateFound: boolean;
  threshold: number;
  newImageHash: string | null;
  topMatch: DuplicateCandidateMatch | null;
  allMatches: DuplicateCandidateMatch[];
}> {
  const cfg = getDuplicateConfig(configOverrides);
  const nowMs = newIssue.nowMs ?? Date.now();
  const newText = `${newIssue.title || ''} ${newIssue.issueType || ''} ${newIssue.category || ''} ${newIssue.description || ''}`;

  const newImageHash =
    newIssue.imageHash ||
    (newIssue.imageBase64 ? await computePerceptualHash(newIssue.imageBase64) : null);

  // Filter strictly OPEN complaints (not Resolved/Closed/Duplicate) within 20m Haversine radius
  const openInRadius = candidateIssues.filter((item) => {
    const st = (item.status || '').trim();
    if (st === 'Resolved' || st === 'Closed' || item.isDuplicate) return false;
    const lat = item.location?.latitude ?? item.latitude;
    const lon = item.location?.longitude ?? item.longitude;
    const dist = calculateHaversineMeters(newIssue.latitude, newIssue.longitude, lat, lon);
    return dist <= cfg.radiusMeters;
  });

  const extraCorpus = candidateIssues
    .map((c) => `${c.title || ''} ${c.category || ''} ${c.description || ''}`)
    .filter((s) => s.trim().length > 0);

  const matches: DuplicateCandidateMatch[] = [];

  for (const cand of openInRadius) {
    const lat = cand.location?.latitude ?? cand.latitude;
    const lon = cand.location?.longitude ?? cand.longitude;
    const dist = calculateHaversineMeters(newIssue.latitude, newIssue.longitude, lat, lon);

    const geoScore = computeGeospatialScore(dist, cfg.radiusMeters);
    const createdMs = parseTimestampMs(cand.createdAt);
    const tempScore = computeTemporalScore(createdMs, nowMs, cfg.recencyHours);

    const candText = `${cand.title || ''} ${cand.issueType || ''} ${cand.category || ''} ${cand.description || ''}`;
    const textSim = computeTfIdfCosineSimilarity(newText, candText, extraCorpus);

    let imgSim = 0;
    const candHash = cand.imageHash || (cand.imageUrl ? await computePerceptualHash(cand.imageUrl) : null);
    if (newImageHash && candHash) {
      imgSim = computeHammingSimilarity(newImageHash, candHash);
    }

    // Rebalance weights cleanly if an existing legacy record has no stored image/pHash
    let composite = 0;
    if (newImageHash && candHash) {
      composite =
        cfg.weights.geospatial * geoScore +
        cfg.weights.image * imgSim +
        cfg.weights.textual * textSim +
        cfg.weights.temporal * tempScore;
    } else {
      const nonImgWeightSum = cfg.weights.geospatial + cfg.weights.textual + cfg.weights.temporal;
      composite =
        (cfg.weights.geospatial / nonImgWeightSum) * geoScore +
        (cfg.weights.textual / nonImgWeightSum) * textSim +
        (cfg.weights.temporal / nonImgWeightSum) * tempScore;
    }

    const overallPct = Math.round(composite * 100);
    const geoPct = Math.round(geoScore * 100);
    const imgPct = Math.round(imgSim * 100);
    const textPct = Math.round(textSim * 100);
    const tempPct = Math.round(tempScore * 100);

    matches.push({
      candidateId: cand.id,
      ticketId: cand.ticketId || cand.id,
      title: cand.title || cand.issueType || 'Civic Issue',
      category: cand.category || 'Civic Issue',
      description: cand.description || '',
      imageUrl: cand.imageUrl || '',
      status: cand.status || 'Submitted',
      distanceMeters: dist,
      locationScore: geoPct,
      imageScore: imgPct,
      temporalScore: tempPct,
      textualScore: textPct,
      overallScore: overallPct,
      reason: `Within ${dist}m (≤${cfg.radiusMeters}m), pHash visual similarity ${imgPct}%, TF-IDF text similarity ${textPct}%, temporal score ${tempPct}%.`,
      supportersCount: cand.supportersCount || cand.upvotes || 1,
      createdAt: cand.createdAt,
    });
  }

  matches.sort((a, b) => b.overallScore - a.overallScore);
  const thresholdPct = Math.round(cfg.threshold * 100);
  const top = matches[0] || null;
  const duplicateFound = Boolean(top && top.overallScore >= thresholdPct);

  return {
    duplicateFound,
    threshold: thresholdPct,
    newImageHash,
    topMatch: duplicateFound ? top : null,
    allMatches: matches,
  };
}
