import { NextRequest, NextResponse } from 'next/server';
import { evaluateDuplicates } from '@/lib/duplicates';

export const dynamic = 'force-dynamic';

/**
 * Research Paper Phase 4: 4-Dimensional Multi-Modal Duplicate Detection API
 * A. Geospatial Proximity (Haversine <= 20m, open complaints only)
 * B. Image Similarity (64-bit DCT pHash + Hamming distance)
 * C. Temporal Proximity (Configurable recency window)
 * D. Textual Similarity (TF-IDF vectorization + Cosine Similarity)
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { newIssue, candidateIssues, config } = body;

    if (!newIssue || !Array.isArray(candidateIssues) || candidateIssues.length === 0) {
      return NextResponse.json({
        success: true,
        duplicateFound: false,
        threshold: 72,
        topMatch: null,
        allMatches: [],
      });
    }

    const result = await evaluateDuplicates(
      {
        latitude: newIssue.latitude ?? null,
        longitude: newIssue.longitude ?? null,
        description: newIssue.description || '',
        title: newIssue.title || '',
        category: newIssue.category || '',
        issueType: newIssue.issueType || '',
        imageBase64: newIssue.imageBase64 || null,
        imageHash: newIssue.imageHash || null,
      },
      candidateIssues,
      config
    );

    return NextResponse.json({
      success: true,
      duplicateFound: result.duplicateFound,
      threshold: result.threshold,
      newImageHash: result.newImageHash,
      topMatch: result.topMatch,
      allMatches: result.allMatches,
      matches: result.allMatches,
    });
  } catch (error: any) {
    console.error('Error in /api/check-duplicates:', error);
    return NextResponse.json(
      {
        success: false,
        duplicateFound: false,
        error: error?.message || 'Duplicate detection check failed.',
      },
      { status: 500 }
    );
  }
}
