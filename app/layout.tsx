import type { Metadata } from 'next'
import { Poppins } from 'next/font/google'
import Header from '@/components/ui/Header'
import Footer from '@/components/ui/Footer'
import './globals.css'

const poppins = Poppins({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-poppins',
})

export const metadata: Metadata = {
  title: 'OpenPolicy AI - Transparent AI Policy Scoring',
  description: 'OpenPolicy AI evaluates US senators\' alignment with OECD AI principles using transparent, evidence-based methodology.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={poppins.variable}>
      <body className={`${poppins.className} min-h-screen bg-white flex flex-col`}>
        <Header />
        <div className="flex-1">
          {children}
        </div>
        <Footer />
      </body>
    </html>
  )
}
