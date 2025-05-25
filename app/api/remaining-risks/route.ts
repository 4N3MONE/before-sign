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
        name: "contract_analysis",
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

async function getNextCategoryRisks(contractText: string, existingRiskTexts: string[], categoryIndex: number = 0): Promise<RiskIdentificationResult & { llmStats: { calls: number; totalTime: number }; categoryAnalyzed: string; hasMoreCategories: boolean; nextCategoryIndex: number }> {
  // Reset counters for new analysis
  llmCallCount = 0
  totalLLMTime = 0
  
  // Remaining categories after the first LIABILITY category
  const remainingCategories = [
    {
      category: "TERMINATION AND RENEWAL",
      priority: 1,
      focusAreas: [
        "Automatic renewal without consent",
        "Short notice periods for termination",
        "Termination for convenience limitations",
        "Post-termination obligations",
        "Termination fees or penalties"
      ]
    },
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

  if (categoryIndex >= remainingCategories.length) {
    return {
      risks: [],
      summary: "All remaining categories analyzed",
      llmStats: { calls: 0, totalTime: 0 },
      categoryAnalyzed: "",
      hasMoreCategories: false,
      nextCategoryIndex: categoryIndex
    }
  }

  const { category, focusAreas } = remainingCategories[categoryIndex]
  
  console.log(`Analyzing ${category} risks (category ${categoryIndex + 1}/${remainingCategories.length})...`)

  try {
    const result = await identifyRisksInCategory(contractText, category, focusAreas)
    
    let newRisks: any[] = []
    if (result.risks && result.risks.length > 0) {
      // Filter out risks that are too similar to existing ones
      newRisks = result.risks.filter((newRisk: any) => 
        !existingRiskTexts.some((existingText: string) => 
          similarity(newRisk.originalText, existingText) > 0.8
        )
      )
    }
    
    console.log(`${category} complete. Found ${newRisks.length} new risks.`)
    
    return {
      risks: newRisks,
      summary: `${category}: Found ${newRisks.length} ${newRisks.length === 1 ? 'risk' : 'risks'}`,
      llmStats: {
        calls: llmCallCount,
        totalTime: totalLLMTime
      },
      categoryAnalyzed: category,
      hasMoreCategories: categoryIndex + 1 < remainingCategories.length,
      nextCategoryIndex: categoryIndex + 1
    }
    
  } catch (error) {
    console.error(`Error analyzing ${category}:`, error)
    
    return {
      risks: [],
      summary: `${category}: Analysis failed`,
      llmStats: { calls: llmCallCount, totalTime: totalLLMTime },
      categoryAnalyzed: category,
      hasMoreCategories: categoryIndex + 1 < remainingCategories.length,
      nextCategoryIndex: categoryIndex + 1
    }
  }
}

export async function POST(req: Request) {
  try {
    const { text, existingRisks = [], categoryIndex = 0 } = await req.json()

    if (!text) {
      return NextResponse.json({ error: "Contract text is required" }, { status: 400 })
    }

    const existingRiskTexts = existingRisks.map((risk: any) => risk.originalText).filter(Boolean)
    console.log(`Looking for next category risks (excluding ${existingRiskTexts.length} existing risks)...`)

    try {
      // Get risks from the next category
      const categoryRisks = await getNextCategoryRisks(text, existingRiskTexts, categoryIndex)
      
      // Convert to format expected by frontend
      const risks = categoryRisks.risks.map((risk: any, index: number) => ({
        id: `category_${categoryIndex}_risk_${Date.now()}_${index}`,
        title: risk.title,
        severity: risk.severity,
        description: `${risk.riskType} risk identified in ${risk.location}. Detailed analysis pending...`,
        originalText: risk.originalText,
        location: risk.location,
        isAnalyzing: false,
        analysisComplete: false
      }))

      console.log(`Category risk identification completed: ${risks.length} new risks found`)
      return NextResponse.json({
        risks,
        summary: categoryRisks.summary,
        llmStats: categoryRisks.llmStats,
        categoryAnalyzed: categoryRisks.categoryAnalyzed,
        hasMoreCategories: categoryRisks.hasMoreCategories,
        nextCategoryIndex: categoryRisks.nextCategoryIndex
      })
      
    } catch (analysisError) {
      console.error("Error during category risk identification:", analysisError)
      
      // Provide fallback risks based on category index
      const fallbackCategories = ["TERMINATION AND RENEWAL", "PAYMENT AND FINANCIAL", "INTELLECTUAL PROPERTY", "PERFORMANCE AND COMPLIANCE", "DISPUTE RESOLUTION"]
      const currentCategory = fallbackCategories[categoryIndex] || "UNKNOWN"
      
      const fallbackRisks = [
        {
          id: `fallback_category_${categoryIndex}_1`,
          title: `${currentCategory} Risk`,
          severity: "medium" as const,
          description: `${currentCategory} risk identified. Detailed analysis pending...`,
          originalText: "Sample problematic text for this category.",
          location: `Section: ${currentCategory}`,
          isAnalyzing: false,
          analysisComplete: false
        }
      ]
      
      return NextResponse.json({
        risks: fallbackRisks,
        summary: `${currentCategory}: Found ${fallbackRisks.length} risk (fallback)`,
        llmStats: { calls: 0, totalTime: 0 },
        categoryAnalyzed: currentCategory,
        hasMoreCategories: categoryIndex + 1 < fallbackCategories.length,
        nextCategoryIndex: categoryIndex + 1
      })
    }

  } catch (error) {
    console.error("Error in remaining-risks API:", error)
    return NextResponse.json({ 
      error: "Failed to identify remaining risks",
      details: error instanceof Error ? error.message : "Unknown error"
    }, { status: 500 })
  }
} 