import * as cheerio from 'cheerio'

export interface Racer {
  lane: number
  name: string
  regNo: string
  grade: string
  branch: string
  age: number
  weight: number
  natRate: number
  nat2Rate: number
  localRate: number
  local2Rate: number
  motorNo: string
  motorRate: number
  boatNo: string
  boatRate: number
}

export interface RaceInfo {
  raceNo: number
  title: string
  racers: Racer[]
}

export interface WeatherInfo {
  weather: string
  wind: string
  windSpeed: number
  wave: number
  temperature: number
}

export interface ExhibitionData {
  lane: number
  course: number
  st: number
  exhibitTime: number
  turnEval: string
  footEval: string
  startEval: string
}

function today(): string {
  const d = new Date()
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
}

async function fetchPage(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'ja,en;q=0.9',
    },
    next: { revalidate: 300 },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.text()
}

export async function scrapeRaceList(venueCode: string, date?: string): Promise<number[]> {
  const hd = date || today()
  const url = `https://www.boatrace.jp/owpc/pc/race/index?jcd=${venueCode}&hd=${hd}`
  try {
    const html = await fetchPage(url)
    const $ = cheerio.load(html)
    const races: number[] = []
    $('a[href*="rno="]').each((_, el) => {
      const href = $(el).attr('href') || ''
      const m = href.match(/rno=(\d+)/)
      if (m) {
        const rno = parseInt(m[1])
        if (!races.includes(rno)) races.push(rno)
      }
    })
    return races.length > 0 ? races.sort((a, b) => a - b) : [1,2,3,4,5,6,7,8,9,10,11,12]
  } catch {
    return [1,2,3,4,5,6,7,8,9,10,11,12]
  }
}

export async function scrapeRaceInfo(venueCode: string, raceNo: number, date?: string): Promise<RaceInfo> {
  const hd = date || today()
  const url = `https://www.boatrace.jp/owpc/pc/race/racelist?jcd=${venueCode}&hd=${hd}&rno=${raceNo}`
  try {
    const html = await fetchPage(url)
    const $ = cheerio.load(html)
    const racers: Racer[] = []
    const title = $('h3.title16_titleName').text().trim() || `${raceNo}R`
    $('tbody.is-fs12').each((laneIdx, tbody) => {
      const lane = laneIdx + 1
      if (lane > 6) return
      const name = $(tbody).find('.is-fs18').text().trim() || `${lane}号艇`
      const grade = $(tbody).find('.label2').text().trim() || 'B1'
      const cells = $(tbody).find('td').map((_, td) => $(td).text().trim()).get()
      const natRate = parseFloat(cells.find(c => /^\d\.\d{2}$/.test(c)) || '5.00') || 5.00
      const rateMatches = cells.filter(c => /^\d\.\d{2}$/.test(c))
      const localRate = parseFloat(rateMatches[1] || '5.00') || 5.00
      const motorRate = parseFloat(cells.find(c => /^\d{2}\.\d$/.test(c)) || '40.0') || 40.0
      racers.push({ lane, name, regNo: '', grade, branch: '', age: 0, weight: 0, natRate, nat2Rate: 0, localRate, local2Rate: 0, motorNo: '--', motorRate, boatNo: '--', boatRate: 0 })
    })
    if (racers.length === 0) {
      for (let i = 1; i <= 6; i++) {
        racers.push({ lane: i, name: `${i}号艇`, regNo: '', grade: i <= 2 ? 'A1' : i <= 4 ? 'A2' : 'B1', branch: '', age: 0, weight: 0, natRate: 6.5 - i * 0.3, nat2Rate: 0, localRate: 6.0 - i * 0.3, local2Rate: 0, motorNo: '--', motorRate: 50 - i * 2, boatNo: '--', boatRate: 0 })
      }
    }
    return { raceNo, title, racers }
  } catch {
    const racers: Racer[] = Array.from({ length: 6 }, (_, i) => ({ lane: i + 1, name: `${i + 1}号艇`, regNo: '', grade: i < 2 ? 'A1' : i < 4 ? 'A2' : 'B1', branch: '', age: 0, weight: 0, natRate: 6.5 - i * 0.3, nat2Rate: 0, localRate: 6.0 - i * 0.3, local2Rate: 0, motorNo: '--', motorRate: 50 - i * 2, boatNo: '--', boatRate: 0 }))
    return { raceNo, title: `${raceNo}R`, racers }
  }
}

export async function scrapeWeather(venueCode: string, raceNo: number, date?: string): Promise<WeatherInfo> {
  const hd = date || today()
  const url = `https://www.boatrace.jp/owpc/pc/race/beforeinfo?jcd=${venueCode}&hd=${hd}&rno=${raceNo}`
  try {
    const html = await fetchPage(url)
    const $ = cheerio.load(html)
    const weatherText = $('.weather1_bodyUnit').text()
    return {
      weather: weatherText.includes('晴') ? '晴' : weatherText.includes('雨') ? '雨' : '曇',
      wind: '向かい風',
      windSpeed: parseFloat($('.weather1_bodyUnit').eq(2).text()) || 3,
      wave: parseFloat($('.weather1_bodyUnit').eq(4).text()) || 5,
      temperature: parseFloat($('.weather1_bodyUnit').eq(0).text()) || 20,
    }
  } catch {
    return { weather: '晴', wind: '向かい風', windSpeed: 3, wave: 5, temperature: 20 }
  }
}

export async function scrapeExhibition(venueCode: string, raceNo: number, date?: string): Promise<ExhibitionData[]> {
  const hd = date || today()
  const url = `https://www.boatrace.jp/owpc/pc/race/beforeinfo?jcd=${venueCode}&hd=${hd}&rno=${raceNo}`
  try {
    const html = await fetchPage(url)
    const $ = cheerio.load(html)
    const exTimes: Record<number, number> = {}
    const stTimes: Record<number, number> = {}
    $('.table1 tbody tr, .is-p3-0 tbody tr').each((_, tr) => {
      const cells = $(tr).find('td').map((_, td) => $(td).text().trim()).get()
      const laneCell = parseInt(cells[0])
      if (laneCell >= 1 && laneCell <= 6) {
        const exT = cells.find(c => /^[67]\.\d{2}$/.test(c))
        if (exT) exTimes[laneCell] = parseFloat(exT)
        const stT = cells.find(c => /^(F|\d\.\d{2})$/.test(c))
        if (stT && stT !== 'F') stTimes[laneCell] = parseFloat(stT)
      }
    })
    const results: ExhibitionData[] = []
    for (let lane = 1; lane <= 6; lane++) {
      const st = stTimes[lane] ?? (0.15 + (lane - 1) * 0.02)
      const exTime = exTimes[lane] ?? (6.80 + (lane - 1) * 0.04)
      const allTimes = Object.values(exTimes)
      const fastest = allTimes.length > 0 ? Math.min(...allTimes) : exTime
      results.push({
        lane, course: lane, st, exhibitTime: exTime,
        turnEval: exTime <= fastest + 0.05 ? '良好' : exTime <= fastest + 0.15 ? '普通' : 'やや難',
        footEval: st < 0.18 ? '良好' : st > 0.25 ? 'やや遅' : '普通',
        startEval: st < 0.18 ? '速い' : st > 0.27 ? '遅い' : '普通',
      })
    }
    return results
  } catch {
    return Array.from({ length: 6 }, (_, i) => ({ lane: i + 1, course: i + 1, st: 0.15 + i * 0.025, exhibitTime: 6.80 + i * 0.04, turnEval: '普通', footEval: '普通', startEval: '普通' }))
  }
}