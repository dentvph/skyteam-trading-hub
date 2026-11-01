import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, access } from 'node:fs/promises';
import { resolve } from 'node:path';

const output = resolve('pages-dist');
test('Pages artifact resolves project-path assets and keeps registration and CRM on the server', async () => {
  const config = JSON.parse(await readFile('deployment/pages.json', 'utf8'));
  const html = await readFile(resolve(output, 'index.html'), 'utf8');
  assert.ok(html.includes(`data-lead-api-origin="${config.backendOrigin}"`));
  assert.ok(html.includes(`href="${config.backendOrigin}/crm"`));
  assert.ok(!html.includes('href="/crm"'));
  assert.ok(html.includes(`content="${config.siteUrl}"`));
  assert.ok(html.includes(`content="${new URL('assets/sky-hero.webp', config.siteUrl).href}"`));
  const top = (await readdir(output)).sort();
  assert.deepEqual(top, ['.nojekyll', 'app.js', 'assets', 'index.html', 'lead-form.css', 'lead-form.js', 'overview-player.js', 'overview-popup.css', 'styles.css'].sort());
  assert.deepEqual((await readdir(resolve(output, 'assets'))).sort(), ['sky-hero.webp', 'sky-logo.png']);
  const paths = [...html.matchAll(/(?:src|href)="([^"#]+)"/g)].map(match => match[1]).filter(path => !/^(?:https?:|mailto:|tel:)/.test(path));
  for (const path of paths) {
    assert.ok(!path.startsWith('/'), `asset stays relative to the repository path: ${path}`);
    await access(resolve(output, path));
  }
  assert.ok(!html.includes('LEAD_FORM_SECRET'));
  assert.ok(!html.includes('CRM_OWNER_EMAIL'));
});
