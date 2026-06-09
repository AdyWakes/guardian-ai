import { NextRequest, NextResponse } from 'next/server';
import { assessRisk, AssessmentInput } from '@/lib/riskAssessment';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Validate required fields
    if (!body.userMessage || typeof body.userMessage !== 'string') {
      return NextResponse.json(
        { error: 'userMessage is required and must be a string' },
        { status: 400 }
      );
    }

    const declaredSafetyRaw = body.declaredSafety;
    const declaredSafety: AssessmentInput['declaredSafety'] =
      declaredSafetyRaw === 'safe' || declaredSafetyRaw === 'unsafe' ? declaredSafetyRaw : 'unknown';

    const placeContextRaw = body.placeContext;
    const placeContext: AssessmentInput['placeContext'] =
      placeContextRaw === 'home' || placeContextRaw === 'public' || placeContextRaw === 'vehicle'
        ? placeContextRaw
        : 'unknown';

    const input: AssessmentInput = {
      userMessage: body.userMessage,
      canSpeakSafely: body.canSpeakSafely ?? null,
      isAlone: body.isAlone ?? null,
      isBeingFollowed: body.isBeingFollowed ?? null,
      location: body.location ?? null,
      activationMode: body.activationMode === 'voice' ? 'voice' : 'typed',
      audioClipStatus: typeof body.audioClipStatus === 'string' ? body.audioClipStatus : null,
      declaredSafety,
      placeContext,
    };

    const assessment = await assessRisk(input);

    return NextResponse.json(assessment);
  } catch (error) {
    console.error('Error in assess API:', error);
    return NextResponse.json(
      { error: 'Failed to process risk assessment', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
