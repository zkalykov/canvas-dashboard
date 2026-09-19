import type { MetadataRoute } from 'next';
import { siteUrl } from '@/lib/site';

export default function sitemap(): MetadataRoute.Sitemap {
  return [{ url: `${siteUrl()}/home`, changeFrequency: 'monthly', priority: 1 }];
}
