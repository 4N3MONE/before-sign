"use client"

import React, { useState, useEffect } from "react"
import { useParams } from "next/navigation"
import { AlertTriangle, CheckCircle, Lightbulb, FileText, BookOpen, Target, Brain, Globe, ArrowLeft, Shield } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import Link from "next/link"

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
}

interface AnalysisResult {
  totalRisks: number
  risks: Risk[]
  summary: string
  analysisComplete: boolean
}

interface Party {
  id: string
  name: string
  description: string
  type: 'individual' | 'company' | 'organization' | 'other'
  aliases?: string[]
}

interface SharedReport {
  shareId: string
  fileName: string
  analysisResult: AnalysisResult
  selectedParty: Party | null
  llmStats: {
    totalCalls: number
    totalTime: number
    parseTime: number
    identifyTime: number
    deepAnalysisTime: number
  }
  createdAt: string
  expiresAt: string
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

export default function SharedReportPage() {
  const params = useParams()
  const shareId = params.shareId as string
  
  const [report, setReport] = useState<SharedReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchSharedReport = async () => {
      try {
        const response = await fetch(`/api/get-shared-report/${shareId}`)
        
        if (!response.ok) {
          const errorData = await response.json()
          throw new Error(errorData.error || 'Failed to load shared report')
        }

        const data = await response.json()
        setReport(data.report)
      } catch (err) {
        console.error('Error fetching shared report:', err)
        setError(err instanceof Error ? err.message : 'An error occurred')
      } finally {
        setLoading(false)
      }
    }

    if (shareId) {
      fetchSharedReport()
    }
  }, [shareId])

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

  const createDiffText = (originalText: string, suggestedText: string): string => {
    if (!originalText || !suggestedText) return ""
    
    // Simple diff for display (same logic as in main app)
    const originalWords = originalText.split(/(\s+)/)
    const suggestedWords = suggestedText.split(/(\s+)/)
    
    // Basic diff implementation for display
    let result = ""
    let i = 0, j = 0
    
    while (i < originalWords.length || j < suggestedWords.length) {
      if (i < originalWords.length && j < suggestedWords.length && originalWords[i] === suggestedWords[j]) {
        result += originalWords[i]
        i++
        j++
      } else {
        if (i < originalWords.length) {
          result += `~~${originalWords[i]}~~`
          i++
        }
        if (j < suggestedWords.length) {
          result += `**${suggestedWords[j]}**`
          j++
        }
      }
    }
    
    return result
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4 flex items-center justify-center">
        <Card className="max-w-md mx-auto">
          <CardContent className="p-8 text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading shared report...</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (error || !report) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4 flex items-center justify-center">
        <Card className="max-w-md mx-auto">
          <CardContent className="p-8 text-center">
            <AlertTriangle className="h-12 w-12 text-red-600 mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Report Not Found</h2>
            <p className="text-gray-600 mb-4">
              {error || 'The shared report could not be found or may have expired.'}
            </p>
            <Link href="/">
              <Button>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Analyze Your Own Document
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    )
  }

  const analysisResult = report.analysisResult

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">
              Contract Risk Analysis Report
              {report.selectedParty && (
                <span className="text-xl font-normal text-blue-600 ml-2">
                  for {report.selectedParty.name}
                </span>
              )}
            </h1>
            <p className="text-gray-600">{report.fileName}</p>
            <p className="text-sm text-gray-500">
              Shared on {new Date(report.createdAt).toLocaleDateString()} • 
              Expires {new Date(report.expiresAt).toLocaleDateString()}
            </p>
          </div>
          <div className="flex gap-2">
            <Link href="/">
              <Button variant="outline">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Analyze Your Own Document
              </Button>
            </Link>
          </div>
        </div>

        {/* Shared Report Notice */}
        <Alert className="mb-6 bg-blue-50 border-blue-200">
          <Globe className="h-4 w-4 text-blue-600" />
          <AlertDescription className="text-blue-800">
            <strong>Shared Report:</strong> This is a publicly accessible analysis report. 
            It will automatically expire on {new Date(report.expiresAt).toLocaleDateString()}.
          </AlertDescription>
        </Alert>

        {/* Party Perspective Information */}
        {report.selectedParty && (
          <Card className="mb-6 bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200">
            <CardContent className="p-6">
              <div className="flex items-start justify-between">
                <div className="flex items-center">
                  <Target className="h-6 w-6 text-blue-600 mr-3 flex-shrink-0 mt-1" />
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-1">
                      Analysis Perspective: {report.selectedParty.name}
                    </h3>
                    <p className="text-sm text-gray-700 mb-2">{report.selectedParty.description}</p>
                    <div className="flex items-center">
                      <Badge variant="outline" className="text-xs mr-2">
                        {report.selectedParty.type}
                      </Badge>
                      <span className="text-xs text-gray-500">
                        This analysis identifies risks that could negatively impact {report.selectedParty.name}
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
                  <p className="text-xs text-gray-600">Immediate Attention</p>
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
                  <p className="text-xs text-gray-600">Review Recommended</p>
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
                  <p className="text-xs text-gray-600">Minor Concerns</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          {sortRisksBySeverityAndSection(analysisResult.risks).map((risk, index) => (
            <Card key={risk.id}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <Badge className={getSeverityColor(risk.severity)}>
                        {risk.severity.charAt(0).toUpperCase() + risk.severity.slice(1)} Risk
                      </Badge>
                      {risk.location && (
                        <Badge className="bg-indigo-100 text-indigo-800 border-indigo-200">
                          {risk.location}
                        </Badge>
                      )}
                      <span className="text-sm text-gray-500">Risk #{index + 1}</span>
                    </div>
                    <CardTitle className="text-xl">{risk.title}</CardTitle>
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

                {risk.originalText && 
                 risk.originalText.toLowerCase() !== 'n/a' && 
                 risk.originalText.toLowerCase() !== 'not applicable' && 
                 risk.originalText.trim() !== '' && (
                  <div>
                    <h4 className="font-medium mb-2 flex items-center">
                      <FileText className="h-4 w-4 mr-2 text-gray-600" />
                      Original Text
                    </h4>
                    <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                      <p className="text-sm text-gray-800 italic">"{risk.originalText}"</p>
                    </div>
                  </div>
                )}

                {risk.businessImpact && (
                  <div>
                    <h4 className="font-medium mb-2 flex items-center">
                      <Target className="h-4 w-4 mr-2 text-orange-600" />
                      Business Impact
                      {report.selectedParty && (
                        <span className="text-xs text-gray-500 ml-2">
                          (for {report.selectedParty.name})
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
                      Recommended Actions
                      {report.selectedParty && (
                        <span className="text-xs text-gray-500 ml-2">
                          (to protect {report.selectedParty.name})
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
                                {rec.priority.charAt(0).toUpperCase() + rec.priority.slice(1)} Priority
                              </Badge>
                              <Badge className={`text-xs ${getEffortColor(rec.effort)}`}>
                                {rec.effort.charAt(0).toUpperCase() + rec.effort.slice(1)} Effort
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
                      Suggested Replacement Text
                    </h4>
                    <div className="bg-green-50 border border-green-200 rounded-lg p-4 space-y-3">
                      {risk.originalText && 
                       risk.originalText.toLowerCase() !== 'n/a' && 
                       risk.originalText.toLowerCase() !== 'not applicable' && 
                       risk.originalText.trim() !== '' && (
                        <div>
                          <p className="text-xs text-gray-600 mb-2">Track Changes:</p>
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
                      <div>
                        <p className="text-xs text-gray-600 mb-2">
                          {risk.originalText && 
                           risk.originalText.toLowerCase() !== 'n/a' && 
                           risk.originalText.toLowerCase() !== 'not applicable' && 
                           risk.originalText.trim() !== '' 
                            ? 'Clean Version:' 
                            : 'Suggested Version:'}
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

        {/* Analysis Statistics */}
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
                <div className="text-2xl font-bold text-blue-600">{report.llmStats.totalCalls}</div>
                <div className="text-sm text-gray-600">AI Model Calls</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">{(report.llmStats.totalTime / 1000).toFixed(1)}s</div>
                <div className="text-sm text-gray-600">Total Analysis Time</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-purple-600">{(report.llmStats.identifyTime / 1000).toFixed(1)}s</div>
                <div className="text-sm text-gray-600">Risk Identification</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-orange-600">{(report.llmStats.deepAnalysisTime / 1000).toFixed(1)}s</div>
                <div className="text-sm text-gray-600">Deep Analysis</div>
              </div>
            </div>
            <div className="mt-4 text-center text-sm text-gray-500">
              Powered by Upstage Document Parse & Solar LLM
            </div>
          </CardContent>
        </Card>

        <Alert className="mt-8">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            <strong>Legal Disclaimer:</strong> This analysis is for informational purposes only and should not replace professional legal advice. 
            Always consult with qualified legal counsel before making decisions based on this analysis.
          </AlertDescription>
        </Alert>

        {/* Powered By Information */}
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
      </div>
    </div>
  )
} 