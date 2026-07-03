import { readFileSync } from 'node:fs'
const tree = JSON.parse(readFileSync(new URL('./audit-tree.json', import.meta.url), 'utf-8'))
const norm = (s) => s.replace(/\s+/g,' ').trim()
const Q=new Set(['הצעות מחיר','הצעת מחיר','הצעה מחיר'])
const M=new Set(['חומר שהתקבל מהמזמין','חומר שיתקבל מהמזמין','חומר שהתקבל','חומר שיתקבל מהזמין','חומר שיקתבל מהמזמין','התקבל מהמזמין','חומר שיתקבל מהמזין','חומר שיתקבל מהלקוח','חומר שיצקבל מהמזמין','חומר ביתקבל מהזמנין','חומר מהמזמין','חומרים שיתקבלו מהמזמין','חומר שיתקבל מהזמזמין','חומר שיתקל מהזמין'])
let q=0,m=0,maxDepth=0
function walk(n,d){maxDepth=Math.max(maxDepth,d);for(const f of n.folders||[]){const nm=norm(f.name);if(Q.has(nm))q++;if(M.has(nm))m++;walk(f,d+1)}}
walk(tree,0)
console.log('total quote folders (all depths):',q)
console.log('total materials folders (all depths):',m)
console.log('max depth crawled:',maxDepth)
