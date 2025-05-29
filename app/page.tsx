"use client"

import React, { useState, useCallback } from "react"
import { Upload, FileText, AlertTriangle, CheckCircle, Lightbulb, ArrowLeft, BookOpen, Shield, Target, Clock, Brain, Globe, Share2, Copy, Check, ChevronDown, ChevronUp, User, Trash2 } from "lucide-react"
import { useTranslation } from 'react-i18next'
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Alert, AlertDescription } from "@/components/ui/alert"
import LanguageSwitcher from "@/components/LanguageSwitcher"
import I18nDebug from "@/components/I18nDebug"
import { useAuth } from '@/lib/auth-context'
import { AuthButton } from '@/components/AuthButton'
import { DocumentSidebar } from '@/components/DocumentSidebar'
import { DocumentService } from '@/lib/document-service'

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
  thinking?: string
}

interface AnalysisResult {
  totalRisks: number
  risks: Risk[]
  summary: string
  analysisComplete: boolean
  isAnalyzing?: boolean
  parseComplete?: boolean
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

// Utility function to parse LLM response and extract thinking process
const parseLLMResponse = (rawResponse: any) => {
  // Convert to string if it's an object
  let content = typeof rawResponse === 'string' ? rawResponse : JSON.stringify(rawResponse)
  let thinking = null
  let parsedContent = rawResponse

  // If the response is already an object, check if any field contains thinking tags
  if (typeof rawResponse === 'object' && rawResponse !== null) {
    // Check each field for thinking tags
    const checkForThinking = (obj: any): any => {
      if (typeof obj === 'string') {
        const thinkMatch = obj.match(/<think>([\s\S]*?)<\/think>/)
        if (thinkMatch) {
          thinking = thinkMatch[1].trim()
          return obj.replace(/<think>[\s\S]*?<\/think>/, '').trim()
        }
        return obj
      } else if (typeof obj === 'object' && obj !== null) {
        const cleaned: any = {}
        for (const [key, value] of Object.entries(obj)) {
          cleaned[key] = checkForThinking(value)
        }
        return cleaned
      }
      return obj
    }

    parsedContent = checkForThinking(rawResponse)
    
    return {
      thinking,
      parsedContent,
      rawContent: content
    }
  }

  // Handle string responses
  // Extract thinking process if present
  const thinkMatch = content.match(/<think>([\s\S]*?)<\/think>/)
  if (thinkMatch) {
    thinking = thinkMatch[1].trim()
    content = content.replace(/<think>[\s\S]*?<\/think>/, '').trim()
  }

  // Try to parse JSON from clean content
  try {
    // Look for JSON block
    const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) || 
                     content.match(/\{[\s\S]*\}/)
    
    if (jsonMatch) {
      const jsonStr = jsonMatch[1] || jsonMatch[0]
      parsedContent = JSON.parse(jsonStr)
    } else if (content.startsWith('{') && content.endsWith('}')) {
      parsedContent = JSON.parse(content)
    }
  } catch (error) {
    console.warn('Failed to parse JSON from LLM response:', error)
    // Return the raw content if JSON parsing fails
    parsedContent = { rawContent: content }
  }

  return {
    thinking,
    parsedContent,
    rawContent: content
  }
}

// Collapsible thinking component
const ThinkingProcess = ({ thinking }: { thinking: string }) => {
  const [isExpanded, setIsExpanded] = useState(false)

  if (!thinking) return null

  return (
    <div className="mt-4 border border-gray-200 rounded-lg overflow-hidden">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-4 py-2 bg-gray-50 hover:bg-gray-100 flex items-center justify-between text-sm font-medium text-gray-700 transition-colors"
      >
        <div className="flex items-center">
          <Brain className="h-4 w-4 mr-2 text-blue-600" />
          AI Thinking Process
        </div>
        {isExpanded ? (
          <ChevronUp className="h-4 w-4" />
        ) : (
          <ChevronDown className="h-4 w-4" />
        )}
      </button>
      {isExpanded && (
        <div className="p-4 bg-gray-50 border-t border-gray-200">
          <div className="text-sm text-gray-600 leading-relaxed whitespace-pre-wrap">
            {thinking}
          </div>
        </div>
      )}
    </div>
  )
}

