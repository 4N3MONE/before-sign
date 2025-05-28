"use client"

import React, { useState, useCallback } from "react"
import { Upload, FileText, AlertTriangle, CheckCircle, Lightbulb, ArrowLeft, BookOpen, Shield, Target, Clock, Brain, Globe, Share2, Copy, Check } from "lucide-react"
import { useTranslation } from 'react-i18next'
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Alert, AlertDescription } from "@/components/ui/alert"
import LanguageSwitcher from "@/components/LanguageSwitcher"
import I18nDebug from "@/components/I18nDebug"

interface Recommendation {
  action: string
  priority: "high" | "medium" | "low"
  effort: "low" | "medium" | "high"
}

interface Party {
  id: string
  name: string
  description: string
  type: 'individual' | 'company' | 'organization' | 'other'
  aliases?: string[]
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

// Helper function to sort risks by severity first, then by section number
const sortRisksBySeverityAndSection = (risks: Risk[]): Risk[] => {
  return [...risks].sort((a, b) => {
    // First, sort by severity (high > medium > low)
    const severityOrder = { 'high': 0, 'medium': 1, 'low': 2 }
    const severityDiff = severityOrder[a.severity] - severityOrder[b.severity]
    
    if (severityDiff !== 0) {
      return severityDiff // Different severities, sort by severity
    }
    
    // Same severity, sort by section number
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
  const { t } = useTranslation()
  const [currentStep, setCurrentStep] = useState<"upload" | "parsing" | "party-selection" | "identifying" | "results">("upload")

  // Helper function to translate category names
  const translateCategory = (category: string): string => {
    if (!category) return ""
    return t(`categories.${category}`, { defaultValue: category })
  }
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
  const [configError, setConfigError] = useState<string | null>(null)
  const [retryStatus, setRetryStatus] = useState<string | null>(null)
  const [stuckTimeout, setStuckTimeout] = useState<NodeJS.Timeout | null>(null)
  const [analysisError, setAnalysisError] = useState<{
    type: 'category' | 'deep',
    message: string,
    canRetry: boolean,
    retryData?: any
  } | null>(null)

  // Share functionality state
  const [isSharing, setIsSharing] = useState(false)
  const [shareUrl, setShareUrl] = useState<string | null>(null)
  const [showShareSuccess, setShowShareSuccess] = useState(false)
  const [showCopySuccess, setShowCopySuccess] = useState(false)

  // Party selection state
  const [parsedContent, setParsedContent] = useState<string | null>(null)
  const [identifiedParties, setIdentifiedParties] = useState<Party[]>([])
  const [selectedParty, setSelectedParty] = useState<Party | null>(null)
  const [isIdentifyingParties, setIsIdentifyingParties] = useState(false)

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
      const sortedRisks = sortRisksBySeverityAndSection(updatedRisks)
      
      return {
        ...prev,
        risks: sortedRisks
      }
    })
  }, [])

  const getNextCategoryRisks = async (contractText: string, existingRisks: Risk[], categoryIndex: number = 0, retryCount: number = 0) => {
    const maxRetries = 3
    
    try {
      console.log(`Getting category risks for index ${categoryIndex}, attempt ${retryCount + 1}/${maxRetries + 1}`)
      
      // Add timeout to the fetch request
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 120000) // 2 minute timeout
      
      const response = await fetch('/api/remaining-risks', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          text: contractText,
          existingRisks: existingRisks,
          categoryIndex: categoryIndex,
          selectedParty: selectedParty
        }),
        signal: controller.signal
      })

      clearTimeout(timeoutId)

      if (response.ok) {
        const categoryRisks = await response.json()
        console.log(`Got category risks response:`, {
          categoryAnalyzed: categoryRisks.categoryAnalyzed,
          risksFound: categoryRisks.risks?.length || 0,
          hasMoreCategories: categoryRisks.hasMoreCategories,
          nextCategoryIndex: categoryRisks.nextCategoryIndex
        })
        
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
          console.log(`Updated category progress: ${categoryIndex + 1}/5 - ${categoryRisks.categoryAnalyzed}`)
        } else {
          console.warn(`No categoryAnalyzed in response:`, categoryRisks)
          setCategoryProgress({
            current: categoryIndex + 1,
            total: 5,
            currentCategory: `Category ${categoryIndex + 1}`
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
            const updatedRisks = sortRisksBySeverityAndSection(newRisks)
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
                risks: sortRisksBySeverityAndSection(prev.risks), // Re-sort in case location info was updated
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
          console.log(`Current allRisks count: ${allRisks.length}`)
          await getNextCategoryRisks(contractText, allRisks, categoryRisks.nextCategoryIndex)
        } else {
          console.log('All categories completed! Finalizing risk identification...')
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
          
          // Clear the stuck timeout since we completed successfully
          if (stuckTimeout) {
            clearTimeout(stuckTimeout)
            setStuckTimeout(null)
          }
          
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
      } else {
        // Handle non-OK responses
        const errorText = await response.text()
        console.error(`API /remaining-risks failed with status ${response.status}:`, errorText)
        
        // Check if it's an API key error
        if (response.status === 401 || errorText.includes('UPSTAGE_API_KEY')) {
          setConfigError('API configuration error. Please check your UPSTAGE_API_KEY.')
          setIsGettingRemainingRisks(false)
          setCategoryProgress({ current: 0, total: 5, currentCategory: "" })
          return
        }
        
        // Retry for other errors
        if (retryCount < maxRetries) {
          console.log(`Retrying category risks in 2 seconds... (${retryCount + 1}/${maxRetries})`)
          setRetryStatus(`Retrying... (${retryCount + 1}/${maxRetries})`)
          await new Promise(resolve => setTimeout(resolve, 2000))
          setRetryStatus(null)
          return getNextCategoryRisks(contractText, existingRisks, categoryIndex, retryCount + 1)
        } else {
          throw new Error(`API failed after ${maxRetries + 1} attempts: ${response.status} ${errorText}`)
        }
      }
    } catch (error) {
      console.error('Failed to get category risks:', error)
      
             // Check if it's a timeout or network error that we should retry
       if (retryCount < maxRetries && (error instanceof Error && (error.name === 'AbortError' || error.message.includes('fetch')))) {
         console.log(`Network error, retrying in 3 seconds... (${retryCount + 1}/${maxRetries})`)
         setRetryStatus(`Network error, retrying... (${retryCount + 1}/${maxRetries})`)
         await new Promise(resolve => setTimeout(resolve, 3000))
         setRetryStatus(null)
         return getNextCategoryRisks(contractText, existingRisks, categoryIndex, retryCount + 1)
       }
      
             // Final failure - stop the process and show retry option
       setIsGettingRemainingRisks(false)
       setCategoryProgress({ current: 0, total: 5, currentCategory: "" })
       
       // Clear stuck timeout
       if (stuckTimeout) {
         clearTimeout(stuckTimeout)
         setStuckTimeout(null)
       }
       
       // Check if it's an API key error (don't offer retry for config issues)
      if (error instanceof Error && (error.message.includes('UPSTAGE_API_KEY') || error.message.includes('API key'))) {
        setConfigError('API configuration error. Please check your UPSTAGE_API_KEY.')
      } else {
        // Set analysis error with retry option instead of config error
        setAnalysisError({
          type: 'category',
          message: `Failed to complete risk identification after ${maxRetries + 1} attempts. You can retry the analysis or continue with the ${existingRisks.length} risks already found.`,
          canRetry: true,
          retryData: { contractText, existingRisks, categoryIndex }
        })
      }
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
        // Add timeout to the fetch request
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 180000) // 3 minute timeout for deep analysis
        
        const response = await fetch('/api/deep-analysis', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ 
            riskId: risk.id,
            title: risk.title,
            description: risk.description,
            originalText: risk.originalText,
            selectedParty: selectedParty
          }),
          signal: controller.signal
        })

        clearTimeout(timeoutId)

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
          
          // Check if it's an API key error
          if (errorText.includes('UPSTAGE_API_KEY') || response.status === 401) {
            setConfigError('API configuration error. Please check your UPSTAGE_API_KEY.')
          }
          
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
        
        // Check if it's an API key error
        if (error instanceof Error && (error.message.includes('UPSTAGE_API_KEY') || error.message.includes('API key'))) {
          setConfigError('API configuration error during deep analysis. Please check your UPSTAGE_API_KEY.')
        }
        
        // Check if it's a timeout error
        const isTimeout = error instanceof Error && error.name === 'AbortError'
        const errorMessage = isTimeout 
          ? "Analysis timed out - please review manually" 
          : "Network error during analysis - please review manually"
        
        updateRiskAnalysis(risk.id, { 
          description: errorMessage,
          isAnalyzing: false, 
          analysisComplete: true,
          businessImpact: errorMessage,
          recommendations: [{
            action: isTimeout 
              ? "This analysis timed out. Try again or review manually with legal counsel"
              : "Review this risk manually with legal counsel",
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
      setParsedContent(uploadResult.parsedContent.text)

      // Step 2: Identify parties in the contract
      setCurrentStep("party-selection")
      setIsIdentifyingParties(true)

      try {
        const partiesResponse = await fetch('/api/identify-parties', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ 
            text: uploadResult.parsedContent.text
          }),
        })

        if (!partiesResponse.ok) {
          throw new Error('Failed to identify parties')
        }

        const partiesResult = await partiesResponse.json()
        
        if (partiesResult.llmStats) {
          setLlmStats(prev => ({
            ...prev,
            totalCalls: prev.totalCalls + partiesResult.llmStats.calls,
            totalTime: prev.totalTime + partiesResult.llmStats.totalTime
          }))
        }

        setIdentifiedParties(partiesResult.parties || [])
        setIsIdentifyingParties(false)

      } catch (error) {
        console.error('Error identifying parties:', error)
        setIsIdentifyingParties(false)
        // Provide fallback parties if identification fails
        setIdentifiedParties([
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
        ])
      }

    } catch (error) {
      console.error('Error:', error)
      setIsUploading(false)
      setCurrentStep("upload")
      
      // Check if it's an API key configuration error
      if (error instanceof Error && error.message.includes('UPSTAGE_API_KEY')) {
        setConfigError('API configuration missing. Please set up the UPSTAGE_API_KEY environment variable.')
      } else if (error instanceof Error && error.message.includes('API key')) {
        setConfigError('API key error. Please check your UPSTAGE_API_KEY configuration.')
      } else {
        setConfigError('An error occurred while processing your document. Please try again.')
      }
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

  const retryFailedAnalysis = () => {
    if (!analysisError || !analysisError.canRetry) return
    
    setAnalysisError(null)
    
    if (analysisError.type === 'category' && analysisError.retryData) {
      // Retry category analysis
      const { contractText, existingRisks, categoryIndex } = analysisError.retryData
      setIsGettingRemainingRisks(true)
      setCategoryProgress({ current: categoryIndex, total: 5, currentCategory: "Retrying..." })
      getNextCategoryRisks(contractText, existingRisks, categoryIndex)
    } else if (analysisError.type === 'deep' && analysisResult) {
      // Retry deep analysis for incomplete risks
      const incompleteRisks = analysisResult.risks.filter(risk => !risk.analysisComplete)
      if (incompleteRisks.length > 0) {
        performDeepAnalysis(incompleteRisks)
      }
    }
  }

  const continueWithCurrentResults = () => {
    setAnalysisError(null)
    
    if (analysisResult && analysisResult.risks.length > 0) {
      // Start deep analysis for current risks if not already complete
      const incompleteRisks = analysisResult.risks.filter(risk => !risk.analysisComplete)
      if (incompleteRisks.length > 0) {
        performDeepAnalysis(incompleteRisks)
      }
    }
  }

  const startRiskAnalysis = async () => {
    if (!parsedContent) return
    
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

    try {
      // Step 3: Get the first critical category (LIABILITY) for immediate results with party context
      const firstCategoryResponse = await fetch('/api/identify-risks', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          text: parsedContent,
          firstCategoryOnly: true,  // Only analyze LIABILITY for immediate results
          selectedParty: selectedParty
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
      
      // Step 4: Show initial results IMMEDIATELY (no delay)
      const initialRisks = firstCategoryRisks.risks.map((risk: Risk) => ({
        ...risk,
        isAnalyzing: false,
        analysisComplete: false
      }))
      
      setAnalysisResult({
        totalRisks: firstCategoryRisks.risks.length,
        risks: sortRisksBySeverityAndSection(initialRisks),
        summary: firstCategoryRisks.summary || "Initial liability analysis complete. Analyzing remaining categories...",
        analysisComplete: false
      })
      setCurrentStep("results")

      // Start background analysis for remaining categories if there are more
      // BUT DON'T start deep analysis yet - wait for all risk identification to complete
      if (firstCategoryRisks.hasMoreCategories) {
        setIsGettingRemainingRisks(true)
        setCategoryProgress({ current: 1, total: 5, currentCategory: "Starting..." })
        
        // Set up a timeout to detect if analysis gets stuck
        const timeout = setTimeout(() => {
          console.error('Category analysis appears stuck, showing error...')
          setConfigError('Analysis appears to be stuck. This may be due to API issues. Please try again.')
          setIsGettingRemainingRisks(false)
          setCategoryProgress({ current: 0, total: 5, currentCategory: "" })
        }, 300000) // 5 minute timeout
        
        setStuckTimeout(timeout)
        
        // Start with categoryIndex 0 for remaining categories (TERMINATION, PAYMENT, etc.)
        getNextCategoryRisks(parsedContent, firstCategoryRisks.risks, 0)
          .then(() => {
            // Clear timeout when done
            if (stuckTimeout) {
              clearTimeout(stuckTimeout)
              setStuckTimeout(null)
            }
          })
          .catch((error) => {
            console.error('Category analysis failed:', error)
            if (stuckTimeout) {
              clearTimeout(stuckTimeout)
              setStuckTimeout(null)
            }
          })
      } else {
        // If no more categories, start deep analysis immediately
        console.log('No more categories, starting deep analysis immediately for', firstCategoryRisks.risks.length, 'risks')
        performDeepAnalysis(firstCategoryRisks.risks)
      }

    } catch (error) {
      console.error('Error:', error)
      clearInterval(identifyInterval)
      setCurrentStep("party-selection")
      
      // Check if it's an API key configuration error
      if (error instanceof Error && error.message.includes('UPSTAGE_API_KEY')) {
        setConfigError('API configuration missing. Please set up the UPSTAGE_API_KEY environment variable.')
      } else if (error instanceof Error && error.message.includes('API key')) {
        setConfigError('API key error. Please check your UPSTAGE_API_KEY configuration.')
      } else {
        setConfigError('An error occurred while analyzing risks. Please try again.')
      }
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
    setConfigError(null)
    setRetryStatus(null)
    setAnalysisError(null)
    // Clear any stuck timeout
    if (stuckTimeout) {
      clearTimeout(stuckTimeout)
      setStuckTimeout(null)
    }
    setLlmStats({
      totalCalls: 0,
      totalTime: 0,
      parseTime: 0,
      identifyTime: 0,
      deepAnalysisTime: 0
    })
    // Clear share state
    setIsSharing(false)
    setShareUrl(null)
    setShowShareSuccess(false)
    setShowCopySuccess(false)
    // Clear party state
    setParsedContent(null)
    setIdentifiedParties([])
    setSelectedParty(null)
    setIsIdentifyingParties(false)
  }

  const handleShareReport = async () => {
    if (!analysisResult || !uploadedFile) return

    setIsSharing(true)
    try {
      const response = await fetch('/api/share-report', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          analysisResult,
          fileName: uploadedFile.name,
          llmStats,
          selectedParty
        }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        const errorMessage = errorData.error || `Server error: ${response.status}`
        throw new Error(errorMessage)
      }

      const data = await response.json()
      setShareUrl(data.shareUrl)
      
      // Automatically copy the URL to clipboard
      const copySuccess = await copyUrlToClipboard(data.shareUrl)
      
      setShowShareSuccess(true)
      
      // Hide success message after 5 seconds (longer since there are now two success states)
      setTimeout(() => setShowShareSuccess(false), 5000)
    } catch (error) {
      console.error('Error sharing report:', error)
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
      
      // Show more detailed error message
      if (errorMessage.includes('Firebase') || errorMessage.includes('Firestore')) {
        alert('Database connection error. Please check your Firebase configuration and try again.')
      } else if (errorMessage.includes('network') || errorMessage.includes('fetch')) {
        alert('Network error. Please check your internet connection and try again.')
      } else {
        alert(`Failed to create shareable link: ${errorMessage}`)
      }
    } finally {
      setIsSharing(false)
    }
  }

  // Helper function to copy URL to clipboard
  const copyUrlToClipboard = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url)
      setShowCopySuccess(true)
      setTimeout(() => setShowCopySuccess(false), 2000)
      return true
    } catch (error) {
      console.error('Failed to copy URL:', error)
      // Fallback for older browsers
      try {
        const textArea = document.createElement('textarea')
        textArea.value = url
        document.body.appendChild(textArea)
        textArea.select()
        document.execCommand('copy')
        document.body.removeChild(textArea)
        setShowCopySuccess(true)
        setTimeout(() => setShowCopySuccess(false), 2000)
        return true
      } catch (fallbackError) {
        console.error('Fallback copy method also failed:', fallbackError)
        return false
      }
    }
  }

  const copyShareUrl = async () => {
    if (!shareUrl) return
    await copyUrlToClipboard(shareUrl)
  }

  if (currentStep === "upload") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-8 pt-8">
            <div className="flex justify-between items-start mb-4">
              <div className="flex-1">
                <h1 className="text-4xl font-bold text-gray-900 mb-2">{t('appName')}</h1>
                <p className="text-xl text-gray-600">{t('appDescription')}</p>
              </div>
              <LanguageSwitcher />
            </div>
          </div>

          <Card className="max-w-2xl mx-auto">
            <CardHeader className="text-center">
              <CardTitle className="text-2xl">{t('upload.title')}</CardTitle>
              <CardDescription>
                {t('upload.description')}
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
                <h3 className="text-lg font-medium text-gray-900 mb-2">{t('upload.dropText')}</h3>
                <p className="text-gray-500 mb-4">{t('upload.supportText')}</p>
                <div className="flex gap-2 justify-center">
                  <Button disabled={isUploading}>{isUploading ? t('upload.uploading') : t('upload.chooseFile')}</Button>
                  {configError && (
                    <Button 
                      variant="outline" 
                      onClick={() => setConfigError(null)}
                      className="text-red-600 border-red-200 hover:bg-red-50"
                    >
                        {t('upload.clearError')}
                    </Button>
                  )}
                </div>
                <input
                  id="file-input"
                  type="file"
                  className="hidden"
                  accept=".pdf,.doc,.docx"
                  onChange={handleFileSelect}
                  disabled={isUploading}
                />
              </div>

              {configError && (
                <Alert className="mt-6 bg-red-50 border-red-200">
                  <AlertTriangle className="h-4 w-4 text-red-600" />
                  <AlertDescription className="text-red-800">
                    <strong>Configuration Error:</strong> {configError}
                    {configError.includes('UPSTAGE_API_KEY') && (
                      <div className="mt-2 text-sm">
                        <p>To fix this:</p>
                        <ol className="list-decimal list-inside mt-1 space-y-1">
                          <li>Get your API key from <a href="https://www.upstage.ai/" target="_blank" rel="noopener noreferrer" className="underline text-red-700">Upstage.ai</a></li>
                          <li>Set the environment variable: <code className="bg-red-100 px-1 rounded">UPSTAGE_API_KEY=your_key_here</code></li>
                          <li>Restart the application</li>
                        </ol>
                      </div>
                    )}
                  </AlertDescription>
                </Alert>
              )}

              <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="text-center p-4">
                  <FileText className="mx-auto h-8 w-8 text-blue-600 mb-2" />
                  <h4 className="font-medium">{t('features.parsing.title')}</h4>
                  <p className="text-sm text-gray-500">{t('features.parsing.description')}</p>
                </div>
                <div className="text-center p-4">
                  <AlertTriangle className="mx-auto h-8 w-8 text-yellow-600 mb-2" />
                  <h4 className="font-medium">{t('features.identification.title')}</h4>
                  <p className="text-sm text-gray-500">{t('features.identification.description')}</p>
                </div>
                <div className="text-center p-4">
                  <Lightbulb className="mx-auto h-8 w-8 text-green-600 mb-2" />
                  <h4 className="font-medium">{t('features.recommendations.title')}</h4>
                  <p className="text-sm text-gray-500">{t('features.recommendations.description')}</p>
                </div>
              </div>

              {/* Powered By and Open Source Information */}
              <Card className="mt-8 bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200">
                <CardContent className="p-6">
                  <div className="text-center space-y-4">
                    <div className="flex items-center justify-center space-x-2">
                      <Shield className="h-5 w-5 text-blue-600" />
                      <span className="text-lg font-medium text-gray-800">Powered by</span>
                    </div>
                    <div className="space-y-2">
                      <p className="text-gray-700">
                        <a 
                          href="https://console.upstage.ai" 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:text-blue-800 font-medium underline"
                        >
                          Upstage Document Parse & Solar LLM
                        </a>
                      </p>
                      <p className="text-sm text-gray-600">
                        Advanced AI technology for intelligent document analysis
                      </p>
                    </div>
                    <div className="pt-2 border-t border-blue-200">
                      <div className="flex items-center justify-center space-x-2">
                        <BookOpen className="h-4 w-4 text-green-600" />
                        <span className="text-sm text-gray-700">
                          Open Source • Available on{" "}
                          <a 
                            href="https://github.com/hunkim/before-sign" 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-green-600 hover:text-green-800 font-medium underline"
                          >
                            GitHub
                          </a>
                        </span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Important Disclaimer */}
              <Alert className="mt-8 border-amber-200 bg-amber-50">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                <AlertDescription className="text-amber-800">
                  <strong>{t('disclaimer.title')}</strong> {t('disclaimer.text')}
                </AlertDescription>
              </Alert>
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
            <CardTitle className="text-xl">{t('progress.parsing.title')}</CardTitle>
            <CardDescription>{t('progress.parsing.description', { fileName: uploadedFile?.name })}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex justify-center">
              <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600"></div>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>{t('progress.parsing.title')}</span>
                <span>{Math.round(parseProgress)}%</span>
              </div>
              <Progress value={parseProgress} className="w-full" />
            </div>

            <div className="text-center text-sm text-gray-600">
              <p>{t('progress.parsing.statusText')}</p>
              <p className="mt-1">{t('progress.parsing.subText')}</p>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (currentStep === "party-selection") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Select Your Party</h1>
              <p className="text-gray-600">{uploadedFile?.name}</p>
            </div>
            <Button variant="outline" onClick={resetApp}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Upload
            </Button>
          </div>

          {isIdentifyingParties ? (
            <Card className="max-w-lg mx-auto">
              <CardHeader className="text-center">
                <CardTitle className="text-xl">Analyzing Contract Parties</CardTitle>
                <CardDescription>Identifying all parties involved in this contract...</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex justify-center">
                  <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600"></div>
                </div>

                <div className="text-center text-sm text-gray-600">
                  <p>Using AI to identify contract parties and their roles</p>
                  <p className="mt-1">This helps us provide analysis from your perspective</p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <Target className="h-5 w-5 mr-2 text-blue-600" />
                    Choose Your Perspective
                  </CardTitle>
                  <CardDescription>
                    Select which party you represent in this contract. The risk analysis will be tailored to identify risks that could negatively impact your interests.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-4">
                    {identifiedParties.map((party) => (
                      <div
                        key={party.id}
                        className={`p-4 border rounded-lg cursor-pointer transition-all ${
                          selectedParty?.id === party.id
                            ? 'border-blue-500 bg-blue-50 shadow-md'
                            : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                        }`}
                        onClick={() => setSelectedParty(party)}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <h3 className="text-lg font-medium text-gray-900">{party.name}</h3>
                              <Badge variant="outline" className="text-xs">
                                {party.type}
                              </Badge>
                            </div>
                            <p className="text-sm text-gray-600 mb-2">{party.description}</p>
                            {party.aliases && party.aliases.length > 0 && (
                              <div className="text-xs text-gray-500">
                                Also known as: {party.aliases.join(', ')}
                              </div>
                            )}
                          </div>
                          <div className="ml-4">
                            {selectedParty?.id === party.id ? (
                              <CheckCircle className="h-6 w-6 text-blue-600" />
                            ) : (
                              <div className="h-6 w-6 rounded-full border-2 border-gray-300"></div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-amber-50 border-amber-200">
                <CardContent className="p-4">
                  <div className="flex items-start">
                    <Lightbulb className="h-5 w-5 text-amber-600 mr-3 mt-0.5 flex-shrink-0" />
                    <div>
                      <h4 className="font-medium text-amber-900 mb-1">Why does this matter?</h4>
                      <p className="text-sm text-amber-800">
                        Contract risks are subjective. A clause that protects one party might expose the other to liability. 
                        By selecting your party, we can identify risks specifically relevant to your position and interests.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <div className="flex justify-center">
                <Button 
                  onClick={startRiskAnalysis}
                  disabled={!selectedParty}
                  size="lg"
                  className="min-w-48"
                >
                  {selectedParty 
                    ? `Analyze Risks for ${selectedParty.name}`
                    : 'Select a Party to Continue'
                  }
                </Button>
              </div>

              {configError && (
                <Alert className="bg-red-50 border-red-200">
                  <AlertTriangle className="h-4 w-4 text-red-600" />
                  <AlertDescription className="text-red-800">
                    <strong>Configuration Error:</strong> {configError}
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}
        </div>
      </div>
    )
  }

  if (currentStep === "identifying") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4 flex items-center justify-center">
        <Card className="max-w-lg mx-auto">
          <CardHeader className="text-center">
            <CardTitle className="text-xl">{t('progress.identifying.title')}</CardTitle>
            <CardDescription>{t('progress.identifying.description')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex justify-center">
              <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600"></div>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>{t('progress.identifying.title')}</span>
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
              <p>{t('progress.identifying.statusText')}</p>
              <p className="mt-1">{t('progress.identifying.subText')}</p>
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
              <h1 className="text-3xl font-bold text-gray-900">
                {t('results.title')}
                {selectedParty && (
                  <span className="text-xl font-normal text-blue-600 ml-2">
                    for {selectedParty.name}
                  </span>
                )}
              </h1>
              <p className="text-gray-600">{uploadedFile?.name}</p>
            </div>
            <div className="flex gap-2">
              {/* Share Button */}
              <div className="relative">
                <Button 
                  variant="default" 
                  onClick={handleShareReport}
                  disabled={
                    isSharing || 
                    !analysisResult || 
                    isGettingRemainingRisks || 
                    currentAnalyzingRisk !== null ||
                    (analysisResult && analysisResult.risks.some(risk => risk.isAnalyzing))
                  }
                  className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400"
                >
                  {isSharing ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      Sharing...
                    </>
                  ) : (
                    <>
                      <Share2 className="h-4 w-4 mr-2" />
                      {isGettingRemainingRisks || currentAnalyzingRisk ? 'Analysis in Progress...' : 'Share Report'}
                    </>
                  )}
                </Button>
                
                {/* Show helpful message when analysis is incomplete */}
                {(isGettingRemainingRisks || currentAnalyzingRisk) && (
                  <div className="absolute top-full left-0 mt-1 text-xs text-gray-500 whitespace-nowrap">
                    Share will be available when analysis completes
                  </div>
                )}
              </div>
              
              <Button variant="outline" onClick={resetApp}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                {t('results.analyzeAnother')}
              </Button>
            </div>
          </div>

          {/* Share Success Notification */}
          {shareUrl && (
            <Alert className="mb-6 bg-green-50 border-green-200">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-green-800">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <strong>Report shared successfully!</strong>
                    {showCopySuccess && (
                      <span className="ml-2 text-green-700 font-medium">📋 Link copied to clipboard!</span>
                    )}
                    <p className="text-sm mt-1">
                      Anyone with this link can view the analysis results. The link will expire in 30 days.
                      {showCopySuccess && (
                        <span className="block text-green-700 font-medium mt-1">
                          ✓ The link has been automatically copied to your clipboard.
                        </span>
                      )}
                    </p>
                    <div className="mt-2 flex items-center gap-2">
                      <code className="bg-green-100 px-2 py-1 rounded text-sm text-green-800 flex-1 truncate">
                        {shareUrl}
                      </code>
                                    <Button 
                size="sm" 
                variant="outline"
                onClick={copyShareUrl}
                className="border-green-300 text-green-700 hover:bg-green-100"
              >
                {showCopySuccess ? (
                  <>
                    <Check className="h-3 w-3 mr-1" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="h-3 w-3 mr-1" />
                    Copy
                  </>
                )}
              </Button>
                    </div>
                  </div>
                </div>
              </AlertDescription>
            </Alert>
          )}

          {/* Party Perspective Information */}
          {selectedParty && (
            <Card className="mb-6 bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200">
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div className="flex items-center">
                    <Target className="h-6 w-6 text-blue-600 mr-3 flex-shrink-0 mt-1" />
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900 mb-1">
                        Analysis Perspective: {selectedParty.name}
                      </h3>
                      <p className="text-sm text-gray-700 mb-2">{selectedParty.description}</p>
                      <div className="flex items-center">
                        <Badge variant="outline" className="text-xs mr-2">
                          {selectedParty.type}
                        </Badge>
                        <span className="text-xs text-gray-500">
                          This analysis identifies risks that could negatively impact {selectedParty.name}
                        </span>
                      </div>
                    </div>
                  </div>
                  <Shield className="h-8 w-8 text-blue-600 opacity-20" />
                </div>
              </CardContent>
            </Card>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 mb-8">
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center">
                  <AlertTriangle className="h-8 w-8 text-red-600 mr-3" />
                  <div>
                    <p className="text-2xl font-bold">{analysisResult.totalRisks}</p>
                    <p className="text-sm text-gray-600">{t('results.risksFound')}</p>
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
                    <p className="text-sm font-medium">{t('results.highRisk')}</p>
                    <p className="text-xs text-gray-600">{t('results.immediateAttention')}</p>
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
                    <p className="text-sm font-medium">{t('results.mediumRisk')}</p>
                    <p className="text-xs text-gray-600">{t('results.reviewRecommended')}</p>
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
                    <p className="text-sm font-medium">{t('results.lowRisk')}</p>
                    <p className="text-xs text-gray-600">{t('results.minorConcerns')}</p>
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
                    <strong>{t('analysis.findingMoreRisks')}</strong> 
                    <div className="ml-2 flex space-x-1">
                      <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce"></div>
                      <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce" style={{animationDelay: '0.1s'}}></div>
                      <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce" style={{animationDelay: '0.2s'}}></div>
                    </div>
                  </div>
                  <div className="text-sm mt-1">
                    {retryStatus ? (
                      <>
                        <span className="text-yellow-600 font-medium">{retryStatus}</span>
                        <br />
                        {t('analysis.connectionIssues')}
                      </>
                    ) : categoryProgress.currentCategory ? (
                      <>
                        {t('analysis.currentlyAnalyzing', { category: translateCategory(categoryProgress.currentCategory) })} 
                        <span className="ml-2 text-blue-600 font-medium">
                          ({t('analysis.category', { current: categoryProgress.current, total: categoryProgress.total })})
                        </span>
                        <br />
                        {t('analysis.newRisksWillAppear')}
                      </>
                    ) : (
                      t('analysis.analyzingRemaining')
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
                    <strong>{t('analysis.allRisksIdentified')}</strong> 
                    <div className="ml-2 flex space-x-1">
                      <div className="w-2 h-2 bg-green-600 rounded-full animate-pulse"></div>
                      <div className="w-2 h-2 bg-green-600 rounded-full animate-pulse" style={{animationDelay: '0.2s'}}></div>
                      <div className="w-2 h-2 bg-green-600 rounded-full animate-pulse" style={{animationDelay: '0.4s'}}></div>
                    </div>
                  </div>
                  <div className="text-sm mt-1">
                    {t('analysis.deepAnalysisProgress', { current: deepAnalysisProgress.current, total: deepAnalysisProgress.total })}
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

          {/* Analysis Error with Retry Options */}
          {analysisError && (
            <Alert className="mb-6 bg-orange-50 border-orange-200">
              <AlertTriangle className="h-4 w-4 text-orange-600" />
              <AlertDescription className="text-orange-800">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <strong>{t('errors.analysisIncomplete')}</strong>
                    <p className="text-sm mt-1">{analysisError.message}</p>
                  </div>
                  <div className="flex gap-2 ml-4">
                    {analysisError.canRetry && (
                      <Button 
                        size="sm"
                        onClick={retryFailedAnalysis}
                        className="bg-orange-100 border-orange-300 text-orange-700 hover:bg-orange-200"
                      >
                        {t('errors.retryAnalysis')}
                      </Button>
                    )}
                    <Button 
                      size="sm"
                      variant="outline"
                      onClick={continueWithCurrentResults}
                      className="border-orange-300 text-orange-700 hover:bg-orange-50"
                    >
                      {t('errors.continueWithCurrent')}
                    </Button>
                  </div>
                </div>
              </AlertDescription>
            </Alert>
          )}

          <div className="space-y-6">
            {analysisResult.risks.map((risk, index) => (
              <Card key={risk.id} className={risk.isAnalyzing ? "border-blue-300 shadow-md" : ""}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <Badge className={getSeverityColor(risk.severity)}>{t(`risk.${risk.severity}Risk`)}</Badge>
                        {risk.location && extractSectionNumber(risk.location) !== null && (
                          <Badge className="bg-indigo-100 text-indigo-800 border-indigo-200">
                            {risk.location}
                          </Badge>
                        )}
                        <span className="text-sm text-gray-500">{t('risk.riskNumber', { number: index + 1 })}</span>
                        {risk.location && extractSectionNumber(risk.location) === null && (
                          <span className="text-sm text-gray-500">• {risk.location}</span>
                        )}
                        {risk.isAnalyzing && (
                          <Badge className="bg-blue-100 text-blue-800">
                            <Brain className="h-3 w-3 mr-1" />
                            {t('risk.analyzing')}
                          </Badge>
                        )}
                        {risk.analysisComplete && (
                          <Badge className="bg-green-100 text-green-800">
                            <CheckCircle className="h-3 w-3 mr-1" />
                            {t('risk.complete')}
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
                      {t('risk.riskDescription')}
                    </h4>
                    <p className="text-gray-700">{risk.description}</p>
                  </div>

                  {risk.originalText && 
                   risk.originalText.toLowerCase() !== 'n/a' && 
                   risk.originalText.toLowerCase() !== 'not applicable' && 
                   risk.originalText.trim() !== '' && (
                    <div>
                      <h4 className="font-medium mb-2 flex items-center">
                        <FileText className="h-4 w-4 mr-2 text-gray-600" />
                        {t('risk.originalText')}
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
                        <span className="text-sm text-gray-600">{t('risk.analyzingImpact')}</span>
                      </div>
                    </div>
                  )}

                  {risk.businessImpact && (
                    <div>
                      <h4 className="font-medium mb-2 flex items-center">
                        <Target className="h-4 w-4 mr-2 text-orange-600" />
                        {t('risk.businessImpact')}
                        {selectedParty && (
                          <span className="text-xs text-gray-500 ml-2">
                            (for {selectedParty.name})
                          </span>
                        )}
                      </h4>
                      <p className="text-gray-700">{risk.businessImpact}</p>
                    </div>
                  )}

                  {risk.recommendations && risk.recommendations.length > 0 && (
                    <div>
                      <h4 className="font-medium mb-3 flex items-center">
                        <Lightbulb className="h-4 w-4 mr-2 text-green-600" />
                        {t('risk.recommendedActions')}
                        {selectedParty && (
                          <span className="text-xs text-gray-500 ml-2">
                            (to protect {selectedParty.name})
                          </span>
                        )}
                      </h4>
                      <div className="space-y-3">
                        {risk.recommendations.map((rec, idx) => (
                          <div key={idx} className="flex items-start bg-gray-50 rounded-lg p-3">
                            <CheckCircle className="h-4 w-4 text-green-600 mr-3 mt-0.5 flex-shrink-0" />
                            <div className="flex-1">
                              <p className="text-gray-700 mb-2">{rec.action}</p>
                              <div className="flex gap-2">
                                <Badge className={`text-xs ${getPriorityColor(rec.priority)}`}>
                                  {t(`risk.${rec.priority}Priority`)}
                                </Badge>
                                <Badge className={`text-xs ${getEffortColor(rec.effort)}`}>
                                  {t(`risk.${rec.effort}Effort`)}
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
                        {t('risk.suggestedText')}
                      </h4>
                      <div className="bg-green-50 border border-green-200 rounded-lg p-4 space-y-3">
                        {/* Show track changes first when original text exists */}
                        {risk.originalText && 
                         risk.originalText.toLowerCase() !== 'n/a' && 
                         risk.originalText.toLowerCase() !== 'not applicable' && 
                         risk.originalText.trim() !== '' && (
                          <div>
                            <p className="text-xs text-gray-600 mb-2">{t('risk.trackChanges')}</p>
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
                        {/* Then show clean version */}
                        <div>
                          <p className="text-xs text-gray-600 mb-2">
                            {risk.originalText && 
                             risk.originalText.toLowerCase() !== 'n/a' && 
                             risk.originalText.toLowerCase() !== 'not applicable' && 
                             risk.originalText.trim() !== '' 
                              ? t('risk.cleanVersion') 
                              : t('risk.suggestedVersion')}
                          </p>
                          <p className="text-sm text-gray-800">"{risk.suggestedNewText}"</p>
                        </div>
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
                {t('stats.title')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-600">{llmStats.totalCalls}</div>
                  <div className="text-sm text-gray-600">{t('stats.aiModelCalls')}</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600">{(llmStats.totalTime / 1000).toFixed(1)}s</div>
                  <div className="text-sm text-gray-600">{t('stats.totalAnalysisTime')}</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-purple-600">{(llmStats.identifyTime / 1000).toFixed(1)}s</div>
                  <div className="text-sm text-gray-600">{t('stats.riskIdentification')}</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-orange-600">{(llmStats.deepAnalysisTime / 1000).toFixed(1)}s</div>
                  <div className="text-sm text-gray-600">{t('stats.deepAnalysis')}</div>
                </div>
              </div>
              <div className="mt-4 text-center text-sm text-gray-500">
                {t('stats.poweredBy')}
              </div>
            </CardContent>
          </Card>

          <Alert className="mt-8">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              <strong>{t('disclaimer.title')}</strong> {t('disclaimer.text')}
            </AlertDescription>
          </Alert>

          {/* Powered By and Open Source Information */}
          <Card className="mt-8 bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200">
            <CardContent className="p-6">
              <div className="text-center space-y-4">
                <div className="flex items-center justify-center space-x-2">
                  <Brain className="h-5 w-5 text-blue-600" />
                  <span className="text-lg font-medium text-gray-800">Powered by</span>
                </div>
                <div className="space-y-2">
                  <p className="text-gray-700">
                    <a 
                      href="https://console.upstage.ai" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:text-blue-800 font-medium underline"
                    >
                      Upstage Document Parse & Solar LLM
                    </a>
                  </p>
                  <p className="text-sm text-gray-600">
                    Advanced AI technology for intelligent document analysis
                  </p>
                </div>
                <div className="pt-2 border-t border-blue-200">
                  <div className="flex items-center justify-center space-x-2">
                    <Globe className="h-4 w-4 text-green-600" />
                    <span className="text-sm text-gray-700">
                      Open Source • Available on{" "}
                      <a 
                        href="https://github.com/hunkim/before-sign" 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-green-600 hover:text-green-800 font-medium underline"
                      >
                        GitHub
                      </a>
                    </span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
          <I18nDebug />
        </div>
      </div>
    )
  }

  return null
}
