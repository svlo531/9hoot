import type { Metadata } from 'next'
import { Montserrat } from 'next/font/google'
import './globals.css'

const montserrat = Montserrat({
  subsets: ['latin'],
  variable: '--font-montserrat',
  display: 'swap',
})

export const metadata: Metadata = {
  title: '9Hoot!',
  description: 'Real-time interactive quiz & engagement platform',
  icons: {
    icon: '/logos/AI-Agency-Logo-favicon.png',
    apple: '/logos/AI-Agency-Logo-notext.png',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={montserrat.variable}>
      <body className="font-montserrat antialiased">{children}</body>
    </html>
  )
}
