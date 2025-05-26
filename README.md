# Before.sign - AI-Powered Contract Risk Analysis

A professional contract analysis tool that uses Upstage Document Parse and Solar LLM to identify risks and provide detailed recommendations.

## Features

- **Smart Document Parsing**: Upload PDF, DOC, and DOCX files using Upstage Document Parse
- **AI Risk Identification**: Uses Solar LLM to identify specific problematic clauses
- **Detailed Analysis**: Provides business impact assessment, legal risks, and recommendations
- **Professional UI**: Modern, responsive interface built with Next.js and Tailwind CSS

## Setup Instructions

### 1. Environment Variables

Create a `.env.local` file in the root directory:

```bash
UPSTAGE_API_KEY=your_upstage_api_key_here
UPSTAGE_MODEL_NAME=solar-pro2-preview
```

Get your API key from: https://console.upstage.ai/services/solar

**Model Configuration:**
- `UPSTAGE_MODEL_NAME` (optional): Specify which Upstage model to use
- Default: `solar-pro2-preview` if not specified
- Available models: `solar-pro`, `solar-pro2-preview`, etc.
- **Note**: `solar-pro2-preview` is a reasoning model that automatically includes `reasoning_effort: "high"` parameter

### 2. Install Dependencies

```bash
npm install
# or
yarn install
# or
pnpm install
```

### 3. Run the Development Server

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Architecture

### Document Processing Flow

1. **File Upload**: Users upload contracts via drag-and-drop or file selection
2. **Document Parse**: Upstage Document Parse extracts text from PDF/DOC/DOCX files
3. **Risk Identification**: Solar LLM analyzes the text to identify potential risks
4. **Detailed Analysis**: For each risk, Solar LLM provides:
   - Detailed explanation of the issue
   - Business and legal impact assessment
   - Prioritized recommendations
   - Suggested alternative text

### API Endpoints

- `POST /api/upload` - Handles file uploads and document parsing
- `POST /api/analysis` - Performs contract risk analysis

### Technology Stack

- **Frontend**: Next.js 15, React 19, TypeScript
- **Styling**: Tailwind CSS, shadcn/ui components
- **Document Processing**: Upstage Document Parse API
- **AI Analysis**: Upstage Solar LLM API
- **Icons**: Lucide React

## Professional Features

### Enhanced Risk Analysis

Each identified risk includes:

- **Original Text**: Exact problematic clause from the contract
- **Severity Level**: High/Medium/Low risk classification
- **Business Impact**: Financial, operational, and reputational implications
- **Legal Risks**: Specific legal exposures that could materialize
- **Recommendations**: Prioritized actions with effort estimates
- **Suggested Text**: Alternative clauses that would be more favorable

### User Experience

- Real-time upload progress
- Professional analysis interface
- Comprehensive risk visualization
- Export-ready recommendations
- Mobile-responsive design

## Usage

1. Visit the application homepage
2. Upload a contract file (PDF, DOC, or DOCX)
3. Wait for AI analysis to complete (1-2 minutes)
4. Review detailed risk analysis and recommendations
5. Use the suggestions to negotiate better contract terms

## Security

- API keys are securely stored in environment variables
- File uploads are processed server-side
- No contract data is stored permanently
- HTTPS encryption for all communications

## License

This project is licensed under the MIT License.

## Support

For questions or support, please contact the development team or refer to the Upstage documentation at https://developers.upstage.ai/ 