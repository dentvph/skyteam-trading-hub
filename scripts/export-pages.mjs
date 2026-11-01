import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, join } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = resolve(root, 'pages-dist');
const config = JSON.parse(await readFile(join(root, 'deployment/pages.json'), 'utf8'));
const site = new URL(config.siteUrl);
const backend = new URL(config.backendOrigin);
if (site.protocol !== 'https:' || backend.protocol !== 'https:' || site.search || site.hash || site.username || backend.username || backend.href !== backend.origin + '/') throw new Error('Use an HTTPS site URL and an HTTPS backend origin without credentials.');
if (!site.pathname.endsWith('/')) throw new Error('The Pages site URL must end with a slash.');
let html = await readFile(join(root, 'content/landing.html'), 'utf8');
const currentOrigin = backend.origin;
html = html.replace('<html lang="en">', `<html lang="en" data-lead-api-origin="${backend.origin}">`)
  .replace(`content="${currentOrigin}/"`, `content="${site.href}"`)
  .replace(`content="${currentOrigin}/assets/sky-hero.webp"`, `content="${new URL('assets/sky-hero.webp', site).href}"`)
  .replace('href="/crm"', `href="${backend.origin}/crm"`);
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await writeFile(join(output, 'index.html'), html);
await writeFile(join(output, '.nojekyll'), '');
// Publish only the landing files. Server code, local configuration and records
// are never inputs to the Pages artifact.
for (const file of ['styles.css', 'lead-form.css', 'overview-popup.css', 'app.js', 'overview-player.js', 'lead-form.js']) {
  await cp(join(root, 'public', file), join(output, file));
}
await mkdir(join(output, 'assets'), { recursive: true });
for (const file of ['sky-logo.png', 'sky-hero.webp']) await cp(join(root, 'public/assets', file), join(output, 'assets', file));
console.log(`GitHub Pages artifact ready: ${output}`);
