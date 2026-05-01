import type { NextConfig } from 'next'
import path from 'path'

const nextConfig: NextConfig = {
  transpilePackages: ['@easybim/ui', '@easybim/auth', '@easybim/db'],
  turbopack: {
    root: path.resolve(__dirname, '../..'),
  },
}

export default nextConfig
