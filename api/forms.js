async function handleContact(body, res) {
  const apiKey = process.env.RESEND_API_KEY;
  const alertTo =
    process.env.CONTACT_EMAIL_TO ||
    process.env.FEEDBACK_EMAIL ||
    process.env.ALERT_EMAIL_TO ||
    'joeybuk03@gmail.com';
  const publicContactEmail =
    process.env.CONTACT_EMAIL_PUBLIC ||
    process.env.FEEDBACK_EMAIL ||
    'feedback@decodemyitem.com';
  const { name, email, subject, message } = body;
  const cleanName = String(name || '').trim();
  const cleanEmail = String(email || '').trim();
  const cleanSubject = String(subject || '').trim();
  const cleanMessage = String(message || '').trim();
  const emailLooksValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail);
  const fallbackPayload = {
    fallbackEmail: publicContactEmail,
    fallbackMailto:
      'mailto:' + encodeURIComponent(publicContactEmail) +
      '?subject=' + encodeURIComponent(cleanSubject || 'Decode My Item contact request'),
  };

  if (!cleanName) {
    return res.status(400).json({ error: 'Name is required' });
  }

  if (!emailLooksValid) {
    return res.status(400).json({ error: 'A valid email is required' });
  }

  if (!cleanMessage) {
    return res.status(400).json({ error: 'Message is required' });
  }

  if (!apiKey) {
    return res.status(503).json({
      error: 'Contact email is temporarily unavailable',
      ...fallbackPayload,
    });
  }

  const bodyText = [
    'Serial Number Decoder - Contact Form Submission',
    '-'.repeat(48),
    `Name:    ${cleanName}`,
    `Email:   ${cleanEmail}`,
    `Subject: ${cleanSubject || '(not provided)'}`,
    '',
    'Message:',
    cleanMessage,
    '',
    'Submitted via decodemyitem.com contact form.',
  ].join('\n');

  try {
    const payload = {
      from: 'Serial Decoder <onboarding@resend.dev>',
      to: [alertTo],
      subject: cleanSubject
        ? `[Decoder] ${cleanSubject}`
        : `[Decoder] Contact from ${cleanName || cleanEmail || 'visitor'}`,
      text: bodyText,
      reply_to: cleanEmail,
    };

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Resend error:', errText);
      return res.status(502).json({
        error: 'Failed to send email',
        ...fallbackPayload,
      });
    }

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('contact handler error:', e);
    return res.status(500).json({
      error: 'Internal server error',
      ...fallbackPayload,
    });
  }
}

async function handleFeedback(body, res) {
  const apiKey = process.env.RESEND_API_KEY;
  const alertTo = process.env.ALERT_EMAIL_TO;
  if (!apiKey || !alertTo) {
    return res.status(500).json({ error: 'Email service not configured' });
  }

  const { brand, serial, issueType, details } = body;

  const issueLabels = {
    wrong_year: 'Wrong year / date',
    wrong_month: 'Wrong month',
    wrong_brand: 'Wrong brand identified',
    format_error: 'Format / decode error',
    other: 'Other',
  };

  const bodyText = [
    'Serial Number Decoder - Possible Error Report',
    '-'.repeat(45),
    `Brand:        ${brand || '(not specified)'}`,
    `Serial/Query: ${serial || '(not specified)'}`,
    `Issue Type:   ${issueLabels[issueType] || issueType || '(not specified)'}`,
    `Details:      ${details || '(none provided)'}`,
    '',
    'Submitted via the Serial Number Decoder feedback form.',
  ].join('\n');

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Serial Decoder <onboarding@resend.dev>',
        to: [alertTo],
        subject: `[Decoder] Possible error - ${brand || 'Unknown Brand'} / ${serial || 'no serial'}`,
        text: bodyText,
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

async function handleSiteFeedback(body, res) {
  const apiKey = process.env.RESEND_API_KEY;
  const feedbackTo = process.env.FEEDBACK_EMAIL;
  if (!apiKey || !feedbackTo) {
    return res.status(500).json({ error: 'Email service not configured' });
  }

  const {
    name = '',
    feedbackType = '',
    pageFeature = '',
    itemSearched = '',
    message = '',
  } = body;

  if (!message.trim()) {
    return res.status(400).json({ error: 'Message is required' });
  }

  const submittedAt = new Date().toISOString();
  const cleanFeedbackType = feedbackType.trim() || 'Not provided';
  const bodyText = [
    `Name: ${name.trim() || 'Not provided'}`,
    `Feedback Type: ${cleanFeedbackType}`,
    `Page / Feature: ${pageFeature.trim() || 'Not provided'}`,
    `Item Searched: ${itemSearched.trim() || 'Not provided'}`,
    `Message: ${message.trim()}`,
    `Submitted: ${submittedAt}`,
  ].join('\n');

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Item Assist <onboarding@resend.dev>',
        to: [feedbackTo],
        subject: `ItemAssist Feedback - ${cleanFeedbackType}`,
        text: bodyText,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('site-feedback resend error:', errText);
      return res.status(502).json({ error: 'Failed to send email' });
    }

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('site-feedback handler error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function handleFeatureRequest(body, res) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Email service not configured' });
  }

  const { selections = [], writeIn = '' } = body;

  if (!Array.isArray(selections) || (selections.length === 0 && !String(writeIn).trim())) {
    return res.status(400).json({ error: 'At least one selection or write-in is required' });
  }

  const lines = [
    'Feature Request - Decode My Item',
    '-'.repeat(40),
  ];
  if (selections.length) {
    lines.push('Selected Features:');
    selections.forEach(function (s) { lines.push('  - ' + s); });
  }
  if (String(writeIn).trim()) {
    lines.push('Write-in: ' + String(writeIn).trim());
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Item Assist <feedback@decodemyitem.com>',
        to: ['joeybuk03@gmail.com'],
        subject: 'Feature Request - Decode My Item',
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

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { type, ...body } = req.body || {};

  if (type === 'contact') return handleContact(body, res);
  if (type === 'feedback') return handleFeedback(body, res);
  if (type === 'site-feedback') return handleSiteFeedback(body, res);
  if (type === 'feature-request') return handleFeatureRequest(body, res);

  return res.status(400).json({ error: 'Missing or unrecognized type' });
}
