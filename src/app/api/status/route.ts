import { NextResponse } from 'next/server';
import { isFoundryConfigured } from '@/lib/foundryIQ';
import { isTelegramConfigured } from '@/lib/telegram';
import { isWhatsAppConfigured } from '@/lib/whatsapp';

export async function GET() {
  const foundryConfigured = isFoundryConfigured();
  const telegramConfigured = isTelegramConfigured();
  const whatsAppConfigured = isWhatsAppConfigured();

  return NextResponse.json({
    is_demo_mode: !foundryConfigured || !telegramConfigured,
    foundry_configured: foundryConfigured,
    telegram_configured: telegramConfigured,
    whatsapp_configured: whatsAppConfigured,
  });
}
