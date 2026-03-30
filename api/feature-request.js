export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Email service not configured' });
  }

  const { selections = [], writeIn = '' } = req.body || {};

  if (!Array.isArray(selections) || (selections.length === 0 && !String(writeIn).trim())) {
    return res.status(400).json({ error: 'At least one selection or write-in is required' });
  }

  const lines = [
    'Feature Request — Decode My Item',
    '─'.repeat(40),
  ];
  if (selections.length) {
    lines.push('Selected Features:');
    selections.forEach(function (s) { lines.push('  • ' + s); });
  }
  if (String(writeIn).trim()) {
    lines.push('Write-in: ' + String(writeIn).trim());
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Item Assist <feedback@decodemyitem.com>',
        to: ['joeybuk03@gmail.com'],
        subject: 'Feature Request — Decode My Item',
        text: lines.join('\n'),
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Resend error:', errText);
      return res.status(502).json({ error: 'Failed to send email' });
    }

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('feature-request handler error:', e);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
