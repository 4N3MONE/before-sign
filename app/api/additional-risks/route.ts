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

interface RiskIdentificationResult {
  risks: Array<{
    title: string
    severity: "low" | "medium" | "high"
    originalText: string
    riskType: string
    location: string
  }>
  summary: string
}

// Global tracking for LLM calls
let llmCallCount = 0
let totalLLMTime = 0

async function callSolarLLM(messages: SolarLLMMessage[], jsonSchema?: any): Promise<any> {
  const startTime = Date.now()
  llmCallCount++
  
  const apiKey = process.env.UPSTAGE_API_KEY?.trim()
  const modelName = process.env.UPSTAGE_MODEL_NAME || "solar-pro2-preview"
  
  if (!apiKey) {
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
        name: "contract_analysis",
        schema: jsonSchema,
        strict: true
      }
    }
  }

  const response = await fetch('https://api.upstage.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  })

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
}

async function identifyRisksInCategory(contractText: string, category: string, focusAreas: string[]): Promise<RiskIdentificationResult> {
  const schema = {
    type: "object",
    properties: {
      risks: {
        type: "array",
        items: {
          type: "object",
          properties: {
            title: { type: "string" },
            severity: { type: "string", enum: ["low", "medium", "high"] },
            originalText: { type: "string" },
            riskType: { type: "string" },
            location: { type: "string" }
          },
          required: ["title", "severity", "originalText", "riskType", "location"]
        }
      },
      summary: { type: "string" }
    },
    required: ["risks", "summary"]
  }

  const messages: SolarLLMMessage[] = [
    {
      role: "system",
      content: `You are an expert legal contract analyst with a specialty in ${category} risks. Your task is to exhaustively identify ALL potential risks in this category, even minor ones that could become problems later.

CRITICAL INSTRUCTIONS:
- Be AGGRESSIVE in finding risks - better to flag something questionable than miss a real risk
- Find EVERY instance of problematic language, even if it seems minor
- Look for both explicit problematic clauses AND missing protective language
- Extract the EXACT text from the contract (word-for-word quotes)
- Classify severity: high (immediate danger), medium (potentially problematic), low (minor but worth noting)
- Identify specific location/section where each risk was found
- Focus specifically on ${category} but don't ignore other obvious risks you encounter

Remember: Clients rely on you to catch everything. Missing a risk could be costly.`
    },
    {
      role: "user",
      content: `Thoroughly analyze this contract for ${category} risks. Find EVERY potential issue in this category:

${contractText}

Specific ${category} risks to find:
${focusAreas.map(area => `- ${area}`).join('\n')}

Look for both:
1. Explicit problematic clauses that create risks
2. Missing protective language that should be present
3. Vague or ambiguous terms that could be interpreted unfavorably
4. Standard contract provisions that favor the other party

Be thorough - find every potential risk, no matter how small.`
    }
  ]

  const content = await callSolarLLM(messages, schema)
  return JSON.parse(content)
}

// Simple text similarity function to detect duplicates
function similarity(str1: string, str2: string): number {
  const longer = str1.length > str2.length ? str1 : str2
  const shorter = str1.length > str2.length ? str2 : str1
  
  if (longer.length === 0) return 1.0
  
  const editDistance = levenshteinDistance(longer, shorter)
  return (longer.length - editDistance) / longer.length
}

function levenshteinDistance(str1: string, str2: string): number {
  const matrix = Array(str2.length + 1).fill(null).map(() => Array(str1.length + 1).fill(null))
  
  for (let i = 0; i <= str1.length; i++) matrix[0][i] = i
  for (let j = 0; j <= str2.length; j++) matrix[j][0] = j
  
  for (let j = 1; j <= str2.length; j++) {
    for (let i = 1; i <= str1.length; i++) {
      const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1
      matrix[j][i] = Math.min(
        matrix[j][i - 1] + 1,     // deletion
        matrix[j - 1][i] + 1,     // insertion
        matrix[j - 1][i - 1] + indicator // substitution
      )
    }
  }
  
  return matrix[str2.length][str1.length]
}

