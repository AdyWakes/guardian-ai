import { NextResponse } from 'next/server';
import { isFoundryConfigured } from '@/lib/foundryIQ';
import { isTelegramConfigured } from '@/lib/telegram';
import { isWhatsAppConfigured } from '@/lib/whatsapp';

// Must evaluate environment variables at request time, not build time.
// Without this, Next.js statically prerenders the response and bakes in
// whatever env state existed during `next build`, so the deployed status
// would never reflect the real runtime configuration.
export const dynamic = 'force-dynamic';

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
