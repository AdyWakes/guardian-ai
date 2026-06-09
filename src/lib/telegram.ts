export interface TelegramAlertResult {
  success: boolean;
  message: string;
  isDemoMode: boolean;
  messageId?: number;
}

export interface TelegramAttachment {
  type: 'audio' | 'video';
  mimeType: string;
  dataUrl: string;
  filename?: string;
}

export const isTelegramConfigured = (): boolean => {
  return !!(
    process.env.TELEGRAM_BOT_TOKEN &&
    process.env.TELEGRAM_CHAT_ID
  );
};

// Send real Telegram message
const dataUrlToBlob = (attachment: TelegramAttachment): Blob => {
  const base64 = attachment.dataUrl.split(',')[1];

  if (!base64) {
    throw new Error('Invalid attachment data URL');
  }

  return new Blob([Buffer.from(base64, 'base64')], { type: attachment.mimeType });
};

/**
 * Send a Guardian AI media clip to Telegram.
 *
 * We always use sendDocument rather than sendVideo/sendAudio:
 * - The browser MediaRecorder produces audio/webm;codecs=opus, which
 *   Telegram's sendAudio rejects (it expects mp3/m4a). The old code
 *   would silently 400 after the text alert had already been sent,
 *   surfacing as a confusing partial failure on the demo.
 * - sendDocument accepts any container, including webm, so the clip
 *   always arrives. The receiving Telegram client renders it as a
 *   downloadable file; modern clients can preview common formats.
 *
 * The caption gives the recipient context about what the clip is.
 */
const sendTelegramAttachment = async (
  attachment: TelegramAttachment
): Promise<void> => {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!botToken || !chatId) {
    throw new Error('Missing Telegram credentials');
  }

  const formData = new FormData();
  formData.append('chat_id', chatId);
  formData.append(
    'document',
    dataUrlToBlob(attachment),
    attachment.filename ?? `guardian-alert-${Date.now()}.webm`,
  );
  formData.append(
    'caption',
    attachment.type === 'video'
      ? 'Guardian AI emergency video clip'
      : 'Guardian AI emergency audio clip',
  );

  const response = await fetch(`https://api.telegram.org/bot${botToken}/sendDocument`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(`Telegram media error: ${errorData.description || response.statusText}`);
  }
};

const sendRealTelegramMessage = async (
  message: string,
  attachments: TelegramAttachment[] = []
): Promise<TelegramAlertResult> => {
  try {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;

    if (!botToken || !chatId) {
      throw new Error('Missing Telegram credentials');
    }

    const response = await fetch(
      `https://api.telegram.org/bot${botToken}/sendMessage`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chat_id: chatId,
          text: message,
        }),
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Telegram API error: ${errorData.description || response.statusText}`);
    }

    const data = await response.json();

    // Send attachments independently so a single failed clip cannot make
    // the overall alert look like it failed. The text alert above already
    // landed; clip failures are degraded-not-failed.
    let sentClips = 0;
    let failedClips = 0;
    const clipErrors: string[] = [];

    for (const attachment of attachments) {
      try {
        await sendTelegramAttachment(attachment);
        sentClips += 1;
      } catch (clipError) {
        failedClips += 1;
        const reason = clipError instanceof Error ? clipError.message : 'Unknown error';
        clipErrors.push(`${attachment.type} clip failed: ${reason}`);
        console.error('Telegram attachment send failed:', clipError);
      }
    }

    const messageParts: string[] = [];
    if (sentClips > 0) {
      messageParts.push(`Alert and ${sentClips} emergency clip(s) sent to Telegram.`);
    } else {
      messageParts.push('Alert sent to Telegram.');
    }
    if (failedClips > 0) {
      messageParts.push(`${failedClips} clip(s) could not be attached.`);
    }

    return {
      success: true,
      message: messageParts.join(' '),
      isDemoMode: false,
      messageId: data.result?.message_id,
    };
  } catch (error) {
    console.error('Error sending Telegram message:', error);
    return {
      success: false,
      message: `Failed to send alert: ${error instanceof Error ? error.message : 'Unknown error'}`,
      isDemoMode: false,
    };
  }
};

// Mock Telegram send for demo mode
const sendMockTelegramMessage = async (
  message: string,
  attachments: TelegramAttachment[] = []
): Promise<TelegramAlertResult> => {
  // Simulate network delay
  await new Promise(resolve => setTimeout(resolve, 1000));

  console.log('[DEMO MODE] Would send Telegram message:');
  console.log('---');
  console.log(message);
  if (attachments.length > 0) {
    console.log(`[DEMO MODE] Would attach ${attachments.length} media clip(s): ${attachments.map((item) => item.type).join(', ')}`);
  }
  console.log('---');

  return {
    success: true,
    message: `Telegram is in demo mode. No real Telegram alert was sent.${
      attachments.length > 0 ? ` ${attachments.length} emergency clip(s) would be included.` : ''
    }`,
    isDemoMode: true,
  };
};

// Main send alert function
export const sendTelegramAlert = async (
  message: string,
  attachments: TelegramAttachment[] = []
): Promise<TelegramAlertResult> => {
  const useRealAPI = isTelegramConfigured();

  if (useRealAPI) {
    return sendRealTelegramMessage(message, attachments);
  } else {
    return sendMockTelegramMessage(message, attachments);
  }
};
