// Read audit-tree.json and tally subfolder-name frequencies to expose the
// naming landscape. Read-only, no network. Buckets by keyword as a HINT only.
import { readFileSync } from 'node:fs'

const tree = JSON.parse(readFileSync(new URL('./audit-tree.json', import.meta.url), 'utf-8'))

// Collect folder nodes at "subfolder" position: grandchildren of clients
// (client -> project -> SUB) plus children of clients that are themselves
// leaf-like (client -> SUB, the client-as-project case).
const counts = new Map()
const bump = (name) => counts.set(name.trim(), (counts.get(name.trim()) || 0) + 1)

for (const client of tree.folders) {
  for (const proj of client.folders) {
    if (proj.folders.length === 0) {
      // client-as-project style: the "project" folder is actually a subfolder bucket
      bump(proj.name)
    } else {
      for (const sub of proj.folders) bump(sub.name)
    }
  }
}

const norm = (s) => s.replace(/\s+/g, ' ').trim()
const isQuote = (s) => /הצע/.test(s) && /מחיר/.test(s)
const isMaterials = (s) => /(מזמין|תקבל|לקוח)/.test(s)
const isContract = (s) => /(חוזה|הסכם|ביטוח|הזמנה|חתומה|מאושר)/.test(s)

const rows = [...counts.entries()].sort((a, b) => b[1] - a[1])
const bucket = (name) => {
  const n = norm(name)
  if (isQuote(n)) return 'QUOTE'
  if (isContract(n)) return 'CONTRACT'
  if (isMaterials(n)) return 'MATERIALS'
  return 'OTHER'
}

const byBucket = { QUOTE: [], MATERIALS: [], CONTRACT: [], OTHER: [] }
for (const [name, c] of rows) byBucket[bucket(name)].push([name, c])

const total = (arr) => arr.reduce((s, [, c]) => s + c, 0)
for (const b of ['QUOTE', 'MATERIALS', 'CONTRACT', 'OTHER']) {
  console.log(`\n### ${b} — ${byBucket[b].length} distinct names, ${total(byBucket[b])} folders`)
  for (const [name, c] of byBucket[b]) console.log(`${String(c).padStart(4)}  ${name}`)
}
