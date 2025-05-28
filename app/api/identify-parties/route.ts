import { NextRequest, NextResponse } from 'next/server'

interface Party {
  id: string
  name: string
  description: string
  type: 'individual' | 'company' | 'organization' | 'other'
  aliases?: string[]
}

export async function POST(request: NextRequest) {
  try {
    const { text } = await request.json()

    if (!text) {
      return NextResponse.json({ error: 'No text provided' }, { status: 400 })
    }

    const UPSTAGE_API_KEY = process.env.UPSTAGE_API_KEY
    if (!UPSTAGE_API_KEY) {
      console.error('UPSTAGE_API_KEY is not configured')
      return NextResponse.json(
        { error: 'UPSTAGE_API_KEY environment variable is not configured' },
        { status: 500 }
      )
    }

    const startTime = Date.now()

    // Prepare the prompt for party identification
    const prompt = `
Analyze the following contract text and identify all parties involved. For each party, provide:
1. A unique identifier (short name)
2. Full name as mentioned in the contract
3. Brief description of their role
4. Type (individual, company, organization, or other)
5. Any aliases or alternative names used in the document

Return the response in the following JSON format:
{
  "parties": [
    {
      "id": "party1",
      "name": "Full Party Name",
      "description": "Brief description of their role in the contract",
      "type": "company|individual|organization|other",
      "aliases": ["Alternative Name 1", "Alternative Name 2"]
    }
  ],
  "analysis": "Brief explanation of the parties and their relationships"
}

Contract text:
${text}
`

    // Call Upstage API
    const response = await fetch('https://api.upstage.ai/v1/solar/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${UPSTAGE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'solar-1-mini-chat',
        messages: [
          {
            role: 'system',
            content: 'You are a legal expert specializing in contract analysis. Your task is to identify all parties in a contract and their roles. Always respond with valid JSON format.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.1,
        max_tokens: 2000
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('Upstage API error:', response.status, errorText)
      throw new Error(`Upstage API error: ${response.status}`)
    }

    const data = await response.json()
    const endTime = Date.now()
    const processingTime = endTime - startTime

    // Extract and parse the LLM response
    let result
    try {
      const content = data.choices[0]?.message?.content || ''
      console.log('Raw LLM response for parties:', content)
      
      // Try to extract JSON from the response
      const jsonMatch = content.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        result = JSON.parse(jsonMatch[0])
      } else {
        throw new Error('No JSON found in response')
      }
    } catch (parseError) {
      console.error('Error parsing LLM response:', parseError)
      console.error('Raw content:', data.choices[0]?.message?.content)
      
      // Fallback: create a basic party structure
      result = {
        parties: [
          {
            id: 'party1',
            name: 'First Party',
            description: 'Unable to automatically identify - please review contract manually',
            type: 'other',
            aliases: []
          },
          {
            id: 'party2',
            name: 'Second Party',
            description: 'Unable to automatically identify - please review contract manually',
            type: 'other',
            aliases: []
          }
        ],
        analysis: 'Automatic party identification failed. Please review the contract manually to identify the parties.'
      }
    }

    // Ensure we have at least basic party information
    if (!result.parties || result.parties.length === 0) {
      result.parties = [
        {
          id: 'party1',
          name: 'First Party',
          description: 'Primary party in the contract',
          type: 'other',
          aliases: []
        },
        {
          id: 'party2',
          name: 'Second Party',
          description: 'Secondary party in the contract',
          type: 'other',
          aliases: []
        }
      ]
    }

    // Add unique IDs if missing
    result.parties = result.parties.map((party: any, index: number) => ({
      ...party,
      id: party.id || `party${index + 1}`,
      aliases: party.aliases || []
    }))

    return NextResponse.json({
      success: true,
      parties: result.parties,
      analysis: result.analysis || 'Parties identified successfully',
      llmStats: {
        calls: 1,
        totalTime: processingTime
      }
    })

  } catch (error) {
    console.error('Error in party identification:', error)
    return NextResponse.json(
      { error: 'Failed to identify parties in the contract' },
      { status: 500 }
    )
  }
} 