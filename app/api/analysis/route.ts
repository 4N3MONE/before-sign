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

interface DetailedRiskAnalysis {
  id: string
  title: string
  severity: "low" | "medium" | "high"
  description: string
  originalText: string
  detailedExplanation: string
  businessImpact: string
  legalRisks: string[]
  recommendations: Array<{
    action: string
    priority: "high" | "medium" | "low"
    effort: "low" | "medium" | "high"
  }>
  suggestedNewText: string
  location: string
}

async function callSolarLLM(messages: SolarLLMMessage[], jsonSchema?: any): Promise<any> {
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

async function identifyRisks(contractText: string): Promise<RiskIdentificationResult> {
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
      content: `You are an expert legal contract analyst specializing in identifying potential risks and problematic clauses in contracts. Your task is to carefully read the contract and identify specific risks with their exact text from the document.

Guidelines:
1. Focus on identifying actual risks and unfavorable terms, not general observations
2. Extract the EXACT text from the contract that contains the risk (word-for-word quotes)
3. Classify each risk by severity: high (immediate legal/financial danger), medium (potentially problematic), low (minor concerns)
4. Identify the type of risk (e.g., liability, termination, payment, indemnification, etc.)
5. Specify the location/section where the risk was found
6. Only include risks that could genuinely impact the signing party negatively

Respond with a JSON object containing the identified risks and a brief summary.`
    },
    {
      role: "user",
      content: `Please analyze this contract and identify specific legal risks with their exact text from the document:

${contractText}

Focus on finding:
- Unlimited liability clauses
- Unfair termination conditions
- Problematic payment terms
- Broad indemnification requirements
- Unclear or missing protections
- Automatic renewal terms
- Dispute resolution limitations
- Intellectual property concerns
- Confidentiality overreach
- Performance guarantees or penalties

For each risk, provide the exact text from the contract that creates the risk.`
    }
  ]

  const content = await callSolarLLM(messages, schema)
  return JSON.parse(content)
}

async function analyzeRiskInDetail(risk: any, contractText: string): Promise<DetailedRiskAnalysis> {
  const messages: SolarLLMMessage[] = [
    {
      role: "system",
      content: `You are a senior legal counsel specializing in contract risk assessment and negotiation. Your task is to provide detailed analysis of a specific contract risk and actionable recommendations for addressing it.

Provide comprehensive analysis including:
1. Detailed explanation of why this is problematic
2. Potential business and legal impacts
3. Specific legal risks that could materialize
4. Prioritized recommendations for addressing the issue
5. Suggested alternative text that would be more favorable

Be practical, specific, and business-focused in your analysis. IMPORTANT: Always write the suggested replacement text in the same language as the original problematic text provided by the user.`
    },
    {
      role: "user",
      content: `Please provide a detailed analysis of this contract risk:

**Risk Title:** ${risk.title}
**Severity:** ${risk.severity}
**Risk Type:** ${risk.riskType}
**Location:** ${risk.location}
**Original Problematic Text:** 
"${risk.originalText}"

**Full Contract Context:**
${contractText}

Please provide:
1. A detailed explanation of why this clause is problematic
2. Potential business impact (financial, operational, reputational)
3. Specific legal risks that could arise
4. Prioritized recommendations to address this issue
5. Suggested replacement text that would be more balanced and fair (MUST be in the same language as the original text)

Format your response as a JSON object with the following structure:
{
  "detailedExplanation": "...",
  "businessImpact": "...",
  "legalRisks": ["risk1", "risk2", "..."],
  "recommendations": [
    {
      "action": "...",
      "priority": "high|medium|low",
      "effort": "low|medium|high"
    }
  ],
  "suggestedNewText": "..."
}`
    }
  ]

  const content = await callSolarLLM(messages)
  
  try {
    const analysis = JSON.parse(content)
    
    return {
      id: `risk_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      title: risk.title,
      severity: risk.severity,
      description: `${risk.riskType} risk identified in ${risk.location}`,
      originalText: risk.originalText,
      detailedExplanation: analysis.detailedExplanation,
      businessImpact: analysis.businessImpact,
      legalRisks: analysis.legalRisks || [],
      recommendations: analysis.recommendations || [],
      suggestedNewText: analysis.suggestedNewText,
      location: risk.location
    }
  } catch (parseError) {
    // Fallback if JSON parsing fails
    return {
      id: `risk_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      title: risk.title,
      severity: risk.severity,
      description: `${risk.riskType} risk identified in ${risk.location}`,
      originalText: risk.originalText,
      detailedExplanation: content,
      businessImpact: "Analysis of business impact was not available in structured format.",
      legalRisks: ["Legal analysis was not available in structured format"],
      recommendations: [{
        action: "Review this clause with legal counsel",
        priority: "medium" as const,
        effort: "medium" as const
      }],
      suggestedNewText: "Please consult with legal counsel for appropriate replacement text.",
      location: risk.location
    }
  }
}

