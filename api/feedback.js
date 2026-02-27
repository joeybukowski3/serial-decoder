export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.RESEND_API_KEY;
  const alertTo = process.env.ALERT_EMAIL_TO;
  if (!apiKey || !alertTo) {
    return res.status(500).json({ error: 'Email service not configured' });
  }

  const { brand, serial, issueType, details } = req.body || {};

  const issueLabels = {
    wrong_year:   'Wrong year / date',
    wrong_month:  'Wrong month',
    wrong_brand:  'Wrong brand identified',
    format_error: 'Format / decode error',
    other:        'Other',
  };

  const bodyText = [
    'Serial Number Decoder — Possible Error Report',
    '─────────────────────────────────────────────',
    `Brand:        ${brand      || '(not specified)'}`,
    `Serial/Query: ${serial     || '(not specified)'}`,
    `Issue Type:   ${issueLabels[issueType] || issueType || '(not specified)'}`,
    `Details:      ${details    || '(none provided)'}`,
    '',
    'Submitted via the Serial Number Decoder feedback form.',
  ].join('\n');

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from:    'Serial Decoder <onboarding@resend.dev>',
        to:      [alertTo],
        subject: `[Decoder] Possible error — ${brand || 'Unknown Brand'} / ${serial || 'no serial'}`,
        text:    bodyText,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Resend error:', errText);
      return res.status(502).json({ error: 'Failed to send email' });
    }

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('feedback handler error:', e);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
