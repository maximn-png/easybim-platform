// Tests the real shipped export parser (lib/agents/peacock/analyticsImport.ts).
// Compiles that single module — it has no imports on purpose — then asserts
// against the LinkedIn export shapes we expect to meet.
//
// Run:  node .\analytics-import.test.mjs
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'

const SRC = new URL('./lib/agents/peacock/analyticsImport.ts', import.meta.url)
const dir = mkdtempSync(join(tmpdir(), 'peacock-parser-'))
let parseAnalyticsExport

try {
  // typescript is hoisted to the monorepo root, so resolve it rather than guess.
  const tsc = createRequire(import.meta.url).resolve('typescript/bin/tsc')
  const srcCopy = join(dir, 'analyticsImport.ts')
  writeFileSync(srcCopy, readFileSync(SRC, 'utf-8'))
  execFileSync(process.execPath, [tsc, srcCopy, '--target', 'es2022', '--module', 'esnext', '--moduleResolution', 'bundler'], {
    stdio: 'pipe',
  })
  const outJs = join(dir, 'analyticsImport.js')
  ;({ parseAnalyticsExport } = await import(`file://${outJs}`))
} catch (err) {
  console.error('could not compile the parser:', err.stdout?.toString() || err.message)
  process.exit(1)
}

let pass = 0
let fail = 0
function check(name, cond, detail = '') {
  if (cond) { pass++; console.log(`  ✓ ${name}`) }
  else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

// 1. LinkedIn's real export shape: title + date range above the header row.
console.log('\nCSV with preamble (LinkedIn page export):')
{
  const r = parseAnalyticsExport(
    [
      'EasyBIM Engineering — Visitor analytics',
      '1/07/2026 - 5/07/2026',
      '',
      'Date,Impressions,Unique impressions,Clicks,Engagements',
      '01/07/2026,"1,204",980,23,64',
      '02/07/2026,"2,010","1,700",41,120',
      '03/07/2026,890,700,12,33',
    ].join('\n')
  )
  check('no error', !r.error, r.error)
  check('3 rows', r.rows.length === 3, `got ${r.rows.length}`)
  check('date is day-first (01/07 → 1 Jul)', r.rows[0] && iso(r.rows[0].date) === '2026-07-01', r.rows[0] && iso(r.rows[0].date))
  check('thousands separator stripped (1,204 → 1204)', r.rows[0]?.impressions === 1204, String(r.rows[0]?.impressions))
  check('uniqueImpressions distinct from impressions', r.rows[1]?.uniqueImpressions === 1700 && r.rows[1]?.impressions === 2010,
    `${r.rows[1]?.impressions}/${r.rows[1]?.uniqueImpressions}`)
  check('engagements mapped', r.rows[1]?.engagements === 120, String(r.rows[1]?.engagements))
  check('clicks mapped', r.rows[2]?.clicks === 12, String(r.rows[2]?.clicks))
}

// 2. Spreadsheet paste (tab-separated), ISO dates, followers columns.
console.log('\nTSV paste with followers:')
{
  const r = parseAnalyticsExport(
    ['Date\tTotal followers\tNew followers\tImpressions', '2026-07-01\t1250\t8\t900', '2026-07-02\t1258\t12\t1100'].join('\n')
  )
  check('2 rows', r.rows.length === 2, `got ${r.rows.length}`)
  check('ISO date parsed', r.rows[0] && iso(r.rows[0].date) === '2026-07-01', r.rows[0] && iso(r.rows[0].date))
  check('followers total', r.rows[1]?.followers === 1258, String(r.rows[1]?.followers))
  check('followers gained kept separate', r.rows[1]?.followersGained === 12, String(r.rows[1]?.followersGained))
}

// 3. Hebrew localized headers.
console.log('\nHebrew headers:')
{
  const r = parseAnalyticsExport(['תאריך,חשיפות,מעורבות', '20/07/2026,1500,90', '21/07/2026,1600,110'].join('\n'))
  check('2 rows', r.rows.length === 2, `got ${r.rows.length}`)
  check('חשיפות → impressions', r.rows[0]?.impressions === 1500, String(r.rows[0]?.impressions))
  check('מעורבות → engagements', r.rows[0]?.engagements === 90, String(r.rows[0]?.engagements))
  check('date 20/07 → 20 Jul', r.rows[0] && iso(r.rows[0].date) === '2026-07-20', r.rows[0] && iso(r.rows[0].date))
}

// 4. Named-month dates.
console.log('\nNamed-month dates:')
{
  const r = parseAnalyticsExport(['Day,Impressions', '"Jul 20, 2026",1500', '"Jul 21, 2026",1600'].join('\n'))
  check('2 rows', r.rows.length === 2, `got ${r.rows.length}`)
  check('"Jul 20, 2026" parsed', r.rows[0] && iso(r.rows[0].date) === '2026-07-20', r.rows[0] && iso(r.rows[0].date))
}

// 5. Junk handling — must not invent rows or throw.
console.log('\nJunk / edge cases:')
{
  const noHeader = parseAnalyticsExport('just some text\nand more text')
  check('missing header → explicit error', !!noHeader.error && noHeader.rows.length === 0)

  const empty = parseAnalyticsExport('')
  check('empty input → error, no throw', !!empty.error && empty.rows.length === 0)

  const partial = parseAnalyticsExport(
    ['Date,Impressions', '01/07/2026,1204', 'Total,5000', ',', '03/07/2026,not-a-number', '04/07/2026,890'].join('\n')
  )
  check('summary/blank/non-numeric rows skipped', partial.rows.length === 2, `got ${partial.rows.length}`)
  check('skipped counted', partial.skipped === 3, `got ${partial.skipped}`)
  check('real rows survive', partial.rows.map((x) => x.impressions).join(',') === '1204,890',
    partial.rows.map((x) => x.impressions).join(','))

  const impossible = parseAnalyticsExport(['Date,Impressions', '32/13/2026,100'].join('\n'))
  check('impossible date rejected, not rolled over', impossible.rows.length === 0, `got ${impossible.rows.length}`)

  const pct = parseAnalyticsExport(['Date,Impressions,Engagement rate', '01/07/2026,1000,6.4%'].join('\n'))
  check('percent cell parsed as number', pct.rows[0]?.engagements === 6.4, String(pct.rows[0]?.engagements))
}

// 6. matched map is reported back for the UI's confirmation step.
console.log('\nMatched-columns report:')
{
  const r = parseAnalyticsExport(['Date,Impressions,Engagements', '01/07/2026,10,2'].join('\n'))
  check('reports date header', r.matched.date === 'Date', JSON.stringify(r.matched))
  check('reports impressions header', r.matched.impressions === 'Impressions', JSON.stringify(r.matched))
}

rmSync(dir, { recursive: true, force: true })
console.log(`\n${fail === 0 ? 'ALL PASS' : 'FAILURES'} — ${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