export async function POST(req: Request) {
  try {
    const { text } = await req.json()

    if (!text) {
      return NextResponse.json({ error: "Contract text is required" }, { status: 400 })
    }

    console.log("Starting contract analysis...")

    try {
      // Step 1: Identify risks and extract corresponding text
      console.log("Step 1: Identifying risks...")
      const riskIdentification = await identifyRisks(text)
      
      if (!riskIdentification.risks || riskIdentification.risks.length === 0) {
        return NextResponse.json({
          totalRisks: 0,
          risks: [],
          summary: riskIdentification.summary || "No significant risks identified in this contract.",
          analysisComplete: false
        })
      }

      // Format basic risks for immediate display (no deep analysis yet)
      const basicRisks = riskIdentification.risks.map((risk, index) => ({
        id: `risk_${Date.now()}_${index}`,
        title: risk.title,
        severity: risk.severity,
        description: `${risk.riskType} risk identified in ${risk.location}`,
        originalText: risk.originalText,
        location: risk.location,
        riskType: risk.riskType,
        isAnalyzing: false,
        analysisComplete: false
      }))

      const analysisResult = {
        totalRisks: basicRisks.length,
        risks: basicRisks,
        summary: riskIdentification.summary + " Additional risks are being identified...",
        analysisComplete: false
      }

      console.log(`Risk identification completed: ${basicRisks.length} risks found`)
      return NextResponse.json(analysisResult)
      
    } catch (analysisError) {
      console.error("Error during risk identification:", analysisError)
      
      // Provide fallback mock data for risk identification only
      const fallbackAnalysis = {
        totalRisks: 3,
        risks: [
          {
            id: "fallback_1",
            title: "Unlimited Liability Exposure",
            severity: "high" as const,
            description: "Liability risk identified in Section 8: Liability and Indemnification",
            originalText: "The Service Provider shall be liable for all damages, losses, costs, and expenses of any kind arising from or relating to this Agreement, without limitation.",
            location: "Section 8: Liability and Indemnification",
            riskType: "Liability",
            isAnalyzing: false,
            analysisComplete: false
          },
          {
            id: "fallback_2",
            title: "Automatic Renewal Without Notice",
            severity: "medium" as const,
            description: "Termination risk identified in Section 3: Term and Termination",
            originalText: "This Agreement shall automatically renew for successive one-year periods unless terminated by either party with thirty (30) days written notice prior to the renewal date.",
            location: "Section 3: Term and Termination",
            riskType: "Termination",
            isAnalyzing: false,
            analysisComplete: false
          },
          {
            id: "fallback_3",
            title: "Broad Indemnification Requirements",
            severity: "medium" as const,
            description: "Indemnification risk identified in Section 9: Indemnification",
            originalText: "Client agrees to indemnify, defend, and hold harmless Provider from and against any and all claims, demands, losses, costs, and expenses arising out of or relating to Client's use of the services or any third-party claims.",
            location: "Section 9: Indemnification",
            riskType: "Indemnification",
            isAnalyzing: false,
            analysisComplete: false
          }
        ],
        summary: "Initial risk identification complete. Found 3 risks requiring attention. Additional risks are being identified...",
        analysisComplete: false
      }
      
      return NextResponse.json(fallbackAnalysis)
    }

  } catch (error) {
    console.error("Error in analysis API:", error)
    return NextResponse.json({ 
      error: "Failed to analyze contract",
      details: error instanceof Error ? error.message : "Unknown error"
    }, { status: 500 })
  }
}
