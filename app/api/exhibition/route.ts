import { NextRequest, NextResponse } from 'next/server'
import { scrapeRaceInfo, scrapeExhibition } from '@/lib/scraper'
import { predictWithExhibition } from '@/lib/gemini'
import { VENUES } from '@/lib/venues'

export async function POST(req: NextRequest) {
  try {
    const { venueCode, raceNo, date, basePrediction } = await req.json()
    const venue = VENUES.find(v => v.code === venueCode)
    if (!venue) return NextResponse.json({ error: '場が見つかりません' }, { status: 400 })
    const [raceInfo, exhibition] = await Promise.all([
      scrapeRaceInfo(venueCode, raceNo, date),
      scrapeExhibition(venueCode, raceNo, date),
    ])
    const prediction = await predictWithExhibition(venue.name, raceInfo, basePrediction, exhibition)
    return NextResponse.json({ prediction, exhibition })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}