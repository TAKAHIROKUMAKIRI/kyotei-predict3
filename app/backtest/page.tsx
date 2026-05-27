'use client'

import { useState } from 'react'
import { VENUE_DATA } from '@/lib/venues'

const VENUE_NAMES: Record<number, string> = {
  1:'桐生',2:'戸田',3:'江戸川',4:'平和島',5:'多摩川',6:'浜名湖',
  7:'蒲郡',8:'常滑',9:'津',10:'三国',11:'びわこ',12:'住之江',
  13:'尼崎',14:'鳴門',15:'丸亀',16:'児島',17:'宮島',18:'徳山',
  19:'下関',20:'若松',21:'芦屋',22:'福岡',23:'唐津',24:'大村',
}
const GRADE_MAP: Record<number, string> = {1:'A1',2:'A2',3:'B1',4:'B2'}

function calcScore(
  racer: any,
  lane: number,
  in1Rate: number,
  exhibition?: { st: number; exhibitTime: number; course: number }
) {
  let score = 0
  score += (racer.natRate || 5.0) * 8
  score += (racer.localRate || 5.0) * 5
  score += (racer.motorRate || 40) * 0.3

  // 実際のコース（展示あれば展示コース、なければ艇番）
  const course = exhibition?.course ?? lane
  const courseBias = [in1Rate, 18, 14, 10, 8, 6]
  score += courseBias[course - 1] || 6

  const gradeBonus: Record<string, number> = { A1: 15, A2: 8, B1: 0, B2: -8 }
  score += gradeBonus[racer.grade] || 0

  // 展示情報反映
  if (exhibition) {
    const { st, exhibitTime } = exhibition
    if (st < 0.15) score += 25
    else if (st < 0.18) score += 12
    else if (st < 0.20) score += 5
    else if (st > 0.25) score -= 12
    else if (st > 0.22) score -= 5

    if (exhibitTime < 6.65) score += 20
    else if (exhibitTime < 6.70) score += 12
    else if (exhibitTime < 6.75) score += 6
    else if (exhibitTime > 6.95) score -= 10
    else if (exhibitTime > 6.88) score -= 5
  }

  return score
}

function predict(
  boats: any[],
  venueName: string,
  raceNo: number,
  exMap?: Map<number, any>
) {
  const vd = VENUE_DATA[venueName] || { in1Rate: 54 }
  const in1Rate = raceNo <= 4 ? vd.in1Rate + 4 : raceNo >= 10 ? vd.in1Rate - 3 : vd.in1Rate

  const racers = boats.map(b => ({
    lane: b.racer_boat_number,
    grade: GRADE_MAP[b.racer_class_number] || 'B1',
    natRate: parseFloat(b.racer_national_top_1_percent) || 5.0,
    localRate: parseFloat(b.racer_local_top_1_percent) || 5.0,
    motorRate: parseFloat(b.racer_assigned_motor_top_2_percent) || 40,
  }))

  const ranked = racers
    .map(r => {
      const ex = exMap?.get(r.lane)
      return { ...r, score: calcScore(r, r.lane, in1Rate, ex) }
    })
    .sort((a, b) => b.score - a.score)

  return {
    honmei: `${ranked[0].lane}-${ranked[1].lane}`,
    taikou: `${ranked[0].lane}-${ranked[2]?.lane || ranked[1].lane}`,
    sanrentan: `${ranked[0].lane}-${ranked[1].lane}-${ranked[2]?.lane}`,
  }
}

function buildExMap(previewRace: any): Map<number, any> {
  const map = new Map<number, any>()
  if (!previewRace?.boats) return map
  for (const b of previewRace.boats) {
    const lane = b.racer_boat_number
    const st = parseFloat(b.start_timing ?? b.racer_average_start_timing ?? '0.20') || 0.20
    const exhibitTime = parseFloat(b.exhibition_time ?? b.exhibit_time ?? '6.80') || 6.80
    const course = parseInt(b.racer_course_number ?? b.start_course ?? lane) || lane
    map.set(lane, { st, exhibitTime, course })
  }
  return map
}

function getActualResult(resultRace: any) {
  if (!resultRace?.boats) return null
  const sorted = [...resultRace.boats].sort((a: any, b: any) =>
    (a.racer_place_number ?? 99) - (b.racer_place_number ?? 99)
  )
  const first = sorted[0]?.racer_boat_number
  const second = sorted[1]?.racer_boat_number
  const third = sorted[2]?.racer_boat_number
  if (!first || !second) return null
  return { exacta: `${first}-${second}`, trifecta: `${first}-${second}-${third}` }
}

