import { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  let baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://ssleaguetemp.vercel.app';
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
      ],
      disallow: [
        '/dashboard/',
        '/admin/',
        '/api/',
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
