# Before.sign Implementation Guide

A comprehensive guide for contributors to understand the architecture and contribute to Before.sign - an AI-powered contract risk analysis tool.

## 🎯 Project Overview

Before.sign is a professional contract analysis tool that leverages Upstage Document Parse and Solar LLM to identify risks and provide detailed recommendations for contract negotiations. It's built with modern web technologies and follows industry best practices for AI-powered document analysis.

### Key Features
- **Smart Document Parsing**: Upload PDF, DOC, and DOCX files using Upstage Document Parse
- **AI Risk Identification**: Uses Solar LLM to identify specific problematic clauses
- **Detailed Analysis**: Provides business impact assessment, legal risks, and recommendations
- **Internationalization**: Multi-language support (EN, KO, JP)
- **Professional UI**: Modern, responsive interface built with Next.js and Tailwind CSS

## 🏗️ Architecture Overview

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Frontend      │    │   API Routes     │    │  External APIs  │
│   (React/Next)  │◄──►│   (Next.js)      │◄──►│   (Upstage)     │
│                 │    │                  │    │                 │
│ • File Upload   │    │ • Document Parse │    │ • Document Parse│
│ • Progress UI   │    │ • Risk Analysis  │    │ • Solar LLM     │
│ • Results View  │    │ • Deep Analysis  │    │                 │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

### Analysis Pipeline
1. **Document Upload** → File validation and upload
2. **Document Parsing** → Upstage Document Parse extracts text
3. **Risk Identification** → Solar LLM identifies risks in categories
4. **Deep Analysis** → Detailed analysis of each risk
5. **Results Display** → Comprehensive risk report with recommendations

## 📁 Project Structure

```
02-before-sign-app/
├── app/                          # Next.js App Router
│   ├── page.tsx                  # Main application component (1,500+ lines)
│   ├── layout.tsx                # Root layout with providers
│   ├── globals.css               # Global styles and Tailwind base
│   └── api/                      # API Routes
│       ├── upload/               # Document parsing endpoint
│       ├── identify-risks/       # Risk identification endpoint
│       ├── remaining-risks/      # Additional risk categories
│       ├── deep-analysis/        # Detailed risk analysis
│       └── debug/                # Debug utilities
├── components/                   # React Components
│   ├── ui/                       # shadcn/ui components
│   ├── LanguageSwitcher.tsx      # Language selection
│   ├── ClientWrapper.tsx         # Client-side providers
│   └── I18nDebug.tsx             # Development i18n debugging
├── lib/                          # Utilities
│   ├── i18n.ts                   # Internationalization setup
│   └── utils.ts                  # Tailwind utility functions
├── locales/                      # Translation files
│   ├── en/                       # English translations
│   ├── ko/                       # Korean translations
│   └── jp/                       # Japanese translations
├── styles/                       # Additional stylesheets
├── public/                       # Static assets
└── Configuration files           # Next.js, Tailwind, TypeScript configs
```

## 🔧 Tech Stack

### Frontend
- **Next.js 15** - React framework with App Router
- **React 19** - UI library
- **TypeScript** - Type safety
- **Tailwind CSS** - Utility-first styling
- **shadcn/ui** - UI component library
- **Lucide React** - Icon library

### Internationalization
- **react-i18next** - i18n framework
- **i18next-browser-languagedetector** - Auto language detection
- **i18next-resources-to-backend** - Dynamic translation loading

### Backend & AI
- **Upstage Document Parse API** - Document text extraction
- **Upstage Solar LLM** - AI analysis and risk identification
- **Next.js API Routes** - Backend endpoints

### Development Tools
- **pnpm** - Package manager
- **ESLint** - Code linting
- **PostCSS** - CSS processing

## 🚀 Quick Start

### Prerequisites
```bash
# Required
Node.js 18+ 
pnpm (recommended) or npm

# API Access
Upstage API Key from https://console.upstage.ai
```

### Environment Setup
```bash
# 1. Clone the repository
git clone https://github.com/hunkim/before-sign.git
cd before-sign/02-before-sign-app

# 2. Install dependencies
pnpm install

# 3. Set up environment variables
cp .env.example .env.local

# Add your API key to .env.local:
UPSTAGE_API_KEY=your_upstage_api_key_here
UPSTAGE_MODEL_NAME=solar-pro2-preview  # Optional, defaults to solar-pro2-preview

# 4. Run development server
pnpm dev
```

Visit `http://localhost:3000` to see the application.

## 🔌 API Endpoints

