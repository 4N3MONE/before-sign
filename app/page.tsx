"use client"

import React, { useState, useCallback } from "react"
import { Upload, FileText, AlertTriangle, CheckCircle, Lightbulb, ArrowLeft, BookOpen, Shield, Target, Clock, Brain } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Alert, AlertDescription } from "@/components/ui/alert"

interface Recommendation {
  action: string
  priority: "high" | "medium" | "low"
  effort: "low" | "medium" | "high"
}

interface Risk {
  id: string
  title: string
  severity: "low" | "medium" | "high"
  description: string
  originalText?: string
  businessImpact?: string
  recommendations?: Recommendation[]
  suggestedNewText?: string
  location?: string
  isAnalyzing?: boolean
  analysisComplete?: boolean
}

interface AnalysisResult {
  totalRisks: number
  risks: Risk[]
  summary: string
  analysisComplete: boolean
  llmStats?: {
    totalCalls: number
    totalTime: number
    parseTime?: number
    identifyTime?: number
    deepAnalysisTime?: number
  }
}

// Helper function to extract section number from location string
const extractSectionNumber = (location?: string): number | null => {
  if (!location) return null
  
  // Match patterns like "Section 1", "Article 2", "Clause 3.1", "§ 4", etc.
  const patterns = [
    /(?:section|article|clause|§)\s*(\d+(?:\.\d+)*)/i,
    /(\d+(?:\.\d+)*)\s*\.?\s*(?:section|article|clause)/i,
    /^(\d+(?:\.\d+)*)/  // Just a number at the start
  ]
  
  for (const pattern of patterns) {
    const match = location.match(pattern)
    if (match) {
      // Convert "3.1" to 3.1, "5" to 5.0 for proper sorting
      const parts = match[1].split('.')
      const mainSection = parseInt(parts[0], 10)
      const subSection = parts[1] ? parseInt(parts[1], 10) / 100 : 0
      return mainSection + subSection
    }
  }
  
  return null
}

// Helper function to sort risks by section number
const sortRisksBySection = (risks: Risk[]): Risk[] => {
  return [...risks].sort((a, b) => {
    const sectionA = extractSectionNumber(a.location)
    const sectionB = extractSectionNumber(b.location)
    
    // If both have section numbers, sort by section number
    if (sectionA !== null && sectionB !== null) {
      return sectionA - sectionB
    }
    
    // If only one has a section number, prioritize it
    if (sectionA !== null && sectionB === null) {
      return -1
    }
    if (sectionA === null && sectionB !== null) {
      return 1
    }
    
    // If neither has section numbers, maintain original order
    return 0
  })
}



