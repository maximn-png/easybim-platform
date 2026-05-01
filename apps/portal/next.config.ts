import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  transpilePackages: ['@easybim/ui', '@easybim/auth', '@easybim/db'],
}

export default nextConfig
