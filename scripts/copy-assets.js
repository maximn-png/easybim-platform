// Copies brand assets from packages/assets/logos/ into every app's public/ folder.
// Run automatically before `dev` and `build` via root package.json scripts.
// Never edit logos inside apps/*/public/ -- edit them in packages/assets/logos/ instead.

const fs   = require('fs')
const path = require('path')

const root   = path.join(__dirname, '..')
const source = path.join(root, 'packages', 'assets', 'logos')
const apps   = fs.readdirSync(path.join(root, 'apps'))

let total = 0

for (const app of apps) {
  const dest = path.join(root, 'apps', app, 'public')
  if (!fs.existsSync(dest)) continue

  const files = fs.readdirSync(source)
  for (const file of files) {
    fs.copyFileSync(path.join(source, file), path.join(dest, file))
    console.log('  copied ' + file + ' -> apps/' + app + '/public/')
    total++
  }
}

console.log('\nDone: ' + total + ' asset(s) copied to ' + apps.length + ' app(s).')
