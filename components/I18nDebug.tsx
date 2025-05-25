"use client"

import React from 'react'
import { useTranslation } from 'react-i18next'

export default function I18nDebug() {
  const { t, i18n } = useTranslation()

  if (process.env.NODE_ENV !== 'development') {
    return null
  }

  return (
    <div className="fixed bottom-4 right-4 bg-gray-800 text-white text-xs p-2 rounded shadow-lg max-w-xs">
      <div>Language: {i18n.language}</div>
      <div>Ready: {i18n.isInitialized ? 'Yes' : 'No'}</div>
      <div>Test: {t('risk.riskNumber', { number: 42 })}</div>
      <div>Categories: {t('categories.LIABILITY')}</div>
    </div>
  )
} 