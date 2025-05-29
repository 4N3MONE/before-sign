"use client"

import React, { useState, useEffect } from 'react'
import { useAuth } from '@/lib/auth-context'
import { DocumentService, DocumentSummary } from '@/lib/document-service'
import { 
  FileText, 
  Clock, 
  AlertTriangle, 
  ChevronLeft, 
  ChevronRight, 
  Trash2, 
  Edit3,
  PlusCircle
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Input } from '@/components/ui/input'
import { useTranslation } from 'react-i18next'

interface DocumentSidebarProps {
  isOpen: boolean
  onToggle: () => void
  selectedDocumentId?: string | null
  onDocumentSelect: (documentId: string) => void
  onNewDocument: () => void
}

export function DocumentSidebar({ 
  isOpen, 
  onToggle, 
  selectedDocumentId, 
  onDocumentSelect,
  onNewDocument 
}: DocumentSidebarProps) {
  const { user } = useAuth()
  const { t } = useTranslation()
  const [documents, setDocuments] = useState<DocumentSummary[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingTitle, setEditingTitle] = useState('')

  useEffect(() => {
    if (user) {
      // Real-time listener will handle loading - no manual load needed
    } else {
      setDocuments([])
      setError(null)
    }
  }, [user])

  // 🔥 REAL-TIME FIRESTORE LISTENER - No polling, instant updates!
  useEffect(() => {
    if (!user) {
      setDocuments([])
      setError(null)
      return
    }

    console.log('🔥 Setting up real-time Firestore listener for user:', {
      userId: user.uid,
      userEmail: user.email
    })

    setLoading(true)
    setError(null)

    // Import Firestore real-time listener
    import('firebase/firestore').then(({ onSnapshot, query, collection, where, orderBy }) => {
      import('@/lib/firebase').then(({ db }) => {
        try {
          const q = query(
            collection(db, 'documents'),
            where('userId', '==', user.uid),
            orderBy('createdAt', 'desc')
          )

          // 🔥 Real-time listener - updates automatically when data changes
          const unsubscribe = onSnapshot(q, 
            (querySnapshot) => {
              console.log('🔥 Real-time update received from Firestore:', {
                size: querySnapshot.size,
                empty: querySnapshot.empty,
                changes: querySnapshot.docChanges().map(change => ({
                  type: change.type,
                  docId: change.doc.id
                }))
              })

              const results = querySnapshot.docs.map(doc => {
                const data = doc.data()
                const analysisResult = data.analysisResult || {}
                
                console.log('📊 Real-time document update:', {
                  docId: doc.id,
                  title: data.title,
                  totalRisks: analysisResult.totalRisks,
                  risksLength: analysisResult.risks?.length,
                  isAnalyzing: analysisResult.isAnalyzing,
                  analysisComplete: analysisResult.analysisComplete
                })
                
                const risks = analysisResult.risks || []
                const riskCount = risks.length > 0 ? risks.length : (analysisResult.totalRisks || 0)
                const highRiskCount = risks.length > 0 
                  ? risks.filter((risk: any) => risk.severity === 'high').length 
                  : 0

                return {
                  id: doc.id,
                  title: data.title,
                  fileName: data.fileName,
                  createdAt: data.createdAt,
                  riskCount,
                  highRiskCount,
                  isAnalyzing: analysisResult.isAnalyzing || false,
                  analysisComplete: analysisResult.analysisComplete || false
                }
              })
              
              console.log('✅ Real-time sidebar update applied:', {
                documentsCount: results.length,
                documents: results.map(r => ({
                  id: r.id,
                  title: r.title,
                  riskCount: r.riskCount,
                  isAnalyzing: r.isAnalyzing
                }))
              })

              setDocuments(results)
              setLoading(false)
            },
            (error) => {
              console.error('❌ Real-time listener error:', error)
              
              let errorMessage = 'Failed to load document history'
              if (error.message.includes('index')) {
                errorMessage = 'Firebase index required. Please create the composite index for documents collection.'
              } else if (error.message.includes('permission')) {
                errorMessage = 'Permission denied. Please check Firestore security rules.'
              } else if (error.message.includes('network')) {
                errorMessage = 'Network error. Please check your internet connection.'
              } else {
                errorMessage = `Database error: ${error.message}`
              }
              setError(errorMessage)
              setLoading(false)
            }
          )

          console.log('🔥 Real-time listener established successfully')

          // Return cleanup function
          return () => {
            console.log('🔥 Cleaning up real-time listener')
            unsubscribe()
          }
        } catch (error) {
          console.error('❌ Failed to set up real-time listener:', error)
          setError('Failed to set up real-time updates')
          setLoading(false)
        }
      })
    })
  }, [user])

  const handleDeleteDocument = async (documentId: string) => {
    try {
      await DocumentService.deleteDocument(documentId)
      setDocuments(prev => prev.filter(doc => doc.id !== documentId))
      
      // If the deleted document was selected, clear selection
      if (selectedDocumentId === documentId) {
        onNewDocument()
      }
    } catch (error) {
      console.error('Error deleting document:', error)
    }
  }

  const handleEditTitle = (doc: DocumentSummary) => {
    setEditingId(doc.id)
    setEditingTitle(doc.title)
  }

  const handleSaveTitle = async () => {
    if (!editingId || !editingTitle.trim()) return

    try {
      await DocumentService.updateDocumentTitle(editingId, editingTitle.trim())
      setDocuments(prev => 
        prev.map(doc => 
          doc.id === editingId 
            ? { ...doc, title: editingTitle.trim() }
            : doc
        )
      )
      setEditingId(null)
      setEditingTitle('')
    } catch (error) {
      console.error('Error updating document title:', error)
    }
  }

  const handleCancelEdit = () => {
    setEditingId(null)
    setEditingTitle('')
  }

  const formatDate = (timestamp: any) => {
    if (!timestamp) return ''
    
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp)
    const now = new Date()
    const diffTime = now.getTime() - date.getTime()
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24))
    
    if (diffDays === 0) {
      return 'Today'
    } else if (diffDays === 1) {
      return 'Yesterday'
    } else if (diffDays < 7) {
      return `${diffDays} days ago`
    } else {
      return date.toLocaleDateString()
    }
  }

  if (!user) {
    return (
      <div className={`fixed left-0 top-0 h-full bg-white border-r border-gray-200 transition-all duration-300 ease-in-out z-40 ${
        isOpen ? 'w-80' : 'w-0'
      } overflow-hidden`}>
        <div className="p-6 text-center">
          <FileText className="mx-auto h-12 w-12 text-gray-400 mb-4" />
          <p className="text-gray-600 mb-4">Sign in to save and access your document history</p>
        </div>
      </div>
    )
  }

  return (
    <>
      {/* Sidebar */}
      <div className={`fixed left-0 top-0 h-full bg-white border-r border-gray-200 transition-all duration-300 ease-in-out z-40 ${
        isOpen ? 'w-80' : 'w-0'
      } overflow-hidden`}>
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="p-4 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Document History</h2>
              <Button
                variant="ghost"
                size="sm"
                onClick={onNewDocument}
                className="text-blue-600 hover:text-blue-700"
              >
                <PlusCircle className="h-4 w-4 mr-1" />
                New
              </Button>
            </div>
          </div>

          {/* Documents List */}
          <div className="flex-1 overflow-y-auto p-2">
            {loading ? (
              <div className="p-4 text-center">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mx-auto"></div>
                <p className="text-sm text-gray-500 mt-2">Loading...</p>
              </div>
            ) : error ? (
              <div className="p-4">
                <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                  <div className="flex items-center mb-2">
                    <AlertTriangle className="h-4 w-4 text-red-500 mr-2" />
                    <h4 className="font-medium text-red-800">Database Error</h4>
                  </div>
                  <p className="text-sm text-red-700 mb-3">{error}</p>
                  {error.includes('index') && (
                    <div className="text-xs text-red-600 space-y-1">
                      <p><strong>To fix this:</strong></p>
                      <p>1. Click the index creation link in the browser console</p>
                      <p>2. Or manually create a composite index in Firebase Console</p>
                      <p>3. Collection: documents, Fields: userId (Ascending), createdAt (Descending)</p>
                      <p>4. Real-time listener will automatically reconnect once index is ready</p>
                    </div>
                  )}
                </div>
              </div>
            ) : documents.length === 0 ? (
              <div className="p-4 text-center">
                <FileText className="mx-auto h-8 w-8 text-gray-400 mb-2" />
                <p className="text-sm text-gray-500">No documents yet</p>
                <p className="text-xs text-gray-400 mt-1">Analyze your first contract to get started</p>
              </div>
            ) : (
              <div className="space-y-2">
                {documents.map((doc) => (
                  <Card 
                    key={doc.id}
                    className={`transition-all hover:shadow-md cursor-pointer ${
                      selectedDocumentId === doc.id 
                        ? 'ring-2 ring-blue-500 bg-blue-50' 
                        : doc.isAnalyzing 
                          ? 'bg-yellow-50 border-yellow-200 hover:bg-yellow-100'
                          : 'hover:bg-gray-50'
                    }`}
                    onClick={() => {
                      onDocumentSelect(doc.id)
                    }}
                  >
                    <CardContent className="p-3">
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          {editingId === doc.id ? (
                            <div className="space-y-2">
                              <Input
                                value={editingTitle}
                                onChange={(e) => setEditingTitle(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleSaveTitle()
                                  if (e.key === 'Escape') handleCancelEdit()
                                }}
                                className="text-sm"
                                autoFocus
                              />
                              <div className="flex space-x-1">
                                <Button size="sm" variant="outline" onClick={handleSaveTitle}>
                                  Save
                                </Button>
                                <Button size="sm" variant="ghost" onClick={handleCancelEdit}>
                                  Cancel
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <>
                              <h3 className="font-medium text-sm text-gray-900 truncate">
                                {doc.title}
                              </h3>
                              <div className="flex items-center space-x-2 mt-1">
                                <Clock className="h-3 w-3 text-gray-400" />
                                <span className="text-xs text-gray-500">
                                  {formatDate(doc.createdAt)}
                                </span>
                                {doc.isAnalyzing && (
                                  <>
                                    <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-blue-600"></div>
                                    <span className="text-xs text-blue-600 font-medium">Analyzing...</span>
                                  </>
                                )}
                              </div>
                              <div className="flex items-center space-x-2 mt-2">
                                <Badge variant="outline" className="text-xs">
                                  {doc.riskCount} risks
                                </Badge>
                                {doc.highRiskCount > 0 && (
                                  <Badge variant="destructive" className="text-xs">
                                    <AlertTriangle className="h-3 w-3 mr-1" />
                                    {doc.highRiskCount} high
                                  </Badge>
                                )}
                              </div>
                            </>
                          )}
                        </div>
                        
                        {editingId !== doc.id && (
                          <div className="flex flex-col space-y-1 ml-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation()
                                handleEditTitle(doc)
                              }}
                              className="h-6 w-6 p-0"
                            >
                              <Edit3 className="h-3 w-3" />
                            </Button>
                            
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={(e) => e.stopPropagation()}
                                  className="h-6 w-6 p-0 text-red-500 hover:text-red-700"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Delete Document</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Are you sure you want to delete "{doc.title}"? This action cannot be undone.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => handleDeleteDocument(doc.id)}
                                    className="bg-red-600 hover:bg-red-700"
                                  >
                                    Delete
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Toggle Button */}
      <Button
        variant="outline"
        size="sm"
        onClick={onToggle}
        className={`fixed top-4 transition-all duration-300 ease-in-out z-50 ${
          isOpen ? 'left-72' : 'left-4'
        }`}
      >
        {isOpen ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
      </Button>

      {/* Overlay for mobile */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 z-30 md:hidden"
          onClick={onToggle}
        />
      )}
    </>
  )
} 