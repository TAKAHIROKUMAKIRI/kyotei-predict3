import type { RaceInfo, WeatherInfo, ExhibitionData } from './scraper'
import { VENUE_DATA } from './venues'

export interface RacerPrediction {
  rank: number
  lane: number
  name: string
  grade: string
  natRate: number
  motorRate: number
  confidence: number
  reason: string
  exNote?: string | null
}

export interface RacePrediction {
  raceNo: number
  raceType: '堅い' | '荒れそう'
  keyFactor: string
  comment: string
  recommended2t: string
  recommended2t2: string
  recommended2f: string
  recommended3t: string
  ranking: RacerPrediction[]
  exhibitionHighlight?: string
  exhibitionApplied?: boolean
  exhibitionData?: ExhibitionData[]
}

function calcScore(
  racer: RaceInfo['racers'][0],
  lane: number,
  in1Rate: number,
  exhibition?: ExhibitionData
): number {
  let score = 0

  // 全国勝率（重要度高）
  score += (racer.natRate || 5.0) * 8

  // 当地勝率
  score += (racer.localRate || 5.0) * 5

  // モーター勝率
  score += (racer.motorRate || 40) * 0.3

  // コース有利性（1コースが最も有利）
  const courseBias = [in1Rate, 18, 14, 10, 8, 6]
  score += courseBias[lane - 1] || 6

  // グレードボーナス
  const gradeBonus: Record<string, number> = { A1: 15, A2: 8, B1: 0, B2: -8 }
  score += gradeBonus[racer.grade] || 0

  // 展示情報反映
  if (exhibition) {
    // ST速い = 有利
    if (exhibition.st < 0.15) score += 20
    else if (exhibition.st < 0.18) score += 10
    else if (exhibition.st > 0.25) score -= 10

    // 展示タイム
    if (exhibition.exhibitTime < 6.70) score += 15
    else if (exhibition.exhibitTime < 6.80) score += 8
    else if (exhibition.exhibitTime > 6.95) score -= 8

    // コース変更
    if (exhibition.course !== lane) {
      const courseBonus = [in1Rate, 18, 14, 10, 8, 6]
      score -= courseBias[lane - 1] || 6
      score += courseBonus[exhibition.course - 1] || 6
    }
  }

  return score
}

function scoreToConfidence(scores: number[]): number[] {
  const total = scores.reduce((a, b) => a + Math.max(b, 0), 0)
  if (total === 0) return scores.map(() => 1 / scores.length)
  return scores.map(s => Math.max(s, 0) / total)
}

function getReason(racer: RaceInfo['racers'][0], lane: number, rank: number, in1Rate: number, ex?: ExhibitionData): string {
  if (rank === 1) {
    if (lane === 1) return `1コース逃げ・当地${racer.localRate}%`
    if (racer.grade === 'A1') return `A1級実力差し`
    if (ex && ex.st < 0.17) return `ST${ex.st.toFixed(2)}好スタート`
    return `勝率${racer.natRate}で上位争い`
  }
  if (lane === 1 && rank > 2) return `1コース沈み波乱`
  if (ex && ex.exhibitTime < 6.75) return `展示T好調`
  if (racer.motorRate > 50) return `モーター好調`
  return `捲り差し狙い`
}

