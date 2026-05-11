const HEALTH_VERSION = 'contact-form-fix-e55e2e0';

function setJsonHeaders(res) {
  if (typeof res.setHeader === 'function') {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
  }
}

function sendJson(res, statusCode, payload) {
  setJsonHeaders(res);
  return res.status(statusCode).json(payload);
}

async function readRawBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function parseRequestBody(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
    return { ok: true, body: req.body };
  }

  if (typeof req.body === 'string') {
    if (!req.body.trim()) return { ok: true, body: {} };
    try {
      return { ok: true, body: JSON.parse(req.body) };
    } catch (_) {
      return { ok: false };
    }
  }

  if (Buffer.isBuffer(req.body)) {
    const text = req.body.toString('utf8');
    if (!text.trim()) return { ok: true, body: {} };
    try {
      return { ok: true, body: JSON.parse(text) };
    } catch (_) {
      return { ok: false };
    }
  }

  const raw = await readRawBody(req);
  if (!raw.trim()) return { ok: true, body: {} };

  try {
    return { ok: true, body: JSON.parse(raw) };
  } catch (_) {
    return { ok: false };
  }
}

function getContactFallback() {
  const fallbackEmail =
    process.env.CONTACT_EMAIL_PUBLIC ||
    process.env.FEEDBACK_EMAIL ||
    'feedback@decodemyitem.com';

  return {
    fallbackEmail,
    mailto: 'mailto:' + fallbackEmail,
  };
}

async function handleContact(body, res) {
  const apiKey = process.env.RESEND_API_KEY;
  const contactTo =
    process.env.CONTACT_EMAIL_TO ||
    process.env.FEEDBACK_EMAIL ||
    process.env.ALERT_EMAIL_TO ||
    'joeybuk03@gmail.com';
  const fallback = getContactFallback();

  const name = String(body.name || '').trim();
  const email = String(body.email || '').trim();
  const subject = String(body.subject || '').trim();
  const message = String(body.message || '').trim();
  const emailLooksValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  if (!name || !email || !message || !emailLooksValid) {
    return sendJson(res, 400, {
      ok: false,
      error: 'Name, email, and message are required',
    });
  }

  if (!apiKey) {
    return sendJson(res, 503, {
      ok: false,
      error: 'Email service not configured',
      ...fallback,
    });
  }

  const bodyText = [
    'Serial Number Decoder - Contact Form Submission',
    '-'.repeat(48),
    `Name:    ${name}`,
    `Email:   ${email}`,
    `Subject: ${subject || '(not provided)'}`,
    '',
    'Message:',
    message,
    '',
    'Submitted via decodemyitem.com contact form.',
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
        to: [contactTo],
        subject: subject
          ? `[Decoder] ${subject}`
          : `[Decoder] Contact from ${name}`,
        text: bodyText,
        reply_to: email,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Resend error:', errText);
      return sendJson(res, 503, {
        ok: false,
        error: 'Email service not configured',
        ...fallback,
      });
    }

    return sendJson(res, 200, { ok: true });
  } catch (error) {
    console.error('contact handler error:', error);
    return sendJson(res, 503, {
      ok: false,
      error: 'Email service not configured',
      ...fallback,
    });
  }
}

async function handleFeedback(body, res) {
  const apiKey = process.env.RESEND_API_KEY;
  const alertTo = process.env.ALERT_EMAIL_TO;
  if (!apiKey || !alertTo) {
    return sendJson(res, 500, { ok: false, error: 'Email service not configured' });
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
      return sendJson(res, 502, { ok: false, error: 'Failed to send email' });
    }

    return sendJson(res, 200, { ok: true });
  } catch (error) {
    console.error('feedback handler error:', error);
    return sendJson(res, 500, { ok: false, error: 'Internal server error' });
  }
}

async function handleSiteFeedback(body, res) {
  const apiKey = process.env.RESEND_API_KEY;
  const feedbackTo = process.env.FEEDBACK_EMAIL;
  if (!apiKey || !feedbackTo) {
    return sendJson(res, 500, { ok: false, error: 'Email service not configured' });
  }

  const {
    name = '',
    feedbackType = '',
    pageFeature = '',
    itemSearched = '',
    message = '',
  } = body;

  if (!String(message).trim()) {
    return sendJson(res, 400, { ok: false, error: 'Message is required' });
  }

  const submittedAt = new Date().toISOString();
  const cleanFeedbackType = String(feedbackType).trim() || 'Not provided';
  const bodyText = [
    `Name: ${String(name).trim() || 'Not provided'}`,
    `Feedback Type: ${cleanFeedbackType}`,
    `Page / Feature: ${String(pageFeature).trim() || 'Not provided'}`,
    `Item Searched: ${String(itemSearched).trim() || 'Not provided'}`,
    `Message: ${String(message).trim()}`,
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
      return sendJson(res, 502, { ok: false, error: 'Failed to send email' });
    }

    return sendJson(res, 200, { ok: true });
  } catch (error) {
    console.error('site-feedback handler error:', error);
    return sendJson(res, 500, { ok: false, error: 'Internal server error' });
  }
}

async function handleFeatureRequest(body, res) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return sendJson(res, 500, { ok: false, error: 'Email service not configured' });
  }

  const { selections = [], writeIn = '' } = body;
  if (!Array.isArray(selections) || (selections.length === 0 && !String(writeIn).trim())) {
    return sendJson(res, 400, {
      ok: false,
      error: 'At least one selection or write-in is required',
    });
  }

  const lines = [
    'Feature Request - Decode My Item',
    '-'.repeat(40),
  ];
  if (selections.length) {
    lines.push('Selected Features:');
    selections.forEach(function (selection) {
      lines.push('  - ' + selection);
    });
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
      return sendJson(res, 502, { ok: false, error: 'Failed to send email' });
    }

    return sendJson(res, 200, { ok: true });
  } catch (error) {
    console.error('feature-request handler error:', error);
    return sendJson(res, 500, { ok: false, error: 'Internal server error' });
  }
}

export default async function handler(req, res) {
  if (req.method === 'GET') {
    return sendJson(res, 200, {
      ok: true,
      route: 'api/forms.js',
      version: HEALTH_VERSION,
      supports: ['contact', 'feedback', 'site-feedback', 'feature-request'],
    });
  }

  if (req.method !== 'POST') {
    return sendJson(res, 405, { ok: false, error: 'Method not allowed' });
  }

  const parsed = await parseRequestBody(req);
  if (!parsed.ok) {
    return sendJson(res, 400, { ok: false, error: 'Invalid JSON payload' });
  }

  const payload = parsed.body && typeof parsed.body === 'object' ? parsed.body : {};
  const type = String(payload.type || '').trim();
  const body = { ...payload };
  delete body.type;

  if (type === 'contact') return handleContact(body, res);
  if (type === 'feedback') return handleFeedback(body, res);
  if (type === 'site-feedback') return handleSiteFeedback(body, res);
  if (type === 'feature-request') return handleFeatureRequest(body, res);

  return sendJson(res, 400, { ok: false, error: 'Missing or unrecognized type' });
}
