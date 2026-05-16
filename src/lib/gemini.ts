import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export async function* askAssistantStream(prompt: string, context?: any, history: {role: 'user' | 'ai', text: string}[] = []) {
  try {
    const formattedHistory = history.map(msg => ({
      role: msg.role === 'user' ? 'user' : 'model',
      parts: [{ text: msg.text }]
    }));

    const historyPrompt = context?.logs?.length > 0 
      ? `\n\nRELEVANT HISTORICAL PERFORMANCE (Last ${context.logs.length} entries):\n${context.logs.map((l: any) => `- ${l.date}: ${l.steps} steps, ${l.waterAmount}ml water, ${l.sleepHours}h sleep, Mood: ${l.mood}, Habits: ${l.completedHabitsCount}/${l.totalHabitsCount}`).join('\n')}`
      : "";

    const systemInstruction = `You are LifeSync AI, a sophisticated, hyper-personalized health and lifestyle companion. 
    Your goal is to provide elite, actionable guidance based on the user's real-time biometric and lifestyle data.

    CURRENT USER METRICS:
    - Pregnancy Status: ${context?.pregnancyWeek ? `Week ${context.pregnancyWeek} (Trimester ${context.pregnancyWeek < 13 ? '1' : context.pregnancyWeek < 27 ? '2' : '3'})` : 'Not tracked'}
    - Hydration: ${context?.waterAmount || 0}ml (Goal: 2000ml)
    - Rest: ${context?.sleepHours || 0}h (Goal: 8h)
    - Mood: ${context?.mood || 'Unrecorded'}
    - Activity: ${context?.steps || 0} steps, ${context?.activeMinutes || 0} active mins
    - Nutrition: ${context?.consumedCalories || 0}/${context?.calorieGoal || 2000} kcal${historyPrompt}

    OPERATIONAL GUIDELINES:
    1. BREVITY: Keep responses under 80 words unless a long explanation is specifically requested.
    2. PROACTIVE: If a metric is low (e.g., <1000ml water), start with a gentle but firm nudge.
    3. TONE: Warm, high-empathy, supportive, and friendly. Use occasional friendly emojis (e.g. 👋, ✨, 💙).
    4. PREGNANCY: If applicable, tailor advice to fetal development stages with extreme care and warmth.
    5. SAFETY: Always include a brief "Consult a professional for medical concerns" for complex health queries.
    6. FORMATTING: Use Markdown for structure. Use bullet points for steps.
    7. FRIENDLINESS: Your persona should feel like a dedicated, caring companion. Always validate user's feelings.
    8. MEMORY: Use the provided historical performance to identify trends (e.g. "I noticed your sleep has been improving this week").`;

    const stream = await ai.models.generateContentStream({
      model: "gemini-3-flash-preview",
      contents: [...formattedHistory, { role: 'user', parts: [{ text: prompt }] }],
      config: {
        systemInstruction,
        temperature: 0.7,
      }
    });

    for await (const chunk of stream) {
      if (chunk.text) {
        yield chunk.text;
      }
    }
  } catch (error) {
    console.error("Gemini Error:", error);
    yield "Error communicating with AI. Please check your connection.";
  }
}

export async function askAssistant(prompt: string, context?: any, history: {role: 'user' | 'ai', text: string}[] = []) {
  try {
    const formattedHistory = history.map(msg => ({
      role: msg.role === 'user' ? 'user' : 'model',
      parts: [{ text: msg.text }]
    }));

    const historyPrompt = context?.logs?.length > 0 
      ? `\n\nRELEVANT HISTORICAL PERFORMANCE (Last ${context.logs.length} entries):\n${context.logs.map((l: any) => `- ${l.date}: ${l.steps} steps, ${l.waterAmount}ml water, ${l.sleepHours}h sleep, Mood: ${l.mood}, Habits: ${l.completedHabitsCount}/${l.totalHabitsCount}`).join('\n')}`
      : "";

    const systemInstruction = `You are LifeSync AI. 
    
    CRITICAL: YOU MUST RESPOND IN UNDER 50 WORDS. NO LONG PARAGRAPHS. 
    
    Context:
    - Pregnancy: Wk ${context?.pregnancyWeek || '?'}
    - Water: ${context?.waterAmount || 0}ml
    - Sleep: ${context?.sleepHours || 0}h
    - Mood: ${context?.mood || '?'}
    - Steps: ${context?.steps || 0}
    - Calories: ${context?.consumedCalories || 0}/${context?.calorieGoal || 2000}${historyPrompt}
    
    Style:
    - Warm, atomic advice.
    - Bullet points for lists.
    - Full friendly and empathetic.
    - Proactive based on stats.
    - Medical disclaimer for complex queries.
    - Use friendly emojis ✨.
    - MEMORY: Use historical performance to personalize advice.`;

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
