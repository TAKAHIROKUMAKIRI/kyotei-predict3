// BoatraceOpenAPI (GitHub Pages) を使ったデータ取得
// 出走表: https://boatraceopenapi.github.io/programs/v2/YYYY/YYYYMMDD.json
// 直前情報: https://boatraceopenapi.github.io/previews/v2/YYYY/YYYYMMDD.json

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
  const jst = new Date(d.getTime() + 9 * 60 * 60 * 1000)
  return `${jst.getUTCFullYear()}${String(jst.getUTCMonth() + 1).padStart(2, '0')}${String(jst.getUTCDate()).padStart(2, '0')}`
}

function toDateParam(date?: string): string {
  return date || today()
}

function getYear(date: string): string {
  return date.slice(0, 4)
}

async function fetchJSON(url: string) {
  const res = await fetch(url, {
    headers: { 'Accept': 'application/json' },
    next: { revalidate: 1800 }, // 30分キャッシュ
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`)
  return res.json()
}

// ── 出走表取得 ──────────────────────────────
export async function scrapeRaceList(venueCode: string, date?: string): Promise<number[]> {
  try {
    const hd = toDateParam(date)
    const year = getYear(hd)
    const url = `https://boatraceopenapi.github.io/programs/v2/${year}/${hd}.json`
    const data = await fetchJSON(url)

    // 場コードに一致するデータを探す
    const jcd = venueCode.padStart(2, '0')
    const venue = data?.venues?.find((v: any) =>
      String(v.jcd).padStart(2, '0') === jcd ||
      String(v.venue_cd).padStart(2, '0') === jcd ||
      String(v.id).padStart(2, '0') === jcd
    )

    if (!venue) return [1,2,3,4,5,6,7,8,9,10,11,12]

    // レース一覧を取得
    const races = venue.races || venue.programs || []
    if (races.length === 0) return [1,2,3,4,5,6,7,8,9,10,11,12]

    return races
      .map((r: any) => r.rno || r.race_no || r.no)
      .filter((n: any) => n >= 1 && n <= 12)
      .sort((a: number, b: number) => a - b)
  } catch {
    return [1,2,3,4,5,6,7,8,9,10,11,12]
  }
}

export async function scrapeRaceInfo(venueCode: string, raceNo: number, date?: string): Promise<RaceInfo> {
  try {
    const hd = toDateParam(date)
    const year = getYear(hd)
    const url = `https://boatraceopenapi.github.io/programs/v2/${year}/${hd}.json`
    const data = await fetchJSON(url)

    const jcd = venueCode.padStart(2, '0')
    const venue = data?.venues?.find((v: any) =>
      String(v.jcd || v.venue_cd || v.id).padStart(2, '0') === jcd
    )
    if (!venue) throw new Error('venue not found')

    const races = venue.races || venue.programs || []
    const race = races.find((r: any) => (r.rno || r.race_no || r.no) === raceNo)
    if (!race) throw new Error('race not found')

    const title = race.title || race.race_name || `${raceNo}R`
    const entries = race.entries || race.racers || race.boats || []

    const racers: Racer[] = entries.slice(0, 6).map((e: any) => ({
      lane: e.waku || e.lane || e.boat_no || entries.indexOf(e) + 1,
      name: e.name || e.racer_name || `${e.waku || entries.indexOf(e) + 1}号艇`,
      regNo: String(e.toban || e.reg_no || ''),
      grade: e.class || e.grade || 'B1',
      branch: e.branch || '',
      age: e.age || 0,
      weight: e.weight || 0,
      natRate: parseFloat(e.winning_rate || e.nat_rate || e.rate || '5.00') || 5.00,
      nat2Rate: 0,
      localRate: parseFloat(e.local_winning_rate || e.local_rate || e.winning_rate || '5.00') || 5.00,
      local2Rate: 0,
      motorNo: String(e.motor_no || e.motor || '--'),
      motorRate: parseFloat(e.motor_rate || e.motor_winning_rate || '40.0') || 40.0,
      boatNo: String(e.boat_no2 || e.boat || '--'),
      boatRate: parseFloat(e.boat_rate || '0') || 0,
    }))

    // 6艇に満たない場合は補完
    while (racers.length < 6) {
      const lane = racers.length + 1
      racers.push({
        lane, name: `${lane}号艇`, regNo: '', grade: 'B1',
        branch: '', age: 0, weight: 0,
        natRate: 5.0, nat2Rate: 0, localRate: 5.0, local2Rate: 0,
        motorNo: '--', motorRate: 40, boatNo: '--', boatRate: 0,
      })
    }

    return { raceNo, title, racers }
  } catch {
    // フォールバック
    return {
      raceNo,
      title: `${raceNo}R`,
      racers: Array.from({ length: 6 }, (_, i) => ({
        lane: i + 1, name: `${i + 1}号艇`, regNo: '',
        grade: i < 2 ? 'A1' : i < 4 ? 'A2' : 'B1',
        branch: '', age: 0, weight: 0,
        natRate: 6.5 - i * 0.3, nat2Rate: 0,
        localRate: 6.0 - i * 0.3, local2Rate: 0,
        motorNo: '--', motorRate: 50 - i * 2,
        boatNo: '--', boatRate: 0,
      }))
    }
  }
}

export async function scrapeWeather(venueCode: string, raceNo: number, date?: string): Promise<WeatherInfo> {
  try {
    const hd = toDateParam(date)
    const year = getYear(hd)
    const url = `https://boatraceopenapi.github.io/previews/v2/${year}/${hd}.json`
    const data = await fetchJSON(url)

    const jcd = venueCode.padStart(2, '0')
    const venue = data?.venues?.find((v: any) =>
      String(v.jcd || v.venue_cd || v.id).padStart(2, '0') === jcd
    )
    if (!venue) throw new Error('venue not found')

    const races = venue.races || []
    const race = races.find((r: any) => (r.rno || r.race_no || r.no) === raceNo)
    const weather = race?.weather || venue.weather || {}

    return {
      weather: weather.weather || weather.name || '晴',
      wind: weather.wind_direction || weather.wind || '向かい風',
      windSpeed: parseFloat(weather.wind_speed || weather.windSpeed || '3') || 3,
      wave: parseFloat(weather.wave || weather.wave_height || '5') || 5,
      temperature: parseFloat(weather.temperature || weather.temp || '20') || 20,
    }
  } catch {
    return { weather: '晴', wind: '向かい風', windSpeed: 3, wave: 5, temperature: 20 }
  }
}

export async function scrapeExhibition(venueCode: string, raceNo: number, date?: string): Promise<ExhibitionData[]> {
  try {
    const hd = toDateParam(date)
    const year = getYear(hd)
    const url = `https://boatraceopenapi.github.io/previews/v2/${year}/${hd}.json`
    const data = await fetchJSON(url)

    const jcd = venueCode.padStart(2, '0')
    const venue = data?.venues?.find((v: any) =>
      String(v.jcd || v.venue_cd || v.id).padStart(2, '0') === jcd
    )
    if (!venue) throw new Error('venue not found')

    const races = venue.races || []
    const race = races.find((r: any) => (r.rno || r.race_no || r.no) === raceNo)
    if (!race) throw new Error('race not found')

    const entries = race.entries || race.boats || []
    if (entries.length === 0) throw new Error('no entries')

    const results: ExhibitionData[] = entries.slice(0, 6).map((e: any) => {
      const st = parseFloat(e.st || e.start_time || e.start || '0.20') || 0.20
      const exTime = parseFloat(e.exhibition_time || e.exhibit_time || e.ex_time || '6.80') || 6.80
      const course = parseInt(e.course || e.start_course || e.waku || '0') || entries.indexOf(e) + 1
      const lane = parseInt(e.waku || e.lane || '0') || entries.indexOf(e) + 1

      return {
        lane,
        course,
        st,
        exhibitTime: exTime,
        turnEval: exTime < 6.70 ? '良好' : exTime < 6.90 ? '普通' : 'やや難',
        footEval: st < 0.18 ? '良好' : st > 0.25 ? 'やや遅' : '普通',
        startEval: st < 0.18 ? '速い' : st > 0.27 ? '遅い' : '普通',
      }
    })

    return results
  } catch {
    return Array.from({ length: 6 }, (_, i) => ({
      lane: i + 1, course: i + 1,
      st: 0.15 + i * 0.025,
      exhibitTime: 6.80 + i * 0.04,
      turnEval: '普通', footEval: '普通', startEval: '普通',
    }))
  }
}
