import { GoogleGenAI, Type } from "@google/genai";
import { NextRequest, NextResponse } from "next/server";

// Verify API Key on startup
const apiKey = process.env.GEMINI_API_KEY;

export async function POST(req: NextRequest) {
  try {
    if (!apiKey) {
      return NextResponse.json(
        { error: "GEMINI_API_KEY environment variable is not configured on the server." },
        { status: 500 }
      );
    }

    const { title, description } = await req.json();

    if (!title) {
      return NextResponse.json({ error: "Title is required" }, { status: 400 });
    }

    const ai = new GoogleGenAI({
      apiKey: apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });

    const prompt = `Break down this task into exactly 3-5 concrete, actionable, sequential subtasks:
Task Title: ${title}
Task Description: ${description || "No description provided."}

Return a list of subtasks.`;

    const generateWithRetryAndFallback = async (primaryModel: string, fallbackModel: string, maxRetries = 3) => {
      let lastError: any = null;
      const models = [primaryModel, fallbackModel];
      
      for (const currentModel of models) {
        let delay = 1000;
        for (let attempt = 0; attempt < maxRetries; attempt++) {
          try {
            console.log(`[Gemini Breakdown] Attempting with model: ${currentModel} (attempt ${attempt + 1}/${maxRetries})`);
            const res = await ai.models.generateContent({
              model: currentModel,
              contents: prompt,
              config: {
                systemInstruction: "You are an elite, hyper-efficient productivity advisor. Your breakdown steps should be extremely actionable, crisp, and output-oriented.",
                responseMimeType: "application/json",
                responseSchema: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      title: {
                        type: Type.STRING,
                        description: "Crisp, actionable step title"
                      },
                      completed: {
                        type: Type.BOOLEAN,
                        description: "Default to false"
                      }
                    },
                    required: ["title", "completed"]
                  }
                }
              }
            });
            return res;
          } catch (err: any) {
            lastError = err;
            console.error(`[Gemini Breakdown] Error with model ${currentModel} on attempt ${attempt + 1}:`, err);
            
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

    const text = response.text || "[]";
    const subtasks = JSON.parse(text.trim());

    return NextResponse.json({ subtasks });
  } catch (error: any) {
    console.error("Gemini breakdown error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal Server Error" },
      { status: 500 }
    );
  }
}
