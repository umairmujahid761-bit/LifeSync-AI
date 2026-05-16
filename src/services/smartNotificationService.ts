import { askAssistant } from '../lib/gemini';

export type NotificationTrigger = 'hydration' | 'sleep' | 'workout' | 'mood' | 'goal' | 'routine';

export async function generateSmartNotification(
  trigger: NotificationTrigger,
  context: any
): Promise<string> {
  const prompt = `Generate a very short, professional, yet warm and motivating "nudge" notification for a user.
  Trigger: ${trigger}
  User Context:
  - Water: ${context.waterAmount}ml
  - Steps: ${context.steps}
  - Mood: ${context.mood || 'Unknown'}
  - Pregnancy Week: ${context.pregnancyWeek || 'N/A'}
  - Current Time: ${new Date().toLocaleTimeString()}

  Specific Goal for this notification: ${trigger === 'hydration' ? 'Remind them to drink water if low.' : 
    trigger === 'workout' ? 'Encourage some movement.' : 
    trigger === 'mood' ? 'Check in on how they are feeling.' : 
    'Provide a general health synchronization boost.'}

  Constraint: MUST be under 15 words. Use one emoji. No hashtags.`;

  try {
    const response = await askAssistant(prompt, context);
    return response;
  } catch (err) {
    // Fallback messages
    const fallbacks: Record<NotificationTrigger, string> = {
      hydration: "Stay synchronized. Time for a hydration boost. 💧",
      sleep: "Your biological systems require rest soon. 🌙",
      workout: "Kinetic engagement recommended. Let's move. ⚡",
      mood: "Neural patterns detected. How are you feeling? 🧠",
      goal: "Optimization target in sight. Keep pushing. 🎯",
      routine: "Protocol check. Ensure all habits are logged. ✅"
    };
    return fallbacks[trigger];
  }
}
