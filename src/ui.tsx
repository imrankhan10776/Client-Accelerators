import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { dayToDate } from './data'

// ── Formatting ──────────────────────────────────────────────────────────────
export const fmtMoney = (n: number) =>
  n >= 100000 ? `$${(n / 1000).toFixed(1)}k` : n >= 10000 ? `$${(n / 1000).toFixed(1)}k` : `$${Math.round(n).toLocaleString('en-US')}`
export const fmtMoneyExact = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`
export const fmtPct = (n: number) => `${(n * 100).toFixed(1)}%`
export const fmtDate = (d: number) => dayToDate(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
export const rate = (num: number, den: number) => (den > 0 ? `${num} / ${den} = ${fmtPct(num / den)}` : `${num} / 0 = —`)

// ── Badge ───────────────────────────────────────────────────────────────────
export function Badge({ tone = 'neutral', children, icon }: { tone?: string; children: ReactNode; icon?: string }) {
  return (
    <span className={`badge badge-${tone}`}>
      {icon && <span aria-hidden="true">{icon}</span>}
      {children}
    </span>
  )
}

// ── Info popover ────────────────────────────────────────────────────────────
export function InfoTip({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc) }
  }, [open])
  return (
    <span className="infotip" ref={ref}>
      <button
        className="info-btn" aria-label={`How ${title} is counted`} aria-expanded={open}
        onClick={(e) => { e.stopPropagation(); setOpen(!open) }}
      >i</button>
      {open && (
        <span className="infotip-pop" role="dialog" onClick={(e) => e.stopPropagation()}>
          <strong>{title}</strong>
          <span>{children}</span>
        </span>
      )}
    </span>
  )
}

// ── Sparkline (single series, recessive) ────────────────────────────────────
export function Sparkline({ values, label }: { values: number[]; label: string }) {
  const w = 72, h = 26
  const max = Math.max(...values, 1)
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * (w - 4) + 2},${h - 3 - (v / max) * (h - 6)}`).join(' ')
  return (
    <svg className="spark" width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`${label}, 8-week trend`}>
      <polyline points={pts} fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

// ── Stacked daily spend chart (testing vs scale) with hover + table view ───
export interface SpendRow { day: number; test: number; scale: number }

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [w, setW] = useState(600)
  useLayoutEffect(() => {
    if (!ref.current) return
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width))
    ro.observe(ref.current)
    return () => ro.disconnect()
  }, [])
  return [ref, w] as const
}

