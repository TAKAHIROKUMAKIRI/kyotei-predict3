import { NextRequest, NextResponse } from 'next/server'
import { scrapeRaceInfo, scrapeWeather } from '@/lib/scraper'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const venueCode = searchParams.get('venue') || '01'
    const date = searchParams.get('date') || undefined
    const raceNo = searchParams.get('rno')

    if (raceNo) {
      const [raceInfo, weather] = await Promise.all([
        scrapeRaceInfo(venueCode, parseInt(raceNo), date),
        scrapeWeather(venueCode, parseInt(raceNo), date),
      ])
      return NextResponse.json({ raceInfo, weather })
    }

    // レース一覧は固定で1〜12を返す（スクレイピング不要）
    const races = [1,2,3,4,5,6,7,8,9,10,11,12]
    return NextResponse.json({ races })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
