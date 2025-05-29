import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { collection, doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { v4 as uuidv4 } from 'uuid';

export async function POST(request: NextRequest) {
  try {
    console.log('🔄 Share report API called');
    
    const body = await request.json();
    console.log('📊 Received body keys:', Object.keys(body));
    console.log('📊 Analysis result keys:', Object.keys(body.analysisResult || {}));
    console.log('📊 Risks count:', body.analysisResult?.risks?.length || 0);
    
    // Extract analysis data from request
    const { 
      analysisResult, 
      fileName, 
      llmStats,
      selectedParty 
    } = body;

    // Validate required data
    if (!analysisResult || !analysisResult.risks || !fileName) {
      console.error('❌ Validation failed:', {
        hasAnalysisResult: !!analysisResult,
        hasRisks: !!analysisResult?.risks,
        hasFileName: !!fileName
      });
      return NextResponse.json(
        { error: 'Missing required analysis data' },
        { status: 400 }
      );
    }

    console.log('✅ Validation passed, generating share ID...');

    // Generate a unique shareable ID
    const shareId = uuidv4();

    // Automatically detect the public URL from request headers
    const host = request.headers.get('host');
    const protocol = request.headers.get('x-forwarded-proto') || 
                    (host?.includes('localhost') ? 'http' : 'https');
    const baseUrl = `${protocol}://${host}`;

    // Prepare data for Firestore
    const sharedReport = {
      shareId,
      fileName,
      analysisResult: {
        totalRisks: analysisResult.totalRisks,
        risks: analysisResult.risks,
        summary: analysisResult.summary,
        analysisComplete: analysisResult.analysisComplete
      },
      selectedParty: selectedParty || null,
      llmStats: llmStats || {
        totalCalls: 0,
        totalTime: 0,
        parseTime: 0,
        identifyTime: 0,
        deepAnalysisTime: 0
      },
      createdAt: serverTimestamp(),
      // Add expiration (30 days from now)
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    };

    // Save to Firestore
    console.log('💾 Attempting to save to Firestore...', {
      shareId,
      fileName,
      risksCount: analysisResult.risks.length,
      hasSelectedParty: !!selectedParty
    });
    
    const reportsCollection = collection(db, 'shared-reports');
    await setDoc(doc(reportsCollection, shareId), sharedReport);

    console.log('✅ Shared report saved with ID:', shareId);

    return NextResponse.json({
      success: true,
      shareId,
      shareUrl: `${baseUrl}/shared/${shareId}`
    });

  } catch (error) {
    console.error('Error saving shared report:', error);
    
    // More detailed error logging for debugging
    if (error instanceof Error) {
      console.error('Error name:', error.name);
      console.error('Error message:', error.message);
      console.error('Error stack:', error.stack);
      
      // Check for specific Firebase errors
      if (error.message.includes('permission')) {
        return NextResponse.json(
          { error: 'Database permission denied. Please check Firestore security rules.' },
          { status: 500 }
        );
      } else if (error.message.includes('index')) {
        return NextResponse.json(
          { error: 'Database index required. Please create the required Firestore index.' },
          { status: 500 }
        );
      } else if (error.message.includes('network')) {
        return NextResponse.json(
          { error: 'Network error. Please check your internet connection.' },
          { status: 500 }
        );
      } else {
        return NextResponse.json(
          { error: `Database error: ${error.message}` },
          { status: 500 }
        );
      }
    }
    
    return NextResponse.json(
      { error: 'Failed to save shared report' },
      { status: 500 }
    );
  }
} 