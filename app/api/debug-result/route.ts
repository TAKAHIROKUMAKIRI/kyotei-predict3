import { NextResponse } from 'next/server'

export async function GET() {
  const url = 'https://boatraceopenapi.github.io/results/v2/2026/20260526.json'
  const res = await fetch(url)
  const data = await res.json()
  const results = data.results || data.programs || []
  // 最初の1件だけ返す
  return NextResponse.json(results[0] || {})
}
