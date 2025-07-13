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

// Sentry config for Next.js
import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 1.0, // Adjust for production
  environment: process.env.NODE_ENV,
});

export default nextConfig