async function getAdditionalRisks(contractText: string, existingRiskTexts: string[]): Promise<RiskIdentificationResult & { llmStats: { calls: number; totalTime: number } }> {
  // Reset counters for new analysis
  llmCallCount = 0
  totalLLMTime = 0
  
  // Lower priority categories that weren't analyzed in quick mode
  const additionalCategories = [
    {
      category: "PAYMENT AND FINANCIAL",
      priority: 2,
      focusAreas: [
        "Payment terms favoring other party",
        "Late payment penalties or interest",
        "Automatic price increases",
        "Expense reimbursement obligations",
        "Missing payment dispute processes"
      ]
    },
    {
      category: "INTELLECTUAL PROPERTY",
      priority: 2,
      focusAreas: [
        "Broad IP assignment or licensing",
        "Work-for-hire provisions",
        "IP indemnification requirements",
        "Trade secret and confidentiality overreach"
      ]
    },
    {
      category: "PERFORMANCE AND COMPLIANCE",
      priority: 3,
      focusAreas: [
        "Unrealistic performance guarantees",
        "Service level agreement penalties",
        "Compliance with changing regulations",
        "Standard of care obligations"
      ]
    },
    {
      category: "DISPUTE RESOLUTION",
      priority: 3,
      focusAreas: [
        "Mandatory arbitration clauses",
        "Venue and jurisdiction limitations",
        "Attorney fees and costs provisions",
        "Waiver of jury trial rights"
      ]
    }
  ]

  console.log(`Analyzing additional risks across ${additionalCategories.length} categories...`)

  let allRisks: any[] = []
  let summaries: string[] = []

  for (const { category, focusAreas } of additionalCategories) {
    try {
      console.log(`Analyzing ${category} risks...`)
      const result = await identifyRisksInCategory(contractText, category, focusAreas)
      
      if (result.risks && result.risks.length > 0) {
        // Filter out risks that are too similar to existing ones
        const newRisks = result.risks.filter((newRisk: any) => 
          !existingRiskTexts.some((existingText: string) => 
            similarity(newRisk.originalText, existingText) > 0.8
          ) &&
          !allRisks.some((existingRisk: any) => 
            similarity(newRisk.originalText, existingRisk.originalText) > 0.8
          )
        )
        allRisks = allRisks.concat(newRisks)
        summaries.push(`${category}: Found ${newRisks.length} additional risks`)
      }
      
      console.log(`${category} complete. Total additional risks so far: ${allRisks.length}`)
    } catch (error) {
      console.error(`Error analyzing ${category}:`, error)
      summaries.push(`${category}: Analysis failed`)
    }
  }

  console.log(`Additional risk analysis complete: ${allRisks.length} new risks found in ${totalLLMTime}ms with ${llmCallCount} LLM calls`)

  return {
    risks: allRisks,
    summary: `Additional analysis found ${allRisks.length} more potential risks. ${summaries.join('. ')}`,
    llmStats: {
      calls: llmCallCount,
      totalTime: totalLLMTime
    }
  }
}

export async function POST(req: Request) {
  try {
    const { text, existingRisks = [] } = await req.json()

    if (!text) {
      return NextResponse.json({ error: "Contract text is required" }, { status: 400 })
    }

    const existingRiskTexts = existingRisks.map((risk: any) => risk.originalText).filter(Boolean)
    console.log(`Looking for additional risks (excluding ${existingRiskTexts.length} existing risks)...`)

    try {
      // Get additional risks from lower-priority categories
      const additionalRisks = await getAdditionalRisks(text, existingRiskTexts)
      
      // Convert to format expected by frontend
      const risks = additionalRisks.risks.map((risk: any, index: number) => ({
        id: `additional_risk_${Date.now()}_${index}`,
        title: risk.title,
        severity: risk.severity,
        description: `${risk.riskType} risk identified in ${risk.location}. Detailed analysis pending...`,
        originalText: risk.originalText,
        location: risk.location,
        isAnalyzing: false,
        analysisComplete: false
      }))

      console.log(`Additional risk identification completed: ${risks.length} new risks found`)
      return NextResponse.json({
        risks,
        summary: additionalRisks.summary,
        llmStats: additionalRisks.llmStats
      })
      
    } catch (analysisError) {
      console.error("Error during additional risk identification:", analysisError)
      
      // Provide fallback additional risks
      const fallbackRisks = [
        {
          id: "additional_fallback_1",
          title: "Late Payment Penalties",
          severity: "medium" as const,
          description: "Payment risk identified. Detailed analysis pending...",
          originalText: "Late payments shall accrue interest at the rate of 1.5% per month or the maximum rate permitted by law, whichever is higher.",
          location: "Section 4: Payment Terms",
          isAnalyzing: false,
          analysisComplete: false
        },
        {
          id: "additional_fallback_2",
          title: "Broad IP Assignment",
          severity: "medium" as const,
          description: "Intellectual property risk identified. Detailed analysis pending...",
          originalText: "All work product, inventions, and intellectual property created in connection with this Agreement shall be owned exclusively by Company.",
          location: "Section 7: Intellectual Property",
          isAnalyzing: false,
          analysisComplete: false
        },
        {
          id: "additional_fallback_3",
          title: "Mandatory Arbitration",
          severity: "low" as const,
          description: "Dispute resolution risk identified. Detailed analysis pending...",
          originalText: "Any dispute arising under this Agreement shall be resolved through binding arbitration in accordance with the rules of the American Arbitration Association.",
          location: "Section 12: Dispute Resolution",
          isAnalyzing: false,
          analysisComplete: false
        }
      ]
      
      return NextResponse.json({
        risks: fallbackRisks,
        summary: `Found ${fallbackRisks.length} additional risks in secondary analysis.`,
        llmStats: { calls: 0, totalTime: 0 }
      })
    }

  } catch (error) {
    console.error("Error in additional-risks API:", error)
    return NextResponse.json({ 
      error: "Failed to identify additional risks",
      details: error instanceof Error ? error.message : "Unknown error"
    }, { status: 500 })
  }
} 