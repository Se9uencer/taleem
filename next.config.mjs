/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  async rewrites() {
    return [
      {
        source: '/api/transcribe',
        destination: 'https://taleem-ai-backend-production.up.railway.app/transcribe',
      },
    ]
  },
}

export default nextConfig