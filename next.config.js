/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'www.congress.gov',
      },
      {
        protocol: 'https',
        hostname: 'clerk.house.gov',
      },
      {
        protocol: 'https',
        hostname: 'bioguide.congress.gov',
      },
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
      },
    ],
  },
}

module.exports = nextConfig
