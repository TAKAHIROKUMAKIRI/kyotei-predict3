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

const GRADE_MAP: Record<number, string> = { 1: 'A1', 2: 'A2', 3: 'B1', 4: 'B2' }

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
    next: { revalidate: 1800 },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`)
  return res.json()
}

// programs配列から特定の場・レースを取得
function findRace(programs: any[], stadiumNo: number, raceNo: number) {
  return programs.find((p: any) =>
    p.race_stadium_number === stadiumNo && p.race_number === raceNo
  )
}

export async function scrapeRaceList(venueCode: string, date?: string): Promise<number[]> {
  try {
    const hd = toDateParam(date)
    const year = getYear(hd)
    const url = `https://boatraceopenapi.github.io/programs/v2/${year}/${hd}.json`
    const data = await fetchJSON(url)
    const programs: any[] = data.programs || []
    const stadiumNo = parseInt(venueCode)
    const races = programs
      .filter((p: any) => p.race_stadium_number === stadiumNo)
      .map((p: any) => p.race_number)
      .filter((n: number) => n >= 1 && n <= 12)
      .sort((a: number, b: number) => a - b)
    return races.length > 0 ? races : [1,2,3,4,5,6,7,8,9,10,11,12]
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
    const programs: any[] = data.programs || []
    const stadiumNo = parseInt(venueCode)
    const race = findRace(programs, stadiumNo, raceNo)
    if (!race) throw new Error('race not found')

    const title = race.race_title || `${raceNo}R`
    const boats: any[] = race.boats || []

    const racers: Racer[] = boats.map((b: any) => ({
      lane: b.racer_boat_number,
      name: b.racer_name || `${b.racer_boat_number}号艇`,
      regNo: String(b.racer_number || ''),
      grade: GRADE_MAP[b.racer_class_number] || 'B1',
      branch: String(b.racer_branch_number || ''),
      age: b.racer_age || 0,
      weight: b.racer_weight || 0,
      natRate: parseFloat(b.racer_national_top_1_percent) || 5.00,
      nat2Rate: parseFloat(b.racer_national_top_2_percent) || 0,
      localRate: parseFloat(b.racer_local_top_1_percent) || 5.00,
      local2Rate: parseFloat(b.racer_local_top_2_percent) || 0,
      motorNo: String(b.racer_assigned_motor_number || '--'),
      motorRate: parseFloat(b.racer_assigned_motor_top_2_percent) || 0,
      boatNo: String(b.racer_assigned_boat_number || '--'),
      boatRate: parseFloat(b.racer_assigned_boat_top_2_percent) || 0,
    }))

    return { raceNo, title, racers }
  } catch {
    return {
      raceNo, title: `${raceNo}R`,
      racers: Array.from({ length: 6 }, (_, i) => ({
        lane: i+1, name: `${i+1}号艇`, regNo: '',
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
    const programs: any[] = data.programs || data.previews || []
    const stadiumNo = parseInt(venueCode)
    const race = findRace(programs, stadiumNo, raceNo)
    const w = race?.weather || {}
    return {
      weather: w.weather || w.weather_name || '晴',
      wind: w.wind_direction || '向かい風',
      windSpeed: parseFloat(w.wind_speed) || 3,
      wave: parseFloat(w.wave_height || w.wave) || 5,
      temperature: parseFloat(w.temperature) || 20,
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
    const programs: any[] = data.programs || data.previews || []
    const stadiumNo = parseInt(venueCode)
    const race = findRace(programs, stadiumNo, raceNo)
    if (!race) throw new Error('race not found')

    const boats: any[] = race.boats || []
    if (boats.length === 0) throw new Error('no boats')

    const results: ExhibitionData[] = boats.map((b: any) => {
      const st = parseFloat(b.start_timing ?? b.racer_average_start_timing ?? b.st ?? '0.20') || 0.20
      const exTime = parseFloat(b.exhibition_time ?? b.exhibit_time ?? '6.80') || 6.80
      const course = parseInt(b.start_course ?? b.course ?? b.racer_boat_number ?? '0') || b.racer_boat_number || boats.indexOf(b) + 1
      const lane = b.racer_boat_number || boats.indexOf(b) + 1

      return {
        lane, course, st, exhibitTime: exTime,
        turnEval: exTime < 6.70 ? '良好' : exTime < 6.90 ? '普通' : 'やや難',
        footEval: st < 0.18 ? '良好' : st > 0.25 ? 'やや遅' : '普通',
        startEval: st < 0.18 ? '速い' : st > 0.27 ? '遅い' : '普通',
      }
    })

    return results
  } catch {
    return Array.from({ length: 6 }, (_, i) => ({
      lane: i+1, course: i+1, st: 0.15 + i * 0.025, exhibitTime: 6.80 + i * 0.04,
      turnEval: '普通', footEval: '普通', startEval: '普通',
    }))
  }
}
