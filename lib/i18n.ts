import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import resourcesToBackend from 'i18next-resources-to-backend'

export const supportedLanguages = ['en', 'ko', 'jp'] as const
export type SupportedLanguage = typeof supportedLanguages[number]

export const languageNames: Record<SupportedLanguage, string> = {
  en: 'English',
  ko: '한국어',
  jp: '日本語'
}

// Get browser locale and map it to supported language
const getBrowserLocale = (): SupportedLanguage => {
  if (typeof window !== 'undefined') {
    const browserLang = navigator.language.toLowerCase()
    
    // Direct match
    if (supportedLanguages.includes(browserLang as SupportedLanguage)) {
      return browserLang as SupportedLanguage
    }
    
    // Match language code (e.g., 'ko-KR' -> 'ko')
    const langCode = browserLang.split('-')[0]
    if (supportedLanguages.includes(langCode as SupportedLanguage)) {
      return langCode as SupportedLanguage
    }
    
    // Special cases for Japanese
    if (browserLang.startsWith('ja')) {
      return 'jp'
    }
  }
  
  // Default to English
  return 'en'
}

const detectedLanguage = getBrowserLocale()

i18n
  .use(
    resourcesToBackend((language: string, namespace: string) => {
      return import(`../locales/${language}/${namespace}.json`)
    })
  )
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    lng: detectedLanguage,
    fallbackLng: 'en',
    
    // Language detection options
    detection: {
      order: ['localStorage', 'navigator', 'htmlTag'],
      lookupLocalStorage: 'i18nextLng',
      caches: ['localStorage'],
    },
    
    ns: ['common'],
    defaultNS: 'common',
    
    interpolation: {
      escapeValue: false,
      prefix: '{',
      suffix: '}',
    },
    
    // Debug mode - set to false in production
    debug: process.env.NODE_ENV === 'development',
  })

export default i18n 