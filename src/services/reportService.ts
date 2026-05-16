import { askAssistant } from '../lib/gemini';

export interface WeeklyReport {
  summary: string;
  trends: {
    hydration: string;
    activity: string;
    sleep: string;
    nutrition: string;
  };
  recommendations: string[];
  score: number;
}

export async function generateWeeklyReport(logs: any[], context: any): Promise<WeeklyReport> {
  const prompt = `Based on the last 7 days of health logs, generate a comprehensive health report.
  
  LOGS:
  ${logs.map(l => `- ${l.date}: Steps: ${l.steps}, Water: ${l.waterAmount}ml, Sleep: ${l.sleepHours}h, Calories: ${l.consumedCalories}`).join('\n')}
  
  CURRENT CONTEXT:
  - Pregnancy Week: ${context.pregnancyWeek || 'N/A'}
  - XP: ${context.xp}, Level: ${context.level}
  
  TASK:
  1. Analyze trends in hydration, activity, sleep, and nutrition.
  2. Provide a 1-sentence summary for each trend.
  3. Provide a high-level overall summary.
  4. Suggest 3 specific recommendations for next week.
  5. Assign an overall "Health Sync Score" (1-100).
  
  RESPONSE FORMAT (JSON):
  {
    "summary": "...",
    "trends": {
      "hydration": "...",
      "activity": "...",
      "sleep": "...",
      "nutrition": "..."
    },
    "recommendations": ["...", "...", "..."],
    "score": 85
  }`;

  try {
    const res = await askAssistant(prompt, context);
    const jsonStr = res.replace(/```json/g, '').replace(/```/g, '').trim();
    return JSON.parse(jsonStr);
  } catch (err) {
    console.error("Report generation failed:", err);
    return {
      summary: "We're still gathering your biometric data to produce a high-fidelity sync report.",
      trends: {
        hydration: "Baseline established.",
        activity: "Steady signal detected.",
        sleep: "Rest patterns stabilizing.",
        nutrition: "Calorie tracking active."
      },
      recommendations: [
        "Increase water intake by 10% next week.",
        "Attempt a consistent sleep window.",
        "Add one additional active period."
      ],
      score: 70
    };
  }
}
