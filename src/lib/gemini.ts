import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export async function askAssistant(prompt: string, context?: any, history: {role: 'user' | 'ai', text: string}[] = []) {
  try {
    const formattedHistory = history.map(msg => ({
      role: msg.role === 'user' ? 'user' : 'model',
      parts: [{ text: msg.text }]
    }));

    const systemInstruction = `You are LifeSync AI. 
    
    CRITICAL: YOU MUST RESPOND IN UNDER 50 WORDS. NO LONG PARAGRAPHS. 
    
    Context:
    - Pregnancy: Wk ${context?.pregnancyWeek || '?'}
    - Water: ${context?.waterAmount || 0}ml
    - Sleep: ${context?.sleepHours || 0}h
    - Mood: ${context?.mood || '?'}
    - Steps: ${context?.steps || 0}
    - Calories: ${context?.consumedCalories || 0}/${context?.calorieGoal || 2000}
    
    Style:
    - Ultra-concise, atomic advice.
    - Bullet points for lists.
    - Professional but direct.
    - Proactive based on stats.
    - Medical disclaimer for complex queries.`;

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [...formattedHistory, { role: 'user', parts: [{ text: prompt }] }],
      config: {
        systemInstruction,
      }
    });

    return response.text || "I'm sorry, I couldn't generate a response.";
  } catch (error) {
    console.error("Gemini Error:", error);
    return "Error communicating with AI. Please try again later.";
  }
}