### Document Processing
- **POST `/api/upload`** - Upload and parse documents using Upstage Document Parse
- **POST `/api/identify-risks`** - Initial risk identification (LIABILITY category first)
- **POST `/api/remaining-risks`** - Additional risk categories (TERMINATION, PAYMENT, etc.)
- **POST `/api/deep-analysis`** - Detailed analysis of individual risks

### Utilities
- **GET `/api/debug`** - Development debugging information

## 📊 Core Components

### 1. Main Application (`app/page.tsx`)
The primary component managing the entire user flow:

```typescript
// Key sections:
- File upload interface
- Progress tracking (parsing, identification, analysis)
- Results display with risk cards
- Internationalization support
- Error handling and retry logic
```

**Key Features:**
- Multi-step wizard (upload → parsing → identifying → results)
- Real-time progress updates
- Comprehensive error handling
- Risk sorting by document sections
- Deep analysis with recommendations

### 2. Risk Analysis Pipeline

#### Phase 1: Document Parsing
- Validates file types (PDF, DOC, DOCX)
- Uses Upstage Document Parse API
- Extracts text, HTML, and structural elements

#### Phase 2: Risk Identification
- **Quick Start**: Analyzes LIABILITY category first for immediate results
- **Comprehensive**: Analyzes all categories (LIABILITY, TERMINATION, PAYMENT, INTELLECTUAL_PROPERTY, COMPLIANCE)
- Uses structured JSON schema for consistent output
- Implements retry logic with exponential backoff

#### Phase 3: Deep Analysis
- Individual risk analysis for business impact
- Generates specific recommendations
- Provides suggested replacement text
- Creates diff views for text comparisons

### 3. Internationalization System

```typescript
// Supported languages
const languages = {
  en: 'English',
  ko: '한국어', 
  jp: '日本語'
}

// Translation structure
locales/
├── en/translation.json
├── ko/translation.json
└── jp/translation.json
```

## 🎨 UI Components

### Built on shadcn/ui
- **Cards** - Risk display containers
- **Badges** - Severity and status indicators
- **Progress** - Analysis progress bars
- **Alerts** - Status messages and errors
- **Buttons** - Actions and navigation

### Custom Components
- **LanguageSwitcher** - Language selection dropdown
- **ClientWrapper** - i18n provider wrapper
- **I18nDebug** - Development translation debugging

## 🔍 Key Features Deep Dive

### Risk Categories Analysis
```typescript
const riskCategories = [
  {
    name: "LIABILITY",
    focusAreas: ["indemnification", "limitation of liability", "insurance requirements"]
  },
  {
    name: "TERMINATION", 
    focusAreas: ["termination clauses", "notice periods", "survival clauses"]
  },
  // ... more categories
]
```

### Progressive Enhancement
1. **Immediate Results**: Shows LIABILITY risks first
2. **Background Processing**: Analyzes remaining categories
3. **Real-time Updates**: Adds new risks as found
4. **Deep Analysis**: Enhances each risk with detailed recommendations

### Error Handling Strategy
- **Configuration Errors**: Missing API keys with setup instructions
- **Network Errors**: Retry logic with exponential backoff
- **Analysis Errors**: Graceful degradation with manual review options
- **Timeout Handling**: Progress indicators and recovery options

## 🧪 Development Guidelines

### Code Organization
```typescript
// Component structure
const Component = () => {
  // 1. Hooks and state
  const [state, setState] = useState()
  
  // 2. Helper functions
  const helperFunction = () => {}
  
  // 3. Event handlers
  const handleEvent = () => {}
  
  // 4. Effects
  useEffect(() => {}, [])
  
  // 5. Render
  return <JSX />
}
```

### State Management
- React hooks for local state
- Callback pattern for child-to-parent communication
- Progress tracking with structured state objects

### API Design Patterns
```typescript
// Consistent error handling
try {
  const result = await apiCall()
  return NextResponse.json({ success: true, data: result })
} catch (error) {
  return NextResponse.json({ 
    error: "Error message", 
    details: error.message 
  }, { status: 500 })
}
```

## 🌍 Internationalization

### Adding New Languages
1. Create new locale directory: `locales/[lang]/`
2. Add translation file: `translation.json`
3. Update language switcher configuration
4. Test all UI components and error messages

### Translation Structure
```json
{
  "appName": "Before.sign",
  "upload": {
    "title": "Upload Contract",
    "description": "Select a contract file to analyze"
  },
  "risk": {
    "highRisk": "High Risk",
    "businessImpact": "Business Impact"
  }
}
```

## 🚀 Deployment

