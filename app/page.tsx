'use client'

import { useState, useCallback } from 'react'
import { VENUES, VENUE_DATA, LANE_COLORS } from '@/lib/venues'
import type { RacePrediction, RacerPrediction } from '@/lib/gemini'
import type { RaceInfo, WeatherInfo } from '@/lib/scraper'

interface RaceState {
  raceNo: number
  raceInfo?: RaceInfo
  weather?: WeatherInfo
  prediction?: RacePrediction
  status: 'idle' | 'loading' | 'done' | 'error'
  error?: string
}

interface ExData {
  lane: number
  course: number
  st: string
  exhibitTime: string
  turn: string
  foot: string
}

function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function stColor(st: string) {
  const v = parseFloat(st)
  if (!st || isNaN(v)) return 'var(--ac)'
  if (v < 0.18) return 'var(--grn)'
  if (v > 0.27) return 'var(--red)'
  return 'var(--ac)'
}

function LaneBadge({ lane, size = 26 }: { lane: number; size?: number }) {
  const c = LANE_COLORS[lane - 1] || LANE_COLORS[0]
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      width: size, height: size, borderRadius: '50%',
      background: c.bg, color: c.text,
      fontFamily: 'monospace', fontSize: size * 0.58, flexShrink: 0, fontWeight: 700,
    }}>{lane}</span>
  )
}

function Tag({ type, children }: { type: 'solid' | 'rough' | 'ex'; children: React.ReactNode }) {
  const styles = {
    solid: { bg: 'rgba(0,212,255,.1)', border: 'rgba(0,212,255,.25)', color: 'var(--ac)' },
    rough: { bg: 'rgba(255,63,85,.1)', border: 'rgba(255,63,85,.25)', color: 'var(--red)' },
    ex: { bg: 'rgba(255,153,48,.12)', border: 'rgba(255,153,48,.3)', color: 'var(--warn)' },
  }[type]
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: 3,
      fontSize: '.58rem', fontFamily: 'monospace', letterSpacing: '.08em',
      background: styles.bg, border: `1px solid ${styles.border}`, color: styles.color,
    }}>{children}</span>
  )
}

function RankRow({ p }: { p: RacerPrediction }) {
  const rnColor = p.rank === 1 ? 'var(--gold)' : p.rank === 2 ? 'var(--silver)' : p.rank === 3 ? 'var(--bronze)' : 'var(--tx3)'
  const nr = typeof p.natRate === 'number' ? p.natRate.toFixed(2) : (p.natRate || '—')
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '36px 28px 1fr 56px 1fr', alignItems: 'center', padding: '10px 14px', gap: 8, borderBottom: '1px solid rgba(255,255,255,.05)' }}>
      <div style={{ fontFamily: 'monospace', fontSize: '1.35rem', textAlign: 'center', color: rnColor, lineHeight: 1 }}>{p.rank}</div>
      <LaneBadge lane={p.lane} />
      <div>
        <div style={{ fontSize: '.86rem', fontWeight: 700 }}>{p.name || '—'}</div>
        <div style={{ fontSize: '.58rem', color: 'var(--tx2)', fontFamily: 'monospace', marginTop: 2 }}>
          {p.grade || '—'} / 全国{nr} / M{p.motorRate || '—'}%
        </div>
        {p.exNote && <div style={{ fontSize: '.58rem', color: 'var(--warn)', fontFamily: 'monospace', marginTop: 2 }}>📊 {p.exNote}</div>}
      </div>
      <div style={{ textAlign: 'center', fontFamily: 'monospace', fontSize: '.76rem', color: 'var(--ac)', fontWeight: 700 }}>
        {Math.round((p.confidence || 0) * 100)}%
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <div style={{ flex: 1, height: 4, background: 'rgba(255,255,255,.07)', borderRadius: 2, overflow: 'hidden' }}>
          <div style={{ width: `${(p.confidence || 0) * 100}%`, height: '100%', background: 'linear-gradient(90deg,var(--ac2),var(--ac))', borderRadius: 2 }} />
        </div>
        <span style={{ fontSize: '.62rem', color: 'var(--tx2)', lineHeight: 1.4, whiteSpace: 'nowrap' }}>{p.reason || ''}</span>
      </div>
    </div>
  )
}

