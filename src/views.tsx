import { useMemo, type ReactNode } from 'react'
import { CLIENTS, RULES, TODAY, clientById, funnelById, type Concept } from './data'
import {
  METRICS, QUAL_LABEL, conceptsFor, dailySeries, inScope, isSmallSample, isStale, lifetime, periodOf, spendIn, stageLabel, summarize,
  weeklyTrend, type MetricId, type Scope,
} from './metrics'
import { CONCEPTS } from './data'
import { Badge, Banner, InfoTip, Sparkline, SpendChart, StateBox, fmtDate, fmtMoney, fmtMoneyExact, fmtPct, rate } from './ui'
import type { ListState, Route } from './App'

export interface ConceptReturn { route: Route; label: string; ids: string[] }

interface Ctx {
  scope: Scope
  mobile: boolean
  go: (r: Route, opts?: { restore?: boolean }) => void
  goMetric: (m: MetricId, segment?: string) => void
  openConcept: (id: string, ret: ConceptReturn) => void
  toast: (msg: string) => void
}

export const scopeRoute = (s: Scope): Route =>
  s.clientId && s.funnelId ? { name: 'funnel', clientId: s.clientId, funnelId: s.funnelId } : s.clientId ? { name: 'client', clientId: s.clientId } : { name: 'portfolio' }

export function scopeLabel(s: Scope) {
  if (!s.clientId) return 'All clients'
  const c = clientById(s.clientId)
  return s.funnelId ? `${c.name} · ${funnelById(c.id, s.funnelId).name}` : c.name
}

function StaleBanner({ scope, toast }: { scope: Scope; toast: (m: string) => void }) {
  const stale = summarize(scope).stale
  if (!stale.length) return null
  return (
    <Banner
      tone="warn" icon="⚠"
      action={<button className="btn btn-sm" onClick={() => toast('Sync requested (simulated). Fresh data would replace these figures.')}>Retry sync</button>}
    >
      <strong>Stale data:</strong> {stale.map((c) => c.name).join(', ')} last synced {fmtDate(stale[0].lastSync)} ({TODAY - stale[0].lastSync} days ago).
      Delivery after that date is missing, so counts and spend for {stale.length > 1 ? 'these clients' : 'this client'} may read low.
    </Banner>
  )
}

const lowN = (den: number) => (den > 0 && den < 5 ? <Badge tone="warn">n&lt;5 · low confidence</Badge> : null)

// ═════════════════════════════════════════════════════════════════════════════
// 1 · Portfolio / client / funnel performance
// ═════════════════════════════════════════════════════════════════════════════
interface KpiRow { label: string; value: ReactNode; segment?: string; extra?: ReactNode }
interface Kpi { metric: MetricId; value: string; unit?: string; sub: string; chip?: string; rows: KpiRow[]; count: number }

