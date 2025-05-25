"use client"

import React from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Globe } from 'lucide-react'
import { supportedLanguages, languageNames, type SupportedLanguage } from '@/lib/i18n'

export default function LanguageSwitcher() {
  const { i18n, t } = useTranslation()

  const handleLanguageChange = (language: SupportedLanguage) => {
    i18n.changeLanguage(language)
  }

  const currentLanguage = i18n.language as SupportedLanguage
  const currentLanguageName = languageNames[currentLanguage] || languageNames['en']

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="flex items-center gap-2">
          <Globe className="h-4 w-4" />
          <span className="hidden sm:inline">{t('language.title')}</span>
          <span className="font-medium">{currentLanguageName}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {supportedLanguages.map((lang) => (
          <DropdownMenuItem
            key={lang}
            onClick={() => handleLanguageChange(lang)}
            className={`cursor-pointer ${
              currentLanguage === lang ? 'bg-blue-50 font-medium' : ''
            }`}
          >
            <div className="flex items-center justify-between w-full">
              <span>{languageNames[lang]}</span>
              {currentLanguage === lang && (
                <div className="w-2 h-2 bg-blue-600 rounded-full ml-2" />
              )}
            </div>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
} 