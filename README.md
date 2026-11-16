# Creative OS — Performance journey prototype

A Claude-built, responsive React + TypeScript prototype of the **Main Performance** journey:

portfolio scorecards → client → funnel → a metric's underlying concept list → concept test/scale evidence and ad/source detail → back, with filters, segment, search, sort and scroll position preserved.

> All data is **synthetic** (`src/data.ts`, deterministic seed). Metric rules are **illustrative placeholders** and must be replaced with Creative OS definitions. Nothing is saved or sent.

## Run it

```bash
npm install
npm run dev      # local dev server
npm run build    # outputs one self-contained dist/index.html
```

Node 20+ recommended.

## Structure

| File | Purpose |
|---|---|
| `src/data.ts` | Sample clients, funnels and concept records (daily delivery, ads). Thresholds live in `RULES`. |
| `src/metrics.ts` | Metric definitions, segments, scorecard summary, trends. Every scorecard count is derived from the same concept records as its drill-down list, so they always match. |
| `src/views.tsx` | Performance (portfolio / client / funnel), metric concept list, concept evidence. |
| `src/ui.tsx` | Shared components: badges, info popover, sparkline, stacked spend chart with hover + table view, empty/error states, sheet. |
| `src/App.tsx` | Shell, navigation, filters, routing (`#client-…`, `#metric-…`, `#concept-…`), simulated loading/error, context preservation. |
| `src/styles.css` | Tokens and responsive rules. |

## What works

- Period / client / funnel filters (desktop filter bar; mobile filter sheet with Apply / Cancel / Reset)
- Six scorecards with definitions, 8-week trends, counts and rates; each breakdown row opens the matching concept segment
- Concept list: segment tabs with counts, search, sort, desktop table / mobile cards
- Concept evidence: test → scale path, CPL vs target, daily testing vs scale spend (hover/tap tooltip, table view), ads with simulated source links, prev/next through the list
- Return paths: back links, breadcrumbs and browser back keep filters, segment, search, sort and scroll position
- States: loading skeleton, slow loading, error + retry, empty (true zero), no search results, stale data, small sample / n<5 low confidence
- Responsive: 3 → 2 → 1 column scorecards; off-canvas nav and card lists below 760 px; sticky mobile pager; 44 px touch targets

Use **Prototype controls** (top right) to simulate slow loading and errors, and to jump to the stale and empty states.

## Responsive behaviour

- ≥ 1180 px: 3-column scorecards, 6-up evidence row
- 761–1180 px: 2-column scorecards, 3-up evidence, narrower sidebar
- ≤ 760 px: off-canvas nav, sticky filter summary + filter sheet, tables become cards, sticky prev/next on concept detail