export function SpendChart({ rows, title, note }: { rows: SpendRow[]; title: string; note?: string }) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const [asTable, setAsTable] = useState(false)
  const h = 200, padL = 46, padR = 8, padT = 8, padB = 24
  const max = Math.max(...rows.map((r) => r.test + r.scale), 1)
  const nice = (() => { const p = Math.pow(10, Math.floor(Math.log10(max))); return Math.ceil(max / p) * p })()
  const plotW = Math.max(width - padL - padR, 50)
  const slot = plotW / rows.length
  const bw = Math.max(2, Math.min(18, slot - 3))
  const y = (v: number) => padT + (h - padT - padB) * (1 - v / nice)
  const ticks = [0, nice / 2, nice]
  const labelEvery = Math.ceil(rows.length / Math.max(2, Math.floor(plotW / 56)))
  const hv = hover !== null ? rows[hover] : null
  const totals = rows.reduce((a, r) => ({ test: a.test + r.test, scale: a.scale + r.scale }), { test: 0, scale: 0 })

  return (
    <section className="card chart-card">
      <div className="card-head">
        <div>
          <h3>{title}</h3>
          {note && <p className="muted small">{note}</p>}
        </div>
        <div className="chart-tools">
          <span className="legend"><i className="sw sw-test" />Testing <b>{fmtMoney(totals.test)}</b></span>
          <span className="legend"><i className="sw sw-scale" />Scale <b>{fmtMoney(totals.scale)}</b></span>
          <button className="btn btn-ghost btn-sm" onClick={() => setAsTable(!asTable)} aria-pressed={asTable}>
            {asTable ? 'View chart' : 'View as table'}
          </button>
        </div>
      </div>
      {asTable ? (
        <div className="scroll-x table-scroll" tabIndex={0} aria-label="Daily spend table">
          <table className="table compact">
            <thead><tr><th>Date</th><th className="num">Testing</th><th className="num">Scale</th><th className="num">Total</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.day}><td>{fmtDate(r.day)}</td><td className="num">{fmtMoneyExact(r.test)}</td><td className="num">{fmtMoneyExact(r.scale)}</td><td className="num">{fmtMoneyExact(r.test + r.scale)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="chart-wrap" ref={ref} onMouseLeave={() => setHover(null)}>
          <svg width={width} height={h} role="img" aria-label={`${title}: testing ${fmtMoney(totals.test)}, scale ${fmtMoney(totals.scale)}`}>
            {ticks.map((t) => (
              <g key={t}>
                <line x1={padL} x2={width - padR} y1={y(t)} y2={y(t)} className="grid" />
                <text x={padL - 8} y={y(t) + 4} textAnchor="end" className="axis">{fmtMoney(t)}</text>
              </g>
            ))}
            {rows.map((r, i) => {
              const x = padL + i * slot + (slot - bw) / 2
              const tH = y(0) - y(r.test)
              const sH = y(0) - y(r.scale)
              const gap = r.test > 0 && r.scale > 0 ? 2 : 0
              return (
                <g key={r.day} opacity={hover === null || hover === i ? 1 : 0.45}>
                  {r.test > 0 && <rect x={x} y={y(r.test)} width={bw} height={Math.max(tH, 1)} rx={Math.min(2, bw / 2)} className="bar-test" />}
                  {r.scale > 0 && <rect x={x} y={y(r.test + r.scale) - gap} width={bw} height={Math.max(sH, 1)} rx={Math.min(2, bw / 2)} className="bar-scale" />}
                  {i % labelEvery === 0 && <text x={x + bw / 2} y={h - 6} textAnchor="middle" className="axis">{fmtDate(r.day)}</text>}
                  <rect
                    x={padL + i * slot} y={padT} width={slot} height={h - padT - padB} fill="transparent"
                    onMouseEnter={() => setHover(i)} onPointerDown={() => setHover(i)}
                  />
                </g>
              )
            })}
          </svg>
          {hv && hover !== null && (
            <div className="tooltip" style={{ left: Math.min(Math.max(padL + hover * slot + slot / 2, 80), width - 80) }}>
              <strong>{fmtDate(hv.day)}</strong>
              <span><i className="sw sw-test" />Testing {fmtMoneyExact(hv.test)}</span>
              <span><i className="sw sw-scale" />Scale {fmtMoneyExact(hv.scale)}</span>
              <span className="muted">Total {fmtMoneyExact(hv.test + hv.scale)}</span>
            </div>
          )}
        </div>
      )}
    </section>
  )
}

// ── States ──────────────────────────────────────────────────────────────────
export function Skeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="skeleton-wrap" aria-busy="true" aria-label="Loading">
      <div className="kpi-grid">
        {Array.from({ length: rows * 2 }, (_, i) => <div key={i} className="card sk sk-card" />)}
      </div>
      <div className="card sk sk-wide" />
    </div>
  )
}

export function StateBox({ icon, title, children, actions }: { icon: string; title: string; children?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="state-box card" role="status">
      <div className="state-icon" aria-hidden="true">{icon}</div>
      <h3>{title}</h3>
      {children && <p className="muted">{children}</p>}
      {actions && <div className="state-actions">{actions}</div>}
    </div>
  )
}

export function Banner({ tone, icon, children, action }: { tone: 'warn' | 'info'; icon: string; children: ReactNode; action?: ReactNode }) {
  return (
    <div className={`banner banner-${tone}`} role="note">
      <span className="banner-icon" aria-hidden="true">{icon}</span>
      <div className="banner-text">{children}</div>
      {action}
    </div>
  )
}

// ── Bottom sheet / dialog ──────────────────────────────────────────────────
export function Sheet({ open, title, onClose, children, footer }: { open: boolean; title: string; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  useEffect(() => {
    if (!open) return
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', esc)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', esc); document.body.style.overflow = prev }
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h3>{title}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="sheet-body">{children}</div>
        {footer && <div className="sheet-foot">{footer}</div>}
      </div>
    </div>
  )
}
