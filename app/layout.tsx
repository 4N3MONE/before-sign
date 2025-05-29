import type { Metadata } from 'next'
import './globals.css'
import ClientWrapper from '@/components/ClientWrapper'

export const metadata: Metadata = {
  title: 'Before.sign - AI Contract Risk Analysis',
  description: 'AI-powered contract risk analysis tool that identifies potential risks and provides expert recommendations before you sign.',
  keywords: ['contract analysis', 'legal risks', 'AI legal assistant', 'contract review', 'legal tech'],
  authors: [{ name: 'Before.sign Team' }],
  icons: {
    icon: '/favicon.svg',
    shortcut: '/favicon.svg',
    apple: '/favicon.svg',
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning={true}>
      <body>
        <ClientWrapper>{children}</ClientWrapper>
      </body>
    </html>
  )
}