export async function predictRace(
  venueName: string,
  raceInfo: RaceInfo,
  weather: WeatherInfo,
  dateStr: string,
): Promise<RacePrediction> {
  const vd = VENUE_DATA[venueName] || { note: '標準水面', in1Rate: 54 }
  const rno = raceInfo.raceNo
  const in1Rate = rno <= 4 ? vd.in1Rate + 4 : rno >= 10 ? vd.in1Rate - 3 : vd.in1Rate

  const racers = raceInfo.racers
  const scores = racers.map(r => calcScore(r, r.lane, in1Rate))
  const confidences = scoreToConfidence(scores)

  const ranked = racers
    .map((r, i) => ({ racer: r, score: scores[i], conf: confidences[i] }))
    .sort((a, b) => b.score - a.score)
    .map((item, rank) => ({
      rank: rank + 1,
      lane: item.racer.lane,
      name: item.racer.name,
      grade: item.racer.grade,
      natRate: item.racer.natRate,
      motorRate: item.racer.motorRate,
      confidence: Math.round(item.conf * 100) / 100,
      reason: getReason(item.racer, item.racer.lane, rank + 1, in1Rate),
      exNote: null,
    }))

  const top2 = ranked.slice(0, 2)
  const top3 = ranked.slice(0, 3)

  // 荒れ判定：1位の確信度が低い or 1コースが上位でない
  const lane1Rank = ranked.find(r => r.lane === 1)?.rank || 6
  const topConf = ranked[0].confidence
  const isRough = lane1Rank > 2 || topConf < 0.28

  const recommended2t = `${top2[0].lane}-${top2[1].lane}`
  const recommended2t2 = `${top2[0].lane}-${top3[2]?.lane || top2[1].lane}`
  const recommended2f = `${Math.min(top2[0].lane, top2[1].lane)}=${Math.max(top2[0].lane, top2[1].lane)}`
  const recommended3t = `${top3[0].lane}-${top3[1].lane}-${top3[2]?.lane || top3[0].lane}`

  const windEffect = weather.windSpeed > 5 ? '強風でインが苦しい展開。' : ''
  const comment = `${windEffect}${ranked[0].name}が${ranked[0].grade}実力で本命。2着は${ranked[1].name}か${ranked[2]?.name}の争い。`

  return {
    raceNo: rno,
    raceType: isRough ? '荒れそう' : '堅い',
    keyFactor: isRough ? '外枠強豪・波乱含み' : `1コース${in1Rate}%・インの壁`,
    comment,
    recommended2t,
    recommended2t2,
    recommended2f,
    recommended3t,
    ranking: ranked,
  }
}

export async function predictWithExhibition(
  venueName: string,
  raceInfo: RaceInfo,
  basePrediction: RacePrediction,
  exhibition: ExhibitionData[],
): Promise<RacePrediction> {
  const vd = VENUE_DATA[venueName] || { note: '標準水面', in1Rate: 54 }
  const rno = raceInfo.raceNo
  const in1Rate = rno <= 4 ? vd.in1Rate + 4 : rno >= 10 ? vd.in1Rate - 3 : vd.in1Rate

  const exMap = new Map(exhibition.map(e => [e.lane, e]))
  const racers = raceInfo.racers
  const scores = racers.map(r => calcScore(r, r.lane, in1Rate, exMap.get(r.lane)))
  const confidences = scoreToConfidence(scores)

  const ranked = racers
    .map((r, i) => ({ racer: r, score: scores[i], conf: confidences[i] }))
    .sort((a, b) => b.score - a.score)
    .map((item, rank) => {
      const ex = exMap.get(item.racer.lane)
      return {
        rank: rank + 1,
        lane: item.racer.lane,
        name: item.racer.name,
        grade: item.racer.grade,
        natRate: item.racer.natRate,
        motorRate: item.racer.motorRate,
        confidence: Math.round(item.conf * 100) / 100,
        reason: getReason(item.racer, item.racer.lane, rank + 1, in1Rate, ex),
        exNote: ex ? (ex.st < 0.17 ? `ST${ex.st.toFixed(2)}` : ex.exhibitTime < 6.75 ? `展示${ex.exhibitTime.toFixed(2)}` : null) : null,
      }
    })

  const top2 = ranked.slice(0, 2)
  const top3 = ranked.slice(0, 3)

  const fastestST = exhibition.reduce((min, e) => e.st < min.st ? e : min, exhibition[0])
  const fastestEx = exhibition.reduce((min, e) => e.exhibitTime < min.exhibitTime ? e : min, exhibition[0])

  const highlight = `ST最速${fastestST.lane}号艇(${fastestST.st.toFixed(2)})・展示最速${fastestEx.lane}号艇(${fastestEx.exhibitTime.toFixed(2)})`

  return {
    raceNo: rno,
    raceType: ranked[0].lane === 1 ? '堅い' : '荒れそう',
    keyFactor: `展示反映済み・${highlight.slice(0, 20)}`,
    comment: `展示情報を反映。${ranked[0].name}が総合トップ。ST最速は${fastestST.lane}号艇。`,
    recommended2t: `${top2[0].lane}-${top2[1].lane}`,
    recommended2t2: `${top2[0].lane}-${top3[2]?.lane || top2[1].lane}`,
    recommended2f: `${Math.min(top2[0].lane, top2[1].lane)}=${Math.max(top2[0].lane, top2[1].lane)}`,
    recommended3t: `${top3[0].lane}-${top3[1].lane}-${top3[2]?.lane || top3[0].lane}`,
    ranking: ranked,
    exhibitionHighlight: highlight,
    exhibitionApplied: true,
    exhibitionData: exhibition,
  }
}
