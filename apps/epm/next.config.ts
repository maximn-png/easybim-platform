import type { NextConfig } from 'next'
import path from 'path'

const monorepoRoot = path.resolve(__dirname, '../..')

const nextConfig: NextConfig = {
  transpilePackages: ['@easybim/ui', '@easybim/db'],
  // Keep these in node_modules (don't bundle/relocate) — @sparticuz/chromium loads
  // its binary from its own bin/ dir at runtime, which breaks if Next bundles it.
  serverExternalPackages: ['mongoose', '@sparticuz/chromium', 'puppeteer-core'],
  turbopack: {
    root: monorepoRoot,
  },
  // The chromium binary is hoisted to the monorepo-root node_modules; force it into
  // the traced output of the two routes that render the PDF with headless Chromium.
  outputFileTracingRoot: monorepoRoot,
  outputFileTracingIncludes: {
    '/api/projects/*/gmail-draft': ['../../node_modules/@sparticuz/chromium/**'],
    '/api/projects/*/report-pdf': ['../../node_modules/@sparticuz/chromium/**'],
  },
}

export default nextConfig
