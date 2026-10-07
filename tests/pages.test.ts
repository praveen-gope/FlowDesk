import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { renderPage } from '../vite.config.js';
import workspace from '../netlify/edge-functions/workspace.js';
import type { Context } from '@netlify/edge-functions';

test('Netlify pages render the shared sidebar without Django', () => {
  const html = renderPage(readFileSync('html/dashboard.html', 'utf8'));
  assert.ok(html.includes('<nav id="nav">'));
  assert.ok(!html.includes('{%'));
  assert.ok(html.includes('<script type="module" src="../javascript/backend.js"></script>'));
});

test('sign-in and password recovery are standalone public pages', () => {
  for (const page of ['html/sign-in.html', 'html/forgot-password.html']) {
    const html = renderPage(readFileSync(page, 'utf8'));
    assert.ok(!html.includes('{%'));
    assert.ok(!html.includes('javascript/backend.js'));
    assert.ok(html.includes('type="module"'));
  }
});

test('landing-page sign-in links use the canonical Netlify route', () => {
  const html = readFileSync('index.html', 'utf8');
  assert.ok(html.includes('href="/sign-in"'));
  assert.ok(!html.includes('href="html/sign-in.html"'));
  assert.ok(html.includes('javascript/identity-callback.js'));
});

test('anonymous visitors cannot read workspace HTML', async () => {
  const context = { next: () => { throw new Error('Protected content must not be served.'); } } as unknown as Context;
  for (const path of ['/html/dashboard.html', '/html/users.html', '/html/contacts']) {
    const response = await workspace(new Request(`https://example.test${path}`), context);
    assert.equal(response?.status, 302);
    assert.equal(response?.headers.get('location'), '/sign-in');
    assert.equal(response?.headers.get('cache-control'), 'no-store');
  }
});

test('public sign-in, recovery, and website forms do not require authentication', async () => {
  const context = {} as Context;
  for (const path of ['/html/sign-in.html', '/html/forgot-password.html', '/html/lead-form.html', '/html/support-form.html', '/html/lead-form']) {
    assert.equal(await workspace(new Request(`https://example.test${path}`), context), undefined);
  }
});

test('workspace HTML rejects unexpected mutation methods', async () => {
  const response = await workspace(new Request('https://example.test/html/dashboard.html', { method: 'POST' }), {} as Context);
  assert.equal(response?.status, 405);
});
