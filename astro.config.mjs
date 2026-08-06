import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';
import mdx from '@astrojs/mdx';

export default defineConfig({
  site: 'https://carpediem1.pages.dev',
  integrations: [
    tailwind({ applyBaseStyles: false }),
    mdx()
  ],
  build: {
    assets: '_assets'
  }
});