export function PerformanceView(ctx: Ctx) {
  const { scope, go, goMetric, openConcept, mobile, toast } = ctx
  const p = periodOf(scope)
  const s = summarize(scope)

  const kpis: Kpi[] = [
    {
      metric: 'launched', value: String(s.launched), unit: 'launched', count: s.launched,
      sub: s.planned !== null ? `of ${s.planned} planned for ${p.short}` : 'Plans are set per client, not per funnel',
      rows: [
        { label: 'Attainment vs plan', value: s.planned !== null ? rate(s.launched, s.planned) : '—' },
        { label: 'Still in test (not yet judged)', value: s.stillInTest, segment: 'still_in_test' },
      ],
    },
    {
      metric: 'qualified', value: `${s.qualified} / ${s.launched}`, unit: 'qualified of launched', count: s.qualified,
      sub: `Qualified rate ${s.launched ? fmtPct(s.qualified / s.launched) : '—'} for the ${p.short} launch cohort`,
      rows: [
        { label: 'Still in test', value: s.stillInTest, segment: 'still_in_test' },
        { label: 'Underqualified', value: s.underqualified, segment: 'underqualified' },
        { label: 'Withheld', value: s.withheld, segment: 'withheld' },
      ],
    },
    {
      metric: 'testing-winners', value: String(s.winners), unit: 'winners', count: s.winners,
      sub: `${s.open} test${s.open === 1 ? ' is' : 's are'} still open and in neither rate`,
      rows: [
        { label: 'Qualified win rate', value: rate(s.winners, s.winners + s.losers), extra: lowN(s.winners + s.losers) },
        { label: 'Did not win', value: s.losers, segment: 'loser' },
        { label: 'Still open', value: s.open, segment: 'open' },
      ],
    },
    {
      metric: 'scale-winners', value: String(s.scaleWinners), chip: 'Scale-start cohort', count: s.scaleWinners,
      sub: `of ${s.started} that started scaling in ${p.short}`,
      rows: [
        { label: 'Scale win rate (judged)', value: rate(s.scaleWinners, s.scaleWinners + s.scaleLosers), extra: lowN(s.scaleWinners + s.scaleLosers) },
        { label: 'Still scaling, not judged', value: s.scaling, segment: 'scaling' },
        { label: 'Did not hold', value: s.scaleLosers, segment: 'scale_loser' },
      ],
    },
    {
      metric: 'spend', value: fmtMoney(s.spend), chip: 'All concepts delivering', count: conceptsFor('spend', 'all', scope).universe.length,
      sub: `Calendar spend, ${p.short}. Not limited to the launch cohort.`,
      rows: [
        { label: 'Testing', value: `${fmtMoneyExact(s.test)} · ${s.spend ? fmtPct(s.test / s.spend) : '—'}`, segment: 'testing' },
        { label: 'Scale', value: `${fmtMoneyExact(s.scale)} · ${s.spend ? fmtPct(s.scale / s.spend) : '—'}`, segment: 'scale' },
      ],
    },
    {
      metric: 'lifetime', value: s.ltAvg !== null ? fmtMoney(s.ltAvg) : '—', unit: s.ltAvg !== null ? 'average' : undefined, chip: `Lifetime, as of ${fmtDate(TODAY)}`, count: s.ltCount,
      sub: 'All launch months in the current client and funnel scope',
      rows: [
        { label: 'Median', value: s.ltMedian !== null ? fmtMoneyExact(s.ltMedian) : '—' },
        { label: 'Scale winners in scope', value: s.ltCount, segment: 'all' },
      ],
    },
  ]

  const client = scope.clientId ? clientById(scope.clientId) : null
  const funnel = client && scope.funnelId ? funnelById(client.id, scope.funnelId) : null

  return (
    <>
      <StaleBanner scope={scope} toast={toast} />

      {client && (
        <section className="context-strip card">
          <div><span className="muted small">Client</span><strong>{client.name}</strong><span className="muted small">{client.code}</span></div>
          <div><span className="muted small">Account strategist</span><strong>{client.strategist}</strong></div>
          <div><span className="muted small">Owner</span><strong>{client.owner}</strong></div>
          <div><span className="muted small">{funnel ? 'Target CPL' : 'Funnels'}</span><strong>{funnel ? fmtMoneyExact(funnel.targetCpl) : client.funnels.length}</strong></div>
          <div>
            <span className="muted small">Data</span>
            {TODAY - client.lastSync > RULES.staleAfterDays ? <Badge tone="warn" icon="⚠">Stale · {fmtDate(client.lastSync)}</Badge> : <Badge tone="good" icon="●">Fresh · {fmtDate(client.lastSync)}</Badge>}
          </div>
        </section>
      )}

      <div className="kpi-grid">
        {kpis.map((k) => {
          const def = METRICS[k.metric]
          return (
            <article key={k.metric} className="card kpi">
              <header className="kpi-head">
                <h3>{def.title}</h3>
                <div className="kpi-head-right">
                  {k.chip && <span className="chip">{k.chip}</span>}
                  <InfoTip title={def.title}>{def.definition}</InfoTip>
                </div>
              </header>
              <div className="kpi-value-row">
                <div><span className="kpi-value">{k.value}</span>{k.unit && <span className="kpi-unit">{k.unit}</span>}</div>
                {k.metric !== 'lifetime' && <Sparkline values={weeklyTrend(k.metric, scope)} label={def.title} />}
              </div>
              <p className="kpi-sub">{k.sub}</p>
              <ul className="kpi-rows">
                {k.rows.map((r) => (
                  <li key={r.label}>
                    {r.segment ? (
                      <button className="kpi-row link-row" onClick={() => goMetric(k.metric, r.segment)}>
                        <span>{r.label}</span><span className="kpi-row-val">{r.value} <span aria-hidden="true">›</span></span>
                      </button>
                    ) : (
                      <div className="kpi-row"><span>{r.label} {r.extra}</span><span className="kpi-row-val">{r.value}</span></div>
                    )}
                  </li>
                ))}
              </ul>
              <button className="kpi-cta" onClick={() => goMetric(k.metric)} disabled={k.count === 0 && k.metric !== 'launched'}>
                View {k.count} concept{k.count === 1 ? '' : 's'} <span aria-hidden="true">→</span>
              </button>
            </article>
          )
        })}
      </div>

      {!client && <ClientsTable {...ctx} />}
      {client && !funnel && (
        <>
          <FunnelsTable {...ctx} />
          <SpendChart
            title={`Daily spend · ${client.name}`}
            note={`${p.label}. Hover or tap a bar for the day's split.`}
            rows={dailySeries(CONCEPTS.filter((c) => inScope(c, scope)), p.start, p.end)}
          />
        </>
      )}
      {funnel && client && (
        <>
          <SpendChart
            title={`Daily spend · ${funnel.name}`}
            note={`${p.label}. Hover or tap a bar for the day's split.`}
            rows={dailySeries(CONCEPTS.filter((c) => inScope(c, scope)), p.start, p.end)}
          />
          <TopConcepts {...ctx} />
        </>
      )}
      {mobile && <div style={{ height: 8 }} />}
      <p className="footnote muted small">
        Sample data is synthetic. Metric definitions are illustrative placeholders, to be replaced with Creative OS rules.
        <button className="link" onClick={() => go({ name: 'portfolio' })} hidden={!client}>Back to all clients</button>
      </p>
    </>
  )
}

