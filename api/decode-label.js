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
  "confidence": "high if all fields are clearly readable, medium if one or more are unclear or partially visible, low if the image is blurry or at a difficult angle",
  "candidates": ["list of other potential serial/model numbers found on the label even if you're unsure which is which"],
  "note": "one short sentence if something is unusual, ambiguous, the photo is unclear, or the image is not a data plate — otherwise empty string"
}

Rules:
- brand: use the consumer brand name only (Whirlpool not Whirlpool Corporation, GE not General Electric), or null if not visible
- serial: strip any label prefixes (SN, S/N, Ser, Serial No., Serial Number, etc.) and return only the code itself
- model: strip any label prefix (Model, Mod., MN, etc.)
- candidates: include any other long alphanumeric strings visible on the label that could be a serial or model number (even if you're unsure)
- If this is clearly not a data plate, return all fields as null with a note explaining what you see
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
            temperature: 0.2,
            topP: 0.95,
            maxOutputTokens: 400
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

    if (!rawText) {
      return res.status(502).json({ error: 'No response from vision API' });
    }

    // Strip any markdown fences and clean up
    let clean = rawText
      .replace(/^```json\s*\n?/i, '')
      .replace(/^```\s*\n?/i, '')
      .replace(/\n?```\s*$/i, '')
      .replace(/\n?```json\s*$/i, '')
      .trim();

    // Handle case where Gemini returns text before/after JSON
    // Look for JSON object pattern
    const jsonMatch = clean.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      clean = jsonMatch[0];
    }

    try {
      const parsed = JSON.parse(clean);
      
      // Ensure candidates is an array
      const candidates = Array.isArray(parsed.candidates) ? parsed.candidates.filter(c => c && typeof c === 'string').slice(0, 5) : [];
      
      const result = {
        brand: parsed.brand || null,
        serial: parsed.serial || null,
        model: parsed.model || null,
        confidence: parsed.confidence || 'low',
        candidates: candidates,
        note: parsed.note || ''
      };

      return res.status(200).json(result);
    } catch (parseErr) {
      console.error('JSON parse failed for:', clean);
      
      // Fallback: extract potential candidates using regex if JSON parsing fails
      const candidates = extractCandidates(rawText);
      
      return res.status(200).json({
        brand: null,
        serial: null,
        model: null,
        confidence: 'low',
        candidates: candidates,
        note: 'Could not clearly read label. Please verify the extracted values below.',
        fallback: true
      });
    }

  } catch (err) {
    console.error('decode-label error:', err);
    return res.status(500).json({ error: 'Unable to analyze image right now' });
  }
}

// ── Helper: extract potential serial/model numbers via regex ──
function extractCandidates(text) {
  // Find sequences of 6+ alphanumeric characters that could be serial/model
  const pattern = /[A-Z0-9]{6,20}/g;
  const matches = text.match(pattern) || [];
  
  // Deduplicate and limit to 8 candidates
  const unique = [...new Set(matches)];
  return unique.slice(0, 8);
}
