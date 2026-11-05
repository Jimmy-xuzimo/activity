import { defineConfig } from 'astro/config';

// GitHub Pages project site: https://jimmy-xuzimo.github.io/activity/
// `base` is mandatory for a project site, otherwise every absolute asset 404s.
export default defineConfig({
  site: 'https://jimmy-xuzimo.github.io',
  base: '/activity/',
  trailingSlash: 'ignore',
  build: {
    inlineStylesheets: 'auto',
  },
  devToolbar: {
    enabled: false,
  },
});
