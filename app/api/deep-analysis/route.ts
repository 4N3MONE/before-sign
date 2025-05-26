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
  const modelName = process.env.UPSTAGE_MODEL_NAME || "solar-pro2-preview"
  
  // Debug environment variables
  console.log(`🔧 [deep-analysis] Environment Check:`, {
    has_api_key: !!apiKey,
    api_key_length: apiKey?.length,
    api_key_preview: apiKey ? `${apiKey.substring(0, 10)}...${apiKey.substring(apiKey.length - 4)}` : 'MISSING',
    model_name: modelName,
    model_name_source: process.env.UPSTAGE_MODEL_NAME ? 'env_var' : 'default'
  })
  
  if (!apiKey) {
    console.error(`❌ [deep-analysis] UPSTAGE_API_KEY environment variable is missing!`)
    throw new Error("UPSTAGE_API_KEY environment variable is required")
  }

  const requestBody: any = {
    model: modelName,
    messages: messages,
    temperature: 0.1,
    max_tokens: 4000,
    top_p: 0.9,
  }

  // Add reasoning parameters for solar-pro2-preview model
  if (modelName === "solar-pro2-preview") {
    requestBody.reasoning_effort = "high"
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

  // Debug logging
  console.log(`🔥 [deep-analysis] LLM Call #${llmCallCount} - Model: ${modelName}`)
  console.log(`📝 [deep-analysis] Request Body:`, {
    model: requestBody.model,
    temperature: requestBody.temperature,
    max_tokens: requestBody.max_tokens,
    top_p: requestBody.top_p,
    reasoning_effort: requestBody.reasoning_effort,
    messages_count: requestBody.messages?.length,
    has_json_schema: !!requestBody.response_format,
    first_message_preview: requestBody.messages?.[0]?.content?.substring(0, 200) + '...'
  })

  // Retry logic with exponential backoff
  const maxRetries = 3
  let retryCount = 0
  
  while (retryCount <= maxRetries) {
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 300000) // 300 seconds timeout

      console.log(`📡 [deep-analysis] Making API request to Upstage (attempt ${retryCount + 1}/${maxRetries + 1})...`)
      
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

      console.log(`📊 [deep-analysis] Response Status: ${response.status} ${response.statusText}`)
      console.log(`📊 [deep-analysis] Response Headers:`, Object.fromEntries(response.headers.entries()))

      if (!response.ok) {
        const errorText = await response.text()
        console.error(`❌ [deep-analysis] Error Response Body:`, errorText)
        
        // Try to parse error as JSON for better logging
        try {
          const errorJson = JSON.parse(errorText)
          console.error(`❌ [deep-analysis] Parsed Error:`, errorJson)
        } catch (parseError) {
          console.error(`❌ [deep-analysis] Raw Error Text:`, errorText)
        }
        
        throw new Error(`Upstage SolarLLM API error: ${response.status} - ${errorText}`)
      }

      const responseText = await response.text()
      console.log(`✅ [deep-analysis] Raw Response Body (first 500 chars):`, responseText.substring(0, 500) + (responseText.length > 500 ? '...' : ''))
      
      const result: SolarLLMResponse = JSON.parse(responseText)
      console.log(`✅ [deep-analysis] Parsed Response:`, {
        id: result.id,
        model: result.model,
        choices_count: result.choices?.length,
        finish_reason: result.choices?.[0]?.finish_reason,
        content_length: result.choices?.[0]?.message?.content?.length,
        usage: result.usage
      })
      
      if (!result.choices || result.choices.length === 0) {
        console.error(`❌ [deep-analysis] No choices in response:`, result)
        throw new Error("No response from SolarLLM")
      }

      const endTime = Date.now()
      const duration = endTime - startTime
      totalLLMTime += duration
      
      console.log(`⏱️ [deep-analysis] Call completed in ${duration}ms (total: ${totalLLMTime}ms)`)
      console.log(`📋 [deep-analysis] Response Content Preview:`, result.choices[0].message.content.substring(0, 200) + '...')

      return result.choices[0].message.content

    } catch (error) {
      retryCount++
      console.error(`❌ [deep-analysis] Upstage API call failed (attempt ${retryCount + 1}/${maxRetries + 1}):`, error)
      
      if (error instanceof Error) {
        console.error(`❌ [deep-analysis] Error Type: ${error.constructor.name}`)
        console.error(`❌ [deep-analysis] Error Message: ${error.message}`)
        console.error(`❌ [deep-analysis] Error Stack:`, error.stack)
      }
      
      if (retryCount > maxRetries) {
        console.error(`🚫 [deep-analysis] All retry attempts exhausted. Final error:`, error)
        throw new Error(`Upstage API failed after ${maxRetries + 1} attempts: ${error instanceof Error ? error.message : 'Unknown error'}`)
      }
      
      // Exponential backoff: wait 2^retryCount seconds
      const backoffMs = Math.pow(2, retryCount) * 1000
      console.log(`⏳ [deep-analysis] Retrying in ${backoffMs}ms...`)
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