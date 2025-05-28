import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { v4 as uuidv4 } from 'uuid';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Extract analysis data from request
    const { 
      analysisResult, 
      fileName, 
      llmStats,
      selectedParty 
    } = body;

    // Validate required data
    if (!analysisResult || !analysisResult.risks || !fileName) {
      return NextResponse.json(
        { error: 'Missing required analysis data' },
        { status: 400 }
      );
    }

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
    const reportsCollection = collection(db, 'shared-reports');
    const docRef = await addDoc(reportsCollection, sharedReport);

    console.log('Shared report saved with ID:', docRef.id);

    return NextResponse.json({
      success: true,
      shareId,
      shareUrl: `${baseUrl}/shared/${shareId}`
    });

  } catch (error) {
    console.error('Error saving shared report:', error);
    return NextResponse.json(
      { error: 'Failed to save shared report' },
      { status: 500 }
    );
  }
} 