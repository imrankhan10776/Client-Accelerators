import { CLIENTS, CONCEPTS, PERIODS, RULES, TODAY, clientById, type Concept, type Period, type PeriodId } from './data'

export interface Scope {
  period: PeriodId
  clientId: string | null
  funnelId: string | null
}

export const periodOf = (s: Scope): Period => PERIODS.find((p) => p.id === s.period)!

export function inScope(c: Concept, s: Scope) {
  if (s.clientId && c.clientId !== s.clientId) return false
  if (s.funnelId && c.funnelId !== s.funnelId) return false
  return true
}

const inPeriod = (day: number, p: Period) => day >= p.start && day <= p.end

export function spendIn(c: Concept, p: Period) {
  let test = 0
  let scale = 0
  for (const r of c.daily) if (inPeriod(r.day, p)) { test += r.test; scale += r.scale }
  return { test, scale, total: test + scale }
}
export function lifetime(c: Concept) {
  let test = 0, scale = 0, leads = 0, impressions = 0, clicks = 0, testLeads = 0, scaleLeads = 0
  for (const r of c.daily) {
    test += r.test; scale += r.scale; leads += r.leads; impressions += r.impressions; clicks += r.clicks
    const share = r.test + r.scale > 0 ? r.test / (r.test + r.scale) : 0
    testLeads += r.leads * share; scaleLeads += r.leads * (1 - share)
  }
  return {
    test, scale, total: test + scale, leads, impressions, clicks,
    ctr: impressions ? clicks / impressions : 0,
    testCpl: testLeads >= 1 ? test / testLeads : null,
    scaleCpl: scaleLeads >= 1 ? scale / scaleLeads : null,
  }
}

export const isSmallSample = (c: Concept) => lifetime(c).test < RULES.qualifySpend
export const isStale = (c: Concept) => TODAY - clientById(c.clientId).lastSync > RULES.staleAfterDays

// ── Metric definitions ──────────────────────────────────────────────────────
export type MetricId = 'launched' | 'qualified' | 'testing-winners' | 'scale-winners' | 'spend' | 'lifetime'

export interface Segment {
  id: string
  label: string
  test: (c: Concept, p: Period) => boolean
}
export interface MetricDef {
  id: MetricId
  title: string
  definition: string
  /** concepts that form the metric's denominator / universe in this period */
  universe: (c: Concept, p: Period) => boolean
  universeLabel: string
  segments: Segment[]
  defaultSegment: string
}

const launchedIn = (c: Concept, p: Period) => inPeriod(c.launchDay, p)
const scaleStartedIn = (c: Concept, p: Period) => c.scaleStartDay !== null && inPeriod(c.scaleStartDay, p)

const QUAL_SEGMENTS: Segment[] = [
  { id: 'all', label: 'All launched', test: () => true },
  { id: 'qualified', label: 'Qualified', test: (c) => c.qualification === 'qualified' },
  { id: 'still_in_test', label: 'Still in test', test: (c) => c.qualification === 'still_in_test' },
  { id: 'underqualified', label: 'Underqualified', test: (c) => c.qualification === 'underqualified' },
  { id: 'withheld', label: 'Withheld', test: (c) => c.qualification === 'withheld' },
]

export const METRICS: Record<MetricId, MetricDef> = {
  launched: {
    id: 'launched', title: 'Launched',
    definition: 'Concepts whose first ad went live inside the selected period.',
    universe: launchedIn, universeLabel: 'launched', segments: QUAL_SEGMENTS, defaultSegment: 'all',
  },
  qualified: {
    id: 'qualified', title: 'Qualified',
    definition: `Launched concepts that cleared the qualification bar (≥ $${RULES.qualifySpend} test spend and lead quality accepted). Illustrative rule.`,
    universe: launchedIn, universeLabel: 'launched', segments: QUAL_SEGMENTS, defaultSegment: 'qualified',
  },
  'testing-winners': {
    id: 'testing-winners', title: 'Testing winners',
    definition: 'Qualified concepts from this launch cohort that beat the funnel’s target CPL in test. Open tests are in neither rate.',
    universe: (c, p) => launchedIn(c, p) && c.qualification === 'qualified', universeLabel: 'qualified',
    segments: [
      { id: 'winner', label: 'Winners', test: (c) => c.testResult === 'winner' },
      { id: 'loser', label: 'Did not win', test: (c) => c.testResult === 'loser' },
      { id: 'open', label: 'Still open', test: (c) => c.testResult === 'open' },
    ],
    defaultSegment: 'winner',
  },
  'scale-winners': {
    id: 'scale-winners', title: 'Scale winners',
    definition: `Concepts that started scaling in the period and held target CPL after ${RULES.scaleJudgeDays}+ days of scale delivery.`,
    universe: scaleStartedIn, universeLabel: 'started scaling',
    segments: [
      { id: 'scale_winner', label: 'Scale winners', test: (c) => c.scaleStatus === 'scale_winner' },
      { id: 'scaling', label: 'Still scaling, not judged', test: (c) => c.scaleStatus === 'scaling' },
      { id: 'scale_loser', label: 'Did not hold', test: (c) => c.scaleStatus === 'scale_loser' },
    ],
    defaultSegment: 'scale_winner',
  },
  spend: {
    id: 'spend', title: 'Spend',
    definition: 'Calendar spend delivered inside the period by any concept, regardless of launch month.',
    universe: (c, p) => spendIn(c, p).total > 0, universeLabel: 'delivering',
    segments: [
      { id: 'all', label: 'All delivering', test: () => true },
      { id: 'testing', label: 'Testing spend', test: (c, p) => spendIn(c, p).test > 0 },
      { id: 'scale', label: 'Scale spend', test: (c, p) => spendIn(c, p).scale > 0 },
    ],
    defaultSegment: 'all',
  },
  lifetime: {
    id: 'lifetime', title: 'Lifetime spend per scale winner',
    definition: 'Average lifetime spend of every scale winner in the current client/funnel scope, any launch month.',
    universe: (c) => c.scaleStatus === 'scale_winner', universeLabel: 'scale winners (lifetime)',
    segments: [{ id: 'all', label: 'All scale winners', test: () => true }],
    defaultSegment: 'all',
  },
}

