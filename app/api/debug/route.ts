import { NextResponse } from "next/server"

export async function GET() {
  try {
    // Get environment variables
    const apiKey = process.env.UPSTAGE_API_KEY
    const modelName = process.env.UPSTAGE_MODEL_NAME || "solar-pro2-preview"
    
    // Basic API connectivity test
    let apiTest = {
      canConnect: false,
      error: null as string | null,
      statusCode: null as number | null,
      responseTime: null as number | null
    }
    
    try {
      const startTime = Date.now()
      // Test the actual chat completions endpoint with a minimal request
      const testResponse = await fetch('https://api.upstage.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: "solar-pro2-preview",
          messages: [{ role: "user", content: "Test" }],
        }),
        signal: AbortSignal.timeout(10000) // 10 second timeout
      })
      
      const endTime = Date.now()
      apiTest.responseTime = endTime - startTime
      apiTest.statusCode = testResponse.status
      apiTest.canConnect = testResponse.ok
      
      if (!testResponse.ok) {
        const errorText = await testResponse.text()
        apiTest.error = `${testResponse.status} - ${errorText}`
      } else {
        apiTest.error = "Chat completions endpoint working!"
      }
    } catch (error) {
      apiTest.error = error instanceof Error ? error.message : 'Unknown error'
    }
    
    const debugInfo = {
      timestamp: new Date().toISOString(),
      environment: {
        hasApiKey: !!apiKey,
        apiKeyLength: apiKey?.length || 0,
        apiKeyPreview: apiKey ? `${apiKey.substring(0, 10)}...${apiKey.substring(apiKey.length - 4)}` : 'MISSING',
        modelName,
        modelNameSource: process.env.UPSTAGE_MODEL_NAME ? 'environment_variable' : 'default_fallback',
        nodeEnv: process.env.NODE_ENV
      },
      apiConnectivity: apiTest,
      urls: {
        chatCompletions: 'https://api.upstage.ai/v1/chat/completions',
        models: 'https://api.upstage.ai/v1/models'
      }
    }
    
    return NextResponse.json(debugInfo, { status: 200 })
    
  } catch (error) {
    console.error('Debug endpoint error:', error)
    return NextResponse.json({
      error: 'Debug endpoint failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
} 