import { Redis } from '@upstash/redis';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { brand, serial, category, reason, timestamp } = req.body || {};

  if (!brand || !serial) {
    return res.status(400).json({ error: 'brand and serial are required' });
  }

  // Sanitize key components to prevent Redis key injection
  const safeBrand  = String(brand).replace(/[^a-zA-Z0-9 ._-]/g, '').substring(0, 64);
  const safeSerial = String(serial).replace(/[^a-zA-Z0-9]/g, '').substring(0, 32);
  const dedupKey   = 'decodeAlert:' + safeBrand + ':' + safeSerial;

  // ── Redis de-duplication: one alert per brand+serial per 24 h ─────────────
  let redis;
  try {
    redis = new Redis({
      url:   process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    });
    const alreadySent = await redis.get(dedupKey);
    if (alreadySent) {
      return res.status(200).json({ status: 'deduplicated' });
    }
  } catch (_) {
    // Redis unavailable — proceed so the alert still fires
  }

  // ── Send email via Resend ─────────────────────────────────────────────────
  const resendKey = process.env.RESEND_API_KEY;
  const alertTo   = process.env.ALERT_EMAIL_TO;

  if (!resendKey || !alertTo) {
    return res.status(200).json({ status: 'no_email_config' });
  }

  try {
    const { Resend } = await import('resend');
    const resend = new Resend(resendKey);

    await resend.emails.send({
      from:    'onboarding@resend.dev',
      to:      alertTo,
      subject: 'Decodemyitem decoder fallback triggered',
      text: [
        'Decodemyitem Decoder Fallback Alert',
        '',
        'Brand:     ' + String(brand),
        'Serial:    ' + String(serial),
        'Category:  ' + String(category || 'unknown'),
        'Reason:    ' + String(reason || 'unknown'),
        'Timestamp: ' + String(timestamp || new Date().toISOString()),
        '',
        'A rule-based serial decoder returned no result or failed sanity validation.',
        'This may indicate a new serial format or a bug in the decoder logic.',
        '',
        'This alert will not repeat for this brand + serial combination for 24 hours.',
      ].join('\n'),
    });
  } catch (e) {
    return res.status(500).json({ error: 'Failed to send alert email', detail: String(e.message || e) });
  }

  // ── Mark sent (24-hour TTL) ────────────────────────────────────────────────
  try {
    if (redis) await redis.set(dedupKey, '1', { ex: 24 * 60 * 60 });
  } catch (_) {}

  return res.status(200).json({ status: 'alert_sent' });
}
