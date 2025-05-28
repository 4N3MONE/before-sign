import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, Timestamp } from 'firebase/firestore';

export async function GET(
  request: NextRequest,
  { params }: { params: { shareId: string } }
) {
  try {
    const { shareId } = params;

    if (!shareId) {
      return NextResponse.json(
        { error: 'Share ID is required' },
        { status: 400 }
      );
    }

    // Query Firestore for the shared report
    const reportsCollection = collection(db, 'shared-reports');
    const q = query(reportsCollection, where('shareId', '==', shareId));
    const querySnapshot = await getDocs(q);

    if (querySnapshot.empty) {
      return NextResponse.json(
        { error: 'Shared report not found' },
        { status: 404 }
      );
    }

    // Get the first (and should be only) document
    const doc = querySnapshot.docs[0];
    const data = doc.data();

    // Check if report has expired
    if (data.expiresAt && data.expiresAt.toDate() < new Date()) {
      return NextResponse.json(
        { error: 'This shared report has expired' },
        { status: 410 }
      );
    }

    // Convert Firestore timestamps to regular dates for JSON serialization
    const sharedReport = {
      ...data,
      createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate().toISOString() : data.createdAt,
      expiresAt: data.expiresAt instanceof Timestamp ? data.expiresAt.toDate().toISOString() : data.expiresAt
    };

    console.log('Retrieved shared report:', shareId);

    return NextResponse.json({
      success: true,
      report: sharedReport
    });

  } catch (error) {
    console.error('Error retrieving shared report:', error);
    return NextResponse.json(
      { error: 'Failed to retrieve shared report' },
      { status: 500 }
    );
  }
} 