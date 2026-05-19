import type { NextConfig } from 'next'
import { PHASE_DEVELOPMENT_SERVER } from 'next/constants'

const nextConfig = (phase: string): NextConfig => {
  const config: NextConfig = {
    images: { unoptimized: true },
  }
  // Static-export settings are only for `next build` (the itch.io bundle).
  // Applying them to `next dev` breaks Fast Refresh / hot-reload.
  if (phase !== PHASE_DEVELOPMENT_SERVER) {
    config.output = 'export'
    config.assetPrefix = './'
    config.trailingSlash = true
  }
  return config
}

export default nextConfig
