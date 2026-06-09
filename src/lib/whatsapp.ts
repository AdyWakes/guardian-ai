export interface WhatsAppAlertResult {
  success: boolean;
  message: string;
  isDemoMode: boolean;
  messageId?: string;
  mediaNotes?: string[];
}

export interface WhatsAppAttachment {
  type: 'audio' | 'video';
  mimeType: string;
  dataUrl: string;
  filename?: string;
}

const WHATSAPP_TEXT_LIMIT = 4096;
const DEFAULT_GRAPH_API_VERSION = 'v23.0';

const SUPPORTED_AUDIO_TYPES = ['audio/aac', 'audio/mp4', 'audio/mpeg', 'audio/amr', 'audio/ogg'];
const SUPPORTED_VIDEO_TYPES = ['video/mp4', 'video/3gpp'];

export const isWhatsAppConfigured = (): boolean => {
  return !!(
    process.env.WHATSAPP_ACCESS_TOKEN &&
    process.env.WHATSAPP_PHONE_NUMBER_ID &&
    process.env.WHATSAPP_RECIPIENT_PHONE
  );
};

const getWhatsAppGraphUrl = (path: string) => {
  const version = process.env.WHATSAPP_GRAPH_API_VERSION || DEFAULT_GRAPH_API_VERSION;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

  if (!phoneNumberId) {
    throw new Error('Missing WhatsApp phone number id');
  }

  return `https://graph.facebook.com/${version}/${phoneNumberId}${path}`;
};

const getAccessToken = () => {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;

  if (!token) {
    throw new Error('Missing WhatsApp access token');
  }

  return token;
};

const dataUrlToBlob = (attachment: WhatsAppAttachment): Blob => {
  const base64 = attachment.dataUrl.split(',')[1];

  if (!base64) {
    throw new Error('Invalid attachment data URL');
  }

  return new Blob([Buffer.from(base64, 'base64')], { type: attachment.mimeType });
};

const isSupportedWhatsAppMedia = (attachment: WhatsAppAttachment) => {
  const normalizedMimeType = attachment.mimeType.toLowerCase().split(';')[0];
  const supportedTypes = attachment.type === 'audio' ? SUPPORTED_AUDIO_TYPES : SUPPORTED_VIDEO_TYPES;

  return supportedTypes.includes(normalizedMimeType);
};

const uploadWhatsAppMedia = async (attachment: WhatsAppAttachment): Promise<string> => {
  const formData = new FormData();
  formData.append('messaging_product', 'whatsapp');
  formData.append('type', attachment.mimeType);
  formData.append(
    'file',
    dataUrlToBlob(attachment),
    attachment.filename ?? `guardian-alert.${attachment.type === 'video' ? 'mp4' : 'ogg'}`
  );

  const response = await fetch(getWhatsAppGraphUrl('/media'), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${getAccessToken()}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error?.message || response.statusText);
  }

  const data = await response.json();

  if (!data.id) {
    throw new Error('WhatsApp media upload did not return a media id');
  }

  return data.id;
};

const sendWhatsAppMediaMessage = async (
  attachment: WhatsAppAttachment,
  mediaId: string
): Promise<string> => {
  const recipient = process.env.WHATSAPP_RECIPIENT_PHONE;

  if (!recipient) {
    throw new Error('Missing WhatsApp recipient phone');
  }

  const response = await fetch(getWhatsAppGraphUrl('/messages'), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${getAccessToken()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: recipient,
      type: attachment.type,
      [attachment.type]: {
        id: mediaId,
      },
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error?.message || response.statusText);
  }

  const data = await response.json();

  return data.messages?.[0]?.id ?? mediaId;
};

const sendWhatsAppAttachment = async (attachment: WhatsAppAttachment): Promise<string> => {
  if (!isSupportedWhatsAppMedia(attachment)) {
    return `${attachment.type} clip skipped because WhatsApp does not accept this browser recording format`;
  }

  const mediaId = await uploadWhatsAppMedia(attachment);
  await sendWhatsAppMediaMessage(attachment, mediaId);

  return `${attachment.type} clip sent via WhatsApp`;
};

const sendRealWhatsAppMessage = async (
  message: string,
  attachments: WhatsAppAttachment[] = []
): Promise<WhatsAppAlertResult> => {
  try {
    const recipient = process.env.WHATSAPP_RECIPIENT_PHONE;

    if (!recipient) {
      throw new Error('Missing WhatsApp recipient phone');
    }

    const response = await fetch(getWhatsAppGraphUrl('/messages'), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${getAccessToken()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: recipient,
        type: 'text',
        text: {
          preview_url: true,
          body: message.slice(0, WHATSAPP_TEXT_LIMIT),
        },
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error?.message || response.statusText);
    }

    const data = await response.json();
    const mediaNotes: string[] = [];

    for (const attachment of attachments) {
      try {
        mediaNotes.push(await sendWhatsAppAttachment(attachment));
      } catch (error) {
        mediaNotes.push(
          `${attachment.type} clip could not be sent via WhatsApp: ${
            error instanceof Error ? error.message : 'Unknown error'
          }`
        );
      }
    }

    return {
      success: true,
      message:
        mediaNotes.length > 0
          ? `Alert sent to WhatsApp. ${mediaNotes.join(' ')}.`
          : 'Alert sent to WhatsApp.',
      isDemoMode: false,
      messageId: data.messages?.[0]?.id,
      mediaNotes,
    };
  } catch (error) {
    console.error('Error sending WhatsApp message:', error);
    return {
      success: false,
      message: `WhatsApp alert failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      isDemoMode: false,
    };
  }
};

const sendMockWhatsAppMessage = async (
  message: string,
  attachments: WhatsAppAttachment[] = []
): Promise<WhatsAppAlertResult> => {
  await new Promise((resolve) => setTimeout(resolve, 500));

  console.log('[DEMO MODE] Would send WhatsApp message:');
  console.log('---');
  console.log(message);
  if (attachments.length > 0) {
    console.log(`[DEMO MODE] Would attach ${attachments.length} WhatsApp media clip(s) when supported.`);
  }
  console.log('---');

  return {
    success: true,
    message: 'WhatsApp is not connected, so it was skipped.',
    isDemoMode: true,
  };
};

export const sendWhatsAppAlert = async (
  message: string,
  attachments: WhatsAppAttachment[] = []
): Promise<WhatsAppAlertResult> => {
  if (isWhatsAppConfigured()) {
    return sendRealWhatsAppMessage(message, attachments);
  }

  return sendMockWhatsAppMessage(message, attachments);
};
