import type { MetadataRoute } from 'next';
import { siteUrl } from '@/lib/site';

/** Search engines may read the public landing page; everything else needs a login. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/api/', '/auth/'] },
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
