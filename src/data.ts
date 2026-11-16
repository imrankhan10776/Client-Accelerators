// ─────────────────────────────────────────────────────────────────────────────
// SAMPLE DATA — synthetic, deterministic, clearly labeled.
// Every scorecard number in the prototype is derived from these concept
// records, so a card count always equals the length of its drill-down list.
// Metric thresholds below are ILLUSTRATIVE placeholders, not Creative OS rules.
// ─────────────────────────────────────────────────────────────────────────────

export const TODAY = 75 // day index: 0 = Sep 1 2026, 75 = Nov 15 2026 (data through this day)

export const RULES = {
  qualifySpend: 100, // $ test spend needed before a concept can be judged
  scaleJudgeDays: 7, // days of scale delivery before a scale result is judged
  staleAfterDays: 2, // sync older than this is flagged stale
}

export function dayToDate(d: number): Date {
  return new Date(2026, 8, 1 + d)
}

export type PeriodId = 'nov' | 'oct' | 'q4'
export interface Period {
  id: PeriodId
  label: string
  short: string
  start: number
  end: number
  planMonths: ('oct' | 'nov')[]
}
export const PERIODS: Period[] = [
  { id: 'nov', label: 'Nov 1 – 15, 2026 (month to date)', short: 'Nov 1–15', start: 61, end: 75, planMonths: ['nov'] },
  { id: 'oct', label: 'October 2026', short: 'Oct 2026', start: 30, end: 60, planMonths: ['oct'] },
  { id: 'q4', label: 'Q4 2026 to date', short: 'Q4 to date', start: 30, end: 75, planMonths: ['oct', 'nov'] },
]

export interface Funnel {
  id: string
  name: string
  targetCpl: number
}
export interface Client {
  id: string
  name: string
  code: string
  strategist: string
  owner: string
  plan: { oct: number; nov: number }
  lastSync: number // day index of last successful data sync
  funnels: Funnel[]
}

export const CLIENTS: Client[] = [
  {
    id: 'northbeam', name: 'Northbeam Coaching', code: 'C-ILL-01', strategist: 'Priya N. (sample)', owner: 'Marcus T. (sample)',
    plan: { oct: 24, nov: 24 }, lastSync: 75,
    funnels: [
      { id: 'vsl', name: 'VSL → Strategy call', targetCpl: 42 },
      { id: 'webinar', name: 'Webinar → Application', targetCpl: 28 },
      { id: 'quiz', name: 'Quiz → Low-ticket offer', targetCpl: 14 },
    ],
  },
  {
    id: 'harbor', name: 'Harbor & Pine Consulting', code: 'C-ILL-02', strategist: 'Daniel O. (sample)', owner: 'Marcus T. (sample)',
    plan: { oct: 14, nov: 16 }, lastSync: 72,
    funnels: [
      { id: 'audit', name: 'Free audit → Call', targetCpl: 65 },
      { id: 'casestudy', name: 'Case-study ad → Application', targetCpl: 80 },
    ],
  },
  {
    id: 'summit', name: 'Summit Expert Academy', code: 'C-ILL-03', strategist: 'Aisha K. (sample)', owner: 'Lena R. (sample)',
    plan: { oct: 18, nov: 18 }, lastSync: 75,
    funnels: [
      { id: 'challenge', name: '5-day challenge → Upsell', targetCpl: 9 },
      { id: 'masterclass', name: 'Masterclass → Enrollment', targetCpl: 22 },
    ],
  },
  {
    id: 'lumen', name: 'Lumen Wellness Co.', code: 'C-ILL-04', strategist: 'Priya N. (sample)', owner: 'Lena R. (sample)',
    plan: { oct: 12, nov: 12 }, lastSync: 75,
    funnels: [{ id: 'leadmagnet', name: 'Lead magnet → Program', targetCpl: 18 }],
  },
  {
    id: 'atlas', name: 'Atlas Fitness Pros', code: 'C-ILL-05', strategist: 'Daniel O. (sample)', owner: 'Lena R. (sample)',
    plan: { oct: 10, nov: 8 }, lastSync: 75,
    funnels: [{ id: 'trial', name: 'Free trial → Membership', targetCpl: 24 }],
  },
]

export type Qualification = 'qualified' | 'still_in_test' | 'underqualified' | 'withheld'
export type TestResult = 'winner' | 'loser' | 'open' | null
export type ScaleStatus = 'scale_winner' | 'scaling' | 'scale_loser' | null

export interface DayRow {
  day: number
  test: number
  scale: number
  leads: number
  impressions: number
  clicks: number
}
export interface Ad {
  id: string
  name: string
  format: string
  placement: string
  share: number
  ctr: number
  status: 'Active' | 'Paused' | 'Off'
}
export interface Concept {
  id: string
  name: string
  angle: string
  hook: string
  format: string
  clientId: string
  funnelId: string
  launchDay: number
  qualification: Qualification
  testResult: TestResult
  scaleStartDay: number | null
  scaleStatus: ScaleStatus
  daily: DayRow[]
  ads: Ad[]
}

// Deterministic PRNG so the sample data is identical on every load.
function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const rnd = mulberry32(123)
const between = (a: number, b: number) => a + rnd() * (b - a)
const pick = <T,>(arr: T[]) => arr[Math.floor(rnd() * arr.length)]

const ANGLES = ['Founder story', 'Client transformation', 'Myth vs. fact', '3 costly mistakes', 'Day in the life', 'Objection crusher',
  'Case-study breakdown', 'Price anchor', 'Behind the scenes', 'Testimonial montage', 'Contrarian take', 'Quick-win tutorial']