function ClientsTable({ scope, go, mobile }: Ctx) {
  const p = periodOf(scope)
  const rows = CLIENTS.map((c) => ({ c, s: summarize({ ...scope, clientId: c.id, funnelId: null }) }))
  const stale = (id: string) => TODAY - clientById(id).lastSync > RULES.staleAfterDays
  return (
    <section className="card">
      <div className="card-head">
        <div>
          <h3>Clients</h3>
          <p className="muted small">{p.label}. Select a client for funnel-level detail.</p>
        </div>
      </div>
      {mobile ? (
        <ul className="m-list">
          {rows.map(({ c, s }) => (
            <li key={c.id}>
              <button className="m-card" onClick={() => go({ name: 'client', clientId: c.id })}>
                <div className="m-card-top"><strong>{c.name}</strong>{stale(c.id) ? <Badge tone="warn" icon="⚠">Stale</Badge> : <span className="chev">›</span>}</div>
                <dl className="m-dl">
                  <div><dt>Launched</dt><dd>{s.launched} / {s.planned}</dd></div>
                  <div><dt>Qualified</dt><dd>{s.launched ? fmtPct(s.qualified / s.launched) : '—'}</dd></div>
                  <div><dt>Test / scale wins</dt><dd>{s.winners} / {s.scaleWinners}</dd></div>
                  <div><dt>Spend</dt><dd>{fmtMoney(s.spend)}</dd></div>
                </dl>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="scroll-x">
          <table className="table clickable">
            <thead>
              <tr><th>Client</th><th className="num">Launched / plan</th><th className="num">Qualified</th><th className="num">Testing winners</th><th className="num">Scale winners</th><th>Spend · testing vs scale</th><th>Data</th></tr>
            </thead>
            <tbody>
              {rows.map(({ c, s }) => (
                <tr key={c.id} tabIndex={0} onClick={() => go({ name: 'client', clientId: c.id })} onKeyDown={(e) => e.key === 'Enter' && go({ name: 'client', clientId: c.id })}>
                  <td><strong>{c.name}</strong><div className="muted small">{c.code} · {c.funnels.length} funnel{c.funnels.length > 1 ? 's' : ''}</div></td>
                  <td className="num">{s.launched} / {s.planned}<div className="muted small">{s.planned ? fmtPct(s.launched / s.planned) : '—'}</div></td>
                  <td className="num">{s.qualified}<div className="muted small">{s.launched ? fmtPct(s.qualified / s.launched) : '—'}</div></td>
                  <td className="num">{s.winners}</td>
                  <td className="num">{s.scaleWinners}<div className="muted small">of {s.started} started</div></td>
                  <td><SplitBar test={s.test} scale={s.scale} /></td>
                  <td>{stale(c.id) ? <Badge tone="warn" icon="⚠">Stale</Badge> : <Badge tone="good" icon="●">Fresh</Badge>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

function SplitBar({ test, scale }: { test: number; scale: number }) {
  const t = test + scale
  return (
    <div className="splitbar" aria-label={`Spend ${fmtMoney(t)}: testing ${fmtMoney(test)}, scale ${fmtMoney(scale)}`}>
      <strong>{fmtMoney(t)}</strong>
      <div className="splitbar-track">
        {test > 0 && <i className="bar-test" style={{ width: `${(test / (t || 1)) * 100}%` }} />}
        {scale > 0 && <i className="bar-scale" style={{ width: `${(scale / (t || 1)) * 100}%` }} />}
      </div>
    </div>
  )
}

function FunnelsTable({ scope, go, mobile }: Ctx) {
  const client = clientById(scope.clientId!)
  const rows = client.funnels.map((f) => ({ f, s: summarize({ ...scope, funnelId: f.id }) }))
  return (
    <section className="card">
      <div className="card-head">
        <div><h3>Funnels</h3><p className="muted small">Select a funnel for its concepts and daily delivery.</p></div>
      </div>
      {mobile ? (
        <ul className="m-list">
          {rows.map(({ f, s }) => (
            <li key={f.id}>
              <button className="m-card" onClick={() => go({ name: 'funnel', clientId: client.id, funnelId: f.id })}>
                <div className="m-card-top"><strong>{f.name}</strong><span className="chev">›</span></div>
                <dl className="m-dl">
                  <div><dt>Launched</dt><dd>{s.launched}</dd></div>
                  <div><dt>Qualified</dt><dd>{s.qualified}</dd></div>
                  <div><dt>Test / scale wins</dt><dd>{s.winners} / {s.scaleWinners}</dd></div>
                  <div><dt>Spend</dt><dd>{fmtMoney(s.spend)}</dd></div>
                </dl>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="scroll-x">
          <table className="table clickable">
            <thead><tr><th>Funnel</th><th className="num">Target CPL</th><th className="num">Launched</th><th className="num">Qualified</th><th className="num">Testing winners</th><th className="num">Scale winners</th><th>Spend · testing vs scale</th></tr></thead>
            <tbody>
              {rows.map(({ f, s }) => (
                <tr key={f.id} tabIndex={0} onClick={() => go({ name: 'funnel', clientId: client.id, funnelId: f.id })} onKeyDown={(e) => e.key === 'Enter' && go({ name: 'funnel', clientId: client.id, funnelId: f.id })}>
                  <td><strong>{f.name}</strong></td>
                  <td className="num">{fmtMoneyExact(f.targetCpl)}</td>
                  <td className="num">{s.launched}</td>
                  <td className="num">{s.qualified}<div className="muted small">{s.launched ? fmtPct(s.qualified / s.launched) : '—'}</div></td>
                  <td className="num">{s.winners}</td>
                  <td className="num">{s.scaleWinners}</td>
                  <td><SplitBar test={s.test} scale={s.scale} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

function TopConcepts({ scope, openConcept, goMetric }: Ctx) {
  const p = periodOf(scope)
  const list = CONCEPTS.filter((c) => inScope(c, scope)).map((c) => ({ c, sp: spendIn(c, p).total })).filter((x) => x.sp > 0).sort((a, b) => b.sp - a.sp)
  const top = list.slice(0, 6)
  const route = scopeRoute(scope)
  return (
    <section className="card">
      <div className="card-head">
        <div><h3>Top concepts by spend</h3><p className="muted small">{p.label} · {list.length} delivering</p></div>
        <button className="btn btn-ghost btn-sm" onClick={() => goMetric('spend')}>View all {list.length}</button>
      </div>
      {top.length === 0 ? (
        <p className="muted pad">No delivery in this period.</p>
      ) : (
        <ul className="concept-mini">
          {top.map(({ c, sp }) => {
            const st = stageLabel(c)
            return (
              <li key={c.id}>
                <button onClick={() => openConcept(c.id, { route, label: 'funnel performance', ids: top.map((x) => x.c.id) })}>
                  <span className="cm-name"><strong>{c.name}</strong><span className="muted small">{c.id} · {c.format}</span></span>
                  <Badge tone={st.tone}>{st.label}</Badge>
                  <span className="cm-spend">{fmtMoney(sp)}</span>
                  <span className="chev" aria-hidden="true">›</span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
// 2 · Metric → underlying concept list
// ═════════════════════════════════════════════════════════════════════════════
export function MetricListView(ctx: Ctx & { metric: MetricId; ls: ListState; setLs: (p: Partial<ListState>) => void; onScope: (s: Scope) => void }) {
  const { metric, scope, ls, setLs, go, openConcept, mobile, toast, onScope } = ctx
  const def = METRICS[metric]
  const p = periodOf(scope)
  const segCounts = def.segments.map((sg) => ({ ...sg, n: conceptsFor(metric, sg.id, scope).list.length }))
  const { universe, list } = conceptsFor(metric, ls.segment, scope)
  const seg = def.segments.find((x) => x.id === ls.segment) ?? def.segments[0]

  const shown = useMemo(() => {
    const q = ls.search.trim().toLowerCase()
    const filtered = q
      ? list.filter((c) => `${c.name} ${c.id} ${funnelById(c.clientId, c.funnelId).name} ${clientById(c.clientId).name} ${c.format}`.toLowerCase().includes(q))
      : list
    const sorted = [...filtered]
    if (ls.sort === 'spend') sorted.sort((a, b) => spendIn(b, p).total - spendIn(a, p).total)
    else if (ls.sort === 'cpl') sorted.sort((a, b) => (lifetime(a).testCpl ?? 1e9) / funnelById(a.clientId, a.funnelId).targetCpl - (lifetime(b).testCpl ?? 1e9) / funnelById(b.clientId, b.funnelId).targetCpl)
    else if (ls.sort === 'name') sorted.sort((a, b) => a.name.localeCompare(b.name))
    else sorted.sort((a, b) => b.launchDay - a.launchDay)
    return sorted
  }, [list, ls.search, ls.sort, p])

  const back = scopeRoute(scope)
  const open = (c: Concept) => openConcept(c.id, { route: { name: 'metric', metric }, label: seg.label === def.title ? `${def.title} list` : `${def.title} › ${seg.label}`, ids: shown.map((x) => x.id) })

  return (
    <>
      <button className="backlink" onClick={() => go(back, { restore: true })}>← {scopeLabel(scope)} performance</button>
      <StaleBanner scope={scope} toast={toast} />

      <section className="card def-card">
        <div>
          <h3>How “{def.title}” is counted</h3>
          <p className="muted">{def.definition}</p>
        </div>
        <div className="def-scope">
          <span className="chip">{scopeLabel(scope)}</span>
          <span className="chip">{metric === 'lifetime' ? `Lifetime to ${fmtDate(TODAY)}` : p.short}</span>
          <span className="chip">{universe.length} {def.universeLabel}</span>
        </div>
      </section>

      {def.segments.length > 1 && (
        <div className="seg-tabs scroll-x" role="tablist" aria-label="Segment">
          {segCounts.map((sg) => (
            <button key={sg.id} role="tab" aria-selected={sg.id === seg.id} className={`seg ${sg.id === seg.id ? 'on' : ''}`} onClick={() => setLs({ segment: sg.id })}>
              {sg.label} <span className="seg-n">{sg.n}</span>
            </button>
          ))}
        </div>
      )}

      <div className="list-toolbar">
        <label className="search">
          <span aria-hidden="true">⌕</span>
          <input value={ls.search} onChange={(e) => setLs({ search: e.target.value })} placeholder="Search concept, ID, funnel, format" aria-label="Search concepts" />
          {ls.search && <button className="icon-btn sm" onClick={() => setLs({ search: '' })} aria-label="Clear search">✕</button>}
        </label>
        <label className="select-wrap">
          <span className="muted small">Sort</span>
          <select value={ls.sort} onChange={(e) => setLs({ sort: e.target.value as ListState['sort'] })}>
            <option value="recent">Most recent launch</option>
            <option value="spend">Highest period spend</option>
            <option value="cpl">Best CPL vs target</option>
            <option value="name">Name A–Z</option>
          </select>
        </label>
        <span className="muted small result-count" aria-live="polite">Showing {shown.length} of {universe.length} {def.universeLabel}</span>
      </div>

      {universe.length === 0 ? (
        <StateBox
          icon="∅" title={`No concepts ${def.universeLabel} in ${p.short}`}
          actions={<>
            {scope.period !== 'q4' && <button className="btn" onClick={() => onScope({ ...scope, period: 'q4' })}>Switch to Q4 to date</button>}
            {scope.clientId && <button className="btn btn-ghost" onClick={() => onScope({ ...scope, clientId: null, funnelId: null })}>View all clients</button>}
          </>}
        >
          {scopeLabel(scope)} has nothing in this metric for the selected period. That's a real zero, not missing data.
        </StateBox>
      ) : shown.length === 0 ? (
        <StateBox icon="⌕" title={ls.search ? `No concepts match “${ls.search}”` : `No concepts in “${seg.label}”`}
          actions={<>
            {ls.search && <button className="btn" onClick={() => setLs({ search: '' })}>Clear search</button>}
            {ls.segment !== def.defaultSegment && <button className="btn btn-ghost" onClick={() => setLs({ segment: def.defaultSegment, search: '' })}>Back to {def.segments.find((x) => x.id === def.defaultSegment)!.label}</button>}
          </>}
        >
          Try another segment or search term.
        </StateBox>
      ) : mobile ? (
        <ul className="m-list">
          {shown.map((c) => <ConceptCard key={c.id} c={c} scope={scope} onOpen={() => open(c)} />)}
        </ul>
      ) : (
        <section className="card">
          <div className="scroll-x">
            <table className="table clickable">
              <thead>
                <tr>
                  <th>Concept</th><th>{scope.clientId ? 'Funnel' : 'Client · funnel'}</th><th>Launched</th><th>Stage</th>
                  <th className="num">{metric === 'lifetime' ? 'Lifetime spend' : `Spend · ${p.short}`}</th><th className="num">Test CPL vs target</th><th>Flags</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((c) => {
                  const st = stageLabel(c)
                  const sp = metric === 'lifetime' ? lifetime(c).total : spendIn(c, p).total
                  return (
                    <tr key={c.id} tabIndex={0} onClick={() => open(c)} onKeyDown={(e) => e.key === 'Enter' && open(c)}>
                      <td className="concept-cell"><strong>{c.name}</strong><div className="muted small">{c.id} · {c.format}</div></td>
                      <td>{!scope.clientId && <div>{clientById(c.clientId).name}</div>}<div className={scope.clientId ? '' : 'muted small'}>{funnelById(c.clientId, c.funnelId).name}</div></td>
                      <td>{fmtDate(c.launchDay)}</td>
                      <td><Badge tone={st.tone}>{st.label}</Badge></td>
                      <td className="num">{fmtMoneyExact(sp)}</td>
                      <td className="num"><CplVsTarget c={c} /></td>
                      <td><Flags c={c} /></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  )
}

function ConceptCard({ c, scope, onOpen }: { c: Concept; scope: Scope; onOpen: () => void }) {
  const st = stageLabel(c)
  const p = periodOf(scope)
  return (
    <li>
      <button className="m-card" onClick={onOpen}>
        <div className="m-card-top"><strong>{c.name}</strong><span className="chev">›</span></div>
        <div className="muted small">{c.id} · {!scope.clientId && `${clientById(c.clientId).name} · `}{funnelById(c.clientId, c.funnelId).name}</div>
        <div className="m-badges"><Badge tone={st.tone}>{st.label}</Badge><Flags c={c} hideEmpty /></div>
        <dl className="m-dl">
          <div><dt>Launched</dt><dd>{fmtDate(c.launchDay)}</dd></div>
          <div><dt>Spend · {p.short}</dt><dd>{fmtMoneyExact(spendIn(c, p).total)}</dd></div>
          <div><dt>Test CPL vs target</dt><dd><CplVsTarget c={c} /></dd></div>
        </dl>
      </button>
    </li>
  )
}

function CplVsTarget({ c }: { c: Concept }) {
  const t = funnelById(c.clientId, c.funnelId).targetCpl
  const cpl = lifetime(c).testCpl
  if (cpl === null) return <span className="muted">No leads yet</span>
  const d = cpl / t - 1
  return (
    <span className="cpl">
      {fmtMoneyExact(cpl)} <span className="muted">/ {fmtMoneyExact(t)}</span>
      <span className={`delta ${d <= 0 ? 'good' : 'bad'}`}>{d <= 0 ? '▼' : '▲'} {Math.abs(Math.round(d * 100))}%</span>
    </span>
  )
}

function Flags({ c, hideEmpty }: { c: Concept; hideEmpty?: boolean }) {
  const small = isSmallSample(c)
  const stale = isStale(c)
  if (!small && !stale) return hideEmpty ? null : <span className="muted small">—</span>
  return (
    <span className="flags">
      {small && <Badge tone="warn">Small sample</Badge>}
      {stale && <Badge tone="warn" icon="⚠">Stale</Badge>}
    </span>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
// 3 · Concept evidence (test → scale) + creative / source detail
// ═════════════════════════════════════════════════════════════════════════════
export function ConceptView(ctx: Ctx & { id: string; ret: ConceptReturn | null }) {
  const { id, ret, go, openConcept, toast, mobile } = ctx
  const c = CONCEPTS.find((x) => x.id === id)
  if (!c) {
    return (
      <StateBox icon="?" title="Concept not found" actions={<button className="btn" onClick={() => go({ name: 'portfolio' })}>Back to portfolio</button>}>
        This link points to a concept that is not in the sample data.
      </StateBox>
    )
  }
  const client = clientById(c.clientId)
  const funnel = funnelById(c.clientId, c.funnelId)
  const lt = lifetime(c)
  const st = stageLabel(c)
  const small = isSmallSample(c)
  const stale = isStale(c)
  const idx = ret ? ret.ids.indexOf(c.id) : -1
  const prev = idx > 0 ? ret!.ids[idx - 1] : null
  const next = ret && idx >= 0 && idx < ret.ids.length - 1 ? ret.ids[idx + 1] : null
  const backRoute: Route = ret?.route ?? { name: 'client', clientId: c.clientId }
  const backLabel = ret ? ret.label : `${client.name} performance`

  const steps = [
    { label: 'Launched', detail: fmtDate(c.launchDay), state: 'done' },
    {
      label: c.qualification === 'qualified' ? 'Qualified' : QUAL_LABEL[c.qualification],
      detail: c.qualification === 'still_in_test' ? `${fmtMoneyExact(lt.test)} of $${RULES.qualifySpend} needed` : c.qualification === 'qualified' ? 'Cleared bar' : 'Stopped here',
      state: c.qualification === 'qualified' ? 'done' : c.qualification === 'still_in_test' ? 'current' : 'stopped',
    },
    {
      label: c.testResult === 'winner' ? 'Testing winner' : c.testResult === 'loser' ? 'Did not win test' : 'Test result',
      detail: c.testResult === 'open' ? 'Open' : c.testResult ? `CPL ${lt.testCpl ? fmtMoneyExact(lt.testCpl) : '—'} vs ${fmtMoneyExact(funnel.targetCpl)}` : 'Not reached',
      state: c.testResult === 'winner' ? 'done' : c.testResult === 'loser' ? 'stopped' : c.testResult === 'open' ? 'current' : 'todo',
    },
    {
      label: c.scaleStatus === 'scale_winner' ? 'Scale winner' : c.scaleStatus === 'scale_loser' ? 'Scale did not hold' : c.scaleStatus === 'scaling' ? 'Scaling' : 'Scale',
      detail: c.scaleStartDay !== null ? `Started ${fmtDate(c.scaleStartDay)}${c.scaleStatus === 'scaling' ? ` · judged after ${RULES.scaleJudgeDays} days` : ''}` : 'Not reached',
      state: c.scaleStatus === 'scale_winner' ? 'done' : c.scaleStatus === 'scale_loser' ? 'stopped' : c.scaleStatus === 'scaling' ? 'current' : 'todo',
    },
  ]

  const navTo = (cid: string) => ret && openConcept(cid, ret)
  const totalAds = lt.total

  return (
    <>
      <div className="concept-nav">
        <button className="backlink" onClick={() => go(backRoute, { restore: true })}>← Back to {backLabel}</button>
        {!mobile && ret && idx >= 0 && (
          <div className="pager">
            <span className="muted small">{idx + 1} of {ret.ids.length}</span>
            <button className="btn btn-sm" disabled={!prev} onClick={() => prev && navTo(prev)} aria-label="Previous concept">‹ Prev</button>
            <button className="btn btn-sm" disabled={!next} onClick={() => next && navTo(next)} aria-label="Next concept">Next ›</button>
          </div>
        )}
      </div>

      <section className="card concept-head">
        <div className="concept-title">
          <h2>{c.name}</h2>
          <p className="muted">{c.id} · {c.format} · {client.name} · {funnel.name}</p>
        </div>
        <div className="m-badges">
          <Badge tone={st.tone}>{st.label}</Badge>
          {small && <Badge tone="warn">Small sample</Badge>}
          {stale && <Badge tone="warn" icon="⚠">Stale data</Badge>}
        </div>
      </section>

      {small && (
        <Banner tone="warn" icon="◔">
          <strong>Small sample:</strong> only {fmtMoneyExact(lt.test)} of testing spend so far, below the ${RULES.qualifySpend} bar. CPL and CTR below are directional only.
        </Banner>
      )}
      {stale && (
        <Banner tone="warn" icon="⚠" action={<button className="btn btn-sm" onClick={() => toast('Sync requested (simulated).')}>Retry sync</button>}>
          <strong>Stale data:</strong> last synced {fmtDate(client.lastSync)}. Delivery after that date isn't included.
        </Banner>
      )}

      <section className="card">
        <div className="card-head"><h3>Test → scale path</h3></div>
        <ol className="stepper">
          {steps.map((s) => (
            <li key={s.label} className={`step step-${s.state}`}>
              <span className="step-dot" aria-hidden="true">{s.state === 'done' ? '✓' : s.state === 'stopped' ? '✕' : s.state === 'current' ? '…' : ''}</span>
              <div><strong>{s.label}</strong><span className="muted small">{s.detail}</span></div>
            </li>
          ))}
        </ol>
      </section>

      <div className="evidence-grid">
        <Evidence label="Testing spend" value={fmtMoneyExact(lt.test)} sub="Lifetime" />
        <Evidence label="Test CPL" value={lt.testCpl ? fmtMoneyExact(lt.testCpl) : '—'} sub={`Target ${fmtMoneyExact(funnel.targetCpl)}`} tone={lt.testCpl ? (lt.testCpl <= funnel.targetCpl ? 'good' : 'bad') : undefined} />
        <Evidence label="Scale spend" value={fmtMoneyExact(lt.scale)} sub={c.scaleStartDay !== null ? `Since ${fmtDate(c.scaleStartDay)}` : 'Not scaled'} />
        <Evidence label="Scale CPL" value={lt.scaleCpl ? fmtMoneyExact(lt.scaleCpl) : '—'} sub={`Target ${fmtMoneyExact(funnel.targetCpl)}`} tone={lt.scaleCpl ? (lt.scaleCpl <= funnel.targetCpl ? 'good' : 'bad') : undefined} />
        <Evidence label="Leads" value={lt.leads.toLocaleString('en-US')} sub="Lifetime" />
        <Evidence label="CTR" value={fmtPct(lt.ctr)} sub={`${lt.clicks.toLocaleString('en-US')} clicks`} />
      </div>

      <SpendChart title="Daily spend since launch" note={`${fmtDate(c.launchDay)} – ${fmtDate(Math.min(TODAY, client.lastSync))}`} rows={dailySeries([c], c.launchDay, Math.min(TODAY, client.lastSync))} />

      <section className="card">
        <div className="card-head">
          <div><h3>Creatives &amp; source</h3><p className="muted small">Meta Ads (simulated) · {c.ads.length} ads · last sync {fmtDate(client.lastSync)}</p></div>
        </div>
        {mobile ? (
          <ul className="m-list">
            {c.ads.map((a) => (
              <li key={a.id} className="m-card static">
                <div className="m-card-top"><strong>{a.name}</strong><Badge tone={a.status === 'Active' ? 'good' : 'muted'}>{a.status}</Badge></div>
                <div className="muted small">{a.id} · {a.placement}</div>
                <dl className="m-dl"><div><dt>Spend</dt><dd>{fmtMoneyExact(totalAds * a.share)}</dd></div><div><dt>CTR</dt><dd>{fmtPct(a.ctr)}</dd></div></dl>
                <button className="btn btn-sm full" onClick={() => toast(`Would open ${a.id} in Meta Ads Manager (simulated).`)}>Open source ↗</button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="scroll-x">
            <table className="table">
              <thead><tr><th>Ad</th><th>Placement</th><th className="num">Spend</th><th className="num">CTR</th><th>Status</th><th /></tr></thead>
              <tbody>
                {c.ads.map((a) => (
                  <tr key={a.id}>
                    <td><strong>{a.name}</strong><div className="muted small">{a.id} · hook {c.hook}</div></td>
                    <td>{a.placement}</td>
                    <td className="num">{fmtMoneyExact(totalAds * a.share)}</td>
                    <td className="num">{fmtPct(a.ctr)}</td>
                    <td><Badge tone={a.status === 'Active' ? 'good' : 'muted'}>{a.status}</Badge></td>
                    <td className="num"><button className="btn btn-ghost btn-sm" onClick={() => toast(`Would open ${a.id} in Meta Ads Manager (simulated).`)}>Open source ↗</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {mobile && ret && idx >= 0 && (
        <div className="mobile-pager">
          <button className="btn" disabled={!prev} onClick={() => prev && navTo(prev)}>‹ Prev</button>
          <span className="muted small">{idx + 1} / {ret.ids.length}</span>
          <button className="btn" disabled={!next} onClick={() => next && navTo(next)}>Next ›</button>
        </div>
      )}
    </>
  )
}

function Evidence({ label, value, sub, tone }: { label: string; value: string; sub: string; tone?: 'good' | 'bad' }) {
  return (
    <div className="card evidence">
      <span className="muted small">{label}</span>
      <strong className="ev-value">{value}</strong>
      <span className={`small ${tone ? `delta ${tone}` : 'muted'}`}>
        {tone === 'good' && '▼ under target · '}{tone === 'bad' && '▲ over target · '}{sub}
      </span>
    </div>
  )
}
