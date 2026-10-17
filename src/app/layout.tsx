import type { Metadata, Viewport } from 'next'
import '@fontsource-variable/inter'
import '@fontsource-variable/plus-jakarta-sans'
import '@/styles/globals.css'

export const metadata: Metadata = {
  title: 'Neev CMS — Property Management',
  description: 'Property Developer Sales & Document Management System',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#09090b',
  colorScheme: 'dark',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
