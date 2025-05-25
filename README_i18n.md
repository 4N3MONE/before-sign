# Internationalization (i18n) Guide

## Overview

The Before.sign application now supports multiple languages with automatic browser language detection and manual language switching.

## Supported Languages

- **English (en)** - Default language
- **Korean (ko)** - 한국어
- **Japanese (jp)** - 日本語

## Features

### Automatic Language Detection

The application automatically detects the user's browser language and sets the appropriate language:

- `en`, `en-US`, `en-GB` → English
- `ko`, `ko-KR` → Korean  
- `ja`, `ja-JP` → Japanese
- Any other language → English (fallback)

### Manual Language Selection

Users can manually change the language using the language switcher in the top-right corner of the application. The selected language is saved in localStorage and will persist across sessions.

### Language Switcher Component

The `LanguageSwitcher` component provides a dropdown menu with:
- Globe icon indicator
- Current language display
- List of all available languages
- Visual indicator for the currently selected language

## Technical Implementation

### File Structure

```
locales/
├── en/
│   └── common.json     # English translations
├── ko/
│   └── common.json     # Korean translations
└── jp/
    └── common.json     # Japanese translations

lib/
└── i18n.ts            # i18n configuration

components/
└── LanguageSwitcher.tsx # Language selection component
```

### Key Libraries

- `react-i18next` - React integration for i18next
- `i18next` - Core internationalization framework
- `i18next-browser-languagedetector` - Browser language detection
- `i18next-resources-to-backend` - Dynamic resource loading

### Usage in Components

```tsx
import { useTranslation } from 'react-i18next'

function MyComponent() {
  const { t } = useTranslation()
  
  return (
    <div>
      <h1>{t('appName')}</h1>
      <p>{t('upload.description')}</p>
      <p>{t('progress.parsing.description', { fileName: 'contract.pdf' })}</p>
    </div>
  )
}
```

### Translation Keys Structure

The translation keys are organized hierarchically:

```json
{
  "appName": "Before.sign",
  "upload": {
    "title": "Upload Your Document",
    "description": "Upload a contract..."
  },
  "progress": {
    "parsing": {
      "title": "Parsing Document",
      "description": "Our AI is parsing {fileName}..."
    }
  }
}
```

## Adding New Languages

To add a new language:

1. Create a new directory in `locales/` (e.g., `locales/fr/`)
2. Add `common.json` with all translated strings
3. Update `supportedLanguages` array in `lib/i18n.ts`
4. Add the language name to `languageNames` object
5. Update browser detection logic if needed

## Adding New Translation Keys

When adding new text to the application:

1. Add the English version to `locales/en/common.json`
2. Add translations to all other language files
3. Use the translation key in your component: `{t('your.new.key')}`

## Browser Language Detection Logic

The detection follows this priority:

1. **localStorage** - Previously selected language
2. **navigator.language** - Browser's primary language
3. **htmlTag** - HTML lang attribute
4. **fallback** - English (en)

Special handling:
- `ja*` patterns are mapped to `jp`
- Language codes are extracted from locale codes (e.g., `ko-KR` → `ko`)
- Unsupported languages fall back to English

## Development

### Testing Different Languages

1. Change your browser language settings
2. Clear localStorage: `localStorage.removeItem('i18nextLng')`
3. Refresh the page to test auto-detection
4. Or use the language switcher to test manual selection

### Debug Mode

Set `NODE_ENV=development` to enable i18next debug logging in the browser console.

## Production Considerations

- Translation files are loaded dynamically to reduce initial bundle size
- Selected language is cached in localStorage
- Fallback to English ensures the app always works
- All user-facing text should use translation keys (no hardcoded strings) 