function ExhibitionPanel({ raceNo, raceInfo, prediction, venueCode, date, onUpdated }: { raceNo: number; raceInfo?: RaceInfo; prediction?: RacePrediction; venueCode: string; date: string; onUpdated: (pred: RacePrediction) => void }) {
  const [rows, setRows] = useState<ExData[]>(Array.from({ length: 6 }, (_, i) => ({ lane: i + 1, course: i + 1, st: '', exhibitTime: '', turn: '', foot: '' })))
  const [frontEntry, setFrontEntry] = useState('')
  const [startOverall, setStartOverall] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const upd = (lane: number, field: keyof ExData, val: string | number) => setRows(prev => prev.map(r => r.lane === lane ? { ...r, [field]: val } : r))
  const hasData = rows.some(r => r.st || r.exhibitTime || r.turn || r.foot)
  const handle = async () => {
    if (!hasData || !prediction) return
    setBusy(true)
    try {
      const exhibition = rows.map(r => ({ lane: r.lane, course: r.course, st: parseFloat(r.st) || 0.20, exhibitTime: parseFloat(r.exhibitTime) || 6.80 }))
      const res = await fetch('/api/exhibition', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ venueCode, raceNo, date, basePrediction: prediction, exhibition, frontEntry, startOverall }) })
      const data = await res.json()
      if (data.prediction) { onUpdated(data.prediction); setDone(true) }
    } catch (e) { console.error(e) }
    setBusy(false)
  }
  const ss: React.CSSProperties = { width: '100%', background: 'var(--bg)', border: '1px solid var(--bd)', color: 'var(--tx)', fontSize: '.68rem', borderRadius: 3, outline: 'none', fontFamily: 'inherit' }
  return (
    <div style={{ background: 'var(--bg2)', borderTop: '1px solid var(--bd)', borderBottom: '1px solid var(--bd)', padding: '12px 14px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
        <span style={{ fontSize: '.6rem', color: 'var(--warn)', fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: '.14em' }}>手動入力で再予想</span>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {done && <span style={{ fontSize: '.58rem', padding: '2px 8px', borderRadius: 3, background: 'rgba(46,220,128,.1)', color: 'var(--grn)', border: '1px solid rgba(46,220,128,.28)', fontFamily: 'monospace' }}>反映済 ✓</span>}
          <button onClick={handle} disabled={busy || !hasData} style={{ padding: '5px 12px', background: 'rgba(255,153,48,.12)', border: '1px solid rgba(255,153,48,.4)', color: 'var(--warn)', borderRadius: 3, fontFamily: 'monospace', fontSize: '.6rem', opacity: busy || !hasData ? .5 : 1 }}>
            {busy ? '分析中...' : '🔄 展示反映して再予想'}
          </button>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: '.56rem', color: 'var(--tx2)', fontFamily: 'monospace', marginBottom: 2 }}>前付け</div>
          <select value={frontEntry} onChange={e => setFrontEntry(e.target.value)} style={{ ...ss, padding: '6px 8px' }}>
            <option value="">なし（枠なり）</option>
            {[1,2,3,4,5,6].map(n => <option key={n} value={`${n}号艇が前付け`}>{n}号艇前付け</option>)}
            <option value="複数艇で乱戦">複数艇乱戦</option>
          </select>
        </div>
        <div>
          <div style={{ fontSize: '.56rem', color: 'var(--tx2)', fontFamily: 'monospace', marginBottom: 2 }}>スタート全体</div>
          <select value={startOverall} onChange={e => setStartOverall(e.target.value)} style={{ ...ss, padding: '6px 8px' }}>
            <option value="">特になし</option>
            <option value="全体的に揃ったスタート">全体揃う</option>
            <option value="バラつきが大きい">バラつき大</option>
            <option value="大時計寄り（遅め）">大時計寄り</option>
            <option value="全体的に前め">全体前め</option>
          </select>
        </div>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.72rem' }}>
          <thead><tr>{['艇','選手','コース','ST','展示T','ターン','行足'].map(h => <th key={h} style={{ background: 'rgba(0,0,0,.3)', color: 'var(--tx2)', fontFamily: 'monospace', fontSize: '.52rem', padding: '5px 4px', border: '1px solid var(--bd2)', textAlign: 'center', whiteSpace: 'nowrap' }}>{h}</th>)}</tr></thead>
          <tbody>{rows.map(row => {
            const c = LANE_COLORS[row.lane - 1]
            const name = raceInfo?.racers?.find(r => r.lane === row.lane)?.name || `${row.lane}号艇`
            return (
              <tr key={row.lane}>
                <td style={{ border: '1px solid var(--bd2)', padding: '3px 4px', textAlign: 'center', background: 'rgba(0,0,0,.12)' }}><span style={{ background: c.bg, color: c.text, padding: '1px 6px', borderRadius: 3, fontFamily: 'monospace', fontSize: '.85rem' }}>{row.lane}</span></td>
                <td style={{ border: '1px solid var(--bd2)', padding: '3px 4px', fontSize: '.66rem', color: 'var(--tx2)', maxWidth: 55, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', background: 'rgba(0,0,0,.12)' }}>{name}</td>
                <td style={{ border: '1px solid var(--bd2)', padding: 2, background: 'rgba(0,0,0,.12)' }}><select value={row.course} onChange={e => upd(row.lane, 'course', e.target.value)} style={{ ...ss, width: 68 }}>{[1,2,3,4,5,6].map(n => <option key={n} value={n}>{n}コース</option>)}</select></td>
                <td style={{ border: '1px solid var(--bd2)', padding: 2, background: 'rgba(0,0,0,.12)' }}><input value={row.st} onChange={e => upd(row.lane, 'st', e.target.value)} placeholder=".15" maxLength={5} style={{ width: 44, background: 'none', border: 'none', color: stColor(row.st), fontFamily: 'monospace', fontSize: '.72rem', textAlign: 'center', outline: 'none', padding: 2 }} /></td>
                <td style={{ border: '1px solid var(--bd2)', padding: 2, background: 'rgba(0,0,0,.12)' }}><input type="number" value={row.exhibitTime} onChange={e => upd(row.lane, 'exhibitTime', e.target.value)} placeholder="6.80" step={0.01} min={5} max={10} style={{ width: 52, background: 'none', border: 'none', color: 'var(--ac)', fontFamily: 'monospace', fontSize: '.72rem', textAlign: 'center', outline: 'none', padding: 2 }} /></td>
                <td style={{ border: '1px solid var(--bd2)', padding: 2, background: 'rgba(0,0,0,.12)' }}><select value={row.turn} onChange={e => upd(row.lane, 'turn', e.target.value)} style={{ ...ss, width: 66 }}><option value="">—</option><option>良好</option><option>普通</option><option>やや難</option><option>不安定</option></select></td>
                <td style={{ border: '1px solid var(--bd2)', padding: 2, background: 'rgba(0,0,0,.12)' }}><select value={row.foot} onChange={e => upd(row.lane, 'foot', e.target.value)} style={{ ...ss, width: 60 }}><option value="">—</option><option>良好</option><option>普通</option><option>やや遅</option></select></td>
              </tr>
            )
          })}</tbody>
        </table>
      </div>
    </div>
  )
}

function RaceCard({ state, venueCode, date, onPredictionUpdate }: { state: RaceState; venueCode: string; date: string; onPredictionUpdate: (raceNo: number, pred: RacePrediction) => void }) {
  const { raceNo, raceInfo, weather, prediction, status, error } = state
  if (status === 'loading') return <div style={{ background: 'var(--sf)', border: '1px solid var(--bd)', borderRadius: 9, padding: 40, textAlign: 'center' }}><div style={{ width: 36, height: 36, border: '3px solid var(--bd)', borderTopColor: 'var(--ac)', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 12px' }} /><div style={{ fontSize: '.72rem', color: 'var(--tx2)', fontFamily: 'monospace' }}>{raceNo}Rを予想中...</div></div>
  if (status === 'error') return <div style={{ background: 'var(--sf)', border: '1px solid var(--bd)', borderRadius: 9, overflow: 'hidden' }}><div style={{ background: 'var(--bg2)', padding: '12px 14px', borderBottom: '1px solid var(--bd)' }}><span style={{ fontFamily: 'monospace', fontSize: '1.1rem', color: '#fff' }}>{raceNo}R</span></div><div style={{ padding: 20, textAlign: 'center', color: 'var(--red)', fontSize: '.8rem', lineHeight: 1.8 }}>⚠️ 予想生成失敗<br /><span style={{ fontSize: '.65rem', color: 'var(--tx2)' }}>{error}</span></div></div>
  if (status === 'idle' || !prediction) return null
  return (
    <div className="fade-in" style={{ background: 'var(--sf)', border: '1px solid var(--bd)', borderRadius: 9, overflow: 'hidden' }}>
      <div style={{ background: 'var(--bg2)', padding: '12px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--bd)', flexWrap: 'wrap', gap: 7 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <span style={{ fontFamily: 'monospace', fontSize: '1.2rem', color: '#fff' }}>{raceNo}R</span>
          {raceInfo?.title && raceInfo.title !== `${raceNo}R` && <span style={{ fontSize: '.65rem', color: 'var(--tx2)' }}>{raceInfo.title}</span>}
          {prediction.exhibitionApplied && <Tag type="ex">📡展示反映</Tag>}
        </div>
        <div style={{ display: 'flex', gap: 7, alignItems: 'center', flexWrap: 'wrap' }}>
          <Tag type={prediction.raceType === '堅い' ? 'solid' : 'rough'}>{prediction.raceType}</Tag>
          <span style={{ fontSize: '.63rem', color: 'var(--tx2)', fontFamily: 'monospace' }}>{prediction.keyFactor}</span>
          {weather && <span style={{ fontSize: '.6rem', color: 'var(--tx3)', fontFamily: 'monospace' }}>{weather.weather} {weather.windSpeed}m/s</span>}
        </div>
      </div>
      {prediction.exhibitionData && prediction.exhibitionData.length > 0 && (
        <div style={{ background: 'rgba(255,153,48,.04)', borderTop: '1px solid rgba(255,153,48,.15)', padding: '12px 14px' }}>
          <div style={{ fontSize: '.58rem', color: 'var(--warn)', fontFamily: 'monospace', letterSpacing: '.14em', marginBottom: 8, textTransform: 'uppercase' }}>📡 展示情報（自動取得）</div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.72rem' }}>
              <thead><tr>{['艇','選手','コース','ST','展示T','ターン','行足'].map(h => <th key={h} style={{ background: 'rgba(0,0,0,.25)', color: 'var(--tx2)', fontFamily: 'monospace', fontSize: '.52rem', padding: '5px 6px', border: '1px solid var(--bd2)', textAlign: 'center', whiteSpace: 'nowrap' }}>{h}</th>)}</tr></thead>
              <tbody>{prediction.exhibitionData.map(e => {
                const c = LANE_COLORS[e.lane - 1]
                const name = raceInfo?.racers?.find(r => r.lane === e.lane)?.name || `${e.lane}号艇`
                const sc = e.st < 0.18 ? 'var(--grn)' : e.st > 0.27 ? 'var(--red)' : 'var(--ac)'
                const cc = e.course !== e.lane
                return (
                  <tr key={e.lane}>
                    <td style={{ border: '1px solid var(--bd2)', padding: '3px 4px', textAlign: 'center', background: 'rgba(0,0,0,.12)' }}><span style={{ background: c.bg, color: c.text, padding: '1px 6px', borderRadius: 3, fontFamily: 'monospace', fontSize: '.85rem' }}>{e.lane}</span></td>
                    <td style={{ border: '1px solid var(--bd2)', padding: '3px 6px', fontSize: '.68rem', color: 'var(--tx2)', background: 'rgba(0,0,0,.12)' }}>{name}</td>
                    <td style={{ border: '1px solid var(--bd2)', padding: '3px 6px', textAlign: 'center', background: 'rgba(0,0,0,.12)', color: cc ? 'var(--warn)' : 'var(--tx)', fontWeight: cc ? 700 : 400, fontSize: '.72rem', fontFamily: 'monospace' }}>{e.course}コース{cc ? '⚠️' : ''}</td>
                    <td style={{ border: '1px solid var(--bd2)', padding: '3px 6px', textAlign: 'center', background: 'rgba(0,0,0,.12)', color: sc, fontFamily: 'monospace', fontSize: '.72rem', fontWeight: 700 }}>{e.st.toFixed(2)}</td>
                    <td style={{ border: '1px solid var(--bd2)', padding: '3px 6px', textAlign: 'center', background: 'rgba(0,0,0,.12)', color: 'var(--ac)', fontFamily: 'monospace', fontSize: '.72rem' }}>{e.exhibitTime.toFixed(2)}</td>
                    <td style={{ border: '1px solid var(--bd2)', padding: '3px 6px', textAlign: 'center', background: 'rgba(0,0,0,.12)', fontSize: '.68rem', color: e.turnEval === '良好' ? 'var(--grn)' : e.turnEval === '不安定' ? 'var(--red)' : 'var(--tx2)' }}>{e.turnEval}</td>
                    <td style={{ border: '1px solid var(--bd2)', padding: '3px 6px', textAlign: 'center', background: 'rgba(0,0,0,.12)', fontSize: '.68rem', color: e.footEval === '良好' ? 'var(--grn)' : e.footEval === 'やや遅' ? 'var(--red)' : 'var(--tx2)' }}>{e.footEval}</td>
                  </tr>
                )
              })}</tbody>
            </table>
          </div>
        </div>
      )}
      <ExhibitionPanel raceNo={raceNo} raceInfo={raceInfo} prediction={prediction} venueCode={venueCode} date={date} onUpdated={pred => onPredictionUpdate(raceNo, pred)} />
      <div>
        <div style={{ display: 'grid', gridTemplateColumns: '36px 28px 1fr 56px 1fr', padding: '7px 14px', gap: 8, background: 'var(--bg2)', fontSize: '.54rem', letterSpacing: '.12em', color: 'var(--tx3)', fontFamily: 'monospace', textTransform: 'uppercase', borderBottom: '1px solid var(--bd2)' }}><div>着</div><div>艇</div><div>選手</div><div style={{ textAlign: 'center' }}>確信度</div><div>根拠</div></div>
        {(prediction.ranking || []).map(p => <RankRow key={p.rank} p={p} />)}
      </div>
      {prediction.exhibitionHighlight && <div style={{ padding: '9px 14px', background: 'rgba(255,153,48,.05)', borderTop: '1px solid rgba(255,153,48,.18)', fontSize: '.73rem', color: 'var(--warn)', fontFamily: 'monospace' }}>📡 {prediction.exhibitionHighlight}</div>}
      <div style={{ padding: '11px 14px', background: 'rgba(0,0,0,.1)', borderTop: '1px solid var(--bd2)', fontSize: '.78rem', lineHeight: 1.8, color: 'var(--tx2)', display: 'flex', gap: 8 }}><span style={{ color: 'var(--ac)', flexShrink: 0 }}>💬</span><span>{prediction.comment || '—'}</span></div>
      <div style={{ padding: '11px 14px', borderTop: '1px solid var(--bd)', background: 'var(--bg2)' }}>
        <div style={{ fontSize: '.58rem', color: 'var(--warn)', fontFamily: 'monospace', letterSpacing: '.12em', marginBottom: 8 }}>⭐ 推奨購入目</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          {[{l:'2連単 本命',v:prediction.recommended2t,main:true},{l:'2連単 対抗',v:prediction.recommended2t2,main:true},{l:'2連複',v:prediction.recommended2f,main:false},{l:'3連単 参考',v:prediction.recommended3t,main:false}].map(({l,v,main}) => (
            <span key={l} style={{ padding: '4px 12px', background: main ? 'rgba(245,200,66,.12)' : 'rgba(255,255,255,.04)', border: `1px solid ${main ? 'rgba(245,200,66,.35)' : 'var(--bd)'}`, borderRadius: 20, fontFamily: 'monospace', fontSize: main ? '.76rem' : '.65rem', color: main ? 'var(--gold)' : 'var(--tx2)', fontWeight: main ? 700 : 400 }}>
              <span style={{ fontSize: '.58rem', opacity: .7, marginRight: 4 }}>{l}</span>{v || '—'}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

export default function Home() {
  const [selV, setSelV] = useState<typeof VENUES[0] | null>(null)
  const [date, setDate] = useState(todayStr)
  const [raceStates, setRaceStates] = useState<RaceState[]>([])
  const [activeIdx, setActiveIdx] = useState(0)
  const [running, setRunning] = useState(false)
  const [toast, setToast] = useState('')
  const showToast = useCallback((msg: string) => { setToast(msg); setTimeout(() => setToast(''), 4000) }, [])
  const updateRace = useCallback((raceNo: number, update: Partial<RaceState>) => { setRaceStates(prev => prev.map(r => r.raceNo === raceNo ? { ...r, ...update } : r)) }, [])
  const handlePredictionUpdate = useCallback((raceNo: number, pred: RacePrediction) => { updateRace(raceNo, { prediction: pred }); showToast(`✅ ${raceNo}R 展示反映完了！`) }, [updateRace, showToast])
  const startPrediction = async () => {
    if (!selV || running) return
    setRunning(true)
    const dateParam = date.replace(/-/g, '')
    let raceNos: number[] = []
    try { const res = await fetch(`/api/race?venue=${selV.code}&date=${dateParam}`); const data = await res.json(); raceNos = data.races || [1,2,3,4,5,6,7,8,9,10,11,12] } catch { raceNos = [1,2,3,4,5,6,7,8,9,10,11,12] }
    const initial: RaceState[] = raceNos.map(rno => ({ raceNo: rno, status: 'idle' }))
    setRaceStates(initial); setActiveIdx(0)
    let done = 0, fail = 0
    for (let i = 0; i < raceNos.length; i++) {
      const rno = raceNos[i]
      updateRace(rno, { status: 'loading' })
      let ok = false
      for (let attempt = 1; attempt <= 3 && !ok; attempt++) {
        try {
          if (attempt > 1) await new Promise(r => setTimeout(r, attempt * 5000))
          const res = await fetch('/api/predict', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ venueCode: selV.code, raceNo: rno, date: dateParam }) })
          const data = await res.json()
          if (data.error) throw new Error(data.error)
          updateRace(rno, { status: 'done', raceInfo: data.raceInfo, weather: data.weather, prediction: data.prediction }); done++; ok = true
        } catch (e) { if (attempt === 3) { updateRace(rno, { status: 'error', error: e instanceof Error ? e.message : 'エラー' }); fail++ } }
      }
      if (i < raceNos.length - 1) await new Promise(r => setTimeout(r, 500))
    }
    setRunning(false)
    showToast(fail === 0 ? `✅ ${selV.name} 全${raceNos.length}レース予想完了！` : `⚠️ ${done}/${raceNos.length}R完了`)
  }
  const vd = selV ? (VENUE_DATA[selV.name] || { note: '', in1Rate: 54 }) : null
  const done = raceStates.filter(r => r.status === 'done')
  const solid = done.filter(r => r.prediction?.raceType === '堅い').length
  return (
    <div style={{ position: 'relative', zIndex: 1 }}>
      <header style={{ padding: '18px 16px 0', borderBottom: '1px solid var(--bd)' }}>
        <div style={{ maxWidth: 1080, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
            <div style={{ width: 42, height: 42, background: 'linear-gradient(135deg,var(--ac2),var(--ac))', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.3rem', flexShrink: 0 }}>🚤</div>
            <div>
              <div style={{ fontFamily: 'monospace', fontSize: '1.8rem', lineHeight: 1, color: '#fff', letterSpacing: '.06em' }}>BOAT<span style={{ color: 'var(--ac)' }}>PREDICT</span></div>
              <div style={{ fontSize: '.54rem', letterSpacing: '.2em', color: 'var(--tx2)', fontFamily: 'monospace', marginTop: 2 }}>AI RACE FORECAST + EXHIBITION ANALYSIS</div>
            </div>
          </div>
        </div>
      </header>
      <main style={{ maxWidth: 1080, margin: '0 auto', padding: '20px 16px 80px' }}>
        <div style={{ fontSize: '.6rem', letterSpacing: '.22em', color: 'var(--tx2)', fontFamily: 'monospace', textTransform: 'uppercase', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}><div style={{ width: 3, height: 11, background: 'var(--ac)', borderRadius: 2 }} />競艇場を選択</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))', gap: 6, marginBottom: 18 }}>
          {VENUES.map(v => <button key={v.code} onClick={() => setSelV(v)} style={{ background: selV?.code === v.code ? 'rgba(0,212,255,.08)' : 'var(--sf)', border: `1px solid ${selV?.code === v.code ? 'var(--ac)' : 'var(--bd)'}`, color: selV?.code === v.code ? 'var(--ac)' : 'var(--tx2)', padding: '8px 5px', borderRadius: 5, fontSize: '.75rem', textAlign: 'center', lineHeight: 1.4, boxShadow: selV?.code === v.code ? '0 0 0 1px var(--ac)' : 'none' }}>{v.name}<br /><span style={{ fontSize: '.54rem', color: selV?.code === v.code ? 'var(--ac2)' : 'var(--tx3)' }}>{v.pref}</span></button>)}
        </div>
        {vd && <div style={{ background: 'var(--sf)', border: '1px solid var(--bd)', borderRadius: 6, padding: '10px 14px', marginBottom: 16, fontSize: '.76rem', color: 'var(--tx2)', display: 'flex', gap: 8, alignItems: 'center' }}><span style={{ color: 'var(--ac)', flexShrink: 0 }}>📍</span><span><strong style={{ color: 'var(--tx)' }}>{selV?.name}</strong> — {vd.note}（1コース1着率目安 {vd.in1Rate}%）</span></div>}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 28, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, background: 'var(--sf)', border: '1px solid var(--bd)', borderRadius: 5, padding: '0 12px', flexShrink: 0 }}>
            <label style={{ fontSize: '.6rem', color: 'var(--tx2)', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>日付</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} style={{ background: 'none', border: 'none', color: 'var(--tx)', fontSize: '.84rem', padding: '9px 0', outline: 'none', colorScheme: 'dark' }} />
          </div>
          <button onClick={startPrediction} disabled={!selV || running} style={{ flex: 1, minWidth: 180, padding: '12px 16px', background: selV && !running ? 'linear-gradient(90deg,var(--ac2),var(--ac))' : 'var(--bd)', border: 'none', borderRadius: 5, color: selV && !running ? 'var(--bg)' : 'var(--tx3)', fontFamily: 'monospace', fontSize: '1.05rem', letterSpacing: '.2em' }}>
            {running ? '⏳ 予想生成中...' : '⚡ 全レース予想を実行'}
          </button>
        </div>
        {raceStates.length > 0 && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 1, background: 'var(--bd)', border: '1px solid var(--bd)', borderRadius: 7, overflow: 'hidden', marginBottom: 18 }}>
              {[{val:done.length,lbl:'完了レース'},{val:solid,lbl:'堅いレース'},{val:done.length-solid,lbl:'荒れそう'},{val:done.filter(r=>r.prediction?.ranking?.[0]?.lane===1).length,lbl:'1コース本命'}].map(({val,lbl}) => <div key={lbl} style={{ background: 'var(--sf)', padding: '11px 10px', textAlign: 'center' }}><div style={{ fontFamily: 'monospace', fontSize: '1.5rem', color: 'var(--ac)', lineHeight: 1 }}>{val}</div><div style={{ fontSize: '.54rem', color: 'var(--tx2)', fontFamily: 'monospace', marginTop: 3 }}>{lbl}</div></div>)}
            </div>
            <div style={{ fontSize: '.58rem', letterSpacing: '.2em', color: 'var(--tx2)', fontFamily: 'monospace', textTransform: 'uppercase', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 7 }}><div style={{ width: 3, height: 11, background: 'var(--ac)', borderRadius: 2 }} />全レース概要</div>
            <div style={{ background: 'var(--sf)', border: '1px solid var(--bd)', borderRadius: 7, overflow: 'hidden', marginBottom: 20 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '44px 1fr 80px 68px 22px', padding: '7px 12px', background: 'var(--bg2)', fontSize: '.54rem', letterSpacing: '.12em', color: 'var(--tx3)', fontFamily: 'monospace', textTransform: 'uppercase', gap: 8 }}><div>R</div><div>本命予想</div><div>2連単本命</div><div>タイプ</div><div /></div>
              {raceStates.map((rs, i) => {
                const top = rs.prediction?.ranking?.[0]; const c = top ? LANE_COLORS[top.lane - 1] : null
                return <div key={rs.raceNo} onClick={() => { setActiveIdx(i); setTimeout(() => document.getElementById(`card-${rs.raceNo}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100) }} style={{ display: 'grid', gridTemplateColumns: '44px 1fr 80px 68px 22px', alignItems: 'center', padding: '10px 12px', borderBottom: '1px solid var(--bd2)', gap: 8, cursor: 'pointer', opacity: rs.status === 'done' ? 1 : .4, background: activeIdx === i ? 'rgba(0,212,255,.03)' : 'transparent', transition: 'background .12s' }} onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,.02)'} onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = activeIdx === i ? 'rgba(0,212,255,.03)' : 'transparent'}>
                  <div style={{ fontFamily: 'monospace', fontSize: '1rem', color: 'var(--tx2)' }}>{rs.raceNo}R</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>{c && <LaneBadge lane={top!.lane} size={22} />}<span style={{ fontSize: '.8rem', fontWeight: 700 }}>{top?.name || (rs.status === 'loading' ? '予想中...' : rs.status === 'error' ? '失敗' : '—')}</span></div>
                  <div style={{ fontFamily: 'monospace', fontSize: '.74rem', color: 'var(--gold)' }}>{rs.prediction?.recommended2t || '—'}</div>
                  <div>{rs.prediction && <Tag type={rs.prediction.raceType === '堅い' ? 'solid' : 'rough'}>{rs.prediction.raceType}</Tag>}</div>
                  <div style={{ color: 'var(--tx3)', fontSize: '.7rem', textAlign: 'right' }}>→</div>
                </div>
              })}
            </div>
            <div style={{ fontSize: '.58rem', letterSpacing: '.2em', color: 'var(--tx2)', fontFamily: 'monospace', textTransform: 'uppercase', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 7 }}><div style={{ width: 3, height: 11, background: 'var(--ac)', borderRadius: 2 }} />レース別詳細・展示情報入力</div>
            <div style={{ display: 'flex', gap: 3, overflowX: 'auto', paddingBottom: 4, marginBottom: 14 }}>
              {raceStates.map((rs, i) => { const isA = activeIdx === i; const hasEx = rs.prediction?.exhibitionApplied; return <button key={rs.raceNo} onClick={() => setActiveIdx(i)} style={{ flexShrink: 0, padding: '6px 11px', background: isA ? (hasEx ? 'rgba(255,153,48,.1)' : 'rgba(0,212,255,.1)') : 'var(--sf)', border: `1px solid ${isA ? (hasEx ? 'var(--warn)' : 'var(--ac)') : hasEx ? 'var(--warn)' : 'var(--bd)'}`, color: isA ? (hasEx ? 'var(--warn)' : 'var(--ac)') : hasEx ? 'var(--warn)' : 'var(--tx2)', borderRadius: 4, fontFamily: 'monospace', fontSize: '.66rem', textAlign: 'center' }}>{rs.raceNo}R<br /><span style={{ fontSize: '.54rem', color: hasEx ? 'var(--warn)' : 'var(--tx3)' }}>{hasEx ? '📡展示済' : rs.prediction?.ranking?.[0] ? `${rs.prediction.ranking[0].lane}号艇` : rs.status === 'error' ? '失敗' : rs.status === 'loading' ? '...' : '—'}</span></button> })}
            </div>
            {raceStates[activeIdx] && <div id={`card-${raceStates[activeIdx].raceNo}`}><RaceCard state={raceStates[activeIdx]} venueCode={selV?.code || '01'} date={date.replace(/-/g, '')} onPredictionUpdate={handlePredictionUpdate} /></div>}
          </>
        )}
      </main>
      {toast && <div style={{ position: 'fixed', bottom: 20, right: 20, background: 'var(--sf2)', border: '1px solid var(--bd)', borderLeft: '3px solid var(--ac)', padding: '10px 16px', borderRadius: 5, fontSize: '.72rem', fontFamily: 'monospace', color: 'var(--tx)', zIndex: 999, maxWidth: 280 }}>{toast}</div>}
    </div>
  )
}