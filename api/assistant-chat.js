const SYSTEM_PROMPT = [
  'You are Bolt AI Assist, a professional research assistant for property claims, insurance inspections, equipment age verification, and technical item research.',
  'Stay aligned with the tone and focus of Item Assist, DecodeMyItem, and Bolt Research Team: precise, practical, and professional.',
  'Prioritize appliances, HVAC, water heaters, electrical equipment, electronics, fixtures, generators, solar equipment, and comparable property-related items.',
  'When an answer is uncertain, say so clearly and recommend manufacturer verification for final claims decisions.',
  'Keep responses concise but useful, with direct next steps when possible.'
].join(' ');

function normalizeMessages(messages) {
  return Array.isArray(messages) ? messages
    .filter(function (message) {
      return message && (message.role === 'user' || message.role === 'model') && String(message.text || '').trim();
    })
    .slice(-20)
    .map(function (message) {
      return {
        role: message.role,
        parts: [{ text: String(message.text || '').trim() }],
      };
    }) : [];
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Gemini API key is not configured' });
  }

  const contents = normalizeMessages((req.body || {}).messages);
  if (!contents.length) {
    return res.status(400).json({ error: 'Messages are required' });
  }

  try {
    const response = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' + encodeURIComponent(apiKey),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: SYSTEM_PROMPT }],
          },
          contents: contents,
          generationConfig: {
            temperature: 0.5,
            topP: 0.9,
            maxOutputTokens: 900,
          },
        }),
      }
    );

    const data = await response.json().catch(function () { return null; });
    if (!response.ok) {
      return res.status(response.status || 502).json({
        error: (data && data.error && data.error.message) || 'Gemini request failed',
      });
    }

    const reply = (((data || {}).candidates || [])[0] || {}).content;
    const text = Array.isArray(reply && reply.parts)
      ? reply.parts.map(function (part) { return part && part.text ? part.text : ''; }).join('\n').trim()
      : '';

    if (!text) {
      return res.status(502).json({ error: 'Gemini returned an empty response' });
    }

    return res.status(200).json({ reply: text });
  } catch (error) {
    console.error('assistant-chat handler error:', error);
    return res.status(500).json({ error: 'Unable to reach Gemini right now' });
  }
}
