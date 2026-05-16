import { askAssistant } from '../lib/gemini';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, addDoc, doc, updateDoc, getDocs, query, where } from 'firebase/firestore';

export interface AgentAction {
  type: 'add_task' | 'add_habit' | 'update_goal' | 'tip';
  payload: any;
}

export interface AgentAnalysis {
  summary: string;
  actions: AgentAction[];
  routine?: { time: string; activity: string; reason: string }[];
}

export async function runAgenticWorkflow(userId: string, context: any): Promise<AgentAnalysis> {
  const prompt = `Analyze the following user health data and historical logs. 
  Create an "Agentic Workflow" proposal to optimize their health.
  
  CONTEXT:
  - User ID: ${userId}
  - Water: ${context.waterAmount}ml (Goal: 2000)
  - Steps: ${context.steps} (Goal: 10000)
  - Sleep: ${context.sleepHours}h (Goal: 8)
  - Mood: ${context.mood || 'Unknown'}
  - Pregnancy: ${context.pregnancyWeek ? `Week ${context.pregnancyWeek}` : 'Not applicable'}
  - Active Minutes: ${context.activeMinutes}
  - Calorie Intake: ${context.consumedCalories}/${context.calorieGoal}
  
  HISTORY (Last 7 days):
  ${context.logs?.map((l: any) => `- ${l.date}: ${l.steps} steps, ${l.waterAmount}ml water, ${l.sleepHours}h sleep`).join('\n')}

  TASK:
  1. Provide a concise, high-level summary of their current state.
  2. Suggest specific 2-3 "Actions" from the following types:
     - 'add_task': Suggest a specific task for today (e.g., "10-min mindfulness").
     - 'add_habit': Suggest a new recurring habit if they are missing something key.
     - 'update_goal': Suggest adjusting their hydration or calorie goal based on activity/pregnancy.
     - 'tip': A specialized tip for sleep, fitness, or pregnancy care.
  3. Generate a "Optimized Daily Routine" (3-5 items) for TODAY with specific times.

  RESPONSE FORMAT:
  Return a raw JSON object (no markdown blocks) with:
  {
    "summary": "...",
    "actions": [
      { "type": "add_task" | "add_habit" | "update_goal" | "tip", "payload": { "text": "...", "value": 0, "field": "..." } }
    ],
    "routine": [
      { "time": "hh:mm", "activity": "...", "reason": "..." }
    ]
  }

   payload details:
  - add_task: { "text": "Task description" }
  - add_habit: { "text": "Habit description" }
  - update_goal: { "field": "waterAmount" | "calorieGoal", "value": number }
  - tip: { "text": "Tip text" }`;

  try {
    const responseText = await askAssistant(prompt, context);
    // Clean up potential markdown formatting if Gemini included it
    const jsonStr = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
    const result = JSON.parse(jsonStr);
    return result;
  } catch (err) {
    console.error("Agentic Workflow Error:", err);
    return {
      summary: "I've analyzed your data. You're doing well, but consistency in hydration and sleep is key to optimal performance.",
      actions: [
        { type: 'tip', payload: { text: "Try setting a fixed sleep schedule to stabilize your circadian rhythm." } }
      ]
    };
  }
}

export async function executeAgentAction(userId: string, action: AgentAction, existingHabits: string[]) {
  try {
    const userRef = doc(db, 'users', userId);
    
    switch (action.type) {
      case 'add_task':
        await addDoc(collection(db, 'users', userId, 'tasks'), {
          text: action.payload.text,
          completed: false,
          createdAt: new Date().toISOString()
        });
        break;
      case 'add_habit':
        // Check if habit already exists
        if (!existingHabits.includes(action.payload.text)) {
           await addDoc(collection(db, 'users', userId, 'habits'), {
             text: action.payload.text,
             completed: false
           });
        }
        break;
      case 'update_goal':
        await updateDoc(userRef, {
          [action.payload.field]: action.payload.value
        });
        break;
      case 'tip':
        // Tips are usually just displayed, but maybe we log them?
        // For now, no database action for tips.
        break;
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `users/${userId}`);
  }
}
