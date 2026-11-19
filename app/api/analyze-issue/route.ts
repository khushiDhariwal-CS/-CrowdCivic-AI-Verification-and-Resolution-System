import { GoogleGenAI, Type } from '@google/genai';
import { NextRequest, NextResponse } from 'next/server';
import { runRFDETRDetection, RFDETR_SUPPORTED_CLASSES, RFDETR_UNSUPPORTED_CLASSES } from '@/lib/rfdetr';
import { computePerceptualHash } from '@/lib/duplicates';
import { routeToDepartment } from '@/lib/lifecycle';

export const dynamic = 'force-dynamic';

function createGenAIClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY || '';
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

const GEMINI_METADATA_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    isCivicIssue: { type: Type.BOOLEAN },
    nonCivicReason: { type: Type.STRING },
    aiTitle: { type: Type.STRING },
    category: { type: Type.STRING },
    issueType: { type: Type.STRING },
    severity: {
      type: Type.STRING,
      enum: ['Critical', 'High', 'Medium', 'Low'],
    },
    department: { type: Type.STRING },
    description: { type: Type.STRING },
    publicSafetyAlert: { type: Type.BOOLEAN },
    estimatedResolutionTime: { type: Type.STRING },
    confidenceScore: { type: Type.NUMBER },
    keyObservations: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
  },
  required: [
    'isCivicIssue',
    'aiTitle',
    'category',
    'issueType',
    'severity',
    'department',
    'description',
    'publicSafetyAlert',
    'estimatedResolutionTime',
    'confidenceScore',
    'keyObservations',
  ],
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { imageBase64, mimeType } = body;

    if (!imageBase64 || typeof imageBase64 !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Image payload is required for RF-DETR & Gemini analysis.' },
        { status: 400 }
      );
    }

    const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, '').trim();
    const imageMime = mimeType || 'image/jpeg';

    // STEP 1: Custom-trained RF-DETR Object Detection + Perceptual Hash (pHash) in parallel
    const [rfdetrResult, imageHash] = await Promise.all([
      runRFDETRDetection(cleanBase64, { confidencePercent: 25, timeoutMs: 8000 }),
      computePerceptualHash(cleanBase64),
    ]);

    const detectionSummary =
      rfdetrResult.detections.length > 0
        ? rfdetrResult.detections
            .map(
              (d) =>
                `- class: "${d.class}" (normalized: ${d.normalizedClass}), confidence: ${(
                  d.confidence * 100
                ).toFixed(1)}%, bbox: [x1=${d.bbox.x1}, y1=${d.bbox.y1}, x2=${d.bbox.x2}, y2=${d.bbox.y2}, w=${d.bbox.width}, h=${d.bbox.height}]`
            )
            .join('\n')
        : 'No bounding box detections exceeded confidence threshold (0.25).';

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        {
          success: false,
          error: 'GEMINI_API_KEY is missing on the server. Cannot generate structured complaint metadata.',
          rfdetrResult,
          imageHash,
        },
        { status: 503 }
      );
    }

    // STEP 2: Pass RF-DETR Detection Results + Image to Gemini 2.5 Flash
    const prompt = `You are the AI Civic Complaint Classifier for CrowdCivic AI.

Examine the attached citizen photograph together with the output from the custom-trained RF-DETR object detection model:

[CUSTOM RF-DETR MODEL]: ${rfdetrResult.modelId}
[RF-DETR TRAINED SUPPORTED CLASSES]: ${RFDETR_SUPPORTED_CLASSES.join(', ')}
[EXPLICITLY UNSUPPORTED BY RF-DETR MODEL]: Broken streetlights (the RF-DETR model weights are NOT trained on broken streetlights; do not claim RF-DETR detected a streetlight)
[RF-DETR INFERENCE STATUS]: ${rfdetrResult.ok ? 'Success' : `Unavailable (${rfdetrResult.error})`}
[RF-DETR DETECTIONS]:
${detectionSummary}

REQUIREMENTS:
1. Determine if the image shows a genuine public civic issue ("isCivicIssue": true/false). Set false ONLY for clear personal selfies, private indoor rooms, documents, or non-civic images.
2. Generate structured complaint metadata strictly matching the schema:
   - "aiTitle": Concise, clear 5-10 word complaint headline.
   - "category": Must map cleanly to municipal categories: "Roads & Infrastructure" (potholes), "Waste & Sanitation" (garbage/waste accumulation), "Water & Drainage" (water leakage/logging), "Power & Street Lighting" (only if clearly observed visually by Gemini — explicitly state RF-DETR does not detect streetlights), or "Other".
   - "issueType": Specific defect label.
   - "severity": Strictly one of "Critical", "High", "Medium", "Low".
   - "department": Responsible municipal department.
   - "description": Detailed 2-4 sentence factual municipal complaint description based ONLY on visible evidence and RF-DETR boxes.
   - "publicSafetyAlert": Boolean true if the hazard poses immediate danger (deep crater on busy road, live wire/flooding, toxic waste).
   - "estimatedResolutionTime": Realistic municipal SLA string (e.g. "24-48 hours", "3-5 business days").
   - "confidenceScore": Numeric 0-100.
   - "keyObservations": Array of 2-4 concrete visual observations grounded in the photo and RF-DETR boxes.

Strict rule: Do not fabricate RF-DETR detections for unsupported classes like broken streetlights, and do not infer missing details.`;

    const ai = createGenAIClient();
    let aiResponseText: string | null = null;
    let lastGeminiErr = '';

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: {
          parts: [
            { inlineData: { data: cleanBase64, mimeType: imageMime } },
            { text: prompt },
          ],
        },
        config: {
          responseMimeType: 'application/json',
          responseSchema: GEMINI_METADATA_SCHEMA,
        },
      });
      aiResponseText = response?.text || null;
    } catch (err: any) {
      lastGeminiErr = err?.message || String(err);
    }

    if (!aiResponseText) {
      return NextResponse.json(
        {
          success: false,
          error: `Gemini 2.5 Flash analysis failed: ${lastGeminiErr || 'Empty model output'}. Please retry or fill complaint fields manually.`,
          rfdetrResult,
          imageHash,
        },
        { status: 502 }
      );
    }

    let parsed: any;
    try {
      parsed = JSON.parse(aiResponseText);
    } catch {
      return NextResponse.json(
        {
          success: false,
          error: 'Gemini 2.5 Flash returned malformed JSON metadata. Please retry.',
          rfdetrResult,
          imageHash,
        },
        { status: 502 }
      );
    }

    const topDetection = rfdetrResult.detections[0];
    const validSeverities = ['Critical', 'High', 'Medium', 'Low'];
    const severity = validSeverities.includes(parsed.severity) ? parsed.severity : 'Medium';
    const category = String(parsed.category || 'Other');
    const department = String(parsed.department || routeToDepartment(category));

    const analysis = {
      isCivicIssue: Boolean(parsed.isCivicIssue),
      nonCivicReason: parsed.nonCivicReason ? String(parsed.nonCivicReason) : undefined,
      aiTitle: String(parsed.aiTitle || parsed.issueType || 'Civic Infrastructure Issue'),
      category,
      issueType: String(parsed.issueType || parsed.aiTitle || 'Civic Defect'),
      severity,
      department,
      description: String(parsed.description || ''),
      publicSafetyAlert: Boolean(parsed.publicSafetyAlert),
      estimatedResolutionTime: String(parsed.estimatedResolutionTime || '48-72 hours'),
      confidenceScore: Math.min(100, Math.max(0, Math.round(Number(parsed.confidenceScore ?? 80)))),
      keyObservations: Array.isArray(parsed.keyObservations) ? parsed.keyObservations.map(String) : [],
      // Authentic RF-DETR metadata
      customModelUsed: rfdetrResult.ok,
      customModelName: `RF-DETR (${rfdetrResult.modelId}) + Gemini 2.5 Flash`,
      customVisionDetectedClass: topDetection ? topDetection.normalizedClass : 'none_detected',
      customVisionDetectedLabel: topDetection
        ? `${topDetection.class} (${Math.round(topDetection.confidence * 100)}%)`
        : category === 'Power & Street Lighting'
        ? 'Not trained in RF-DETR (Gemini visual assessment only)'
        : 'No RF-DETR bounding box matched threshold',
      rfdetrDetections: rfdetrResult.detections,
      rfdetrSupportedClasses: [...RFDETR_SUPPORTED_CLASSES],
      rfdetrUnsupportedClasses: [...RFDETR_UNSUPPORTED_CLASSES],
      rfdetrInferenceOk: rfdetrResult.ok,
      rfdetrError: rfdetrResult.error,
      rfdetrImageWidth: rfdetrResult.imageWidth,
      rfdetrImageHeight: rfdetrResult.imageHeight,
      roboflowDetections: rfdetrResult.detections,
      imageHash: imageHash || undefined,
    };

    return NextResponse.json({
      success: true,
      analysis,
      rfdetrResult,
      imageHash,
    });
  } catch (error: any) {
    console.error('Error in /api/analyze-issue:', error);
    return NextResponse.json(
      {
        success: false,
        error: error?.message || 'Unexpected server error analyzing civic photograph.',
      },
      { status: 500 }
    );
  }
}