function getPayout(result: any, type: 'exacta' | 'trifecta', combo: string) {
  if (!result?.payouts?.[type]) return 0
  for (const p of result.payouts[type]) {
    if (p.combination === combo) return parseInt(p.payout || 0)
  }
  return 0
}

function dateToStr(d: Date) {
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
}
function getDateRange(months: number) {
  const dates = []
  const end = new Date(); end.setDate(end.getDate() - 1)
  const start = new Date(end); start.setMonth(start.getMonth() - months)
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) dates.push(dateToStr(new Date(d)))
  return dates
}
function roi(invest: number, payout: number) {
  if (!invest) return '0.0'
  return ((payout / invest) * 100).toFixed(1)
}
function hitRate(wins: number, bets: number) {
  if (!bets) return '0.0'
  return ((wins / bets) * 100).toFixed(1)
}

const STRATEGIES = [
  { id: 'base',   label: 'ベース（展示なし）', desc: '全レース・展示情報なし・2連単' },
  { id: 'ex',     label: '展示込み',           desc: '全レース・展示情報あり・2連単' },
  { id: 'ex3',    label: '展示込み 3連単',      desc: '全レース・展示情報あり・3連単' },
  { id: 'exhigh', label: '展示込み 高ST絞り',   desc: 'ST0.18以下の艇がいるレースのみ' },
  { id: 'exfast', label: '展示込み 展示速い絞り', desc: '展示最速6.75以下のレースのみ' },
  { id: 'exboth', label: '展示込み ST+展示絞り', desc: 'ST速い＋展示速いレースのみ' },
]

