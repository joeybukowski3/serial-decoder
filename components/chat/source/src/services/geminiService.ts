import { GoogleGenAI } from "@google/genai";

const SYSTEM_INSTRUCTION = `You are InsureAge AI, a specialized assistant for insurance adjusters, underwriters, and claims professionals. 
Your primary goal is to help users research the age of items (appliances, HVAC units, electronics, heavy machinery) and provide technical specifications.

Key Responsibilities:
1. **Serial Number Decoding**: Explain how to read serial numbers for major brands (e.g., Carrier, Rheem, Whirlpool, Samsung) to determine the manufacture date.
2. **Technical Specifications**: Provide BTU ratings, SEER ratings, wattage, and other technical details relevant for insurance valuation.
3. **Life Expectancy**: Offer standard industry estimates for the useful life of various items.
4. **Professional Tone**: Maintain a precise, technical, and helpful tone.

If a user provides a serial number, try to identify the brand's pattern. If you don't know the specific pattern, provide general guidance on where to look for the date code.
Always cite that these are estimates and official manufacturer verification is recommended for final claims.`;

export interface Message {
  role: 'user' | 'model';
  text: string;
  image?: {
    data: string;
    mimeType: string;
  };
}

export async function chatWithGemini(history: Message[]) {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });
  
  // Convert history to the format expected by the SDK
  const contents = history.map(msg => {
    const parts: any[] = [{ text: msg.text }];
    
    if (msg.image) {
      parts.push({
        inlineData: {
          data: msg.image.data,
          mimeType: msg.image.mimeType
        }
      });
    }

    return {
      role: msg.role,
      parts
    };
  });

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3.1-pro-preview",
      contents,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        temperature: 0.7,
      },
    });

    return response.text || "I'm sorry, I couldn't process that request.";
  } catch (error) {
    console.error("Gemini API Error:", error);
    return "An error occurred while communicating with the AI. Please check your configuration.";
  }
}
