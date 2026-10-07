import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { build } from 'esbuild';

const root = resolve(import.meta.dirname, '..');
const dist = resolve(root, 'dist');
const workspace = resolve(root, '.build/workspace');
await rm(dist, { recursive: true, force: true });
await rm(workspace, { recursive: true, force: true });
await mkdir(resolve(dist, 'html'), { recursive: true });
await mkdir(workspace, { recursive: true });
for (const folder of ['css', 'javascript']) {
  await cp(resolve(root, folder), resolve(dist, folder), { recursive: true });
}
const rewrite = text => text.replaceAll('/html/sign-in.html', '/sign-in')
  .replaceAll('href="html/sign-in.html"', 'href="/sign-in"');
const identityScript = '<script src="/javascript/identity-browser.js"></script>';
await writeFile(resolve(dist, 'index.html'), rewrite(await readFile(resolve(root, 'index.html'), 'utf8')).replace('</body>', identityScript + '</body>'));
const login = await readFile(resolve(root, 'html/sign-in.html'), 'utf8');
await writeFile(resolve(dist, 'sign-in.html'), login.replaceAll('../css/', '/css/').replaceAll('../javascript/', '/javascript/').replace('<script src="/javascript/auth.js">', identityScript + '\n<script src="/javascript/auth.js">'));
const menu = await readFile(resolve(root, 'html/menu.html'), 'utf8');
const publicPages = new Set(['lead-form.html', 'support-form.html', 'forgot-password.html']);
const manifest = [];
for (const name of await readdir(resolve(root, 'html'))) {
  if (!name.endsWith('.html') || name === 'menu.html' || name === 'sign-in.html') continue;
  const original = await readFile(resolve(root, 'html', name), 'utf8');
  let html = rewrite(original.replace('{% include "html/menu.html" %}', menu));
  if (/\{%/.test(html)) throw new Error(`Unresolved template in ${name}`);
  if (publicPages.has(name)) {
    await writeFile(resolve(dist, 'html', name), html);
  } else {
    // Workspace files are bundled only with the authenticated Function, not the CDN.
    html = html.replace('<script src="../javascript/backend.js">', identityScript + '\n<script src="../javascript/backend.js">');
    await writeFile(resolve(workspace, name), html);
    manifest.push(name);
  }
}
await writeFile(resolve(workspace, 'manifest.json'), JSON.stringify(manifest));
await build({ entryPoints: [resolve(root, 'javascript/identity-browser.js')], outfile: resolve(dist, 'javascript/identity-browser.js'), bundle: true, platform: 'browser', format: 'iife', minify: true });
console.log(`Built public frontend and ${manifest.length} protected workspace pages.`);
