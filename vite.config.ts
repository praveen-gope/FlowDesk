import { defineConfig } from 'vite';
import { cpSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

export function renderPage(html: string) {
  return html
    .replaceAll('{% include "html/menu.html" %}', readFileSync('html/menu.html', 'utf8'))
    .replace(/<script src="(\.\.\/javascript\/(?:auth|backend|leads)\.js)"><\/script>/g, '<script type="module" src="$1"></script>');
}

export default defineConfig({
  appType: 'mpa',
  plugins: [{
    name: 'flowdesk-pages',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const url = new URL(request.url || '/', 'http://localhost');
        if (url.pathname === '/sign-in' || url.pathname === '/sign-in/') {
          request.url = '/html/sign-in.html' + url.search;
        }
        next();
      });
    },
    transformIndexHtml: { order: 'pre', handler: renderPage },
    closeBundle() {
      for (const directory of ['css', 'javascript']) {
        cpSync(directory, `dist/${directory}`, { recursive: true });
      }
    },
  }],
  build: {
    rollupOptions: {
      input: ['index.html', ...readdirSync('html').filter(name => name.endsWith('.html')).map(name => `html/${name}`)]
        .map(name => resolve(name)),
    },
  },
  server: { host: '127.0.0.1', port: 3000, strictPort: true },
});
