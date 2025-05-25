import { NextResponse } from "next/server"

interface UpstageDocumentParseResponse {
  api: string
  content: {
    html: string
    markdown: string
    text: string
  }
  elements: Array<{
    category: string
    content: {
      html: string
      markdown: string
      text: string
    }
    coordinates: Array<{
      x: number
      y: number
    }>
    id: number
    page: number
  }>
  model: string
  usage: {
    pages: number
  }
}

async function parseDocumentWithUpstage(file: File): Promise<UpstageDocumentParseResponse> {
  const apiKey = process.env.UPSTAGE_API_KEY
  
  if (!apiKey) {
    throw new Error("UPSTAGE_API_KEY environment variable is required")
  }

  const formData = new FormData()
  formData.append('document', file)

  const response = await fetch('https://api.upstage.ai/v1/document-ai/document-parse', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
    },
    body: formData,
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Upstage API error: ${response.status} - ${errorText}`)
  }

  return await response.json()
}

export async function POST(req: Request) {
  try {
    const formData = await req.formData()
    const file = formData.get("file") as File | null

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 })
    }

    // Validate file type
    const allowedTypes = ['pdf', 'doc', 'docx']
    const fileExtension = file.name.toLowerCase().split('.').pop()
    const isValidType = allowedTypes.includes(fileExtension || '') || 
                       file.type.includes('pdf') || 
                       file.type.includes('msword') || 
                       file.type.includes('wordprocessingml')
    
    if (!isValidType) {
      return NextResponse.json({ error: "Only PDF, DOC, and DOCX files are supported" }, { status: 400 })
    }

    try {
      // Parse document using Upstage Document Parse API
      const parseResult = await parseDocumentWithUpstage(file)
      
      // Extract text content for analysis
      const textContent = parseResult.content.text || parseResult.content.html
      
      return NextResponse.json({
        success: true,
        message: "Document uploaded and parsed successfully",
        fileName: file.name,
        fileSize: file.size,
        parsedContent: {
          text: textContent,
          html: parseResult.content.html,
          elements: parseResult.elements,
          pages: parseResult.usage.pages
        }
      })
      
    } catch (parseError) {
      console.error("Error parsing document with Upstage:", parseError)
      return NextResponse.json({ 
        error: "Failed to parse document", 
        details: parseError instanceof Error ? parseError.message : "Unknown error"
      }, { status: 500 })
    }

  } catch (error) {
    console.error("Error uploading file:", error)
    return NextResponse.json({ error: "Failed to upload file" }, { status: 500 })
  }
}
