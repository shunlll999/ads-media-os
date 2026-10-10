import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  output: process.env.MEDIA_OS_STANDALONE_BUILD === 'true' ? 'standalone' : undefined,
  reactStrictMode: true,
  devIndicators: false,
}

export default nextConfig
