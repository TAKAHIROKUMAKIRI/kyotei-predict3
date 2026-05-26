import { NextRequest, NextResponse } from 'next/server'
import { scrapeRaceInfo, scrapeWeather, scrapeExhibition } from '@/lib/scraper'
import { predictRace, predictWithExhibition } from '@/lib/gemini'
import { VENUES } from '@/lib/venues'

export async function POST(req: NextRequest) {
  try {
    const { venueCode, raceNo, date } = await req.json()
    const venue = VENUES.find(v => v.code === venueCode)
    if (!venue) return NextResponse.json({ error: '場が見つかりません' }, { status: 400 })
    const dateStr = date ? (() => {
      const y = date.slice(0, 4), m = date.slice(4, 6), d = date.slice(6, 8)
      return `${y}年${parseInt(m)}月${parseInt(d)}日`
    })() : (() => {
      const d = new Date()
      return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`
    })()
    const [raceInfo, weather, exhibition] = await Promise.all([
      scrapeRaceInfo(venueCode, raceNo, date),
      scrapeWeather(venueCode, raceNo, date),
      scrapeExhibition(venueCode, raceNo, date),
    ])
    const basePrediction = await predictRace(venue.name, raceInfo, weather, dateStr)
    const hasRealExhibition = exhibition.some(e => e.st < 0.40)
    let finalPrediction = basePrediction
    if (hasRealExhibition) {
      try {
        finalPrediction = await predictWithExhibition(venue.name, raceInfo, basePrediction, exhibition)
      } catch {
        finalPrediction = basePrediction
      }
    }
    return NextResponse.json({ raceInfo, weather, exhibition, prediction: finalPrediction, exhibitionFetched: hasRealExhibition })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}