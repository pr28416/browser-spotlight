/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
  },
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // Don't bundle Node.js modules in the browser
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        os: false,
      }
    }
    return config
  },
}

module.exports = nextConfig
