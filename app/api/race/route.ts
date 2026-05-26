import { NextRequest, NextResponse } from 'next/server'
import { scrapeRaceList, scrapeRaceInfo, scrapeWeather } from '@/lib/scraper'

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
    const races = await scrapeRaceList(venueCode, date)
    return NextResponse.json({ races })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}