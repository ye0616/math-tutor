import type { NextConfig } from 'next';

const backendUrl = process.env.BACKEND_URL || 'http://127.0.0.1:8000';

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*',
        pathname: '/**',
      },
    ],
  },
  async rewrites() {
    // 生产环境如果设了 NEXT_PUBLIC_API_BASE，前端直连后端，不需要代理
    if (process.env.NEXT_PUBLIC_API_BASE) return [];
    return [
      {
        source: '/api/:path*',
        destination: `${backendUrl}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
