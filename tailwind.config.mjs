/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  theme: {
    extend: {
      colors: {
        space: '#05050a',
        deep: '#0a0a14',
        cyan: '#00f2fe',
        purple: '#7000ff',
        // Bright magenta — third accent for the Narrative Work title.
        // Sits between cyan and the deep --purple on the color wheel so
        // the three reel cards read as a coordinated trio (cyan/cyan/
        // magenta) instead of two cyan cards plus one washed-out title.
        // Higher luminance than --purple (~0.55 vs ~0.13) makes it pop
        // against the dark gradient backdrop. (Added 2026-08-24.)
        magenta: '#ff3df0',
        silver: '#c0c0c0'
      },
      fontFamily: {
        orbitron: ['Orbitron', 'sans-serif'],
        inter: ['Inter', 'sans-serif']
      }
    }
  },
  plugins: []
}
