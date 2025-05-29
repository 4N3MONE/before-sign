import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/firebase'
import { doc, getDoc, deleteDoc } from 'firebase/firestore'

export async function DELETE(
  request: NextRequest,
  { params }: { params: { shareId: string } }
) {
  try {
    const { shareId } = params

    console.log('🗑️ Delete shared report API called with shareId:', shareId)

    if (!shareId) {
      console.error('❌ No shareId provided')
      return NextResponse.json(
        { error: 'Share ID is required' },
        { status: 400 }
      )
    }

    // Check if the shared report exists
    const shareRef = doc(db, 'shared-reports', shareId)
    console.log('🔍 Checking if document exists with ID:', shareId)
    
    const shareDoc = await getDoc(shareRef)
    console.log('📄 Document exists?', shareDoc.exists())

    if (!shareDoc.exists()) {
      console.error('❌ Shared report not found for shareId:', shareId)
      return NextResponse.json(
        { error: 'Shared report not found' },
        { status: 404 }
      )
    }

    console.log('🗑️ Deleting shared report with ID:', shareId)
    // Delete the shared report
    await deleteDoc(shareRef)

    console.log('✅ Shared report deleted successfully:', shareId)
    return NextResponse.json(
      { message: 'Shared report deleted successfully' },
      { status: 200 }
    )
  } catch (error) {
    console.error('❌ Error deleting shared report:', error)
    return NextResponse.json(
      { error: 'Failed to delete shared report' },
      { status: 500 }
    )
  }
} 