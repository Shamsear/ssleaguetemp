import { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://ssleaguetemp.vercel.app';
  
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
