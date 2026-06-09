import { NextRequest, NextResponse } from 'next/server';
import { sendTelegramAlert, TelegramAttachment } from '@/lib/telegram';
import { sendWhatsAppAlert, WhatsAppAttachment } from '@/lib/whatsapp';

const buildUserAlertMessage = ({
  telegramResult,
  whatsAppResult,
}: {
  telegramResult: Awaited<ReturnType<typeof sendTelegramAlert>>;
  whatsAppResult: Awaited<ReturnType<typeof sendWhatsAppAlert>>;
}) => {
  const parts: string[] = [];

  if (telegramResult.success) {
    parts.push(telegramResult.isDemoMode ? 'Telegram is in demo mode.' : 'Alert sent to Telegram.');
  } else {
    parts.push('Telegram alert failed.');
  }

  if (whatsAppResult.isDemoMode) {
    parts.push('WhatsApp is not connected, so it was skipped.');
  } else if (whatsAppResult.success) {
    parts.push('Alert sent to WhatsApp.');
  } else {
    parts.push('WhatsApp alert failed.');
  }

  return parts.join(' ');
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Validate required fields
    if (!body.message || typeof body.message !== 'string') {
      return NextResponse.json(
        { error: 'message is required and must be a string' },
        { status: 400 }
      );
    }

    const attachments: TelegramAttachment[] = Array.isArray(body.attachments)
      ? body.attachments.filter(
          (attachment: Partial<TelegramAttachment>) =>
            (attachment.type === 'audio' || attachment.type === 'video') &&
            typeof attachment.mimeType === 'string' &&
            typeof attachment.dataUrl === 'string'
        )
      : [];

    const [telegramResult, whatsAppResult] = await Promise.all([
      sendTelegramAlert(body.message, attachments),
      sendWhatsAppAlert(body.message, attachments as WhatsAppAttachment[]),
    ]);

    const realChannelSent =
      (!telegramResult.isDemoMode && telegramResult.success) ||
      (!whatsAppResult.isDemoMode && whatsAppResult.success);
    const demoOnly = telegramResult.isDemoMode && whatsAppResult.isDemoMode;
    const success = realChannelSent || (demoOnly && telegramResult.success && whatsAppResult.success);
    const userMessage = buildUserAlertMessage({ telegramResult, whatsAppResult });

    return NextResponse.json({
      success,
      message: userMessage,
      isDemoMode: telegramResult.isDemoMode,
      channels: {
        telegram: telegramResult,
        whatsapp: whatsAppResult,
      },
    });
  } catch (error) {
    console.error('Error in send-alert API:', error);
    return NextResponse.json(
      { error: 'Failed to send alert', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
