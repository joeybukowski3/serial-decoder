export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.RESEND_API_KEY;
  const alertTo = process.env.ALERT_EMAIL_TO;
  if (!apiKey || !alertTo) {
    return res.status(500).json({ error: 'Email service not configured' });
  }

  const { name, email, message } = req.body || {};

  if (!message || !message.trim()) {
    return res.status(400).json({ error: 'Message is required' });
  }

  const bodyText = [
    'Serial Number Decoder — Contact Form Submission',
    '────────────────────────────────────────────────',
    `Name:    ${name    || '(not provided)'}`,
    `Email:   ${email   || '(not provided)'}`,
    '',
    `Message:`,
    message,
    '',
    'Submitted via decodemyitem.com contact form.',
  ].join('\n');

  try {
    const payload = {
      from:    'Serial Decoder <onboarding@resend.dev>',
      to:      [alertTo],
      subject: `[Decoder] Contact from ${name || email || 'visitor'}`,
      text:    bodyText,
    };

    if (email && email.includes('@')) {
      payload.reply_to = email;
    }

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Resend error:', errText);
      return res.status(502).json({ error: 'Failed to send email' });
    }

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('contact handler error:', e);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