### Environment Variables
```bash
# Required
UPSTAGE_API_KEY=your_api_key_here

# Optional
UPSTAGE_MODEL_NAME=solar-pro2-preview  # Default model
NODE_ENV=production
```

### Build Process
```bash
# Build for production
pnpm build

# Start production server
pnpm start

# Lint code
pnpm lint
```

### Deployment Platforms
- **Vercel** (Recommended) - Optimized for Next.js
- **Netlify** - Static site with serverless functions
- **Docker** - Container deployment

## 🤝 Contributing

### Getting Started
1. **Fork the repository**
2. **Create feature branch**: `git checkout -b feature/amazing-feature`
3. **Follow coding standards**: Use TypeScript, ESLint rules
4. **Add tests**: Ensure new features work correctly
5. **Update documentation**: Keep README and this file current
6. **Submit pull request**: Detailed description of changes

### Contribution Areas

#### 🔧 Backend/API
- **New Risk Categories**: Add specialized risk analysis
- **Performance Optimization**: Improve API response times
- **Error Handling**: Enhanced retry and recovery logic
- **Additional LLM Providers**: Support for other AI models

#### 🎨 Frontend/UI
- **UI/UX Improvements**: Enhanced user experience
- **Accessibility**: WCAG compliance improvements
- **Mobile Responsiveness**: Touch-friendly interactions
- **Animation**: Progress and transition enhancements

#### 🌍 Internationalization
- **New Languages**: Add support for additional languages
- **Translation Quality**: Improve existing translations
- **Localization**: Cultural adaptations and formats

#### 📊 Features
- **Export Capabilities**: PDF, Word document generation
- **Collaboration**: Multi-user contract review
- **Integration**: API for third-party applications
- **Analytics**: Usage insights and risk pattern analysis

### Code Quality Standards
- **TypeScript**: Strict type checking
- **ESLint**: Follow project linting rules
- **Component Design**: Reusable, composable components
- **Error Boundaries**: Graceful error handling
- **Performance**: Optimize bundle size and runtime

## 🐛 Debugging

### Development Tools
- **I18nDebug Component**: Toggle translation debugging
- **API Debug Endpoint**: `/api/debug` for system information
- **Console Logging**: Structured logging for API calls
- **React DevTools**: Component inspection

### Common Issues
1. **API Key Errors**: Check environment variable setup
2. **File Upload Failures**: Verify file type and size limits
3. **Analysis Timeouts**: Monitor network connectivity
4. **Translation Issues**: Use I18nDebug component

## 📈 Performance Considerations

### Optimization Strategies
- **Progressive Loading**: Show results incrementally
- **API Batching**: Efficient request grouping
- **Caching**: Reduce redundant API calls
- **Bundle Splitting**: Optimize JavaScript delivery

### Monitoring
- **LLM Call Statistics**: Track API usage and performance
- **Error Rates**: Monitor failure patterns
- **User Experience**: Measure analysis completion rates

## 🔮 Future Roadmap

### Short Term
- [ ] Additional risk categories (FORCE_MAJEURE, DISPUTE_RESOLUTION)
- [ ] Export functionality (PDF reports)
- [ ] Enhanced mobile experience
- [ ] Performance optimizations

### Medium Term
- [ ] Multi-document comparison
- [ ] Collaborative review features
- [ ] Custom risk category definitions
- [ ] Integration with legal document systems

### Long Term
- [ ] Advanced analytics and insights
- [ ] Machine learning risk prediction
- [ ] Regulatory compliance checking
- [ ] Enterprise deployment options

## 📚 Resources

### External Documentation
- [Upstage API Documentation](https://developers.upstage.ai/)
- [Next.js Documentation](https://nextjs.org/docs)
- [shadcn/ui Components](https://ui.shadcn.com/)
- [Tailwind CSS](https://tailwindcss.com/docs)

### Project Links
- **Live Demo**: [before-sign.vercel.app](https://before-sign.vercel.app)
- **GitHub Repository**: [github.com/hunkim/before-sign](https://github.com/hunkim/before-sign)
- **Issue Tracker**: [GitHub Issues](https://github.com/hunkim/before-sign/issues)

---

## 💡 Questions or Need Help?

1. **Check existing issues**: [GitHub Issues](https://github.com/hunkim/before-sign/issues)
2. **Create new issue**: Detailed description with reproduction steps
3. **Community Discussions**: Use GitHub Discussions for questions
4. **Documentation**: Refer to this guide and linked resources

Thank you for contributing to Before.sign! Your contributions help make contract analysis more accessible and effective for everyone. 