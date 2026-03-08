export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

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
  } = req.body || {};

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
        subject: `ItemAssist Feedback — ${cleanFeedbackType}`,
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
