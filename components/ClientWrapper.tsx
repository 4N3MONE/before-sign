"use client"

import React, { useEffect } from 'react'
import '@/lib/i18n' // Initialize i18n

interface ClientWrapperProps {
  children: React.ReactNode
}

export default function ClientWrapper({ children }: ClientWrapperProps) {
  return <>{children}</>
} 