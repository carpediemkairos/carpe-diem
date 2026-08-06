import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const categories = ['narrative', 'information', 'retention', 'commercial'] as const;
const subCategories = [
  'documentary', 'cinematic', 'youtube-essay', 'feature',
  'educational', 'saas', 'corporate', 'product',
  'shorts', 'social', 'vlogs', 'gaming',
  'promo', 'ugc', 'tv', 'brand'
] as const;

const projects = defineCollection({
  loader: glob({ pattern: '**/[^_]*.{md,mdx}', base: './src/content/projects' }),
  schema: z.object({
    title: z.string(),
    category: z.enum(categories),
    subCategory: z.enum(subCategories),
    desc: z.string(),
    tags: z.array(z.string()).default([]),
    // YouTube video ID (the part after v= or youtu.be/). When set, the
    // project card renders a clickable thumbnail; the iframe only loads
    // after the user clicks. This is how we keep 24 videos from loading
    // 24 iframes on first paint.
    youtubeId: z.string().default(''),
    // Legacy/optional direct video URL (e.g. Vimeo or self-hosted MP4).
    video: z.string().default(''),
    // Optional poster image URL. Used only when youtubeId is empty.
    thumb: z.string().default(''),
    order: z.number().default(999),
    featured: z.boolean().default(false)
  })
});

export const collections = { projects };
