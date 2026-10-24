import type { Metadata, Viewport } from 'next'
import { GeistSans } from 'geist/font/sans'
import { SITE_URL } from '@/lib/env'
import './globals.css'

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'vouch — anonymous compliments from your school',
    template: '%s · vouch',
  },
  description:
    'Vote on daily superlatives about people at your school. Get vouched for anonymously. Share to find out who’s hyping you.',
  applicationName: 'vouch',
  appleWebApp: { capable: true, title: 'vouch', statusBarStyle: 'black-translucent' },
  formatDetection: { telephone: false },
  openGraph: {
    type: 'website',
    siteName: 'vouch.school',
    title: 'vouch — who’s hyping you?',
    description: 'Anonymous compliments from people at your school.',
    url: SITE_URL,
  },
  twitter: { card: 'summary_large_image' },
}

export const viewport: Viewport = {
  themeColor: '#09090b',
  colorScheme: 'dark',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={GeistSans.variable}>
      <body className="ambient min-h-dvh font-sans">{children}</body>
    </html>
  )
}
