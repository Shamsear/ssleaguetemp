import { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  let baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://ssleague.vercel.app';
  if (baseUrl.endsWith('/')) {
    baseUrl = baseUrl.slice(0, -1);
  }
  
  return {
    rules: {
      userAgent: '*',
      allow: [
        '/',
        '/news',
        '/players',
        '/teams',
        '/seasons',
        '/fixtures',
        '/awards',
        '/polls',
        '/rules',
        '/footballplayers',
        '/api/public/',
      ],
      disallow: [
        '/dashboard/',
        '/admin/',
        '/api/auth/',
        '/api/admin/',
        '/api/committee/',
        '/api/user/',
        '/test/',
        '/ios-test/',
        '/notification-debug/',
        '/test-news/',
        '/test-notifications/',
        '/register-sw',
      ],
    },
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
