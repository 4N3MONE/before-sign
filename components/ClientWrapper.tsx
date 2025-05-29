"use client"

import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AuthProvider } from '@/lib/auth-context'
import '@/lib/i18n' // Initialize i18n

interface ClientWrapperProps {
  children: React.ReactNode
}

export default function ClientWrapper({ children }: ClientWrapperProps) {
  const { i18n } = useTranslation()
  const [isReady, setIsReady] = useState(false)

  useEffect(() => {
    // Wait for i18n to be initialized
    if (i18n.isInitialized) {
      setIsReady(true)
    } else {
      i18n.on('initialized', () => {
        setIsReady(true)
      })
    }

    return () => {
      i18n.off('initialized')
    }
  }, [i18n])

  if (!isReady) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    )
  }

  return (
    <AuthProvider>
      {children}
    </AuthProvider>
  )
} 