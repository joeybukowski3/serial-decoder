export default async function handler(req, res) {
  const query = req.query.query;
  if (!query) {
    return res.status(400).json({ error: 'Missing query parameter' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'API key not configured' });
  }

  const prompt = `You are a product research specialist. Given the following appliance or water heater model number, brand, or description, determine the most likely manufacture date or production era.

Research approach:
- Identify the brand and model from the query
- Determine when this model was first manufactured or sold
- Look for earliest known references: product launches, first reviews, first retail listings, manual publication dates
- If an exact year cannot be determined, provide a production year range
- Consider model number patterns that indicate year/generation

Query: "${query}"

Respond with ONLY valid JSON in this exact format:
{
  "brand": "Brand name or Unknown",
  "model": "Model number if identifiable",
  "estimatedYear": "Most likely manufacture year or null",
  "yearRange": "e.g. 2015-2018 or null",
  "confidence": "high, medium, or low",
  "evidence": [
    {"source": "Source name", "date": "Date if known", "detail": "Brief explanation"}
  ],
  "notes": "Any important context about this determination"
}`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: 'application/json',
            temperature: 0.2
          }
        })
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      console.error('Gemini API error:', errText);
      return res.status(502).json({ error: 'AI service error' });
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) {
      return res.status(502).json({ error: 'No response from AI service' });
    }

    const result = JSON.parse(text);
    return res.status(200).json(result);
  } catch (e) {
    console.error('age-lookup error:', e);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
