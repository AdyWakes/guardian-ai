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
    attachment.type,
    dataUrlToBlob(attachment),
    attachment.filename ?? `guardian-alert.${attachment.type === 'video' ? 'webm' : 'webm'}`
  );

  const endpoint = attachment.type === 'video' ? 'sendVideo' : 'sendAudio';
  const response = await fetch(`https://api.telegram.org/bot${botToken}/${endpoint}`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const errorData = await response.json();
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

    for (const attachment of attachments) {
      await sendTelegramAttachment(attachment);
    }

    return {
      success: true,
      message:
        attachments.length > 0
          ? `Alert and ${attachments.length} emergency clip(s) sent to Telegram.`
          : 'Alert sent to Telegram.',
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
