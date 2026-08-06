// Single source of truth for project categories & sub-categories.
// Import from this file in Portfolio, Contact, and the filter component
// so all three stay in sync when adding/editing categories.

export type CategoryId = 'narrative' | 'information' | 'retention' | 'commercial';

export interface SubCategory {
  id: string;
  label: string;
}

export interface Category {
  id: CategoryId;
  label: string;
  subs: SubCategory[];
}

export const categories: Category[] = [
  {
    id: 'narrative',
    label: 'Narrative & Continuity',
    subs: [
      { id: 'all', label: 'All' },
      { id: 'documentary', label: 'Documentary' },
      { id: 'cinematic', label: 'Cinematic Storytelling' },
      { id: 'youtube-essay', label: 'YouTube Video Essays' },
      { id: 'feature', label: 'Feature Films' }
    ]
  },
  {
    id: 'information',
    label: 'Information & Explainer',
    subs: [
      { id: 'all', label: 'All' },
      { id: 'educational', label: 'Educational Media' },
      { id: 'saas', label: 'SaaS Motion Graphics' },
      { id: 'corporate', label: 'Corporate Training' },
      { id: 'product', label: 'Product Walkthroughs' }
    ]
  },
  {
    id: 'retention',
    label: 'Retention & Micro-Content',
    subs: [
      { id: 'all', label: 'All' },
      { id: 'shorts', label: 'TikTok / Reels / Shorts' },
      { id: 'social', label: 'Social Media Content' },
      { id: 'vlogs', label: 'Vlogs' },
      { id: 'gaming', label: 'Gaming Videos' }
    ]
  },
  {
    id: 'commercial',
    label: 'Commercial & Conversational',
    subs: [
      { id: 'all', label: 'All' },
      { id: 'promo', label: 'Promotional Video Ads' },
      { id: 'ugc', label: 'UGC Ads' },
      { id: 'tv', label: 'Television Commercials' },
      { id: 'brand', label: 'Brand Launch Trailers' }
    ]
  }
];