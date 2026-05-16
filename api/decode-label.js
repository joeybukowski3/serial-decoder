// /api/decode-label.js
// Analyzes a photo of an appliance data plate using Gemini vision
// Returns: { brand, serial, model, confidence, note }

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { image, mimeType } = req.body || {};
  if (!image) return res.status(400).json({ error: 'No image provided' });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'API key not configured' });

  const PROMPT = `You are analyzing a photo of an appliance, HVAC equipment, or electronics data plate / rating label / serial number sticker.

Extract the following and return ONLY a valid JSON object — no markdown, no explanation, no extra text:

{
  "brand": "manufacturer brand name (e.g. Whirlpool, GE, Samsung, Carrier) or null if not clearly visible",
  "serial": "serial number digits/letters only — no label prefix like SN: or Serial No. — or null if not visible",
  "model": "model number value only — no label prefix — or null if not visible",
  "confidence": "high if both brand and serial are clearly readable, medium if one is unclear, low if both are unclear",
  "note": "one short sentence if something is unusual, ambiguous, or the image is not a data plate — otherwise empty string"
}

Rules:
- brand: use the consumer brand name only (Whirlpool not Whirlpool Corporation, GE not General Electric)
- serial: strip any label prefixes (SN, S/N, Ser, Serial No., Serial Number, etc.) and return only the code itself
- model: strip any label prefix (Model, Mod., MN, etc.)
- If this is clearly not a data plate or serial label, return all null values with a note explaining what you see
- Return ONLY the JSON — nothing else`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            role: 'user',
            parts: [
              { inlineData: { mimeType: mimeType || 'image/jpeg', data: image } },
              { text: PROMPT }
            ]
          }],
          generationConfig: {
            temperature: 0.1,
            topP: 0.95,
            maxOutputTokens: 300
          }
        })
      }
    );

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      console.error('Gemini error:', errData);
      return res.status(response.status).json({
        error: errData?.error?.message || 'Vision API request failed'
      });
    }

    const data = await response.json();
    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';

    // Strip any markdown fences Gemini might add
    const clean = rawText
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    try {
      const parsed = JSON.parse(clean);
      return res.status(200).json({
        brand: parsed.brand || null,
        serial: parsed.serial || null,
        model: parsed.model || null,
        confidence: parsed.confidence || 'low',
        note: parsed.note || ''
      });
    } catch (parseErr) {
      console.error('JSON parse failed:', clean);
      return res.status(502).json({ error: 'Could not parse label data from image', raw: clean });
    }

  } catch (err) {
    console.error('decode-label error:', err);
    return res.status(500).json({ error: 'Unable to analyze image right now' });
  }
}