export default function BeforeSignApp() {
  const [currentStep, setCurrentStep] = useState<"upload" | "parsing" | "identifying" | "results">("upload")
  const [uploadedFile, setUploadedFile] = useState<File | null>(null)
  const [parseProgress, setParseProgress] = useState(0)
  const [identifyProgress, setIdentifyProgress] = useState(0)
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [currentAnalyzingRisk, setCurrentAnalyzingRisk] = useState<string | null>(null)
  const [deepAnalysisProgress, setDeepAnalysisProgress] = useState({ current: 0, total: 0 })
  const [categoryProgress, setCategoryProgress] = useState({ current: 0, total: 5, currentCategory: "" })
  const [isGettingAdditionalRisks, setIsGettingAdditionalRisks] = useState(false)
  const [currentProgress, setCurrentProgress] = useState<string>("")
  const [isGettingRemainingRisks, setIsGettingRemainingRisks] = useState(false)
  const [llmStats, setLlmStats] = useState({
    totalCalls: 0,
    totalTime: 0,
    parseTime: 0,
    identifyTime: 0,
    deepAnalysisTime: 0
  })

  const createDiffText = (originalText: string, suggestedText: string): string => {
    if (!originalText || !suggestedText) return ""
    
    // Split texts into words for better diffing
    const originalWords = originalText.split(/(\s+)/)
    const suggestedWords = suggestedText.split(/(\s+)/)
    
    // Simple LCS-based diff algorithm
    const lcs = longestCommonSubsequence(originalWords, suggestedWords)
    
    let result = ""
    let origIndex = 0
    let suggIndex = 0
    let lcsIndex = 0
    
    while (origIndex < originalWords.length || suggIndex < suggestedWords.length) {
      // If we have a common word at current LCS position
      if (lcsIndex < lcs.length && 
          origIndex < originalWords.length && 
          suggIndex < suggestedWords.length &&
          originalWords[origIndex] === lcs[lcsIndex] && 
          suggestedWords[suggIndex] === lcs[lcsIndex]) {
        // Add the common word
        result += originalWords[origIndex]
        origIndex++
        suggIndex++
        lcsIndex++
      } else {
        // Handle deletions (words in original but not in suggested)
        while (origIndex < originalWords.length && 
               (lcsIndex >= lcs.length || originalWords[origIndex] !== lcs[lcsIndex])) {
          result += `~~${originalWords[origIndex]}~~`
          origIndex++
        }
        
        // Handle insertions (words in suggested but not in original)
        while (suggIndex < suggestedWords.length && 
               (lcsIndex >= lcs.length || suggestedWords[suggIndex] !== lcs[lcsIndex])) {
          result += `**${suggestedWords[suggIndex]}**`
          suggIndex++
        }
      }
    }
    
    return result
  }

  const longestCommonSubsequence = (arr1: string[], arr2: string[]): string[] => {
    const m = arr1.length
    const n = arr2.length
    const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0))
    
    // Build LCS table
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (arr1[i - 1] === arr2[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1] + 1
        } else {
          dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1])
        }
      }
    }
    
    // Reconstruct LCS
    const lcs: string[] = []
    let i = m, j = n
    while (i > 0 && j > 0) {
      if (arr1[i - 1] === arr2[j - 1]) {
        lcs.unshift(arr1[i - 1])
        i--
        j--
      } else if (dp[i - 1][j] > dp[i][j - 1]) {
        i--
      } else {
        j--
      }
    }
    
    return lcs
  }

  const updateRiskAnalysis = useCallback((riskId: string, updatedRisk: Partial<Risk>) => {
    setAnalysisResult(prev => {
      if (!prev) return prev
      
      const updatedRisks = prev.risks.map(risk => 
        risk.id === riskId 
          ? { ...risk, ...updatedRisk }
          : risk
      )
      
      // Re-sort risks to maintain order, especially if location was updated
      const sortedRisks = sortRisksBySection(updatedRisks)
      
      return {
        ...prev,
        risks: sortedRisks
      }
    })
  }, [])

  const getNextCategoryRisks = async (contractText: string, existingRisks: Risk[], categoryIndex: number = 0) => {
    try {
      const response = await fetch('/api/remaining-risks', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          text: contractText,
          existingRisks: existingRisks,
          categoryIndex: categoryIndex
        }),
      })

      if (response.ok) {
        const categoryRisks = await response.json()
        
        // Update LLM stats
        if (categoryRisks.llmStats) {
          setLlmStats(prev => ({
            ...prev,
            totalCalls: prev.totalCalls + categoryRisks.llmStats.calls,
            totalTime: prev.totalTime + categoryRisks.llmStats.totalTime,
            identifyTime: prev.identifyTime + categoryRisks.llmStats.totalTime
          }))
        }
        
        // Update category progress
        if (categoryRisks.categoryAnalyzed) {
          setCategoryProgress({
            current: categoryIndex + 1,
            total: 5,
            currentCategory: categoryRisks.categoryAnalyzed
          })
        }
        
        let allRisks: Risk[] = []
        
        // Add new risks to existing analysis result IMMEDIATELY
        if (categoryRisks.risks && categoryRisks.risks.length > 0) {
          setAnalysisResult(prev => {
            if (!prev) return prev
            
            const newRisks = [...prev.risks, ...categoryRisks.risks.map((risk: Risk) => ({
              ...risk,
              isAnalyzing: false,
              analysisComplete: false
            }))]
            
            // Sort risks by section number
            const updatedRisks = sortRisksBySection(newRisks)
            allRisks = updatedRisks
            
            return {
              ...prev,
              totalRisks: prev.totalRisks + categoryRisks.risks.length,
              risks: updatedRisks,
              summary: `${prev.summary} ${categoryRisks.summary}.`
            }
          })
        } else {
          // Even if no new risks found, we still need to get all risks
          setAnalysisResult(prev => {
            if (prev) {
              allRisks = prev.risks
              // Update summary even if no risks found, but maintain current sorting
              return {
                ...prev,
                risks: sortRisksBySection(prev.risks), // Re-sort in case location info was updated
                summary: `${prev.summary} ${categoryRisks.summary}.`
              }
            }
            return prev
          })
        }
        
        // Check if there are more categories to analyze
        if (categoryRisks.hasMoreCategories) {
          // Continue with next category
          console.log(`Continuing with next category (${categoryRisks.nextCategoryIndex})...`)
          getNextCategoryRisks(contractText, allRisks, categoryRisks.nextCategoryIndex)
        } else {
          // All categories done - update summary and start deep analysis
          setAnalysisResult(prev => {
            if (!prev) return prev
            return {
              ...prev,
              summary: `Risk identification complete! Found ${prev.totalRisks} total risks. Starting detailed analysis...`
            }
          })
          
          setIsGettingRemainingRisks(false)
          setCategoryProgress({ current: 0, total: 5, currentCategory: "" })
          
          // NOW start deep analysis for ALL risks since risk identification is complete
          console.log('All risk identification complete. Starting deep analysis for', allRisks.length, 'risks...')
          
          // Get the current risks from state to ensure we have the latest
          setAnalysisResult(prev => {
            if (prev && prev.risks.length > 0) {
              console.log('Starting deep analysis with', prev.risks.length, 'risks from state')
              performDeepAnalysis(prev.risks)
            } else {
              console.log('No risks found in state, using allRisks:', allRisks.length)
              if (allRisks.length > 0) {
                performDeepAnalysis(allRisks)
              }
            }
            return prev
          })
        }
      }
    } catch (error) {
      console.error('Failed to get category risks:', error)
      setIsGettingRemainingRisks(false)
    }
  }

  const performDeepAnalysis = async (risks: Risk[]) => {
    console.log(`Starting deep analysis for ${risks.length} risks...`)
    
    if (!risks || risks.length === 0) {
      console.log('No risks to analyze')
      return
    }
    
    // Initialize progress tracking
    setDeepAnalysisProgress({ current: 0, total: risks.length })
    
    for (let i = 0; i < risks.length; i++) {
      const risk = risks[i]
      console.log(`Deep analyzing risk ${i + 1}/${risks.length}: ${risk.id} - ${risk.title}`)
      setCurrentAnalyzingRisk(risk.id)
      setDeepAnalysisProgress({ current: i + 1, total: risks.length })
      
      // Mark this risk as being analyzed
      updateRiskAnalysis(risk.id, { isAnalyzing: true })

      try {
        const response = await fetch('/api/deep-analysis', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ 
            riskId: risk.id,
            title: risk.title,
            description: risk.description,
            originalText: risk.originalText
          }),
        })

        if (response.ok) {
          const deepAnalysis = await response.json()
          console.log(`Deep analysis completed for ${risk.id}:`, deepAnalysis)
          
          // Update LLM stats if available
          if (deepAnalysis.llmStats) {
            setLlmStats(prev => ({
              ...prev,
              totalCalls: prev.totalCalls + deepAnalysis.llmStats.calls,
              totalTime: prev.totalTime + deepAnalysis.llmStats.totalTime,
              deepAnalysisTime: prev.deepAnalysisTime + deepAnalysis.llmStats.totalTime
            }))
          }
          
          // Update with deep analysis results
          updateRiskAnalysis(risk.id, {
            description: deepAnalysis.businessImpact || risk.description, // Use business impact as the main description
            businessImpact: deepAnalysis.businessImpact,
            recommendations: deepAnalysis.recommendations,
            suggestedNewText: deepAnalysis.suggestedNewText,
            isAnalyzing: false,
            analysisComplete: true
          })
          
          console.log(`Risk ${risk.id} updated with:`, {
            businessImpact: deepAnalysis.businessImpact,
            recommendations: deepAnalysis.recommendations?.length || 0,
            suggestedNewText: deepAnalysis.suggestedNewText ? 'Yes' : 'No'
          })
        } else {
          console.error(`Deep analysis API failed for ${risk.id}:`, response.status, response.statusText)
          const errorText = await response.text()
          console.error('Error details:', errorText)
          
          // Mark as complete even if analysis failed
          updateRiskAnalysis(risk.id, { 
            description: "Analysis failed - please review manually",
            isAnalyzing: false, 
            analysisComplete: true,
            businessImpact: "Analysis failed - please review manually",
            recommendations: [{
              action: "Review this risk manually with legal counsel",
              priority: "medium" as const,
              effort: "medium" as const
            }]
          })
        }
      } catch (error) {
        console.error('Deep analysis failed for risk:', risk.id, error)
        updateRiskAnalysis(risk.id, { 
          description: "Network error during analysis - please review manually",
          isAnalyzing: false, 
          analysisComplete: true,
          businessImpact: "Network error during analysis - please review manually",
          recommendations: [{
            action: "Review this risk manually with legal counsel",
            priority: "medium" as const,
            effort: "medium" as const
          }],
          suggestedNewText: "Please consult with legal counsel for appropriate replacement text."
        })
      }

      // Small delay between analyses to improve UX
      await new Promise(resolve => setTimeout(resolve, 500))
    }

    console.log('All deep analysis completed')
    setCurrentAnalyzingRisk(null)
    setDeepAnalysisProgress({ current: 0, total: 0 })
  }

  const handleFileUpload = async (file: File) => {
    setUploadedFile(file)
    setIsUploading(true)
    
    try {
      // Step 1: Upload and Parse with Upstage DocParse
      setCurrentStep("parsing")
      
      const formData = new FormData()
      formData.append('file', file)
      
      // Simulate parsing progress
      let parseProgress = 0
      const parseInterval = setInterval(() => {
        parseProgress += Math.random() * 15 + 5
        if (parseProgress >= 90) {
          parseProgress = 90
        }
        setParseProgress(parseProgress)
      }, 300)
      
      const uploadResponse = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      })
      
      clearInterval(parseInterval)
      setParseProgress(100)
      
      if (!uploadResponse.ok) {
        throw new Error('Failed to parse document')
      }
      
      const uploadResult = await uploadResponse.json()
      
      if (!uploadResult.success) {
        throw new Error(uploadResult.error || 'Failed to parse document')
      }

      setIsUploading(false)

      // Step 2: Identify initial risks
      setCurrentStep("identifying")
      
      // Simulate identification progress
      let identifyProgress = 0
      const identifyInterval = setInterval(() => {
        identifyProgress += Math.random() * 20 + 10
        if (identifyProgress >= 85) {
          identifyProgress = 85
        }
        setIdentifyProgress(identifyProgress)
      }, 400)

      // Step 2a: Get the first critical category (LIABILITY) for immediate results
      const firstCategoryResponse = await fetch('/api/identify-risks', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          text: uploadResult.parsedContent.text,
          firstCategoryOnly: true  // Only analyze LIABILITY for immediate results
        }),
      })

      if (!firstCategoryResponse.ok) {
        throw new Error('Failed to identify initial risks')
      }

      const firstCategoryRisks = await firstCategoryResponse.json()

      // Update progress with current category
      if (firstCategoryRisks.currentProgress) {
        setCurrentProgress(firstCategoryRisks.currentProgress)
      }
      
      // Update LLM stats
      if (firstCategoryRisks.llmStats) {
        setLlmStats(prev => ({
          ...prev,
          totalCalls: prev.totalCalls + firstCategoryRisks.llmStats.calls,
          totalTime: prev.totalTime + firstCategoryRisks.llmStats.totalTime,
          identifyTime: prev.identifyTime + firstCategoryRisks.llmStats.totalTime
        }))
      }

      clearInterval(identifyInterval)
      setIdentifyProgress(100)
      
      // Step 3: Show initial results IMMEDIATELY (no delay)
      const initialRisks = firstCategoryRisks.risks.map((risk: Risk) => ({
        ...risk,
        isAnalyzing: false,
        analysisComplete: false
      }))
      
      setAnalysisResult({
        totalRisks: firstCategoryRisks.risks.length,
        risks: sortRisksBySection(initialRisks),
        summary: firstCategoryRisks.summary || "Initial liability analysis complete. Analyzing remaining categories...",
        analysisComplete: false
      })
      setCurrentStep("results")

      // Start background analysis for remaining categories if there are more
      // BUT DON'T start deep analysis yet - wait for all risk identification to complete
      if (firstCategoryRisks.hasMoreCategories) {
        setIsGettingRemainingRisks(true)
        setCategoryProgress({ current: 1, total: 5, currentCategory: "Starting..." })
        // Start with categoryIndex 0 for remaining categories (TERMINATION, PAYMENT, etc.)
        getNextCategoryRisks(uploadResult.parsedContent.text, firstCategoryRisks.risks, 0)
      } else {
        // If no more categories, start deep analysis immediately
        console.log('No more categories, starting deep analysis immediately for', firstCategoryRisks.risks.length, 'risks')
        performDeepAnalysis(firstCategoryRisks.risks)
      }

    } catch (error) {
      console.error('Error:', error)
      setIsUploading(false)
      setCurrentStep("upload")
      // You might want to show an error message to the user here
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const files = Array.from(e.dataTransfer.files)
    if (files.length > 0 && files[0] instanceof File) {
      handleFileUpload(files[0])
    }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files && files.length > 0) {
      handleFileUpload(files[0])
    }
  }

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case "high":
        return "bg-red-100 text-red-800 border-red-200"
      case "medium":
        return "bg-yellow-100 text-yellow-800 border-yellow-200"
      case "low":
        return "bg-blue-100 text-blue-800 border-blue-200"
      default:
        return "bg-gray-100 text-gray-800 border-gray-200"
    }
  }

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "high":
        return "bg-red-100 text-red-800"
      case "medium":
        return "bg-yellow-100 text-yellow-800"
      case "low":
        return "bg-blue-100 text-blue-800"
      default:
        return "bg-gray-100 text-gray-800"
    }
  }

  const getEffortColor = (effort: string) => {
    switch (effort) {
      case "high":
        return "bg-red-100 text-red-800"
      case "medium":
        return "bg-yellow-100 text-yellow-800"
      case "low":
        return "bg-green-100 text-green-800"
      default:
        return "bg-gray-100 text-gray-800"
    }
  }

  const resetApp = () => {
    setCurrentStep("upload")
    setUploadedFile(null)
    setParseProgress(0)
    setIdentifyProgress(0)
    setAnalysisResult(null)
    setIsUploading(false)
    setCurrentAnalyzingRisk(null)
    setDeepAnalysisProgress({ current: 0, total: 0 })
    setCategoryProgress({ current: 0, total: 5, currentCategory: "" })
    setIsGettingAdditionalRisks(false)
    setCurrentProgress("")
    setIsGettingRemainingRisks(false)
    setLlmStats({
      totalCalls: 0,
      totalTime: 0,
      parseTime: 0,
      identifyTime: 0,
      deepAnalysisTime: 0
    })
  }

  if (currentStep === "upload") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-8 pt-8">
            <h1 className="text-4xl font-bold text-gray-900 mb-2">Before.sign</h1>
            <p className="text-xl text-gray-600">AI-powered contract risk analysis</p>
          </div>

          <Card className="max-w-2xl mx-auto">
            <CardHeader className="text-center">
              <CardTitle className="text-2xl">Upload Your Document</CardTitle>
              <CardDescription>
                Upload a contract or legal document to analyze potential risks and get detailed recommendations
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div
                className="border-2 border-dashed border-gray-300 rounded-lg p-12 text-center hover:border-gray-400 transition-colors cursor-pointer"
                onDrop={handleDrop}
                onDragOver={(e: React.DragEvent) => e.preventDefault()}
                onClick={() => document.getElementById("file-input")?.click()}
              >
                <Upload className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">Drop your file here, or click to browse</h3>
                <p className="text-gray-500 mb-4">Supports PDF, DOC, DOCX files up to 10MB</p>
                <Button disabled={isUploading}>{isUploading ? 'Uploading...' : 'Choose File'}</Button>
                <input
                  id="file-input"
                  type="file"
                  className="hidden"
                  accept=".pdf,.doc,.docx"
                  onChange={handleFileSelect}
                  disabled={isUploading}
                />
              </div>

              <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="text-center p-4">
                  <FileText className="mx-auto h-8 w-8 text-blue-600 mb-2" />
                  <h4 className="font-medium">Smart Document Parsing</h4>
                  <p className="text-sm text-gray-500">Advanced AI extracts and analyzes contract text</p>
                </div>
                <div className="text-center p-4">
                  <AlertTriangle className="mx-auto h-8 w-8 text-yellow-600 mb-2" />
                  <h4 className="font-medium">Risk Identification</h4>
                  <p className="text-sm text-gray-500">Identifies specific problematic clauses and terms</p>
                </div>
                <div className="text-center p-4">
                  <Lightbulb className="mx-auto h-8 w-8 text-green-600 mb-2" />
                  <h4 className="font-medium">Expert Recommendations</h4>
                  <p className="text-sm text-gray-500">Detailed suggestions and alternative text</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  if (currentStep === "parsing") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4 flex items-center justify-center">
        <Card className="max-w-md mx-auto">
          <CardHeader className="text-center">
            <CardTitle className="text-xl">Parsing Document</CardTitle>
            <CardDescription>Our AI is parsing {uploadedFile?.name} for potential risks</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex justify-center">
              <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600"></div>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Parsing Progress</span>
                <span>{Math.round(parseProgress)}%</span>
              </div>
              <Progress value={parseProgress} className="w-full" />
            </div>

            <div className="text-center text-sm text-gray-600">
              <p>This usually takes 1-2 minutes</p>
              <p className="mt-1">Parsing the document...</p>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (currentStep === "identifying") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4 flex items-center justify-center">
        <Card className="max-w-lg mx-auto">
          <CardHeader className="text-center">
            <CardTitle className="text-xl">Identifying Risks</CardTitle>
            <CardDescription>Our AI is identifying potential risks in the document</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex justify-center">
              <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600"></div>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Risk Identification Progress</span>
                <span>{Math.round(identifyProgress)}%</span>
              </div>
              <Progress value={identifyProgress} className="w-full" />
            </div>

            {/* Real-time progress updates */}
            {currentProgress && (
              <Alert className="bg-blue-50 border-blue-200">
                <Brain className="h-4 w-4 text-blue-600" />
                <AlertDescription className="text-blue-800">
                  <strong>Current Analysis:</strong> {currentProgress}
                </AlertDescription>
              </Alert>
            )}

            <div className="text-center text-sm text-gray-600">
              <p>Analyzing the most critical risks first...</p>
              <p className="mt-1">Results will appear as soon as first risks are identified</p>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (currentStep === "results" && analysisResult) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Analysis Results</h1>
              <p className="text-gray-600">{uploadedFile?.name}</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={resetApp}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Analyze Another Document
              </Button>
              {analysisResult && analysisResult.risks.length > 0 && (
                <Button 
                  variant="outline" 
                  onClick={() => {
                    console.log('Manual deep analysis trigger for', analysisResult.risks.length, 'risks')
                    performDeepAnalysis(analysisResult.risks)
                  }}
                  className="bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100"
                >
                  <Brain className="h-4 w-4 mr-2" />
                  Force Deep Analysis
                </Button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 mb-8">
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center">
                  <AlertTriangle className="h-8 w-8 text-red-600 mr-3" />
                  <div>
                    <p className="text-2xl font-bold">{analysisResult.totalRisks}</p>
                    <p className="text-sm text-gray-600">Risks Found</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center">
                  <div className="h-8 w-8 bg-red-100 rounded-full flex items-center justify-center mr-3">
                    <span className="text-red-600 font-bold text-sm">
                      {analysisResult.risks.filter((r) => r.severity === "high").length}
                    </span>
                  </div>
                  <div>
                    <p className="text-sm font-medium">High Risk</p>
                    <p className="text-xs text-gray-600">Immediate attention</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center">
                  <div className="h-8 w-8 bg-yellow-100 rounded-full flex items-center justify-center mr-3">
                    <span className="text-yellow-600 font-bold text-sm">
                      {analysisResult.risks.filter((r) => r.severity === "medium").length}
                    </span>
                  </div>
                  <div>
                    <p className="text-sm font-medium">Medium Risk</p>
                    <p className="text-xs text-gray-600">Review recommended</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center">
                  <div className="h-8 w-8 bg-blue-100 rounded-full flex items-center justify-center mr-3">
                    <span className="text-blue-600 font-bold text-sm">
                      {analysisResult.risks.filter((r) => r.severity === "low").length}
                    </span>
                  </div>
                  <div>
                    <p className="text-sm font-medium">Low Risk</p>
                    <p className="text-xs text-gray-600">Minor concerns</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Progress indicator for ongoing analysis */}
          {isGettingRemainingRisks && (
            <Alert className="mb-6 bg-blue-50 border-blue-200">
              <div className="flex items-center">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600 mr-2"></div>
                <Brain className="h-4 w-4 text-blue-600 mr-2" />
                <AlertDescription className="text-blue-800">
                  <div className="flex items-center">
                    <strong>Finding more risks...</strong> 
                    <div className="ml-2 flex space-x-1">
                      <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce"></div>
                      <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce" style={{animationDelay: '0.1s'}}></div>
                      <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce" style={{animationDelay: '0.2s'}}></div>
                    </div>
                  </div>
                  <div className="text-sm mt-1">
                    {categoryProgress.currentCategory ? (
                      <>
                        Currently analyzing: <strong>{categoryProgress.currentCategory}</strong> 
                        <span className="ml-2 text-blue-600 font-medium">
                          (Category {categoryProgress.current}/{categoryProgress.total})
                        </span>
                        <br />
                        New risks will appear automatically.
                      </>
                    ) : (
                      "Analyzing remaining risk categories. New risks will appear automatically."
                    )}
                  </div>
                  {categoryProgress.current > 0 && (
                    <div className="mt-2">
                      <Progress 
                        value={(categoryProgress.current / categoryProgress.total) * 100} 
                        className="w-full h-2"
                      />
                    </div>
                  )}
                </AlertDescription>
              </div>
            </Alert>
          )}
          
          {currentAnalyzingRisk && !isGettingRemainingRisks && (
            <Alert className="mb-6 bg-green-50 border-green-200">
              <div className="flex items-center">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-green-600 mr-2"></div>
                <Brain className="h-4 w-4 text-green-600 mr-2" />
                <AlertDescription className="text-green-800">
                  <div className="flex items-center">
                    <strong>All risks identified!</strong> 
                    <div className="ml-2 flex space-x-1">
                      <div className="w-2 h-2 bg-green-600 rounded-full animate-pulse"></div>
                      <div className="w-2 h-2 bg-green-600 rounded-full animate-pulse" style={{animationDelay: '0.2s'}}></div>
                      <div className="w-2 h-2 bg-green-600 rounded-full animate-pulse" style={{animationDelay: '0.4s'}}></div>
                    </div>
                  </div>
                  <div className="text-sm mt-1">
                    Now performing deep analysis... Currently analyzing: <strong>Risk #{deepAnalysisProgress.current}/{deepAnalysisProgress.total}</strong>
                    {deepAnalysisProgress.total > 0 && (
                      <span className="ml-2 text-green-600 font-medium">
                        ({Math.round((deepAnalysisProgress.current / deepAnalysisProgress.total) * 100)}%)
                      </span>
                    )}
                  </div>
                  {deepAnalysisProgress.total > 0 && (
                    <div className="mt-2">
                      <Progress 
                        value={(deepAnalysisProgress.current / deepAnalysisProgress.total) * 100} 
                        className="w-full h-2"
                      />
                    </div>
                  )}
                </AlertDescription>
              </div>
            </Alert>
          )}

          <div className="space-y-6">
            {analysisResult.risks.map((risk, index) => (
              <Card key={risk.id} className={risk.isAnalyzing ? "border-blue-300 shadow-md" : ""}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <Badge className={getSeverityColor(risk.severity)}>{risk.severity.toUpperCase()} RISK</Badge>
                        {risk.location && extractSectionNumber(risk.location) !== null && (
                          <Badge className="bg-indigo-100 text-indigo-800 border-indigo-200">
                            {risk.location}
                          </Badge>
                        )}
                        <span className="text-sm text-gray-500">Risk #{index + 1}</span>
                        {risk.location && extractSectionNumber(risk.location) === null && (
                          <span className="text-sm text-gray-500">• {risk.location}</span>
                        )}
                        {risk.isAnalyzing && (
                          <Badge className="bg-blue-100 text-blue-800">
                            <Brain className="h-3 w-3 mr-1" />
                            Analyzing...
                          </Badge>
                        )}
                        {risk.analysisComplete && (
                          <Badge className="bg-green-100 text-green-800">
                            <CheckCircle className="h-3 w-3 mr-1" />
                            Complete
                          </Badge>
                        )}
                      </div>
                      <CardTitle className="text-xl flex items-center">
                        {risk.title}
                        {risk.isAnalyzing && (
                          <div className="ml-3 animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                        )}
                      </CardTitle>
                    </div>
                    <AlertTriangle
                      className={`h-6 w-6 ${
                        risk.severity === "high"
                          ? "text-red-600"
                          : risk.severity === "medium"
                            ? "text-yellow-600"
                            : "text-blue-600"
                      }`}
                    />
                  </div>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div>
                    <h4 className="font-medium mb-2 flex items-center">
                      <BookOpen className="h-4 w-4 mr-2 text-blue-600" />
                      Risk Description
                    </h4>
                    <p className="text-gray-700">{risk.description}</p>
                  </div>

                  {risk.originalText && (
                    <div>
                      <h4 className="font-medium mb-2 flex items-center">
                        <FileText className="h-4 w-4 mr-2 text-gray-600" />
                        Original Problematic Text
                      </h4>
                      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                        <p className="text-sm text-gray-800 italic">"{risk.originalText}"</p>
                      </div>
                    </div>
                  )}

                  {/* Show loading state for deep analysis fields */}
                  {risk.isAnalyzing && !risk.businessImpact && (
                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                      <div className="flex items-center">
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600 mr-2"></div>
                        <span className="text-sm text-gray-600">Analyzing business impact and legal risks...</span>
                      </div>
                    </div>
                  )}

                  {risk.businessImpact && (
                    <div>
                      <h4 className="font-medium mb-2 flex items-center">
                        <Target className="h-4 w-4 mr-2 text-orange-600" />
                        Business Impact
                      </h4>
                      <p className="text-gray-700">{risk.businessImpact}</p>
                    </div>
                  )}



                  {risk.recommendations && risk.recommendations.length > 0 && (
                    <div>
                      <h4 className="font-medium mb-3 flex items-center">
                        <Lightbulb className="h-4 w-4 mr-2 text-green-600" />
                        Recommended Actions
                      </h4>
                      <div className="space-y-3">
                        {risk.recommendations.map((rec, idx) => (
                          <div key={idx} className="flex items-start bg-gray-50 rounded-lg p-3">
                            <CheckCircle className="h-4 w-4 text-green-600 mr-3 mt-0.5 flex-shrink-0" />
                            <div className="flex-1">
                              <p className="text-gray-700 mb-2">{rec.action}</p>
                              <div className="flex gap-2">
                                <Badge className={`text-xs ${getPriorityColor(rec.priority)}`}>
                                  {rec.priority.toUpperCase()} PRIORITY
                                </Badge>
                                <Badge className={`text-xs ${getEffortColor(rec.effort)}`}>
                                  {rec.effort.toUpperCase()} EFFORT
                                </Badge>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {risk.suggestedNewText && (
                    <div>
                      <h4 className="font-medium mb-2 flex items-center">
                        <Lightbulb className="h-4 w-4 mr-2 text-green-600" />
                        Suggested Alternative Text
                      </h4>
                      <div className="bg-green-50 border border-green-200 rounded-lg p-4 space-y-3">
                        <div>
                          <p className="text-xs text-gray-600 mb-2">
                            {risk.originalText && risk.originalText.toLowerCase() !== 'n/a' && risk.originalText.trim() !== '' 
                              ? 'Clean version:' 
                              : 'Suggested text:'}
                          </p>
                          <p className="text-sm text-gray-800">"{risk.suggestedNewText}"</p>
                        </div>
                        {risk.originalText && risk.originalText.toLowerCase() !== 'n/a' && risk.originalText.trim() !== '' && (
                          <div>
                            <p className="text-xs text-gray-600 mb-2">Track changes:</p>
                            <div 
                              className="text-sm text-gray-800"
                              dangerouslySetInnerHTML={{
                                __html: createDiffText(risk.originalText, risk.suggestedNewText)
                                  .replace(/~~(.*?)~~/g, '<span style="text-decoration: line-through; color: #dc2626;">$1</span>')
                                  .replace(/\*\*(.*?)\*\*/g, '<span style="font-weight: bold; color: #059669;">$1</span>')
                              }}
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>



          {/* LLM Statistics */}
          <Card className="mt-8 bg-gray-50">
            <CardHeader>
              <CardTitle className="text-lg flex items-center">
                <Brain className="h-5 w-5 mr-2 text-blue-600" />
                Analysis Statistics
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-600">{llmStats.totalCalls}</div>
                  <div className="text-sm text-gray-600">AI Model Calls</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600">{(llmStats.totalTime / 1000).toFixed(1)}s</div>
                  <div className="text-sm text-gray-600">Total Analysis Time</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-purple-600">{(llmStats.identifyTime / 1000).toFixed(1)}s</div>
                  <div className="text-sm text-gray-600">Risk Identification</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-orange-600">{(llmStats.deepAnalysisTime / 1000).toFixed(1)}s</div>
                  <div className="text-sm text-gray-600">Deep Analysis</div>
                </div>
              </div>
              <div className="mt-4 text-center text-sm text-gray-500">
                Analysis powered by advanced AI models for comprehensive contract review
              </div>
            </CardContent>
          </Card>

          <Alert className="mt-8">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              <strong>Disclaimer:</strong> This analysis is provided for informational purposes only and should not be
              considered as legal advice. Please consult with a qualified attorney for specific legal guidance regarding
              your contract.
            </AlertDescription>
          </Alert>
        </div>
      </div>
    )
  }

  return null
}