export default function BacktestPage() {
  const [months, setMonths] = useState(1)
  const [strategy, setStrategy] = useState('ex')
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState({ current: 0, total: 0, date: '', fetched: 0 })
  const [result, setResult] = useState<any>(null)
  const [log, setLog] = useState<string[]>([])

  const addLog = (msg: string) => setLog(prev => [...prev.slice(-20), msg])

  const run = async () => {
    setRunning(true); setResult(null); setLog([])
    const dates = getDateRange(months)
    setProgress({ current: 0, total: dates.length, date: '', fetched: 0 })

    const useEx = strategy !== 'base'
    const use3tan = strategy === 'ex3'

    const stats = {
      totalRaces: 0, bettedRaces: 0, exMissing: 0,
      main: { bets: 0, wins: 0, payout: 0 },
      sub: { bets: 0, wins: 0, payout: 0 },
      byVenue: {} as Record<string, any>,
      byRaceNo: {} as Record<number, any>,
      monthly: {} as Record<string, any>,
    }

    for (let i = 0; i < dates.length; i++) {
      const dateStr = dates[i]
      const year = dateStr.slice(0, 4)
      const month = dateStr.slice(0, 6)
      setProgress({ current: i + 1, total: dates.length, date: dateStr, fetched: stats.bettedRaces })

      try {
        const urls = [
          fetch(`https://boatraceopenapi.github.io/programs/v2/${year}/${dateStr}.json`).then(r => r.ok ? r.json() : null),
          fetch(`https://boatraceopenapi.github.io/results/v2/${year}/${dateStr}.json`).then(r => r.ok ? r.json() : null),
        ]
        if (useEx) urls.push(
          fetch(`https://boatraceopenapi.github.io/previews/v2/${year}/${dateStr}.json`).then(r => r.ok ? r.json() : null)
        )

        const [programData, resultData, previewData] = await Promise.all(urls)
        if (!programData || !resultData) continue

        const programs = programData.programs || []
        const results = (resultData.results || resultData.programs || [])
        const previews = previewData?.programs || previewData?.previews || []

        const resultMap = new Map()
        for (const r of results) resultMap.set(`${r.race_stadium_number}_${r.race_number}`, r)

        const previewMap = new Map()
        for (const p of previews) previewMap.set(`${p.race_stadium_number}_${p.race_number}`, p)

        for (const prog of programs) {
          if (!prog.boats || prog.boats.length < 6) continue
          const key = `${prog.race_stadium_number}_${prog.race_number}`
          const resultRace = resultMap.get(key)
          if (!resultRace) continue
          const actual = getActualResult(resultRace)
          if (!actual) continue

          const venueName = VENUE_NAMES[prog.race_stadium_number] || `場${prog.race_stadium_number}`
          const raceNo = prog.race_number
          stats.totalRaces++

          // 展示マップ構築
          let exMap: Map<number, any> | undefined
          if (useEx) {
            const previewRace = previewMap.get(key)
            if (previewRace) {
              exMap = buildExMap(previewRace)
            } else {
              stats.exMissing++
              continue // 展示データなしはスキップ
            }
          }

          // 絞り込み判定
          if (strategy === 'exhigh' && exMap) {
            const hasFastST = [...exMap.values()].some(e => e.st <= 0.18)
            if (!hasFastST) continue
          }
          if (strategy === 'exfast' && exMap) {
            const hasFastEx = [...exMap.values()].some(e => e.exhibitTime <= 6.75)
            if (!hasFastEx) continue
          }
          if (strategy === 'exboth' && exMap) {
            const hasFastST = [...exMap.values()].some(e => e.st <= 0.18)
            const hasFastEx = [...exMap.values()].some(e => e.exhibitTime <= 6.75)
            if (!hasFastST || !hasFastEx) continue
          }

          stats.bettedRaces++
          const pred = predict(prog.boats, venueName, raceNo, exMap)

          let mainHit = false, subHit = false
          let mainPay = 0, subPay = 0

          if (use3tan) {
            mainHit = pred.sanrentan === actual.trifecta
            mainPay = mainHit ? getPayout(resultRace, 'trifecta', actual.trifecta) : 0
          } else {
            mainHit = pred.honmei === actual.exacta
            mainPay = mainHit ? getPayout(resultRace, 'exacta', actual.exacta) : 0
            subHit = pred.taikou === actual.exacta
            subPay = subHit ? getPayout(resultRace, 'exacta', actual.exacta) : 0
          }

          stats.main.bets++
          if (mainHit) { stats.main.wins++; stats.main.payout += mainPay }
          if (!use3tan) {
            stats.sub.bets++
            if (subHit) { stats.sub.wins++; stats.sub.payout += subPay }
          }

          // 集計
          for (const [key2, s] of [
            [`v_${venueName}`, stats.byVenue],
            [`r_${raceNo}`, stats.byRaceNo],
            [`m_${month}`, stats.monthly],
          ] as any[]) {
            const k = key2.slice(2)
            if (!s[k]) s[k] = { bets: 0, wins: 0, invest: 0, payout: 0 }
            s[k].bets += use3tan ? 1 : 2
            s[k].invest += use3tan ? 100 : 200
            if (mainHit) { s[k].wins++; s[k].payout += mainPay }
            if (!use3tan && subHit) { s[k].wins++; s[k].payout += subPay }
          }
        }

        if ((i + 1) % 5 === 0) addLog(`${dateStr}: ベット${stats.bettedRaces}/${stats.totalRaces}R 展示なし${stats.exMissing}R`)
      } catch { /* スキップ */ }

      await new Promise(r => setTimeout(r, 150))
    }

    setResult({ ...stats, strategy, use3tan })
    setRunning(false)
    addLog('✅ 完了！')
  }

  const totalInvest = result ? (result.main.bets + (result.use3tan ? 0 : result.sub.bets)) * 100 : 0
  const totalPayout = result ? result.main.payout + result.sub.payout : 0

  return (
    <div style={{ position: 'relative', zIndex: 1, maxWidth: 1080, margin: '0 auto', padding: '24px 16px 80px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <div style={{ width: 42, height: 42, background: 'linear-gradient(135deg,#cc2233,#ff4455)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.3rem' }}>📊</div>
        <div>
          <div style={{ fontFamily: 'monospace', fontSize: '1.6rem', color: '#fff' }}>BACK<span style={{ color: 'var(--red)' }}>TEST</span></div>
          <div style={{ fontSize: '.54rem', letterSpacing: '.2em', color: 'var(--tx2)', fontFamily: 'monospace' }}>展示込みバックテスト</div>
        </div>
      </div>

      <div style={{ background: 'var(--sf)', border: '1px solid var(--bd)', borderRadius: 9, padding: 20, marginBottom: 20 }}>
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: '.6rem', color: 'var(--tx2)', fontFamily: 'monospace', marginBottom: 8 }}>戦略選択</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
            {STRATEGIES.map(s => (
              <button key={s.id} onClick={() => setStrategy(s.id)}
                style={{ padding: '10px 12px', background: strategy === s.id ? 'rgba(255,63,85,.12)' : 'var(--bg)', border: `1px solid ${strategy === s.id ? 'var(--red)' : 'var(--bd)'}`, color: strategy === s.id ? '#fff' : 'var(--tx2)', borderRadius: 6, fontFamily: 'monospace', fontSize: '.72rem', textAlign: 'left', cursor: 'pointer' }}>
                <div style={{ color: strategy === s.id ? 'var(--red)' : 'var(--tx2)', marginBottom: 3 }}>{s.label}</div>
                <div style={{ fontSize: '.58rem', color: 'var(--tx3)' }}>{s.desc}</div>
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: '.6rem', color: 'var(--tx2)', fontFamily: 'monospace', marginBottom: 6 }}>期間</div>
            <div style={{ display: 'flex', gap: 8 }}>
              {[1, 2, 3, 6].map(m => (
                <button key={m} onClick={() => setMonths(m)}
                  style={{ padding: '8px 16px', background: months === m ? 'rgba(255,63,85,.1)' : 'var(--bg)', border: `1px solid ${months === m ? 'var(--red)' : 'var(--bd)'}`, color: months === m ? 'var(--red)' : 'var(--tx2)', borderRadius: 5, fontFamily: 'monospace', fontSize: '.8rem', cursor: 'pointer' }}>
                  {m}ヶ月
                </button>
              ))}
            </div>
          </div>
          <div style={{ fontSize: '.64rem', color: 'var(--tx3)', fontFamily: 'monospace' }}>
            ※6ヶ月は20〜30分かかります
          </div>
          <button onClick={run} disabled={running}
            style={{ marginLeft: 'auto', padding: '12px 28px', background: running ? 'var(--bd)' : 'linear-gradient(90deg,#cc2233,#ff4455)', border: 'none', borderRadius: 5, color: running ? 'var(--tx3)' : '#fff', fontFamily: 'monospace', fontSize: '1rem', letterSpacing: '.1em', cursor: running ? 'not-allowed' : 'pointer' }}>
            {running ? '⏳ 実行中...' : '▶ 実行'}
          </button>
        </div>

        {running && (
          <div style={{ marginTop: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.68rem', color: 'var(--tx2)', fontFamily: 'monospace', marginBottom: 6 }}>
              <span>処理中: {progress.date}</span>
              <span>{progress.current} / {progress.total}日</span>
            </div>
            <div style={{ height: 6, background: 'var(--bg)', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{ width: `${progress.total ? (progress.current / progress.total * 100) : 0}%`, height: '100%', background: 'linear-gradient(90deg,#cc2233,#ff4455)', transition: 'width .3s' }} />
            </div>
            <div style={{ marginTop: 8, fontSize: '.6rem', color: 'var(--tx3)', fontFamily: 'monospace' }}>{log[log.length - 1]}</div>
          </div>
        )}
      </div>

      {result && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 1, background: 'var(--bd)', borderRadius: 9, overflow: 'hidden' }}>
            {[
              { label: '総レース', value: result.totalRaces.toLocaleString() },
              { label: 'ベット対象', value: result.bettedRaces.toLocaleString() },
              { label: '総投資額', value: `${totalInvest.toLocaleString()}円` },
              { label: '総回収額', value: `${totalPayout.toLocaleString()}円` },
              { label: '総回収率', value: `${roi(totalInvest, totalPayout)}%`, color: parseFloat(roi(totalInvest, totalPayout)) >= 100 ? 'var(--grn)' : parseFloat(roi(totalInvest, totalPayout)) >= 85 ? 'var(--warn)' : 'var(--red)' },
            ].map(({ label, value, color }) => (
              <div key={label} style={{ background: 'var(--sf)', padding: '14px 10px', textAlign: 'center' }}>
                <div style={{ fontFamily: 'monospace', fontSize: '1.2rem', color: color || 'var(--ac)', lineHeight: 1 }}>{value}</div>
                <div style={{ fontSize: '.52rem', color: 'var(--tx2)', fontFamily: 'monospace', marginTop: 4 }}>{label}</div>
              </div>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: result.use3tan ? '1fr' : '1fr 1fr', gap: 12 }}>
            {[
              { label: result.use3tan ? '3連単 本命' : '2連単 本命', data: result.main },
              ...(!result.use3tan ? [{ label: '2連単 対抗', data: result.sub }] : []),
            ].map(({ label, data }) => {
              const r = roi(data.bets * 100, data.payout)
              const isPlus = parseFloat(r) >= 100
              return (
                <div key={label} style={{ background: 'var(--sf)', border: '1px solid var(--bd)', borderRadius: 9, padding: 16 }}>
                  <div style={{ fontSize: '.6rem', color: 'var(--warn)', fontFamily: 'monospace', letterSpacing: '.14em', marginBottom: 12 }}>{label}</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    {[
                      { l: 'ベット数', v: data.bets.toLocaleString() },
                      { l: '的中数', v: `${data.wins.toLocaleString()} (${hitRate(data.wins, data.bets)}%)` },
                      { l: '投資額', v: `${(data.bets * 100).toLocaleString()}円` },
                      { l: '回収額', v: `${data.payout.toLocaleString()}円` },
                    ].map(({ l, v }) => (
                      <div key={l} style={{ background: 'var(--bg)', borderRadius: 5, padding: '8px 10px' }}>
                        <div style={{ fontSize: '.56rem', color: 'var(--tx3)', marginBottom: 3 }}>{l}</div>
                        <div style={{ fontSize: '.82rem', color: 'var(--tx)', fontFamily: 'monospace' }}>{v}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ marginTop: 12, padding: '8px 12px', background: isPlus ? 'rgba(46,220,128,.08)' : 'rgba(255,63,85,.08)', borderRadius: 5, border: `1px solid ${isPlus ? 'rgba(46,220,128,.25)' : 'rgba(255,63,85,.25)'}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '.6rem', color: 'var(--tx2)', fontFamily: 'monospace' }}>回収率 (ROI)</span>
                    <span style={{ fontSize: '1.4rem', color: isPlus ? 'var(--grn)' : 'var(--red)', fontFamily: 'monospace', fontWeight: 700 }}>{r}%</span>
                  </div>
                </div>
              )
            })}
          </div>

          <div style={{ background: 'var(--sf)', border: '1px solid var(--bd)', borderRadius: 9, overflow: 'hidden' }}>
            <div style={{ padding: '12px 16px', background: 'var(--bg2)', borderBottom: '1px solid var(--bd)', fontSize: '.6rem', color: 'var(--tx2)', fontFamily: 'monospace', letterSpacing: '.14em' }}>月別成績</div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.76rem' }}>
                <thead>
                  <tr>{['月', 'ベット', '的中', '投資額', '回収額', 'ROI'].map(h => (
                    <th key={h} style={{ background: 'var(--bg)', color: 'var(--tx2)', fontFamily: 'monospace', fontSize: '.56rem', padding: '8px 12px', borderBottom: '1px solid var(--bd)', textAlign: 'right' }}>{h}</th>
                  ))}</tr>
                </thead>
                <tbody>
                  {Object.entries(result.monthly).sort().map(([month, s]: any) => {
                    const r = parseFloat(roi(s.invest, s.payout))
                    return (
                      <tr key={month}>
                        <td style={{ padding: '8px 12px', borderBottom: '1px solid var(--bd2)', fontFamily: 'monospace', color: 'var(--tx)', textAlign: 'right' }}>{month.slice(0, 4)}/{month.slice(4)}</td>
                        <td style={{ padding: '8px 12px', borderBottom: '1px solid var(--bd2)', fontFamily: 'monospace', color: 'var(--tx2)', textAlign: 'right' }}>{s.bets}</td>
                        <td style={{ padding: '8px 12px', borderBottom: '1px solid var(--bd2)', fontFamily: 'monospace', color: 'var(--tx2)', textAlign: 'right' }}>{s.wins} ({hitRate(s.wins, s.bets)}%)</td>
                        <td style={{ padding: '8px 12px', borderBottom: '1px solid var(--bd2)', fontFamily: 'monospace', color: 'var(--tx2)', textAlign: 'right' }}>{s.invest.toLocaleString()}円</td>
                        <td style={{ padding: '8px 12px', borderBottom: '1px solid var(--bd2)', fontFamily: 'monospace', color: 'var(--tx2)', textAlign: 'right' }}>{s.payout.toLocaleString()}円</td>
                        <td style={{ padding: '8px 12px', borderBottom: '1px solid var(--bd2)', fontFamily: 'monospace', fontWeight: 700, textAlign: 'right', color: r >= 100 ? 'var(--grn)' : r >= 85 ? 'var(--warn)' : 'var(--red)' }}>{roi(s.invest, s.payout)}%</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div style={{ background: 'var(--sf)', border: '1px solid var(--bd)', borderRadius: 9, overflow: 'hidden' }}>
            <div style={{ padding: '12px 16px', background: 'var(--bg2)', borderBottom: '1px solid var(--bd)', fontSize: '.6rem', color: 'var(--tx2)', fontFamily: 'monospace', letterSpacing: '.14em' }}>場別成績（ROI順）</div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.76rem' }}>
                <thead>
                  <tr>{['場名', 'ベット', '的中', '投資額', '回収額', 'ROI'].map(h => (
                    <th key={h} style={{ background: 'var(--bg)', color: 'var(--tx2)', fontFamily: 'monospace', fontSize: '.56rem', padding: '8px 12px', borderBottom: '1px solid var(--bd)', textAlign: 'right' }}>{h}</th>
                  ))}</tr>
                </thead>
                <tbody>
                  {Object.entries(result.byVenue)
                    .filter(([, s]: any) => s.bets > 0)
                    .sort(([, a]: any, [, b]: any) => (b.payout / b.invest) - (a.payout / a.invest))
                    .map(([venue, s]: any) => {
                      const r = parseFloat(roi(s.invest, s.payout))
                      return (
                        <tr key={venue}>
                          <td style={{ padding: '8px 12px', borderBottom: '1px solid var(--bd2)', color: 'var(--tx)', textAlign: 'right' }}>{venue}</td>
                          <td style={{ padding: '8px 12px', borderBottom: '1px solid var(--bd2)', fontFamily: 'monospace', color: 'var(--tx2)', textAlign: 'right' }}>{s.bets}</td>
                          <td style={{ padding: '8px 12px', borderBottom: '1px solid var(--bd2)', fontFamily: 'monospace', color: 'var(--tx2)', textAlign: 'right' }}>{s.wins} ({hitRate(s.wins, s.bets)}%)</td>
                          <td style={{ padding: '8px 12px', borderBottom: '1px solid var(--bd2)', fontFamily: 'monospace', color: 'var(--tx2)', textAlign: 'right' }}>{s.invest.toLocaleString()}円</td>
                          <td style={{ padding: '8px 12px', borderBottom: '1px solid var(--bd2)', fontFamily: 'monospace', color: 'var(--tx2)', textAlign: 'right' }}>{s.payout.toLocaleString()}円</td>
                          <td style={{ padding: '8px 12px', borderBottom: '1px solid var(--bd2)', fontFamily: 'monospace', fontWeight: 700, textAlign: 'right', color: r >= 100 ? 'var(--grn)' : r >= 85 ? 'var(--warn)' : 'var(--red)' }}>{roi(s.invest, s.payout)}%</td>
                        </tr>
                      )
                    })}
                </tbody>
              </table>
            </div>
          </div>

          <div style={{ background: 'var(--sf)', border: '1px solid var(--bd)', borderRadius: 9, overflow: 'hidden' }}>
            <div style={{ padding: '12px 16px', background: 'var(--bg2)', borderBottom: '1px solid var(--bd)', fontSize: '.6rem', color: 'var(--tx2)', fontFamily: 'monospace', letterSpacing: '.14em' }}>R別成績</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 1, background: 'var(--bd)' }}>
              {Array.from({ length: 12 }, (_, i) => i + 1).map(rno => {
                const s = result.byRaceNo[rno]
                if (!s || s.bets === 0) return <div key={rno} style={{ background: 'var(--sf)', padding: '10px 8px', textAlign: 'center' }}><div style={{ fontFamily: 'monospace', color: 'var(--tx3)', fontSize: '.9rem' }}>{rno}R</div><div style={{ fontSize: '.6rem', color: 'var(--tx3)' }}>-</div></div>
                const r = parseFloat(roi(s.invest, s.payout))
                return (
                  <div key={rno} style={{ background: 'var(--sf)', padding: '10px 8px', textAlign: 'center' }}>
                    <div style={{ fontFamily: 'monospace', fontSize: '.9rem', color: 'var(--tx2)', marginBottom: 4 }}>{rno}R</div>
                    <div style={{ fontFamily: 'monospace', fontSize: '1.1rem', color: r >= 100 ? 'var(--grn)' : r >= 85 ? 'var(--warn)' : 'var(--red)', fontWeight: 700 }}>{roi(s.invest, s.payout)}%</div>
                    <div style={{ fontSize: '.54rem', color: 'var(--tx3)', marginTop: 2 }}>{hitRate(s.wins, s.bets)}%的中</div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
