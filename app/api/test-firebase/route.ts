import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { collection, addDoc } from 'firebase/firestore';

export async function GET(request: NextRequest) {
  try {
    // Try to write a simple test document to Firestore
    const testCollection = collection(db, 'test');
    const testDoc = {
      message: 'Firebase connection test',
      timestamp: new Date().toISOString(),
      test: true
    };
    
    const docRef = await addDoc(testCollection, testDoc);
    
    console.log('Test document written with ID:', docRef.id);
    
    return NextResponse.json({
      success: true,
      message: 'Firebase connection successful!',
      docId: docRef.id
    });
    
  } catch (error) {
    console.error('Firebase connection test failed:', error);
    
    return NextResponse.json({
      success: false,
      error: 'Firebase connection failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
} 