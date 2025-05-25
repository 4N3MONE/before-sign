import { NextResponse } from "next/server"

interface SolarLLMMessage {
  role: "user" | "assistant" | "system"
  content: string
}

interface SolarLLMResponse {
  id: string
  object: string
  created: number
  model: string
  choices: Array<{
    index: number
    message: {
      role: string
      content: string
    }
    finish_reason: string
  }>
  usage: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
}

// Global tracking for LLM calls
let llmCallCount = 0
let totalLLMTime = 0

async function callSolarLLM(messages: SolarLLMMessage[], jsonSchema?: any): Promise<any> {
  const startTime = Date.now()
  llmCallCount++
  const apiKey = process.env.UPSTAGE_API_KEY
  
  if (!apiKey) {
    throw new Error("UPSTAGE_API_KEY environment variable is required")
  }

  const requestBody: any = {
    model: "solar-pro",
    messages: messages,
    temperature: 0.1,
    max_tokens: 4000,
    top_p: 0.9,
  }

  if (jsonSchema) {
    requestBody.response_format = {
      type: "json_schema",
      json_schema: {
        name: "risk_analysis",
        schema: jsonSchema,
        strict: true
      }
    }
  }

  // Retry logic with exponential backoff
  const maxRetries = 3
  let retryCount = 0
  
  while (retryCount <= maxRetries) {
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 300000) // 300 seconds timeout

      const response = await fetch('https://api.upstage.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Upstage SolarLLM API error: ${response.status} - ${errorText}`)
      }

      const result: SolarLLMResponse = await response.json()
      
      if (!result.choices || result.choices.length === 0) {
        throw new Error("No response from SolarLLM")
      }

      const endTime = Date.now()
      totalLLMTime += (endTime - startTime)

      return result.choices[0].message.content

    } catch (error) {
      retryCount++
      console.error(`Upstage API call failed (attempt ${retryCount}/${maxRetries + 1}):`, error)
      
      if (retryCount > maxRetries) {
        throw new Error(`Upstage API failed after ${maxRetries + 1} attempts: ${error instanceof Error ? error.message : 'Unknown error'}`)
      }
      
      // Exponential backoff: wait 2^retryCount seconds
      const backoffMs = Math.pow(2, retryCount) * 1000
      console.log(`Retrying in ${backoffMs}ms...`)
      await new Promise(resolve => setTimeout(resolve, backoffMs))
    }
  }
}

async function performDeepAnalysis(riskId: string, title: string, description: string, originalText: string): Promise<any> {
  const schema = {
    type: "object",
    properties: {
      businessImpact: { type: "string" },
      recommendations: {
        type: "array",
        items: {
          type: "object",
          properties: {
            action: { type: "string" },
            priority: { type: "string", enum: ["low", "medium", "high"] },
            effort: { type: "string", enum: ["low", "medium", "high"] }
          },
          required: ["action", "priority", "effort"]
        }
      },
      suggestedNewText: { type: "string" }
    },
    required: ["businessImpact", "recommendations", "suggestedNewText"]
  }

  const messages: SolarLLMMessage[] = [
    {
      role: "system",
      content: `You are a contract advisor. Provide quick, practical suggestions to fix contract risks. Be concise and focus on actionable changes. IMPORTANT: Always write the suggested replacement text in the same language as the original text provided by the user.`
    },
    {
      role: "user",
      content: `Fix this contract risk:

**Risk:** ${title}
**Original Text:** "${originalText}"

Provide:
1. Brief business impact (1 sentence)
2. 2-3 practical actions to fix it (with priority: high/medium/low and effort: low/medium/high)
3. Suggested replacement text (MUST be in the same language as the original text)

Be concise and practical.`
    }
  ]

  const content = await callSolarLLM(messages, schema)
  return JSON.parse(content)
}

export async function POST(req: Request) {
  try {
    const { riskId, title, description, originalText } = await req.json()

    if (!riskId || !title) {
      return NextResponse.json({ error: "Risk ID and title are required" }, { status: 400 })
    }

    // Reset counters for this analysis
    llmCallCount = 0
    totalLLMTime = 0

    console.log(`Starting deep analysis for risk: ${riskId}`)

    try {
      const analysis = await performDeepAnalysis(riskId, title, description, originalText || "")

      console.log(`Deep analysis completed for risk: ${riskId} in ${totalLLMTime}ms with ${llmCallCount} LLM calls`)
      return NextResponse.json({
        ...analysis,
        llmStats: {
          calls: llmCallCount,
          totalTime: totalLLMTime
        }
      })
      
    } catch (analysisError) {
      console.error("Error during deep analysis:", analysisError)
      
      // Provide fallback analysis based on risk type
      let fallbackAnalysis
      
      if (title.toLowerCase().includes('liability')) {
        fallbackAnalysis = {
          businessImpact: "Could result in unlimited financial exposure far exceeding the contract value.",
          recommendations: [
            {
              action: "Add liability cap limiting damages to contract value",
              priority: "high",
              effort: "low"
            },
            {
              action: "Exclude consequential and indirect damages",
              priority: "high", 
              effort: "low"
            }
          ],
          suggestedNewText: "Liability under this Agreement shall be limited to the total amount paid in the twelve (12) months preceding the claim, excluding consequential, indirect, or punitive damages."
        }
      } else if (title.toLowerCase().includes('renewal') || title.toLowerCase().includes('termination')) {
        fallbackAnalysis = {
          businessImpact: "Risk of being locked into unfavorable terms without opportunity to renegotiate.",
          recommendations: [
            {
              action: "Change to opt-in renewal requiring explicit agreement",
              priority: "medium",
              effort: "low"
            },
            {
              action: "Extend notice period to 90 days",
              priority: "medium",
              effort: "low"
            }
          ],
          suggestedNewText: "This Agreement expires at the end of the initial term unless both parties agree in writing to renew. Either party may provide 90 days written notice of non-renewal."
        }
      } else if (title.toLowerCase().includes('indemnif')) {
        fallbackAnalysis = {
          businessImpact: "Potential responsibility for costs and damages beyond your control.",
          recommendations: [
            {
              action: "Limit indemnification to claims from your breach or negligence",
              priority: "high",
              effort: "low"
            },
            {
              action: "Exclude indemnification for their gross negligence",
              priority: "high",
              effort: "low"
            }
          ],
          suggestedNewText: "Each party indemnifies the other for third-party claims arising solely from their breach or negligent acts, excluding the other party's gross negligence or willful misconduct."
        }
      } else {
        // Generic fallback
        fallbackAnalysis = {
          businessImpact: "May result in unfavorable terms or unexpected obligations.",
          recommendations: [
            {
              action: "Review this clause with legal counsel",
              priority: "medium",
              effort: "medium"
            },
            {
              action: "Negotiate more balanced terms",
              priority: "medium",
              effort: "medium"
            }
          ],
          suggestedNewText: "Consult with legal counsel for appropriate replacement text that better protects your interests."
        }
      }
      
      return NextResponse.json(fallbackAnalysis)
    }

  } catch (error) {
    console.error("Error in deep-analysis API:", error)
    return NextResponse.json({ 
      error: "Failed to perform deep analysis",
      details: error instanceof Error ? error.message : "Unknown error"
    }, { status: 500 })
  }
} 