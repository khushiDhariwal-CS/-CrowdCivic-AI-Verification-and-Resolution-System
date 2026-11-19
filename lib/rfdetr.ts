import { RFDETRDetection, RFDETRResult } from './types/civic';

/**
 * Capabilities of the custom-trained RF-DETR model:
 * Model: raj-chaudhary-7gdzq/civic-issue-detector-btrff-1-rfdetr-small-t1
 * Supported defect classes trained in this model:
 *   - pothole
 *   - garbage / waste accumulation
 *   - water_logging / water leakage
 * Explicitly unsupported by this RF-DETR checkpoint:
 *   - Broken streetlights (not trained in the current model weights; handled transparently)
 */
export const RFDETR_SUPPORTED_CLASSES = ['pothole', 'garbage', 'water_logging'] as const;
export const RFDETR_UNSUPPORTED_CLASSES = ['broken_streetlight'] as const;

export function normalizeRFDETRClass(
  rawClass: string
): 'pothole' | 'garbage' | 'water_logging' | 'unsupported' {
  const c = (rawClass || '').toLowerCase().trim();
  if (c.includes('pothole') || c.includes('crater') || c.includes('road_damage')) {
    return 'pothole';
  }
  if (
    c.includes('garbage') ||
    c.includes('waste') ||
    c.includes('trash') ||
    c.includes('litter') ||
    c.includes('dump')
  ) {
    return 'garbage';
  }
  if (
    c.includes('water') ||
    c.includes('leak') ||
    c.includes('drain') ||
    c.includes('puddle') ||
    c.includes('flood')
  ) {
    return 'water_logging';
  }
  return 'unsupported';
}

export async function runRFDETRDetection(
  imageBase64: string,
  options?: { confidencePercent?: number; timeoutMs?: number }
): Promise<RFDETRResult> {
  const apiKey = process.env.ROBOFLOW_API_KEY || '';
  const modelId =
    process.env.ROBOFLOW_MODEL_ID || 'raj-chaudhary-7gdzq/civic-issue-detector-btrff-1-rfdetr-small-t1';
  const confidence = options?.confidencePercent ?? 25;
  const timeoutMs = options?.timeoutMs ?? 8000;

  if (!apiKey) {
    return {
      ok: false,
      modelId,
      supportedClasses: [...RFDETR_SUPPORTED_CLASSES],
      unsupportedClasses: [...RFDETR_UNSUPPORTED_CLASSES],
      detections: [],
      error: 'ROBOFLOW_API_KEY is not configured in server environment variables.',
    };
  }

  const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, '').trim();
  if (!cleanBase64) {
    return {
      ok: false,
      modelId,
      supportedClasses: [...RFDETR_SUPPORTED_CLASSES],
      unsupportedClasses: [...RFDETR_UNSUPPORTED_CLASSES],
      detections: [],
      error: 'Empty image payload provided to RF-DETR inference.',
    };
  }

  const endpoints = [
    `https://serverless.roboflow.com/${modelId}?api_key=${encodeURIComponent(apiKey)}&confidence=${confidence}`,
    `https://detect.roboflow.com/${modelId}?api_key=${encodeURIComponent(apiKey)}&confidence=${confidence}`,
  ];

  let lastError = 'No RF-DETR endpoint responded successfully.';

  for (const endpoint of endpoints) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: cleanBase64,
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        lastError = `RF-DETR HTTP ${res.status}: ${errText.slice(0, 160)}`;
        continue;
      }

      const data = await res.json();
      const rawPreds: any[] = Array.isArray(data?.predictions) ? data.predictions : [];

      const detections: RFDETRDetection[] = rawPreds.map((p) => {
        const x = Number(p.x ?? 0);
        const y = Number(p.y ?? 0);
        const width = Number(p.width ?? 0);
        const height = Number(p.height ?? 0);
        const cls = String(p.class || p.label || 'unknown');
        return {
          class: cls,
          normalizedClass: normalizeRFDETRClass(cls),
          confidence: Number(p.confidence ?? 0),
          bbox: {
            x,
            y,
            width,
            height,
            x1: Math.round(x - width / 2),
            y1: Math.round(y - height / 2),
            x2: Math.round(x + width / 2),
            y2: Math.round(y + height / 2),
          },
        };
      });

      return {
        ok: true,
        modelId,
        endpointUsed: endpoint.split('?')[0],
        supportedClasses: [...RFDETR_SUPPORTED_CLASSES],
        unsupportedClasses: [...RFDETR_UNSUPPORTED_CLASSES],
        detections,
        inferenceTimeMs: typeof data?.time === 'number' ? Math.round(data.time * 1000) : undefined,
        imageWidth: data?.image?.width,
        imageHeight: data?.image?.height,
      };
    } catch (err: any) {
      clearTimeout(timer);
      lastError = err?.name === 'AbortError' ? 'RF-DETR request timed out.' : err?.message || String(err);
    }
  }

  return {
    ok: false,
    modelId,
    supportedClasses: [...RFDETR_SUPPORTED_CLASSES],
    unsupportedClasses: [...RFDETR_UNSUPPORTED_CLASSES],
    detections: [],
    error: lastError,
  };
}
