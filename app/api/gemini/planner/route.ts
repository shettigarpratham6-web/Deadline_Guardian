import { GoogleGenAI, Type } from "@google/genai";
import { NextRequest, NextResponse } from "next/server";

const apiKey = process.env.GEMINI_API_KEY;

export async function POST(req: NextRequest) {
  try {
    if (!apiKey) {
      return NextResponse.json(
        { error: "GEMINI_API_KEY environment variable is not configured on the server." },
        { status: 500 }
      );
    }

    const { tasks } = await req.json();

    if (!tasks || !Array.isArray(tasks)) {
      return NextResponse.json({ error: "Tasks list is required" }, { status: 400 });
    }

    const ai = new GoogleGenAI({
      apiKey: apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });

    const tasksSummary = tasks.map((t, idx) => `
Task #${idx + 1}:
- Title: ${t.title}
- Description: ${t.description || "N/A"}
- Priority: ${t.priority}
- Deadline: ${t.deadline}
- Status: ${t.status}
`).join("\n");

    const prompt = `Review this user's current workload and tasks:
${tasksSummary || "No tasks currently registered."}

Perform a high-level productivity analysis:
1. Synthesize 'todayPath' - a beautifully written, cohesive single-paragraph strategic statement (max 3 sentences) advising the user on their absolute best focal path today.
2. Formulate 'workloadAssessment' - a single word describing current load ('relaxed', 'moderate', or 'intense').
3. Create 'recommendations' - exactly 3 highly specific, creative, elite tactical tips for tackling these deadlines.
4. Calculate a 'productivityScore' (integer between 0 and 100) reflecting how securely they are currently handling their commitments (e.g. if many high-priority tasks are pending/overdue, score is lower; if many are completed, score is higher).`;

    const generateWithRetryAndFallback = async (primaryModel: string, fallbackModel: string, maxRetries = 3) => {
      let lastError: any = null;
      const models = [primaryModel, fallbackModel];
      
      for (const currentModel of models) {
        let delay = 1000;
        for (let attempt = 0; attempt < maxRetries; attempt++) {
          try {
            console.log(`[Gemini Planner] Attempting with model: ${currentModel} (attempt ${attempt + 1}/${maxRetries})`);
            const res = await ai.models.generateContent({
              model: currentModel,
              contents: prompt,
              config: {
                systemInstruction: "You are an elite, military-grade productivity strategist. Speak with razor-sharp precision, high emotional intelligence, and inspiring, sophisticated dark authority.",
                responseMimeType: "application/json",
                responseSchema: {
                  type: Type.OBJECT,
                  properties: {
                    todayPath: {
                      type: Type.STRING,
                      description: "A cohesive, inspiring single-paragraph strategic guide for today."
                    },
                    workloadAssessment: {
                      type: Type.STRING,
                      description: "Must be 'relaxed', 'moderate', or 'intense'"
                    },
                    recommendations: {
                      type: Type.ARRAY,
                      items: { type: Type.STRING },
                      description: "Exactly 3 premium advice items"
                    },
                    productivityScore: {
                      type: Type.INTEGER,
                      description: "A score from 0 to 100 based on status, priorities, and deadlines"
                    }
                  },
                  required: ["todayPath", "workloadAssessment", "recommendations", "productivityScore"]
                }
              }
            });
            return res;
          } catch (err: any) {
            lastError = err;
            console.error(`[Gemini Planner] Error with model ${currentModel} on attempt ${attempt + 1}:`, err);
            
            // If it's a structural client-side parameters error (e.g., 400), don't retry, just fall back
            const status = err.status || err.statusCode || (err.error && err.error.code);
            if (status === 400 || status === 403 || status === 401) {
              break;
            }
            
            if (attempt < maxRetries - 1) {
              await new Promise(resolve => setTimeout(resolve, delay));
              delay *= 2;
            }
          }
        }
      }
      throw lastError || new Error("Failed to generate content with Gemini.");
    };

    const response = await generateWithRetryAndFallback("gemini-2.5-flash", "gemini-2.5");

    const text = response.text || "{}";
    const data = JSON.parse(text.trim());

    return NextResponse.json(data);
  } catch (error: any) {
    console.error("Gemini planner error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal Server Error" },
      { status: 500 }
    );
  }
}