const HOOKS = ['"I almost quit in year one"', '"Stop doing this on your calls"', '"Here\'s the exact script"', '"Nobody tells you this"',
  '"From 0 to 40 leads a week"', '"The $9 test that changed everything"', '"Why your offer isn\'t converting"', '"Watch me fix this live"',
  '"3 signs you\'re ready"', '"What 200 clients taught me"', '"The question I get every day"', '"Do this before Monday"']
const FORMATS = ['UGC video', 'Talking head', 'Static image', 'Carousel', 'Motion graphic']
const PLACEMENTS = ['Reels 9:16', 'Feed 4:5', 'Stories 9:16', 'Feed 1:1']

const LAUNCH_WEIGHT: Record<string, number> = { northbeam: 52, harbor: 28, summit: 36, lumen: 22, atlas: 14 }

function buildConcepts(): Concept[] {
  const out: Concept[] = []
  for (const client of CLIENTS) {
    const n = LAUNCH_WEIGHT[client.id]
    for (let i = 0; i < n; i++) {
      const lastLaunch = client.id === 'atlas' ? 58 : 74 // Atlas: no November launches (drives an empty state)
      const launchDay = Math.round(between(14, lastLaunch))
      const funnel = pick(client.funnels)
      const age = TODAY - launchDay
      let qualification: Qualification
      const r = rnd()
      if (age < 5) qualification = r < 0.75 ? 'still_in_test' : 'withheld'
      else if (r < 0.42) qualification = 'qualified'
      else if (r < 0.7) qualification = 'underqualified'
      else if (r < 0.84) qualification = 'withheld'
      else qualification = 'still_in_test'

      let testResult: TestResult = null
      let scaleStartDay: number | null = null
      let scaleStatus: ScaleStatus = null
      if (qualification === 'qualified') {
        const t = rnd()
        testResult = age < 9 ? 'open' : t < 0.4 ? 'winner' : t < 0.86 ? 'loser' : 'open'
        if (testResult === 'winner') {
          const s = launchDay + Math.round(between(8, 14))
          if (s <= TODAY) {
            scaleStartDay = s
            scaleStatus = TODAY - s < RULES.scaleJudgeDays ? 'scaling' : rnd() < 0.58 ? 'scale_winner' : 'scale_loser'
          }
        }
      }

      // Daily delivery
      const winner = testResult === 'winner'
      const cpl = funnel.targetCpl * (winner ? between(0.62, 0.9) : qualification === 'underqualified' ? between(1.3, 1.9) : between(0.95, 1.35))
      const testDays = qualification === 'withheld' ? 3 : qualification === 'underqualified' ? Math.round(between(4, 8)) : 14
      const smallBudget = rnd() < 0.18 // some concepts get tiny test budgets -> small-sample flag
      const daily: DayRow[] = []
      const end = Math.min(TODAY, client.lastSync)
      for (let d = launchDay; d <= end; d++) {
        let test = 0
        let scale = 0
        const inTest = d < launchDay + testDays && (scaleStartDay === null || d < scaleStartDay)
        if (inTest) test = smallBudget ? between(3, 9) : between(18, 120)
        if (scaleStartDay !== null && d >= scaleStartDay) {
          const sd = d - scaleStartDay
          if (scaleStatus === 'scale_loser' && sd > 9) scale = 0
          else scale = (scaleStatus === 'scale_loser' ? between(180, 420) : between(320, 1050)) * Math.min(1, 0.45 + sd * 0.12)
        }
        const spend = test + scale
        if (spend === 0) continue
        const impressions = (spend * 1000) / between(22, 44)
        const ctrDay = between(0.008, 0.024)
        daily.push({
          day: d, test: Math.round(test * 100) / 100, scale: Math.round(scale * 100) / 100,
          leads: Math.max(0, Math.round(spend / (cpl * between(0.85, 1.15)))),
          impressions: Math.round(impressions), clicks: Math.round(impressions * ctrDay),
        })
      }

      const angle = pick(ANGLES)
      const hook = pick(HOOKS)
      const format = pick(FORMATS)
      const nAds = 2 + Math.floor(rnd() * 3)
      const raw = Array.from({ length: nAds }, () => between(0.3, 1))
      const sum = raw.reduce((a, b) => a + b, 0)
      const id = `${client.code.slice(-2)}-${String(i + 1).padStart(3, '0')}`
      const ads: Ad[] = raw.map((w, k) => ({
        id: `AD-${id}-${k + 1}`,
        name: `${angle} · v${k + 1}`,
        format,
        placement: pick(PLACEMENTS),
        share: w / sum,
        ctr: between(0.007, 0.026),
        status: scaleStatus === 'scale_winner' || scaleStatus === 'scaling' ? (k === 0 ? 'Active' : pick(['Active', 'Paused'])) : qualification === 'still_in_test' ? 'Active' : 'Off',
      }))

      out.push({
        id, name: `${angle} — ${hook}`, angle, hook, format, clientId: client.id, funnelId: funnel.id,
        launchDay, qualification, testResult, scaleStartDay, scaleStatus, daily, ads,
      })
    }
  }
  return out.sort((a, b) => b.launchDay - a.launchDay)
}

export const CONCEPTS: Concept[] = buildConcepts()

export const clientById = (id: string) => CLIENTS.find((c) => c.id === id)!
export const funnelById = (clientId: string, funnelId: string) => clientById(clientId).funnels.find((f) => f.id === funnelId)!