export function conceptsFor(metric: MetricId, segment: string, s: Scope) {
  const p = periodOf(s)
  const def = METRICS[metric]
  const universe = CONCEPTS.filter((c) => inScope(c, s) && def.universe(c, p))
  const seg = def.segments.find((x) => x.id === segment) ?? def.segments[0]
  return { universe, list: universe.filter((c) => seg.test(c, p)) }
}

// ── Scorecard summary ──────────────────────────────────────────────────────
export function summarize(s: Scope) {
  const p = periodOf(s)
  const scoped = CONCEPTS.filter((c) => inScope(c, s))
  const launched = scoped.filter((c) => launchedIn(c, p))
  const q = (k: string) => launched.filter((c) => c.qualification === k).length
  const qualified = launched.filter((c) => c.qualification === 'qualified')
  const winners = qualified.filter((c) => c.testResult === 'winner').length
  const losers = qualified.filter((c) => c.testResult === 'loser').length
  const open = qualified.filter((c) => c.testResult === 'open').length
  const started = scoped.filter((c) => scaleStartedIn(c, p))
  const scaleWinners = started.filter((c) => c.scaleStatus === 'scale_winner').length
  const scaling = started.filter((c) => c.scaleStatus === 'scaling').length
  const scaleLosers = started.filter((c) => c.scaleStatus === 'scale_loser').length
  let test = 0, scale = 0
  for (const c of scoped) { const x = spendIn(c, p); test += x.test; scale += x.scale }
  const lifetimeWinners = scoped.filter((c) => c.scaleStatus === 'scale_winner')
  const lt = lifetimeWinners.map((c) => lifetime(c).total).sort((a, b) => a - b)
  const clients = s.clientId ? [clientById(s.clientId)] : CLIENTS
  const planned = s.funnelId ? null : clients.reduce((a, c) => a + p.planMonths.reduce((b, m) => b + c.plan[m], 0), 0)
  const stale = clients.filter((c) => TODAY - c.lastSync > RULES.staleAfterDays)
  return {
    launched: launched.length, planned,
    qualified: qualified.length, stillInTest: q('still_in_test'), underqualified: q('underqualified'), withheld: q('withheld'),
    winners, losers, open,
    started: started.length, scaleWinners, scaling, scaleLosers,
    test, scale, spend: test + scale,
    ltCount: lt.length, ltAvg: lt.length ? lt.reduce((a, b) => a + b, 0) / lt.length : null, ltMedian: lt.length ? lt[Math.floor(lt.length / 2)] : null,
    stale,
  }
}

/** 8 weekly buckets ending today — sparkline trend for a metric in this client/funnel scope. */
export function weeklyTrend(metric: MetricId, s: Scope): number[] {
  const scoped = CONCEPTS.filter((c) => inScope(c, s))
  return Array.from({ length: 8 }, (_, i) => {
    const start = TODAY - 7 * (8 - i) + 1
    const end = start + 6
    const inW = (d: number | null) => d !== null && d >= start && d <= end
    switch (metric) {
      case 'launched': return scoped.filter((c) => inW(c.launchDay)).length
      case 'qualified': return scoped.filter((c) => inW(c.launchDay) && c.qualification === 'qualified').length
      case 'testing-winners': return scoped.filter((c) => inW(c.launchDay) && c.testResult === 'winner').length
      case 'scale-winners': return scoped.filter((c) => inW(c.scaleStartDay) && c.scaleStatus === 'scale_winner').length
      case 'spend': return scoped.reduce((a, c) => a + c.daily.filter((r) => inW(r.day)).reduce((b, r) => b + r.test + r.scale, 0), 0)
      default: return 0
    }
  })
}

/** Daily spend series for a set of concepts over a period (for the stacked chart). */
export function dailySeries(concepts: Concept[], start: number, end: number) {
  const rows = Array.from({ length: end - start + 1 }, (_, i) => ({ day: start + i, test: 0, scale: 0 }))
  for (const c of concepts) for (const r of c.daily) if (r.day >= start && r.day <= end) {
    rows[r.day - start].test += r.test
    rows[r.day - start].scale += r.scale
  }
  return rows
}

export const QUAL_LABEL: Record<string, string> = {
  qualified: 'Qualified', still_in_test: 'Still in test', underqualified: 'Underqualified', withheld: 'Withheld',
}
export function stageLabel(c: Concept) {
  if (c.scaleStatus === 'scale_winner') return { label: 'Scale winner', tone: 'good' }
  if (c.scaleStatus === 'scaling') return { label: 'Scaling · not judged', tone: 'info' }
  if (c.scaleStatus === 'scale_loser') return { label: 'Scale did not hold', tone: 'muted' }
  if (c.testResult === 'winner') return { label: 'Testing winner', tone: 'good' }
  if (c.testResult === 'open') return { label: 'Qualified · test open', tone: 'info' }
  if (c.testResult === 'loser') return { label: 'Qualified · did not win', tone: 'muted' }
  if (c.qualification === 'still_in_test') return { label: 'Still in test', tone: 'info' }
  if (c.qualification === 'underqualified') return { label: 'Underqualified', tone: 'warn' }
  return { label: 'Withheld', tone: 'muted' }
}
