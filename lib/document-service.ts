import { 
  collection, 
  doc, 
  addDoc, 
  getDocs, 
  getDoc, 
  query, 
  where, 
  orderBy, 
  serverTimestamp,
  deleteDoc,
  updateDoc,
  Timestamp 
} from 'firebase/firestore'
import { db } from './firebase'

export interface DocumentAnalysis {
  id: string
  userId: string
  title: string
  fileName: string
  htmlContent: string
  analysisResult: any // The full analysis result from the risk analysis
  createdAt: Timestamp
  updatedAt: Timestamp
  shareInfo?: {
    shareId: string
    shareUrl: string
    sharedAt: Timestamp
  }
}

export interface DocumentSummary {
  id: string
  title: string
  fileName: string
  createdAt: Timestamp
  riskCount: number
  highRiskCount: number
  isAnalyzing?: boolean
  analysisComplete?: boolean
}

export class DocumentService {
  private static readonly COLLECTION_NAME = 'documents'

  static async saveDocument(
    userId: string,
    fileName: string,
    htmlContent: string,
    analysisResult: any
  ): Promise<string> {
    try {
      const title = this.generateTitle(fileName, analysisResult)
      
      console.log('📝 DocumentService.saveDocument called:', {
        userId,
        fileName,
        title,
        htmlContentLength: htmlContent?.length,
        totalRisks: analysisResult?.totalRisks,
        risksCount: analysisResult?.risks?.length
      })
      
      // 🔧 CLEAN UNDEFINED VALUES: Firestore doesn't allow undefined values
      const cleanedAnalysisResult = this.removeUndefinedValues(analysisResult)
      
      const docRef = await addDoc(collection(db, this.COLLECTION_NAME), {
        userId,
        title,
        fileName,
        htmlContent,
        analysisResult: cleanedAnalysisResult,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      })

      console.log('✅ DocumentService.saveDocument completed successfully, ID:', docRef.id)
      return docRef.id
    } catch (error) {
      console.error('❌ DocumentService.saveDocument failed:', error)
      throw error
    }
  }

  static async getUserDocuments(userId: string): Promise<DocumentSummary[]> {
    try {
      console.log('🔍 DocumentService.getUserDocuments called for userId:', userId)
      
      const q = query(
        collection(db, this.COLLECTION_NAME),
        where('userId', '==', userId),
        orderBy('createdAt', 'desc')
      )

      console.log('🔍 DocumentService.getUserDocuments: Executing Firestore query...')
      const querySnapshot = await getDocs(q)
      
      console.log('🔍 DocumentService.getUserDocuments: Query completed, raw results:', {
        size: querySnapshot.size,
        empty: querySnapshot.empty
      })
      
      const results = querySnapshot.docs.map(doc => {
        const data = doc.data()
        const analysisResult = data.analysisResult || {}
        
        // Log the structure of each document's analysis result for debugging
        console.log('📊 Document analysis result structure:', {
          docId: doc.id,
          title: data.title,
          hasAnalysisResult: !!analysisResult,
          analysisResultKeys: Object.keys(analysisResult),
          totalRisks: analysisResult.totalRisks,
          risksArray: !!analysisResult.risks,
          risksLength: analysisResult.risks?.length,
          isAnalyzing: analysisResult.isAnalyzing,
          analysisComplete: analysisResult.analysisComplete
        })
        
        // Use risks array if available, otherwise fall back to totalRisks
        const risks = analysisResult.risks || []
        const riskCount = risks.length > 0 ? risks.length : (analysisResult.totalRisks || 0)
        const highRiskCount = risks.length > 0 
          ? risks.filter((risk: any) => risk.severity === 'high').length 
          : 0

        const result = {
          id: doc.id,
          title: data.title,
          fileName: data.fileName,
          createdAt: data.createdAt,
          riskCount,
          highRiskCount,
          isAnalyzing: analysisResult.isAnalyzing || false,
          analysisComplete: analysisResult.analysisComplete || false
        }
        
        console.log('📋 Processed document summary:', {
          id: result.id,
          title: result.title,
          riskCount: result.riskCount,
          highRiskCount: result.highRiskCount,
          isAnalyzing: result.isAnalyzing,
          analysisComplete: result.analysisComplete
        })
        
        return result
      })
      
      console.log('✅ DocumentService.getUserDocuments: Final processed results:', {
        count: results.length,
        documents: results.map(r => ({
          id: r.id,
          title: r.title,
          riskCount: r.riskCount,
          highRiskCount: r.highRiskCount,
          isAnalyzing: r.isAnalyzing,
          analysisComplete: r.analysisComplete
        }))
      })
      
      return results
    } catch (error) {
      console.error('❌ DocumentService.getUserDocuments failed:', error)
      throw error
    }
  }

