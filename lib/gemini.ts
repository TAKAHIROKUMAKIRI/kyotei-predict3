import { GoogleGenerativeAI } from '@google/generative-ai'
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

function getClient() {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error('GEMINI_API_KEY is not set')
  return new GoogleGenerativeAI(apiKey)
}

function parseJSON(text: string): RacePrediction {
  const s = text.indexOf('{')
  const e = text.lastIndexOf('}')
  if (s === -1 || e <= s) throw new Error('JSONが見つかりません')
  const json = text.slice(s, e + 1).replace(/,(\s*[}\]])/g, '$1')
  return JSON.parse(json)
}

export async function predictRace(
  venueName: string,
  raceInfo: RaceInfo,
  weather: WeatherInfo,
  dateStr: string,
): Promise<RacePrediction> {
  const genAI = getClient()
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })
  const vd = VENUE_DATA[venueName] || { note: '標準水面', in1Rate: 54 }
  const rno = raceInfo.raceNo
  const in1Rate = rno <= 4 ? vd.in1Rate + 4 : rno >= 10 ? vd.in1Rate - 3 : vd.in1Rate
  const rClass = rno <= 4 ? 'B級中心' : rno <= 9 ? 'A・B混合' : 'A級中心'
  const racerLines = raceInfo.racers.map(r =>
    `${r.lane}号艇: ${r.name}（${r.grade}）全国勝率${r.natRate} 当地勝率${r.localRate} モーター${r.motorNo}(勝率${r.motorRate}%)`
  ).join('\n')
  const prompt = `あなたは競艇（ボートレース）の専門AIアナリストです。

【レース情報】
競艇場: ${venueName} ${dateStr} ${rno}R（${raceInfo.title}）
場の特性: ${vd.note}
1コース1着率目安: 約${in1Rate}%
レース傾向: ${rClass}
天候: ${weather.weather} 風速${weather.windSpeed}m/s 波高${weather.wave}cm 気温${weather.temperature}℃

【出走選手】
${racerLines}

【推奨舟券について】
メインは2連単（1・2着を順番通り当てる）。的中率重視で選ぶこと。
- recommended2t: 最も自信のある2連単（例: "1-2"）
- recommended2t2: 対抗の2連単（例: "1-3"）
- recommended2f: 2連複（例: "1=2"）
- recommended3t: 参考用の3連単（例: "1-2-3"）

必ず以下のJSON形式のみで応答（説明文・コードブロック不要）:
{"raceNo":${rno},"raceType":"堅い","keyFactor":"ポイント20字","comment":"総合コメント80字","recommended2t":"1-2","recommended2t2":"1-3","recommended2f":"1=2","recommended3t":"1-2-3","ranking":[{"rank":1,"lane":1,"name":"選手名","grade":"A1","natRate":6.8,"motorRate":48,"confidence":0.60,"reason":"理由15字"},{"rank":2,"lane":2,"name":"選手名","grade":"A2","natRate":5.9,"motorRate":42,"confidence":0.48,"reason":"理由"},{"rank":3,"lane":3,"name":"選手名","grade":"B1","natRate":5.4,"motorRate":38,"confidence":0.36,"reason":"理由"},{"rank":4,"lane":4,"name":"選手名","grade":"B1","natRate":5.0,"motorRate":34,"confidence":0.26,"reason":"理由"},{"rank":5,"lane":5,"name":"選手名","grade":"B2","natRate":4.8,"motorRate":30,"confidence":0.18,"reason":"理由"},{"rank":6,"lane":6,"name":"選手名","grade":"B2","natRate":4.5,"motorRate":28,"confidence":0.10,"reason":"理由"}]}

実際の出走選手データを使い、グレード・勝率・信頼度・理由をリアルにばらつかせること。`
  const result = await model.generateContent(prompt)
  const text = result.response.text()
  const pred = parseJSON(text)
  pred.raceNo = raceInfo.raceNo
  return pred
}

export async function predictWithExhibition(
  venueName: string,
  raceInfo: RaceInfo,
  basePrediction: RacePrediction,
  exhibition: ExhibitionData[],
): Promise<RacePrediction> {
  const genAI = getClient()
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })
  const orig = basePrediction.ranking
    .map(p => `${p.rank}着:${p.lane}号艇${p.name}(${Math.round(p.confidence * 100)}%)`)
    .join(' ')
  const exLines = exhibition.map(e => {
    const racer = raceInfo.racers.find(r => r.lane === e.lane)
    const courseStr = e.course !== e.lane ? `実コース:${e.course}コース【前付け】` : `${e.course}コース`
    return `${e.lane}号艇(${racer?.name || '—'}) ${courseStr} ST:${e.st.toFixed(2)}(${e.startEval}) 展示T:${e.exhibitTime.toFixed(2)} ターン:${e.turnEval} 行足:${e.footEval}`
  }).join('\n')
  const stRanking = [...exhibition].sort((a, b) => a.st - b.st).map((e, i) => `${i + 1}位:${e.lane}号艇(${e.st.toFixed(2)})`).join(' ')
  const exTimeRanking = [...exhibition].sort((a, b) => a.exhibitTime - b.exhibitTime).map((e, i) => `${i + 1}位:${e.lane}号艇(${e.exhibitTime.toFixed(2)})`).join(' ')
  const prompt = `競艇AIアナリスト。${venueName} ${raceInfo.raceNo}Rの展示情報を加味して着順予想と舟券推奨を更新。

【初回予想】${orig}
【展示情報】
${exLines}
【ST速さランキング】${stRanking}
【展示タイムランキング】${exTimeRanking}

ST速い(.10-.17)=先行有利。展示タイム最速=モーター好調。前付け重視。
2連単を的中率重視で推奨すること。

必ず以下のJSON形式のみで応答（説明文・コードブロック不要）:
{"raceType":"堅い","keyFactor":"展示踏まえたポイント30字","comment":"展示込みコメント80字","exhibitionHighlight":"目立った特徴30字","recommended2t":"1-2","recommended2t2":"1-3","recommended2f":"1=2","recommended3t":"1-2-3","ranking":[{"rank":1,"lane":1,"name":"選手名","grade":"A1","natRate":6.8,"motorRate":48,"confidence":0.65,"reason":"根拠15字","exNote":"展示特徴10字"},{"rank":2,"lane":2,"name":"選手名","grade":"A2","natRate":5.9,"motorRate":42,"confidence":0.50,"reason":"根拠","exNote":null},{"rank":3,"lane":3,"name":"選手名","grade":"B1","natRate":5.4,"motorRate":38,"confidence":0.38,"reason":"根拠","exNote":null},{"rank":4,"lane":4,"name":"選手名","grade":"B1","natRate":5.0,"motorRate":34,"confidence":0.27,"reason":"根拠","exNote":null},{"rank":5,"lane":5,"name":"選手名","grade":"B2","natRate":4.8,"motorRate":30,"confidence":0.18,"reason":"根拠","exNote":null},{"rank":6,"lane":6,"name":"選手名","grade":"B2","natRate":4.5,"motorRate":28,"confidence":0.10,"reason":"根拠","exNote":null}]}`
  const result = await model.generateContent(prompt)
  const text = result.response.text()
  const pred = parseJSON(text)
  pred.raceNo = raceInfo.raceNo
  pred.exhibitionApplied = true
  pred.exhibitionData = exhibition
  return pred
}
