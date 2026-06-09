import { NextRequest, NextResponse } from 'next/server';
import { respondToSafetyMessage } from '@/lib/safetyConversation';

// This route may call the Foundry agent (via assessRisk) which can take a few
// seconds. Raise the serverless ceiling above the 10s default for headroom.
export const maxDuration = 30;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (!body.message || typeof body.message !== 'string') {
      return NextResponse.json({ error: 'message is required and must be a string' }, { status: 400 });
    }

    const result = await respondToSafetyMessage({
      message: body.message,
      state: body.state ?? null,
      activationMode: body.activationMode === 'voice' ? 'voice' : 'typed',
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error in chat API:', error);
    return NextResponse.json(
      { error: 'Failed to process chat turn', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
