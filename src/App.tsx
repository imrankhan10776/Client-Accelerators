import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { CLIENTS, PERIODS, TODAY, clientById, funnelById, type PeriodId } from './data'
import { METRICS, periodOf, type MetricId, type Scope } from './metrics'
import { Badge, Sheet, Skeleton, StateBox, fmtDate } from './ui'
import { ConceptView, MetricListView, PerformanceView, scopeLabel, scopeRoute, type ConceptReturn } from './views'

// ── Routing: plain #names so links work inside the hosted artifact frame ────
export type Route =
  | { name: 'portfolio' }
  | { name: 'client'; clientId: string }
  | { name: 'funnel'; clientId: string; funnelId: string }
  | { name: 'metric'; metric: MetricId }
  | { name: 'concept'; id: string }

export interface ListState { segment: string; search: string; sort: 'recent' | 'spend' | 'cpl' | 'name' }

const toHash = (r: Route) =>
  r.name === 'portfolio' ? 'portfolio' : r.name === 'client' ? `client-${r.clientId}` : r.name === 'funnel' ? `funnel-${r.clientId}-${r.funnelId}` : r.name === 'metric' ? `metric-${r.metric}` : `concept-${r.id}`

function parseHash(h: string): Route {
  const s = h.replace(/^#/, '')
  if (s.startsWith('client-') && CLIENTS.some((c) => c.id === s.slice(7))) return { name: 'client', clientId: s.slice(7) }
  if (s.startsWith('funnel-')) {
    const [cid, fid] = s.slice(7).split('-')
    const c = CLIENTS.find((x) => x.id === cid)
    if (c && c.funnels.some((f) => f.id === fid)) return { name: 'funnel', clientId: cid, funnelId: fid }
  }
  if (s.startsWith('metric-') && s.slice(7) in METRICS) return { name: 'metric', metric: s.slice(7) as MetricId }
  if (s.startsWith('concept-')) return { name: 'concept', id: s.slice(8) }
  return { name: 'portfolio' }
}

function useMedia(q: string) {
  const [m, setM] = useState(() => window.matchMedia(q).matches)
  useEffect(() => {
    const mq = window.matchMedia(q)
    const f = () => setM(mq.matches)
    mq.addEventListener('change', f)
    return () => mq.removeEventListener('change', f)
  }, [q])
  return m
}

const NAV = [
  { group: 'Plan', items: ['Command Center', 'Performance', 'Forecast'] },
  { group: 'Setup', items: ['Policy', 'Budget', 'Client Settings'] },
  { group: 'Operate', items: ['Creative Queue', 'Early Stops', 'Contributors'] },
  { group: 'Govern', items: ['Trust', 'Glossary', 'Admin Portal'] },
]

const defaultList = (m: MetricId): ListState => ({ segment: METRICS[m].defaultSegment, search: '', sort: 'recent' })

export default function App() {
  const mobile = useMedia('(max-width: 760px)')
  const [route, setRoute] = useState<Route>(() => parseHash(location.hash))
  const [scope, setScope] = useState<Scope>(() => {
    const r = parseHash(location.hash)
    return { period: 'nov', clientId: r.name === 'client' || r.name === 'funnel' ? r.clientId : null, funnelId: r.name === 'funnel' ? r.funnelId : null }
  })
  const [lists, setLists] = useState<Partial<Record<MetricId, ListState>>>({})
  const [conceptReturn, setConceptReturn] = useState<ConceptReturn | null>(null)
  const [sim, setSim] = useState({ slow: false, error: false })
  const [loading, setLoading] = useState(true)
  const [reloadTick, setReloadTick] = useState(0)
  const [toastMsg, setToastMsg] = useState<string | null>(null)
  const [navOpen, setNavOpen] = useState(false)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [controlsOpen, setControlsOpen] = useState(false)

  const scrollMem = useRef<Record<string, number>>({})
  const navKind = useRef<'forward' | 'restore'>('forward')
  const suppressHash = useRef(false)
  const routeRef = useRef(route)
  routeRef.current = route

  const toast = useCallback((m: string) => {
    setToastMsg(m)
    window.clearTimeout((toast as unknown as { t?: number }).t)
    ;(toast as unknown as { t?: number }).t = window.setTimeout(() => setToastMsg(null), 3200)
  }, [])

  const go = useCallback((r: Route, opts?: { restore?: boolean }) => {
    scrollMem.current[toHash(routeRef.current)] = window.scrollY
    navKind.current = opts?.restore ? 'restore' : 'forward'
    if (r.name === 'portfolio') setScope((s) => ({ ...s, clientId: null, funnelId: null }))
    if (r.name === 'client') setScope((s) => ({ ...s, clientId: r.clientId, funnelId: null }))
    if (r.name === 'funnel') setScope((s) => ({ ...s, clientId: r.clientId, funnelId: r.funnelId }))
    setRoute(r)
    setNavOpen(false)
    const h = toHash(r)
    if (location.hash.slice(1) !== h) {
      suppressHash.current = true
      try { location.hash = h } catch { /* hash unavailable in some frames — in-app routing still works */ }
    }
  }, [])

  useEffect(() => {
    const onHash = () => {
      if (suppressHash.current) { suppressHash.current = false; return }
      go(parseHash(location.hash), { restore: true }) // browser back/forward
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [go])

  // Simulated fetch on every forward navigation or scope change. Returning (back) uses cached data.
  const loadKey = `${toHash(route)}|${route.name === 'concept' ? '' : `${scope.period}|${scope.clientId}|${scope.funnelId}`}|${reloadTick}`
  useEffect(() => {
    if (navKind.current === 'restore') { setLoading(false); return }
    setLoading(true)
    const t = window.setTimeout(() => setLoading(false), sim.slow ? 1800 : 420)
    return () => window.clearTimeout(t)
  }, [loadKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // Back/return restores the list's scroll position; forward navigation starts at the top.
  useLayoutEffect(() => {
    window.scrollTo(0, navKind.current === 'restore' ? scrollMem.current[toHash(route)] ?? 0 : 0)
  }, [route])

  const goMetric = useCallback((m: MetricId, segment?: string) => {
    setLists((l) => ({ ...l, [m]: { ...(l[m] ?? defaultList(m)), segment: segment ?? METRICS[m].defaultSegment, search: '' } }))
    go({ name: 'metric', metric: m })
  }, [go])

  const openConcept = useCallback((id: string, ret: ConceptReturn) => {
    setConceptReturn(ret)
    go({ name: 'concept', id })
  }, [go])

  /** Filter change: on performance pages it navigates; on a list it re-scopes in place. */
  const onScope = useCallback((next: Scope) => {
    if (routeRef.current.name === 'metric') {
      navKind.current = 'forward'
      setScope(next)
    } else {
      setScope((s) => ({ ...s, period: next.period }))
      go(scopeRoute(next))
    }
  }, [go])

  const metric = route.name === 'metric' ? route.metric : null
  const ls = metric ? lists[metric] ?? defaultList(metric) : null
  const setLs = (p: Partial<ListState>) => metric && setLists((l) => ({ ...l, [metric]: { ...(l[metric] ?? defaultList(metric)), ...p } }))

  const ctx = { scope, mobile, go, goMetric, openConcept, toast }
  const p = periodOf(scope)

  // ── Page header content ──────────────────────────────────────────────────
  let crumbs: { label: string; route?: Route }[] = [{ label: 'Creative' }, { label: 'Performance', route: { name: 'portfolio' } }]
  let title = 'Creative Performance'
  let subtitle = 'Output, qualification, testing winners, scale winners and spend across the portfolio, from scorecard to ad evidence.'
  if (scope.clientId && route.name !== 'concept') {
    crumbs.push({ label: clientById(scope.clientId).name, route: { name: 'client', clientId: scope.clientId } })
    if (route.name === 'client') { title = clientById(scope.clientId).name; subtitle = 'Client performance, funnel breakdown and daily delivery.' }
  }
  if (scope.clientId && scope.funnelId && route.name !== 'concept') {
    crumbs.push({ label: funnelById(scope.clientId, scope.funnelId).name, route: { name: 'funnel', clientId: scope.clientId, funnelId: scope.funnelId } })
    if (route.name === 'funnel') { title = funnelById(scope.clientId, scope.funnelId).name; subtitle = `Funnel performance for ${clientById(scope.clientId).name}.` }
  }
  if (route.name === 'metric') {
    crumbs.push({ label: METRICS[route.metric].title })
    title = `${METRICS[route.metric].title} · concepts`
    subtitle = `The concepts behind the ${METRICS[route.metric].title.toLowerCase()} scorecard. Select one for its evidence.`
  }
  if (route.name === 'concept') {
    crumbs = [{ label: 'Creative' }, { label: 'Performance', route: { name: 'portfolio' } }]
    if (conceptReturn) crumbs.push({ label: conceptReturn.label, route: conceptReturn.route })
    crumbs.push({ label: route.id })
    title = 'Concept evidence'
    subtitle = 'Qualification, test and scale results with the underlying ads.'
  }
  const crumbsShown = mobile && crumbs.length > 2 ? crumbs.slice(-2) : crumbs

  const showFilters = route.name !== 'concept'

  return (
    <div className={`app ${mobile ? 'is-mobile' : ''}`}>
      <a className="skip" href="#main" onClick={(e) => { e.preventDefault(); document.getElementById('main')?.focus() }}>Skip to content</a>
      <header className="topbar">
        {mobile && <button className="icon-btn" aria-label="Open navigation" onClick={() => setNavOpen(true)}>☰</button>}
        <div className="topbar-title"><strong>Client Accelerators</strong><span className="muted">Creative OS</span></div>
        <Badge tone="proto">Prototype · synthetic data</Badge>
        <button className="btn btn-sm topbar-demo" onClick={() => setControlsOpen(true)}>{mobile ? 'Demo' : 'Prototype controls'}</button>
      </header>

      <div className="body">
        <nav className={`sidebar ${navOpen ? 'open' : ''}`} aria-label="Primary">
          <div className="brand">
            <div className="logo">CLIENT</div>
            <div className="logo-sub">— ACCELERATORS —</div>
            <div className="brand-app">Creative Performance</div>
            <div className="brand-sub">Operating dashboard</div>
          </div>
          {NAV.map((g) => (
            <div key={g.group} className="nav-group">
              <div className="nav-label">{g.group}</div>
              {g.items.map((it) => (
                <button
                  key={it} className={`nav-item ${it === 'Performance' ? 'active' : ''}`} aria-current={it === 'Performance' ? 'page' : undefined}
                  onClick={() => (it === 'Performance' ? go({ name: 'portfolio' }) : (toast(`${it} is outside this prototype (Performance journey only).`), setNavOpen(false)))}
                >{it}</button>
              ))}
            </div>
          ))}
        </nav>
        {navOpen && <div className="nav-backdrop" onClick={() => setNavOpen(false)} />}

        <main id="main" tabIndex={-1}>
          <div className="page-head">
            <ol className="crumbs" aria-label="Breadcrumb">
              {crumbsShown.map((c, i) => (
                <li key={i}>
                  {c.route && i < crumbsShown.length - 1 ? <button className="link" onClick={() => go(c.route!, { restore: true })}>{c.label}</button> : <span>{c.label}</span>}
                </li>
              ))}
            </ol>
            <h1>{title}</h1>
            <p className="muted">{subtitle}</p>
            <div className="meta-badges">
              <span className="dot" aria-hidden="true" /> <span className="muted small">Demo scenario · synthetic records · data through {fmtDate(TODAY)}, 2026</span>
            </div>
          </div>

          {showFilters && (
            mobile ? (
              <div className="filter-summary">
                <button className="filter-chip" onClick={() => setFiltersOpen(true)}>
                  <span><strong>{p.short}</strong> · {scopeLabel(scope)}</span>
                  <span className="filter-btn">Filters</span>
                </button>
              </div>
            ) : (
              <FilterBar scope={scope} onScope={onScope} />
            )
          )}

          <div className="content">
            {loading ? (
              <Skeleton rows={route.name === 'concept' ? 2 : 3} />
            ) : sim.error ? (
              <StateBox
                icon="⚠" title="Couldn't load performance data"
                actions={<button className="btn btn-primary" onClick={() => { navKind.current = 'forward'; setSim((s) => ({ ...s, error: false })); setReloadTick((t) => t + 1) }}>Retry</button>}
              >
                The metrics service didn't respond (simulated error). Your filters and place are kept, so nothing is lost when you retry.
              </StateBox>
            ) : route.name === 'metric' && ls ? (
              <MetricListView {...ctx} metric={route.metric} ls={ls} setLs={setLs} onScope={onScope} />
            ) : route.name === 'concept' ? (
              <ConceptView {...ctx} id={route.id} ret={conceptReturn} />
            ) : (
              <PerformanceView {...ctx} />
            )}
          </div>
        </main>
      </div>

      <Sheet open={filtersOpen} title="Filters" onClose={() => setFiltersOpen(false)}>
        <MobileFilters scope={scope} onApply={(s) => { setFiltersOpen(false); onScope(s) }} onCancel={() => setFiltersOpen(false)} />
      </Sheet>

      <Sheet open={controlsOpen} title="Prototype controls" onClose={() => setControlsOpen(false)}>
        <div className="controls">
          <label className="toggle"><input type="checkbox" checked={sim.slow} onChange={(e) => setSim((s) => ({ ...s, slow: e.target.checked }))} /> Simulate slow loading (1.8 s)</label>
          <label className="toggle"><input type="checkbox" checked={sim.error} onChange={(e) => setSim((s) => ({ ...s, error: e.target.checked }))} /> Simulate data error, with retry</label>
          <div className="tips">
            <strong>Try these states</strong>
            <button className="link" onClick={() => { setControlsOpen(false); go({ name: 'client', clientId: 'harbor' }) }}>Stale data: Harbor &amp; Pine Consulting</button>
            <button className="link" onClick={() => { setControlsOpen(false); go({ name: 'client', clientId: 'atlas' }) }}>Zero launches this month: Atlas Fitness Pros</button>
            <button className="link" onClick={() => { setControlsOpen(false); goMetric('launched', 'still_in_test') }}>Small-sample concepts: Launched › Still in test</button>
          </div>
          <p className="muted small">All data is synthetic. Interactions are simulated; nothing is saved or sent.</p>
        </div>
      </Sheet>

      {toastMsg && <div className="toast" role="status">{toastMsg}</div>}
    </div>
  )
}

function FilterBar({ scope, onScope }: { scope: Scope; onScope: (s: Scope) => void }) {
  const client = scope.clientId ? clientById(scope.clientId) : null
  return (
    <div className="filterbar" role="group" aria-label="Filters">
      <label className="select-wrap">
        <span className="muted small">Period</span>
        <select value={scope.period} onChange={(e) => onScope({ ...scope, period: e.target.value as PeriodId })}>
          {PERIODS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>
      </label>
      <label className="select-wrap">
        <span className="muted small">Client</span>
        <select value={scope.clientId ?? ''} onChange={(e) => onScope({ ...scope, clientId: e.target.value || null, funnelId: null })}>
          <option value="">All clients</option>
          {CLIENTS.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </label>
      <label className="select-wrap">
        <span className="muted small">Funnel</span>
        <select value={scope.funnelId ?? ''} disabled={!client} onChange={(e) => onScope({ ...scope, funnelId: e.target.value || null })}>
          <option value="">{client ? 'All funnels' : 'Select a client first'}</option>
          {client?.funnels.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>
      </label>
      {(scope.clientId || scope.period !== 'nov') && (
        <button className="link reset" onClick={() => onScope({ period: 'nov', clientId: null, funnelId: null })}>Reset filters</button>
      )}
    </div>
  )
}

function MobileFilters({ scope, onApply, onCancel }: { scope: Scope; onApply: (s: Scope) => void; onCancel: () => void }) {
  const [draft, setDraft] = useState(scope)
  const client = draft.clientId ? clientById(draft.clientId) : null
  return (
    <div className="m-filters">
      <fieldset>
        <legend>Period</legend>
        {PERIODS.map((p) => (
          <label key={p.id} className="radio"><input type="radio" name="period" checked={draft.period === p.id} onChange={() => setDraft({ ...draft, period: p.id })} /> {p.label}</label>
        ))}
      </fieldset>
      <label className="select-wrap block">
        <span>Client</span>
        <select value={draft.clientId ?? ''} onChange={(e) => setDraft({ ...draft, clientId: e.target.value || null, funnelId: null })}>
          <option value="">All clients</option>
          {CLIENTS.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </label>
      <label className="select-wrap block">
        <span>Funnel</span>
        <select value={draft.funnelId ?? ''} disabled={!client} onChange={(e) => setDraft({ ...draft, funnelId: e.target.value || null })}>
          <option value="">{client ? 'All funnels' : 'Select a client first'}</option>
          {client?.funnels.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>
      </label>
      <div className="sheet-actions">
        <button className="btn btn-ghost" onClick={() => setDraft({ period: 'nov', clientId: null, funnelId: null })}>Reset</button>
        <span style={{ flex: 1 }} />
        <button className="btn" onClick={onCancel}>Cancel</button>
        <button className="btn btn-primary" onClick={() => onApply(draft)}>Apply</button>
      </div>
    </div>
  )
}