export default function BeforeSignApp() {
  const { t } = useTranslation()
  
  // DEBUGGING: Add a simple log to ensure this code is running
  console.log('🚀 BeforeSignApp component loaded - debugging enabled')
  
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
  const [categoryProgress, setCategoryProgress] = useState({ current: 0, total: 0, currentCategory: "" })
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
  const [isDeletingShare, setIsDeletingShare] = useState(false)

  // Party selection state
  const [parsedContent, setParsedContent] = useState<string | null>(null)
  const [identifiedParties, setIdentifiedParties] = useState<Party[]>([])
  const [selectedParty, setSelectedParty] = useState<Party | null>(null)
  const [isIdentifyingParties, setIsIdentifyingParties] = useState(false)

  // Authentication and document history state
  const { user } = useAuth()
  
  // DEBUGGING: Log authentication status whenever it changes
  console.log('👤 User state updated:', {
    isLoggedIn: !!user,
    userEmail: user?.email,
    timestamp: new Date().toISOString()
  })
  
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null)
  const [documentSaveError, setDocumentSaveError] = useState<string | null>(null)
  const [currentHtmlContent, setCurrentHtmlContent] = useState<string | null>(null)
  const [hasAutoSaved, setHasAutoSaved] = useState(false)
  const [showAutoSaveSuccess, setShowAutoSaveSuccess] = useState(false)

  // 🔥 NEW: Background analysis state - separate from displayed content
  const [backgroundAnalysis, setBackgroundAnalysis] = useState<{
    documentId: string | null
    isRunning: boolean
    step: 'identifying' | 'category-analysis' | 'deep-analysis' | 'complete'
    parsedContent: string | null
    selectedParty: Party | null
    currentAnalysisResult: AnalysisResult | null
    fileName: string | null
    htmlContent: string | null
    categoryProgress: { current: number, total: number, currentCategory: string }
    deepAnalysisProgress: { current: number, total: number }
    currentAnalyzingRisk: string | null
  }>({
    documentId: null,
    isRunning: false,
    step: 'identifying',
    parsedContent: null,
    selectedParty: null,
    currentAnalysisResult: null,
    fileName: null,
    htmlContent: null,
    categoryProgress: { current: 0, total: 0, currentCategory: "" },
    deepAnalysisProgress: { current: 0, total: 0 },
    currentAnalyzingRisk: null
  })

  // 🔥 NEW: Track if currently displayed document is being analyzed in background
  const isDisplayedDocumentBeingAnalyzed = selectedDocumentId === backgroundAnalysis.documentId && backgroundAnalysis.isRunning

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
    // 🔥 NEW: Update both displayed state and background analysis state as needed
    
    // Always update displayed analysis result if it has this risk
    setAnalysisResult(prev => {
      if (!prev) return prev
      
      const hasRisk = prev.risks.some(risk => risk.id === riskId)
      if (!hasRisk) return prev
      
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
    
    // 🔥 NEW: Also update background analysis state if this risk belongs to background analysis
    setBackgroundAnalysis(prev => {
      if (!prev.currentAnalysisResult) return prev
      
      const hasRisk = prev.currentAnalysisResult.risks.some(risk => risk.id === riskId)
      if (!hasRisk) return prev
      
      const updatedRisks = prev.currentAnalysisResult.risks.map(risk => 
        risk.id === riskId 
          ? { ...risk, ...updatedRisk }
          : risk
      )
      
      const sortedRisks = sortRisksBySeverityAndSection(updatedRisks)
      
      return {
        ...prev,
        currentAnalysisResult: {
          ...prev.currentAnalysisResult,
          risks: sortedRisks
        }
      }
    })
  }, [])

  const getNextCategoryRisks = async (contractText: string, existingRisks: Risk[], categoryIndex: number = 0, retryCount: number = 0, targetDocumentId?: string) => {
    const maxRetries = 3
    
    // 🔥 NEW: Determine if this is background analysis or current display analysis
    const isBackgroundAnalysis = targetDocumentId && targetDocumentId !== selectedDocumentId
    
    try {
      console.log(`Getting category risks for index ${categoryIndex}, attempt ${retryCount + 1}/${maxRetries + 1}`, {
        isBackgroundAnalysis,
        targetDocumentId,
        currentSelectedDocumentId: selectedDocumentId
      })
      
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
          selectedParty: isBackgroundAnalysis ? backgroundAnalysis.selectedParty : selectedParty
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
          nextCategoryIndex: categoryRisks.nextCategoryIndex,
          isBackgroundAnalysis
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
        
        // 🔥 NEW: Update appropriate progress state based on analysis type
        const newCategoryProgress = {
          current: categoryIndex + 1,
          total: categoryRisks.totalCategories || 5,
          currentCategory: categoryRisks.categoryAnalyzed || `Category ${categoryIndex + 1}`
        }
        
        if (isBackgroundAnalysis) {
          // Update background analysis progress
          setBackgroundAnalysis(prev => ({
            ...prev,
            categoryProgress: newCategoryProgress
          }))
        } else {
          // Update displayed progress
          setCategoryProgress(newCategoryProgress)
        }
        
        let allRisks: Risk[] = []
        
        // 🔥 NEW: Handle risk updates for appropriate analysis state
        if (categoryRisks.risks && categoryRisks.risks.length > 0) {
          if (isBackgroundAnalysis) {
            // Update background analysis state
            setBackgroundAnalysis(prev => {
              if (prev.currentAnalysisResult) {
                const updatedRisks = [...prev.currentAnalysisResult.risks, ...categoryRisks.risks]
                const sortedRisks = sortRisksBySeverityAndSection(updatedRisks)
                const updatedAnalysisResult = {
                  ...prev.currentAnalysisResult,
                  totalRisks: sortedRisks.length,
                  risks: sortedRisks,
                  summary: `Found ${sortedRisks.length} total risks so far. Continuing analysis...`
                }
                
                // Save to database immediately for background analysis
                if (user && targetDocumentId) {
                  console.log('🔄 Updating background analysis in database:', {
                    categoryAnalyzed: categoryRisks.categoryAnalyzed,
                    newRisksFound: categoryRisks.risks.length,
                    totalRisksNow: sortedRisks.length
                  })
                  
                  const progressResult = {
                    ...updatedAnalysisResult,
                    summary: `Found ${sortedRisks.length} risks so far. ${categoryRisks.categoryAnalyzed} analysis complete.`,
                    isAnalyzing: true,
                    analysisComplete: false
                  }
                  
                  DocumentService.updateDocumentAnalysis(targetDocumentId, progressResult)
                    .then(() => {
                      console.log('✅ Background analysis updated in database')
                    })
                    .catch(error => {
                      console.error('❌ Failed to update background analysis in database:', error)
                    })
                }
                
                return {
                  ...prev,
                  currentAnalysisResult: updatedAnalysisResult
                }
              }
              return prev
            })
          } else {
            // Update displayed analysis state (existing logic)
            setAnalysisResult(prev => {
              if (prev) {
                const updatedRisks = [...prev.risks, ...categoryRisks.risks]
                const sortedRisks = sortRisksBySeverityAndSection(updatedRisks)
                const newAnalysisResult = {
                  ...prev,
                  totalRisks: sortedRisks.length,
                  risks: sortedRisks,
                  summary: `Found ${sortedRisks.length} total risks so far. Continuing analysis...`
                }
                
                // Update database if this is also the selected document
                if (user && selectedDocumentId) {
                  const progressResult = {
                    ...newAnalysisResult,
                    summary: `Found ${sortedRisks.length} risks so far. ${categoryRisks.categoryAnalyzed} analysis complete.`,
                    isAnalyzing: true,
                    analysisComplete: false
                  }
                  
                  DocumentService.updateDocumentAnalysis(selectedDocumentId, progressResult)
                    .then(() => {
                      console.log('✅ Displayed analysis updated in database')
                    })
                    .catch(error => {
                      console.error('❌ Failed to update displayed analysis in database:', error)
                    })
                }
                
                return newAnalysisResult
              }
              return prev
            })
          }
        }
        
        // Check if there are more categories to analyze
        if (categoryRisks.hasMoreCategories) {
          // Continue with next category
          console.log(`Continuing with next category (${categoryRisks.nextCategoryIndex})...`)
          await getNextCategoryRisks(contractText, allRisks, categoryRisks.nextCategoryIndex, 0, targetDocumentId)
        } else {
          console.log('All categories completed! Finalizing risk identification...')
          
          // 🔥 NEW: Handle completion for appropriate analysis state
          if (isBackgroundAnalysis) {
            // Update background analysis completion
            setBackgroundAnalysis(prev => {
              if (prev.currentAnalysisResult) {
                const finalResult = {
                  ...prev.currentAnalysisResult,
                  summary: `Found ${prev.currentAnalysisResult.totalRisks} total risks. Now analyzing each risk in detail...`
                }
                
                // Start deep analysis for background
                setTimeout(() => {
                  if (prev.currentAnalysisResult) {
                    performBackgroundDeepAnalysis(prev.currentAnalysisResult.risks, targetDocumentId!)
                  }
                }, 100)
                
                return {
                  ...prev,
                  step: 'deep-analysis' as const,
                  currentAnalysisResult: finalResult,
                  categoryProgress: { current: 0, total: 0, currentCategory: "" }
                }
              }
              return prev
            })
          } else {
            // Update displayed analysis completion (existing logic)
            setAnalysisResult(prev => {
              if (!prev) return prev
              return {
                ...prev,
                summary: `Found ${prev.totalRisks} total risks. Now analyzing each risk in detail...`
              }
            })
            
            setIsGettingRemainingRisks(false)
            setCategoryProgress({ current: 0, total: 0, currentCategory: "" })
            
            // Start deep analysis for displayed content
            setAnalysisResult(prev => {
              if (prev && prev.risks.length > 0) {
                performDeepAnalysis(prev.risks)
              }
              return prev
            })
          }
        }
      } else {
        // Handle non-OK responses (existing error handling logic)
        const errorText = await response.text()
        console.error(`API /remaining-risks failed with status ${response.status}:`, errorText)
        
        if (response.status === 401 || errorText.includes('UPSTAGE_API_KEY')) {
          setConfigError('API configuration error. Please check your UPSTAGE_API_KEY.')
          if (isBackgroundAnalysis) {
            setBackgroundAnalysis(prev => ({ ...prev, isRunning: false }))
          } else {
            setIsGettingRemainingRisks(false)
            setCategoryProgress({ current: 0, total: 0, currentCategory: "" })
          }
          return
        }
        
        // Retry logic
        if (retryCount < maxRetries) {
          console.log(`Retrying category risks in 2 seconds... (${retryCount + 1}/${maxRetries})`)
          if (!isBackgroundAnalysis) {
            setRetryStatus(`Retrying... (${retryCount + 1}/${maxRetries})`)
          }
          await new Promise(resolve => setTimeout(resolve, 2000))
          if (!isBackgroundAnalysis) {
            setRetryStatus(null)
          }
          return getNextCategoryRisks(contractText, existingRisks, categoryIndex, retryCount + 1, targetDocumentId)
        } else {
          throw new Error(`API failed after ${maxRetries + 1} attempts: ${response.status} ${errorText}`)
        }
      }
    } catch (error) {
      console.error('Failed to get category risks:', error)
      
      // Handle retries and errors
      if (retryCount < maxRetries && (error instanceof Error && (error.name === 'AbortError' || error.message.includes('fetch')))) {
        console.log(`Network error, retrying in 3 seconds... (${retryCount + 1}/${maxRetries})`)
        if (!isBackgroundAnalysis) {
          setRetryStatus(`Network error, retrying... (${retryCount + 1}/${maxRetries})`)
        }
        await new Promise(resolve => setTimeout(resolve, 3000))
        if (!isBackgroundAnalysis) {
          setRetryStatus(null)
        }
        return getNextCategoryRisks(contractText, existingRisks, categoryIndex, retryCount + 1, targetDocumentId)
      }
      
      // Final failure handling
      if (isBackgroundAnalysis) {
        console.error('Background analysis failed:', error)
        setBackgroundAnalysis(prev => ({ ...prev, isRunning: false }))
      } else {
        setIsGettingRemainingRisks(false)
        setCategoryProgress({ current: 0, total: 0, currentCategory: "" })
        
        if (stuckTimeout) {
          clearTimeout(stuckTimeout)
          setStuckTimeout(null)
        }
        
        if (error instanceof Error && (error.message.includes('UPSTAGE_API_KEY') || error.message.includes('API key'))) {
          setConfigError('API configuration error. Please check your UPSTAGE_API_KEY.')
        } else {
          setAnalysisError({
            type: 'category',
            message: `Failed to complete risk identification after ${maxRetries + 1} attempts. You can retry the analysis or continue with the ${existingRisks.length} risks already found.`,
            canRetry: true,
            retryData: { contractText, existingRisks, categoryIndex }
          })
        }
      }
    }
  }

  const performBackgroundDeepAnalysis = async (risks: Risk[], targetDocumentId: string) => {
    console.log(`🔄 Starting background deep analysis for ${risks.length} risks in document ${targetDocumentId}...`)
    
    if (!risks || risks.length === 0) {
      console.log('No risks to analyze in background')
      setBackgroundAnalysis(prev => ({ ...prev, isRunning: false, step: 'complete' }))
      return
    }
    
    // Initialize background progress tracking
    setBackgroundAnalysis(prev => ({
      ...prev,
      deepAnalysisProgress: { current: 0, total: risks.length },
      currentAnalyzingRisk: null
    }))
    
    for (let i = 0; i < risks.length; i++) {
      const risk = risks[i]
      console.log(`🔍 Background deep analyzing risk ${i + 1}/${risks.length}: ${risk.id} - ${risk.title}`)
      
      // Update background progress
      setBackgroundAnalysis(prev => ({
        ...prev,
        deepAnalysisProgress: { current: i + 1, total: risks.length },
        currentAnalyzingRisk: risk.id
      }))
      
      // Mark this risk as being analyzed (this will update both states if needed)
      updateRiskAnalysis(risk.id, { isAnalyzing: true })

      try {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 180000) // 3 minute timeout
        
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
            selectedParty: backgroundAnalysis.selectedParty
          }),
          signal: controller.signal
        })

        clearTimeout(timeoutId)

        if (response.ok) {
          const deepAnalysis = await response.json()
          console.log(`Background deep analysis completed for ${risk.id}:`, deepAnalysis)
          
          // Parse the LLM response to extract thinking process
          const parsed = parseLLMResponse(deepAnalysis)
          const analysisData = parsed.parsedContent || deepAnalysis
          
          // Update with deep analysis results (this will update both states if needed)
          updateRiskAnalysis(risk.id, {
            description: analysisData.businessImpact || risk.description,
            businessImpact: analysisData.businessImpact,
            recommendations: analysisData.recommendations,
            suggestedNewText: analysisData.suggestedNewText,
            thinking: parsed.thinking || undefined,
            isAnalyzing: false,
            analysisComplete: true
          })
          
          console.log(`Background risk ${risk.id} updated with analysis results`)
        } else {
          console.error(`Background deep analysis API failed for ${risk.id}:`, response.status, response.statusText)
          
          // Mark as complete even if analysis failed
          updateRiskAnalysis(risk.id, { 
            description: "Background analysis failed - please review manually",
            isAnalyzing: false, 
            analysisComplete: true,
            businessImpact: "Background analysis failed - please review manually",
            recommendations: [{
              action: "Review this risk manually with legal counsel",
              priority: "medium" as const,
              effort: "medium" as const
            }]
          })
        }
      } catch (error) {
        console.error('Background deep analysis failed for risk:', risk.id, error)
        
        const isTimeout = error instanceof Error && error.name === 'AbortError'
        const errorMessage = isTimeout 
          ? "Background analysis timed out - please review manually" 
          : "Background network error during analysis - please review manually"
        
        updateRiskAnalysis(risk.id, { 
          description: errorMessage,
          isAnalyzing: false, 
          analysisComplete: true,
          businessImpact: errorMessage,
          recommendations: [{
            action: isTimeout 
              ? "This background analysis timed out. Try again or review manually with legal counsel"
              : "Review this risk manually with legal counsel",
            priority: "medium" as const,
            effort: "medium" as const
          }],
          suggestedNewText: "Please consult with legal counsel for appropriate replacement text."
        })
      }

      // Small delay between analyses
      await new Promise(resolve => setTimeout(resolve, 500))

      // Periodically save progress during background analysis
      if ((i + 1) % 3 === 0) {
        setTimeout(async () => {
          try {
            // Get current background analysis result and save it
            const currentBackgroundResult = backgroundAnalysis.currentAnalysisResult
            if (currentBackgroundResult && user) {
              const progressResult = {
                ...currentBackgroundResult,
                summary: `Background analysis: ${i + 1}/${risks.length} risks analyzed in detail.`,
                isAnalyzing: true,
                analysisComplete: false
              }
              
              await DocumentService.updateDocumentAnalysis(targetDocumentId, progressResult)
              console.log(`✅ Background document updated after analyzing ${i + 1}/${risks.length} risks`)
            }
          } catch (error) {
            console.error('❌ Failed to update background document during deep analysis:', error)
          }
        }, 100)
      }
      
      console.log(`✅ Completed background deep analysis for risk ${i + 1}/${risks.length}: ${risk.id}`)
    }

    console.log('🎉 *** BACKGROUND DEEP ANALYSIS COMPLETED *** 🎉')
    
    // Update background analysis completion
    setBackgroundAnalysis(prev => {
      if (!prev.currentAnalysisResult) return prev
      
      const finalAnalysisResult = {
        ...prev.currentAnalysisResult,
        summary: `Background analysis complete! Found ${prev.currentAnalysisResult.totalRisks} risks with detailed recommendations.`,
        analysisComplete: true,
        isAnalyzing: false
      }
      
      // Save final completion status to database
      if (user) {
        console.log('🔄 Saving final background analysis completion status to database...')
        
        setTimeout(() => {
          DocumentService.updateDocumentAnalysis(targetDocumentId, finalAnalysisResult)
            .then(() => {
              console.log('🎉 *** BACKGROUND ANALYSIS COMPLETION SAVED TO DATABASE *** 🎉')
            })
            .catch(error => {
              console.error('❌ Failed to save background analysis completion status:', error)
            })
        }, 200)
      }
      
      return {
        ...prev,
        isRunning: false,
        step: 'complete',
        currentAnalysisResult: finalAnalysisResult,
        currentAnalyzingRisk: null,
        deepAnalysisProgress: { current: 0, total: 0 }
      }
    })
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
      console.log(`🔍 Deep analyzing risk ${i + 1}/${risks.length}: ${risk.id} - ${risk.title}`)
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
          
          // Parse the LLM response to extract thinking process
          const parsed = parseLLMResponse(deepAnalysis)
          const analysisData = parsed.parsedContent || deepAnalysis
          
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
            description: analysisData.businessImpact || risk.description, // Use business impact as the main description
            businessImpact: analysisData.businessImpact,
            recommendations: analysisData.recommendations,
            suggestedNewText: analysisData.suggestedNewText,
            thinking: parsed.thinking || undefined, // Add thinking process, convert null to undefined
            isAnalyzing: false,
            analysisComplete: true
          })
          
          console.log(`Risk ${risk.id} updated with:`, {
            businessImpact: analysisData.businessImpact,
            recommendations: analysisData.recommendations?.length || 0,
            suggestedNewText: analysisData.suggestedNewText ? 'Yes' : 'No',
            thinking: parsed.thinking ? 'Yes' : 'No'
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

      // Periodically save progress during deep analysis for logged-in users
      if (user && selectedDocumentId && (i + 1) % 3 === 0) {
        setTimeout(async () => {
          try {
            await saveCurrentDocument()
            console.log(`Document updated after analyzing ${i + 1}/${risks.length} risks`)
          } catch (error) {
            console.error('Failed to update document during deep analysis:', error)
          }
        }, 100)
      }
      
      console.log(`✅ Completed deep analysis for risk ${i + 1}/${risks.length}: ${risk.id}`)
    }

    console.log('🎉 *** ALL DEEP ANALYSIS COMPLETED *** 🎉')
    console.log(`Analyzed ${risks.length} risks total`)
    setCurrentAnalyzingRisk(null)
    setDeepAnalysisProgress({ current: 0, total: 0 })
    
    // 🔥 IMMEDIATE FINAL UPDATE: Update state and database together
    setAnalysisResult(prev => {
      if (!prev) return prev
      
      const finalAnalysisResult = {
        ...prev,
        summary: `Analysis complete! Found ${prev.totalRisks} risks with detailed recommendations.`,
        analysisComplete: true,
        isAnalyzing: false
      }
      
      // 🔥 IMMEDIATE DATABASE UPDATE: Save final completion status
      if (user && selectedDocumentId) {
        console.log('🔥 Immediately updating database with final completion status:', {
          totalRisks: finalAnalysisResult.totalRisks,
          risksCount: finalAnalysisResult.risks?.length,
          analysisComplete: true,
          isAnalyzing: false
        })
        
        // Small delay to ensure any pending periodic saves complete first
        setTimeout(() => {
          console.log('🕐 Executing final database update after 200ms delay...')
          DocumentService.updateDocumentAnalysis(selectedDocumentId, finalAnalysisResult)
            .then(() => {
              console.log('🎉 *** FINAL COMPLETION STATUS SAVED TO DATABASE *** 🎉')
              console.log('✅ Analysis is now complete and sidebar should update')
              setShowAutoSaveSuccess(true)
              setTimeout(() => setShowAutoSaveSuccess(false), 5000)
            })
            .catch(error => {
              console.error('❌ Failed to save final completion status:', error)
            })
        }, 200) // Short delay to prevent race conditions with periodic saves
      } else {
        console.log('⚠️ No user or selectedDocumentId - skipping final database update')
      }
      
      return finalAnalysisResult
    })
  }

  const handleFileUpload = async (file: File) => {
    console.log('🚀 handleFileUpload started with file:', file.name)
    setUploadedFile(file)
    setIsUploading(true)
    
    try {
      // Step 1: Upload and Parse with Upstage DocParse
      setCurrentStep("parsing")
      console.log('📄 Starting document parsing...')
      
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
      
      // Store HTML content for potential saving
      if (uploadResult.parsedContent.html) {
        console.log('✅ HTML content received and stored, length:', uploadResult.parsedContent.html.length)
        setCurrentHtmlContent(uploadResult.parsedContent.html)
        
        // 🚀 IMMEDIATE SAVE: Create document in history as soon as parsing is complete
        if (user) {
          console.log('💾 Creating immediate history entry after document parsing...')
          try {
            // Create initial document with parsing complete status
            const initialAnalysisResult = {
              totalRisks: 0,
              risks: [],
              summary: 'Document parsed successfully. Ready for analysis.',
              analysisComplete: false,
              isAnalyzing: false,
              parseComplete: true
            }
            
            const documentId = await DocumentService.saveDocument(
              user.uid,
              file.name,
              uploadResult.parsedContent.html,
              initialAnalysisResult
            )
            
            setSelectedDocumentId(documentId)
            console.log('✅ Immediate history entry created:', documentId)
            
            // Real-time Firestore listener will automatically update sidebar
          } catch (error) {
            console.error('❌ Failed to create immediate history entry:', error)
          }
        }
      } else {
        console.warn('⚠️ No HTML content in upload result!')
      }

      // Step 2: Identify parties in the contract
      setCurrentStep("party-selection")
      setIsIdentifyingParties(true)
      console.log('🎭 Starting party identification...')
      
      const partiesResponse = await fetch('/api/identify-parties', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text: uploadResult.parsedContent.text }),
      })

      if (!partiesResponse.ok) {
        throw new Error('Failed to identify parties')
      }

      const partiesResult = await partiesResponse.json()
      setIdentifiedParties(partiesResult.parties || [])
      setIsIdentifyingParties(false)
      console.log('✅ Party identification complete, found', partiesResult.parties?.length || 0, 'parties')
      
    } catch (error) {
      setIsUploading(false)
      setIsIdentifyingParties(false)
      
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

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const files = Array.from(e.dataTransfer.files)
    if (files.length > 0) {
      handleFileUpload(files[0])
    }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files && files.length > 0) {
      handleFileUpload(files[0])
    }
  }

  const startRiskAnalysis = async () => {
    console.log('🎯 startRiskAnalysis called with:', {
      selectedParty: selectedParty?.name,
      parsedContent: !!parsedContent,
      parsedContentLength: parsedContent?.length,
      user: !!user,
      userEmail: user?.email,
      currentHtmlContent: !!currentHtmlContent,
      htmlContentLength: currentHtmlContent?.length,
      uploadedFile: !!uploadedFile,
      uploadedFileName: uploadedFile?.name,
      currentSelectedDocumentId: selectedDocumentId
    })
    
    if (!selectedParty || !parsedContent) {
      console.error('❌ Missing required data for analysis:', {
        selectedParty: !!selectedParty,
        parsedContent: !!parsedContent
      })
      return
    }
    
    // Debug authentication status first
    console.log('🔐 Authentication Status:', {
      isLoggedIn: !!user,
      userEmail: user?.email,
      userId: user?.uid,
      userDisplayName: user?.displayName
    })
    
    setCurrentStep("identifying")
    setIdentifyProgress(0)
    
    // 🔄 MARK AS ANALYZING: Update document to show it's being analyzed
    if (user && selectedDocumentId) {
      console.log('🔄 Marking document as analyzing...')
      try {
        const analyzingResult = {
          totalRisks: 0,
          risks: [],
          summary: 'Analysis in progress...',
          analysisComplete: false,
          isAnalyzing: true,
          parseComplete: true
        }
        
        await DocumentService.updateDocumentAnalysis(selectedDocumentId, analyzingResult)
        console.log('✅ Document marked as analyzing')
        
        // 🔥 NEW: Initialize background analysis state for this document
        setBackgroundAnalysis({
          documentId: selectedDocumentId,
          isRunning: true,
          step: 'identifying',
          parsedContent: parsedContent,
          selectedParty: selectedParty,
          currentAnalysisResult: null,
          fileName: uploadedFile?.name || 'Unknown',
          htmlContent: currentHtmlContent,
          categoryProgress: { current: 0, total: 0, currentCategory: "" },
          deepAnalysisProgress: { current: 0, total: 0 },
          currentAnalyzingRisk: null
        })
        
        console.log('🔥 Background analysis state initialized for document:', selectedDocumentId)
        
        // Real-time Firestore listener will automatically update sidebar
      } catch (error) {
        console.error('❌ Failed to mark document as analyzing:', error)
      }
    }

    // Simulate initial progress
    const progressInterval = setInterval(() => {
      setIdentifyProgress(prev => {
        if (prev >= 80) {
          clearInterval(progressInterval)
          return 80
        }
        return prev + Math.random() * 10 + 5
      })
    }, 500)

    try {
      // Get initial risks
      const response = await fetch('/api/analysis', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          text: parsedContent,
          selectedParty: selectedParty
        }),
      })

      clearInterval(progressInterval)
      setIdentifyProgress(100)

      if (!response.ok) {
        throw new Error('Failed to analyze document')
      }

      const result = await response.json()
      
      if (result.llmStats) {
        setLlmStats(prev => ({
          ...prev,
          totalCalls: prev.totalCalls + result.llmStats.calls,
          totalTime: prev.totalTime + result.llmStats.totalTime,
          identifyTime: prev.identifyTime + result.llmStats.totalTime
        }))
      }

      // Sort risks and set initial result
      const sortedRisks = sortRisksBySeverityAndSection(result.risks || [])
      
      const analysisResult: AnalysisResult = {
        totalRisks: sortedRisks.length,
        risks: sortedRisks.map(risk => ({
          ...risk,
          isAnalyzing: false,
          analysisComplete: false
        })),
        summary: result.summary || 'Initial risk analysis complete. Finding additional risks...',
        analysisComplete: false
      }

      setAnalysisResult(analysisResult)
      setCurrentStep("results") // Show results immediately!

      // 🔥 NEW: Update background analysis state with initial results
      setBackgroundAnalysis(prev => ({
        ...prev,
        currentAnalysisResult: analysisResult,
        step: 'category-analysis'
      }))

      // 🔄 IMMEDIATE UPDATE: Save initial risks to database for real-time sidebar updates
      if (user && selectedDocumentId) {
        console.log('🔄 Updating document with initial risks:', {
          totalRisks: analysisResult.totalRisks,
          risksCount: analysisResult.risks.length
        })
        try {
          const progressResult = {
            ...analysisResult,
            summary: `Found ${analysisResult.totalRisks} initial risks. Finding additional risks...`,
            isAnalyzing: true, // Still analyzing
            analysisComplete: false
          }
          
          await DocumentService.updateDocumentAnalysis(selectedDocumentId, progressResult)
          console.log('✅ Document updated with initial risks')
          
          // Real-time Firestore listener will automatically update sidebar
        } catch (error) {
          console.error('❌ Failed to update document with initial risks:', error)
        }
      }

      // Save document if user is logged in - with debugging
      console.log('🔍 Save conditions check:', {
        user: !!user,
        uploadedFile: !!uploadedFile,
        currentHtmlContent: !!currentHtmlContent,
        analysisResult: !!analysisResult
      })
      
      if (user) {
        if (!uploadedFile) {
          console.warn('❌ Cannot save: No uploaded file')
        } else if (!currentHtmlContent) {
          console.warn('❌ Cannot save: No HTML content')
        } else {
          console.log('✅ All conditions met, saving document...')
          try {
            await saveCurrentDocument()
            console.log('✅ Document saved successfully')
          } catch (error) {
            console.error('❌ Failed to save document:', error)
          }
        }
      } else {
        console.log('ℹ️ User not logged in, skipping save')
      }

      // Start background processes AFTER showing results
      setTimeout(async () => {
        // First, get additional risks from all categories
        setIsGettingRemainingRisks(true)
        await getNextCategoryRisks(parsedContent, analysisResult.risks, 0, 0, selectedDocumentId || undefined)
        
        // After all risks are found, the getNextCategoryRisks will automatically start deep analysis
      }, 100) // Small delay to ensure UI is rendered

    } catch (error) {
      clearInterval(progressInterval)
      setIdentifyProgress(0)
      
      if (error instanceof Error && error.message.includes('UPSTAGE_API_KEY')) {
        setConfigError('API configuration error. Please check your UPSTAGE_API_KEY.')
      } else {
        setConfigError('An error occurred during risk analysis. Please try again.')
      }
    }
  }

  const retryFailedAnalysis = () => {
    if (!analysisError?.retryData) return
    
    setAnalysisError(null)
    
    if (analysisError.type === 'category') {
      const { contractText, existingRisks, categoryIndex } = analysisError.retryData
      setIsGettingRemainingRisks(true)
      getNextCategoryRisks(contractText, existingRisks, categoryIndex)
    }
  }

  const continueWithCurrentResults = () => {
    setAnalysisError(null)
    setIsGettingRemainingRisks(false)
    setCategoryProgress({ current: 0, total: 0, currentCategory: "" })
    
    // Start deep analysis with current risks
    setAnalysisResult(prev => {
      if (prev && prev.risks.length > 0) {
        performDeepAnalysis(prev.risks)
      }
      return prev
    })
  }

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'high':
        return 'bg-red-100 text-red-800 border-red-200'
      case 'medium':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200'
      case 'low':
        return 'bg-blue-100 text-blue-800 border-blue-200'
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200'
    }
  }

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high':
        return 'bg-red-100 text-red-800'
      case 'medium':
        return 'bg-yellow-100 text-yellow-800'
      case 'low':
        return 'bg-green-100 text-green-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  const getEffortColor = (effort: string) => {
    switch (effort) {
      case 'high':
        return 'bg-purple-100 text-purple-800'
      case 'medium':
        return 'bg-blue-100 text-blue-800'
      case 'low':
        return 'bg-green-100 text-green-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  const resetApp = () => {
    setCurrentStep("upload")
    setUploadedFile(null)
    setIdentifiedParties([])
    setSelectedParty(null)
    setAnalysisResult(null)
    setConfigError(null)
    setSelectedDocumentId(null)
    setDocumentSaveError(null)
    setCurrentHtmlContent(null)
    setHasAutoSaved(false)
    setShowAutoSaveSuccess(false)
    setIsGettingRemainingRisks(false)
    setCurrentAnalyzingRisk(null)
    setLlmStats({
      totalCalls: 0,
      totalTime: 0,
      parseTime: 0,
      identifyTime: 0,
      deepAnalysisTime: 0
    })
    setShareUrl(null)
    setShowCopySuccess(false)
    setShowShareSuccess(false)
    setIsSharing(false)
    setIsDeletingShare(false)
  }

  const handleShareReport = async () => {
    // 🔥 FIXED: Work with both new analysis and loaded historical documents
    if (!analysisResult) return

    // 🔗 NEW: Check if document is already shared
    if (shareUrl) {
      console.log('📋 Document already shared, showing existing share URL:', shareUrl)
      return // Document is already shared, show existing URL
    }

    setIsSharing(true)
    try {
      // Use the document title from loaded document or filename from uploaded file
      const documentName = uploadedFile?.name || 'Analysis Report'
      
      const response = await fetch('/api/share-report', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          analysisResult,
          fileName: documentName,
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
      
      // 🔗 NEW: Save share info to document if we have a selected document
      if (user && selectedDocumentId) {
        try {
          await DocumentService.updateDocumentShareInfo(selectedDocumentId, data.shareId, data.shareUrl)
          console.log('✅ Share info saved to document:', selectedDocumentId)
        } catch (error) {
          console.error('❌ Failed to save share info to document:', error)
          // Don't fail the whole operation if this fails
        }
      }
      
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

  const deleteShareReport = async () => {
    if (!shareUrl) return

    setIsDeletingShare(true)
    try {
      // Extract share ID from URL
      const shareId = shareUrl.split('/shared/')[1]
      if (!shareId) {
        throw new Error('Invalid share URL')
      }

      const response = await fetch(`/api/delete-shared-report/${shareId}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        const errorMessage = errorData.error || `Server error: ${response.status}`
        throw new Error(errorMessage)
      }

      // 🔗 NEW: Remove share info from document if we have a selected document
      if (user && selectedDocumentId) {
        try {
          await DocumentService.removeDocumentShareInfo(selectedDocumentId)
          console.log('✅ Share info removed from document:', selectedDocumentId)
        } catch (error) {
          console.error('❌ Failed to remove share info from document:', error)
          // Don't fail the whole operation if this fails
        }
      }

      // Clear share URL and show success
      setShareUrl(null)
      setShowShareSuccess(false)
      alert('Shared report deleted successfully')
    } catch (error) {
      console.error('Error deleting shared report:', error)
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
      alert(`Failed to delete shared report: ${errorMessage}`)
    } finally {
      setIsDeletingShare(false)
    }
  }

  // Document management functions
  const saveCurrentDocument = async () => {
    console.log('📁 saveCurrentDocument called with:', {
      user: !!user,
      userId: user?.uid,
      userEmail: user?.email,
      uploadedFile: !!uploadedFile,
      fileName: uploadedFile?.name,
      analysisResult: !!analysisResult,
      risksCount: analysisResult?.risks?.length,
      currentHtmlContent: !!currentHtmlContent,
      selectedDocumentId: selectedDocumentId,
      timestamp: new Date().toISOString()
    })
    
    if (!user) {
      console.warn('❌ saveCurrentDocument: No user authenticated')
      return
    }
    
    if (!uploadedFile) {
      console.warn('❌ saveCurrentDocument: No uploaded file')
      return
    }
    
    if (!analysisResult) {
      console.warn('❌ saveCurrentDocument: No analysis result')
      return
    }
    
    if (!currentHtmlContent) {
      console.warn('❌ saveCurrentDocument: No HTML content')
      return
    }

    console.log('✅ All required data present, proceeding with save...')
    setDocumentSaveError(null) // Clear previous errors
    
    try {
      console.log('🔐 User authentication details:', {
        uid: user.uid,
        email: user.email,
        displayName: user.displayName,
        emailVerified: user.emailVerified
      })
      
      if (selectedDocumentId) {
        // Update existing document
        console.log('🔄 Updating existing document:', selectedDocumentId)
        console.log('📊 Analysis result summary:', {
          totalRisks: analysisResult.totalRisks,
          risksCount: analysisResult.risks?.length,
          hasRisks: !!analysisResult.risks,
          analysisComplete: analysisResult.analysisComplete,
          riskTitles: analysisResult.risks?.map(r => r.title).slice(0, 3) // Show first 3 risk titles
        })
        
        await DocumentService.updateDocumentAnalysis(selectedDocumentId, analysisResult)
        console.log('✅ Document updated successfully:', selectedDocumentId)
        
        // Real-time Firestore listener will automatically update sidebar
      } else {
        // Create new document
        console.log('📝 Creating new document for user:', user.uid)
        console.log('📄 Document details:', {
          fileName: uploadedFile.name,
          htmlContentLength: currentHtmlContent.length,
          analysisResultKeys: Object.keys(analysisResult),
          totalRisks: analysisResult.totalRisks,
          riskTitles: analysisResult.risks?.map(r => r.title).slice(0, 3) // Show first 3 risk titles
        })
        
        const documentId = await DocumentService.saveDocument(
          user.uid,
          uploadedFile.name,
          currentHtmlContent,
          analysisResult
        )
        setSelectedDocumentId(documentId)
        console.log('✅ New document created successfully:', documentId)
        
        // Real-time Firestore listener will automatically update sidebar
      }
    } catch (error: unknown) {
      console.error('❌ Error saving document:', error)
      console.error('❌ Error type:', typeof error)
      
      if (error && typeof error === 'object' && 'constructor' in error) {
        console.error('❌ Error constructor:', (error as any).constructor.name)
      }
      
      // Extract meaningful error message for users
      let errorMessage = 'Failed to save document to history'
      if (error instanceof Error) {
        console.error('❌ Error message:', error.message)
        console.error('❌ Error stack:', error.stack)
        
        if (error.message.includes('index')) {
          errorMessage = 'Document save failed: Firebase index required. Please create the composite index.'
          console.error('🚨 INDEX ERROR DETECTED - This is likely the main issue!')
        } else if (error.message.includes('permission')) {
          errorMessage = 'Document save failed: Permission denied. Please check Firestore security rules.'
          console.error('🚨 PERMISSION ERROR DETECTED')
        } else if (error.message.includes('network')) {
          errorMessage = 'Document save failed: Network error. Please check your internet connection.'
          console.error('🚨 NETWORK ERROR DETECTED')
        } else {
          errorMessage = `Document save failed: ${error.message}`
          console.error('🚨 OTHER ERROR:', error.message)
        }
      }
      setDocumentSaveError(errorMessage)
      
      // Also log the error details for debugging
      if (error instanceof Error) {
        console.error('Error details:', {
          name: error.name,
          message: error.message,
          stack: error.stack
        })
      } else {
        console.error('Non-Error object thrown:', error)
      }
    }
  }

  const loadDocument = async (documentId: string) => {
    console.log('📂 Loading document:', documentId, {
      isBackgroundAnalysisRunning: backgroundAnalysis.isRunning,
      backgroundDocumentId: backgroundAnalysis.documentId,
      currentSelectedDocumentId: selectedDocumentId
    })
    
    try {
      const document = await DocumentService.getDocument(documentId)
      if (document) {
        // 🔥 NEW: Don't interrupt background analysis - just switch what's displayed
        console.log('✅ Document loaded, switching display without interrupting background analysis')
        
        setSelectedDocumentId(documentId)
        setAnalysisResult(document.analysisResult)
        setCurrentHtmlContent(document.htmlContent)
        setCurrentStep("results")
        
        // Create a mock file object for display purposes
        const mockFile = new File([], document.fileName, { type: 'application/pdf' })
        setUploadedFile(mockFile)
        
        // Clear any displayed progress states since we're showing a completed document
        setIsGettingRemainingRisks(false)
        setCurrentAnalyzingRisk(null)
        setDeepAnalysisProgress({ current: 0, total: 0 })
        setCategoryProgress({ current: 0, total: 0, currentCategory: "" })
        
        // 🔗 NEW: Restore share state if document was previously shared
        if (document.shareInfo) {
          console.log('🔗 Restoring share state from document:', {
            shareId: document.shareInfo.shareId,
            shareUrl: document.shareInfo.shareUrl,
            sharedAt: document.shareInfo.sharedAt
          })
          setShareUrl(document.shareInfo.shareUrl)
          setShowShareSuccess(true) // Show that it's already shared
          setShowCopySuccess(false)
          setIsSharing(false)
          setIsDeletingShare(false)
        } else {
          // Clear share state for documents that haven't been shared
          setShareUrl(null)
          setShowShareSuccess(false)
          setShowCopySuccess(false)
          setIsSharing(false)
          setIsDeletingShare(false)
        }
        
        console.log('🎯 Document display switched to:', documentId, {
          totalRisks: document.analysisResult?.totalRisks,
          analysisComplete: document.analysisResult?.analysisComplete,
          backgroundStillRunning: backgroundAnalysis.isRunning ? 'Yes' : 'No',
          backgroundDocumentId: backgroundAnalysis.documentId,
          hasShareInfo: !!document.shareInfo,
          shareUrl: document.shareInfo?.shareUrl
        })
      }
    } catch (error) {
      console.error('Error loading document:', error)
    }
  }

  const handleNewDocument = () => {
    setSelectedDocumentId(null)
    resetApp()
  }

  const toggleSidebar = () => {
    setSidebarOpen(!sidebarOpen)
  }

  if (currentStep === "upload") {
    return (
      <>
        <DocumentSidebar
          isOpen={sidebarOpen}
          onToggle={toggleSidebar}
          selectedDocumentId={selectedDocumentId}
          onDocumentSelect={loadDocument}
          onNewDocument={handleNewDocument}
        />
        
        <div className={`min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4 transition-all duration-300 ${
          sidebarOpen ? 'ml-80' : 'ml-0'
        }`}>
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-8 pt-8">
              <div className="flex justify-between items-start mb-4">
                <div className="flex-1">
                  <h1 className="text-4xl font-bold text-gray-900 mb-2">{t('appName')}</h1>
                  <p className="text-xl text-gray-600">{t('appDescription')}</p>
                </div>
                <div className="flex items-center space-x-4">
                  <LanguageSwitcher />
                  <AuthButton onHistoryToggle={toggleSidebar} />
                </div>
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
      </>
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
      <>
        <DocumentSidebar
          isOpen={sidebarOpen}
          onToggle={toggleSidebar}
          selectedDocumentId={selectedDocumentId}
          onDocumentSelect={loadDocument}
          onNewDocument={handleNewDocument}
        />
        
        <div className={`min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4 transition-all duration-300 ${
          sidebarOpen ? 'ml-80' : 'ml-0'
        }`}>
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
              <div className="flex items-center gap-2">
                {/* Share Button */}
                <div className="relative">
                  <Button 
                    variant="default" 
                    onClick={handleShareReport}
                    disabled={
                      isSharing || 
                      !analysisResult || 
                      !analysisResult.analysisComplete ||
                      (isDisplayedDocumentBeingAnalyzed && (isGettingRemainingRisks || currentAnalyzingRisk !== null))
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
                        {shareUrl ? 'Manage Share' : 'Share Report'}
                      </>
                    )}
                  </Button>
                  
                  {/* Show helpful message when analysis is incomplete */}
                  {(!analysisResult?.analysisComplete && isDisplayedDocumentBeingAnalyzed && (isGettingRemainingRisks || currentAnalyzingRisk)) && (
                    <div className="absolute top-full left-0 mt-1 text-xs text-gray-500 whitespace-nowrap">
                      Share will be available when analysis completes
                    </div>
                  )}
                </div>
                
                {/* Back Button */}
                <Button variant="outline" onClick={resetApp}>
                  + New
                </Button>
                
                {/* User Authentication - Most Right */}
                <AuthButton onHistoryToggle={toggleSidebar} />
              </div>
            </div>


            {/* Document Save Error */}
            {documentSaveError && (
              <Alert className="mb-6 bg-red-50 border-red-200">
                <AlertTriangle className="h-4 w-4 text-red-600" />
                <AlertDescription className="text-red-800">
                  <strong>❌ Document Save Error:</strong> {documentSaveError}
                  {documentSaveError.includes('index') && (
                    <div className="mt-2 text-sm">
                      <p><strong>To fix this Firebase index error:</strong></p>
                      <ol className="list-decimal list-inside mt-1 space-y-1">
                        <li>Check the browser console for the Firebase index creation link</li>
                        <li>Click the link to automatically create the required index</li>
                        <li>Or manually create a composite index: Collection: documents, Fields: userId (Ascending), createdAt (Descending)</li>
                        <li>Wait a few minutes for the index to build</li>
                      </ol>
                    </div>
                  )}
                  <Button 
                    size="sm" 
                    variant="outline" 
                    onClick={() => setDocumentSaveError(null)}
                    className="mt-3 text-red-600 border-red-300 hover:bg-red-50"
                  >
                    Dismiss
                  </Button>
                </AlertDescription>
              </Alert>
            )}

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
                        <Button 
                          size="sm" 
                          variant="outline"
                          onClick={deleteShareReport}
                          disabled={isDeletingShare}
                          className="border-red-300 text-red-700 hover:bg-red-50"
                        >
                          {isDeletingShare ? (
                            <>
                              <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-red-600 mr-1"></div>
                              Deleting...
                            </>
                          ) : (
                            <>
                              <Trash2 className="h-3 w-3 mr-1" />
                              Delete Share
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                  </div>
                </AlertDescription>
              </Alert>
            )}

            {/* Auto-Save Success Notification */}
            {showAutoSaveSuccess && user && (
              <Alert className="mb-6 bg-blue-50 border-blue-200">
                <CheckCircle className="h-4 w-4 text-blue-600" />
                <AlertDescription className="text-blue-800">
                  <strong>Analysis automatically saved to your history!</strong>
                  <p className="text-sm mt-1">
                    Your complete analysis has been saved and can be accessed from the history sidebar.
                  </p>
                </AlertDescription>
              </Alert>
            )}

            {/* 🔥 NEW: Background Analysis Status - Only show when different from displayed document */}
            {false && backgroundAnalysis.isRunning && backgroundAnalysis.documentId !== selectedDocumentId && (
              <Alert className="mb-6 bg-purple-50 border-purple-200">
                <div className="flex items-center">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-purple-600 mr-2"></div>
                  <Brain className="h-4 w-4 text-purple-600 mr-2" />
                  <AlertDescription className="text-purple-800">
                    <div className="flex items-center justify-between w-full">
                      <div className="flex-1">
                        <strong>Background Analysis Running</strong>
                        <div className="text-sm mt-1">
                          <span className="font-medium">{backgroundAnalysis.fileName}</span> is being analyzed in the background.
                          {backgroundAnalysis.step === 'category-analysis' && backgroundAnalysis.categoryProgress.currentCategory && (
                            <span className="ml-2">
                              Currently: {translateCategory(backgroundAnalysis.categoryProgress.currentCategory)} 
                              ({backgroundAnalysis.categoryProgress.current}/{backgroundAnalysis.categoryProgress.total})
                            </span>
                          )}
                          {backgroundAnalysis.step === 'deep-analysis' && backgroundAnalysis.deepAnalysisProgress.total > 0 && (
                            <span className="ml-2">
                              Deep analysis: {backgroundAnalysis.deepAnalysisProgress.current}/{backgroundAnalysis.deepAnalysisProgress.total} risks
                            </span>
                          )}
                          <br />
                          <span className="text-purple-600">You can continue viewing other documents while this completes.</span>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          if (backgroundAnalysis.documentId) {
                            loadDocument(backgroundAnalysis.documentId)
                          }
                        }}
                        className="border-purple-300 text-purple-700 hover:bg-purple-100 ml-4"
                      >
                        View Progress
                      </Button>
                    </div>
                  </AlertDescription>
                </div>
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
            {(isGettingRemainingRisks || (isDisplayedDocumentBeingAnalyzed && backgroundAnalysis.step === 'category-analysis')) && (
              <Alert className="mb-6 bg-blue-50 border-blue-200">
                <div className="flex items-center">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600 mr-2"></div>
                  <Brain className="h-4 w-4 text-blue-600 mr-2" />
                  <AlertDescription className="text-blue-800">
                    <div className="flex items-center">
                      <strong>{t('analysis.findingAdditionalRisks')}</strong> 
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
                      ) : (
                        (() => {
                          // Use background progress if this document is being analyzed in background
                          const currentCategoryProgress = isDisplayedDocumentBeingAnalyzed 
                            ? backgroundAnalysis.categoryProgress 
                            : categoryProgress
                          
                          return currentCategoryProgress.currentCategory ? (
                            <>
                              Currently analyzing {translateCategory(currentCategoryProgress.currentCategory)}
                              <span className="ml-2 text-blue-600 font-medium">
                                ({currentCategoryProgress.current}/{currentCategoryProgress.total})
                              </span>
                              <br />
                              <span className="text-blue-600">New risks will appear here automatically</span>
                            </>
                          ) : (
                            t('analysis.analyzingRemaining')
                          )
                        })()
                      )}
                    </div>
                    {(() => {
                      const currentCategoryProgress = isDisplayedDocumentBeingAnalyzed 
                        ? backgroundAnalysis.categoryProgress 
                        : categoryProgress
                      return currentCategoryProgress.current > 0 && currentCategoryProgress.total > 0 && (
                        <div className="mt-2">
                          <Progress 
                            value={(currentCategoryProgress.current / currentCategoryProgress.total) * 100} 
                            className="w-full h-2"
                          />
                        </div>
                      )
                    })()}
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
                      <strong>Analyzing risks in detail</strong> 
                      <div className="ml-2 flex space-x-1">
                        <div className="w-2 h-2 bg-green-600 rounded-full animate-pulse"></div>
                        <div className="w-2 h-2 bg-green-600 rounded-full animate-pulse" style={{animationDelay: '0.2s'}}></div>
                        <div className="w-2 h-2 bg-green-600 rounded-full animate-pulse" style={{animationDelay: '0.4s'}}></div>
                      </div>
                    </div>
                    <div className="text-sm mt-1">
                      Analyzing risk {deepAnalysisProgress.current} of {deepAnalysisProgress.total}
                      {deepAnalysisProgress.total > 0 && (
                        <span className="ml-2 text-green-600 font-medium">
                          ({Math.round((deepAnalysisProgress.current / deepAnalysisProgress.total) * 100)}%)
                        </span>
                      )}
                      <br />
                      <span className="text-green-600">Detailed recommendations will appear as analysis completes</span>
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

                    {/* Show thinking process if available */}
                    {risk.thinking && (
                      <ThinkingProcess thinking={risk.thinking} />
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
          </div>
        </div>
      </>
    )
  }

  return null
}