  static async getDocument(documentId: string): Promise<DocumentAnalysis | null> {
    try {
      const docRef = doc(db, this.COLLECTION_NAME, documentId)
      const docSnap = await getDoc(docRef)

      if (docSnap.exists()) {
        return {
          id: docSnap.id,
          ...docSnap.data()
        } as DocumentAnalysis
      }

      return null
    } catch (error) {
      console.error('Error fetching document:', error)
      throw error
    }
  }

  static async deleteDocument(documentId: string): Promise<void> {
    try {
      await deleteDoc(doc(db, this.COLLECTION_NAME, documentId))
    } catch (error) {
      console.error('Error deleting document:', error)
      throw error
    }
  }

  static async updateDocumentTitle(documentId: string, title: string): Promise<void> {
    try {
      const docRef = doc(db, this.COLLECTION_NAME, documentId)
      await updateDoc(docRef, {
        title,
        updatedAt: serverTimestamp()
      })
    } catch (error) {
      console.error('Error updating document title:', error)
      throw error
    }
  }

  static async updateDocumentAnalysis(documentId: string, analysisResult: any): Promise<void> {
    try {
      console.log('🔄 DocumentService.updateDocumentAnalysis called:', {
        documentId,
        totalRisks: analysisResult?.totalRisks,
        risksCount: analysisResult?.risks?.length,
        analysisComplete: analysisResult?.analysisComplete,
        isAnalyzing: analysisResult?.isAnalyzing
      })
      
      // 🔧 CLEAN UNDEFINED VALUES: Firestore doesn't allow undefined values
      const cleanedAnalysisResult = this.removeUndefinedValues(analysisResult)
      
      const docRef = doc(db, this.COLLECTION_NAME, documentId)
      await updateDoc(docRef, {
        analysisResult: cleanedAnalysisResult,
        updatedAt: serverTimestamp()
      })
      
      console.log('✅ DocumentService.updateDocumentAnalysis completed successfully for:', documentId)
    } catch (error) {
      console.error('❌ DocumentService.updateDocumentAnalysis failed:', error)
      throw error
    }
  }

  static async updateDocumentShareInfo(documentId: string, shareId: string, shareUrl: string): Promise<void> {
    try {
      console.log('🔗 DocumentService.updateDocumentShareInfo called:', {
        documentId,
        shareId,
        shareUrl
      })
      
      const docRef = doc(db, this.COLLECTION_NAME, documentId)
      await updateDoc(docRef, {
        shareInfo: {
          shareId,
          shareUrl,
          sharedAt: serverTimestamp()
        },
        updatedAt: serverTimestamp()
      })
      
      console.log('✅ DocumentService.updateDocumentShareInfo completed successfully')
    } catch (error) {
      console.error('❌ DocumentService.updateDocumentShareInfo failed:', error)
      throw error
    }
  }

  static async removeDocumentShareInfo(documentId: string): Promise<void> {
    try {
      console.log('🗑️ DocumentService.removeDocumentShareInfo called for:', documentId)
      
      const docRef = doc(db, this.COLLECTION_NAME, documentId)
      await updateDoc(docRef, {
        shareInfo: null,
        updatedAt: serverTimestamp()
      })
      
      console.log('✅ DocumentService.removeDocumentShareInfo completed successfully')
    } catch (error) {
      console.error('❌ DocumentService.removeDocumentShareInfo failed:', error)
      throw error
    }
  }

  // Helper function to recursively remove undefined values from objects
  private static removeUndefinedValues(obj: any): any {
    if (obj === null || obj === undefined) {
      return null
    }
    
    if (Array.isArray(obj)) {
      return obj.map(item => this.removeUndefinedValues(item))
    }
    
    if (typeof obj === 'object') {
      const cleaned: any = {}
      for (const [key, value] of Object.entries(obj)) {
        if (value !== undefined) {
          cleaned[key] = this.removeUndefinedValues(value)
        }
      }
      return cleaned
    }
    
    return obj
  }

  private static generateTitle(fileName: string, analysisResult: any): string {
    // Remove file extension and create a readable title
    const baseName = fileName.replace(/\.[^/.]+$/, '')
    
    // If the analysis has identified a contract type or key parties, use that in the title
    if (analysisResult?.summary) {
      const summary = analysisResult.summary
      // Try to extract contract type from summary
      const contractTypeMatch = summary.match(/(?:this|the)\s+([^.]+(?:agreement|contract|terms|policy))/i)
      if (contractTypeMatch) {
        return contractTypeMatch[1].trim()
      }
    }

    // Fallback to cleaned filename
    return baseName.replace(/[-_]/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase())
  }
} 