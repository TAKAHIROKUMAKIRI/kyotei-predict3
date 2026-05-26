import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'BOAT PREDICT — 競艇AI予想',
  description: 'AIによる競艇着順予想・展示情報分析サービス',
  viewport: 'width=device-width, initial-scale=1',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  )
}
