import { Redis } from '@upstash/redis';

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const alertKey = `ai:alertSent:${today}`;

  // ── Connect to Redis ───────────────────────────────────────────────────────
  let redis;
  try {
    redis = new Redis({
      url:   process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    });
  } catch (_) {
    return res.status(500).json({ error: 'Redis unavailable' });
  }

  // ── De-duplication: one alert per day ─────────────────────────────────────
  try {
    const alreadySent = await redis.get(alertKey);
    if (alreadySent) {
      return res.status(200).json({ status: 'already_sent', date: today });
    }
  } catch (_) {
    // If Redis check fails, proceed conservatively
  }

  // ── Read usage metrics (safely handle missing or unexpected data) ──────────
  let usageCount = null;
  try {
    const usageRaw = await redis.get('ai:usage:daily:' + today);
    if (usageRaw !== null && usageRaw !== undefined) {
      const parsed = typeof usageRaw === 'number' ? usageRaw : parseInt(String(usageRaw), 10);
      if (!isNaN(parsed)) usageCount = parsed;
    }
  } catch (_) {
    // No usage data — proceed with alert anyway if threshold met
  }

  // ── Threshold check (placeholder — cap enforcement is separate) ───────────
  const HIGH_USAGE_THRESHOLD = 100;
  const shouldAlert = usageCount === null || usageCount >= HIGH_USAGE_THRESHOLD;

  if (!shouldAlert) {
    return res.status(200).json({ status: 'below_threshold', usageCount });
  }

  // ── Send alert email via Resend ───────────────────────────────────────────
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
      subject: 'Decodemyitem Smart Lookup usage alert',
      text: [
        'Decodemyitem Smart Lookup Usage Alert',
        '',
        'Date: ' + today,
        'Usage count: ' + (usageCount !== null ? String(usageCount) : 'unavailable'),
        '',
        'High usage detected for Smart Lookup on decodemyitem.com.',
        'Please review current traffic and capacity as needed.',
        '',
        'This alert will not repeat until tomorrow.',
      ].join('\n'),
    });
  } catch (e) {
    return res.status(500).json({ error: 'Failed to send alert email', detail: String(e.message || e) });
  }

  // ── Mark alert sent for today (24-hour TTL) ───────────────────────────────
  try {
    await redis.set(alertKey, '1', { ex: 24 * 60 * 60 });
  } catch (_) {}

  return res.status(200).json({ status: 'alert_sent', date: today, usageCount });
}
