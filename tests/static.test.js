// Checks on the source itself: privacy (no network calls) and wiring.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const jsFiles = (dir) => fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((e) =>
  (e.isDirectory() ? jsFiles(path.join(dir, e.name)) : e.name.endsWith('.js') ? [path.join(dir, e.name)] : []));

test('no code makes network requests or loads remote resources', () => {
  const banned = [/\bfetch\s*\(/, /XMLHttpRequest/, /sendBeacon/, /WebSocket/, /EventSource/, /import\s*\(/, /\beval\s*\(/, /new Function\b/];
  jsFiles('js').forEach((f) => {
    const src = read(f);
    banned.forEach((re) => assert.ok(!re.test(src), `${f} matches ${re}`));
  });
  const html = read('index.html');
  assert.ok(!/<script[^>]+src="https?:/i.test(html), 'no remote scripts');
  assert.ok(!/<link[^>]+href="https?:/i.test(html), 'no remote stylesheets');
  assert.match(html, /connect-src 'none'/, 'CSP blocks network connections');
});

test('the only URLs in the code are official sources shown as links', () => {
  jsFiles('js').forEach((f) => {
    const urls = (read(f).match(/https?:\/\/[^\s'"`)]+/g) || []).filter((u) => u !== 'http://www.w3.org/2000/svg'); // SVG namespace, not a request
    urls.forEach((u) => assert.match(u, /^https:\/\/www\.(gov\.uk|gov\.scot)\//, `${f}: ${u}`));
  });
});

test('every script is loaded by index.html, and the tests load the same calc files in the same order', () => {
  const html = read('index.html');
  const tags = [...html.matchAll(/<script src="([^"?]+)(?:\?[^"]*)?"/g)].map((m) => m[1]);
  jsFiles('js').map((f) => f.split(path.sep).join('/')).forEach((f) => assert.ok(tags.includes(f), `${f} missing from index.html`));
  const loader = read('tests/load.js');
  const loaded = [...loader.matchAll(/'(js\/[^']+)'/g)].map((m) => m[1]);
  const pageOrder = tags.filter((t) => loaded.includes(t));
  assert.deepEqual(loaded, pageOrder);
  // UI files never load in Node; calc/model/config files never touch the DOM
  loaded.forEach((f) => assert.ok(!/\bdocument\.|\bwindow\./.test(read(f)), `${f} uses the DOM`));
});

test('exported data files are git-ignored', () => {
  assert.match(read('.gitignore'), /finance-planner-export-\*\.json/);
  assert.match(read('js/ui/data.js'), /finance-planner-export-/);
});

test('GitHub Pages: every local path in index.html is relative and exists', () => {
  const html = read('index.html');
  const refs = [...html.matchAll(/(?:src|href)="([^"?]+)(?:\?[^"]*)?"/g)].map((m) => m[1])
    .filter((u) => !u.startsWith('#') && !u.startsWith('data:') && !/^https?:/.test(u));
  assert.ok(refs.length > 10);
  refs.forEach((u) => {
    assert.ok(!u.startsWith('/'), `${u} must be relative so the site works from a subfolder`);
    assert.ok(fs.existsSync(path.join(root, u)), `${u} is missing`);
  });
  assert.ok(!/<base\b/i.test(html), 'no <base> tag');
  assert.ok(fs.existsSync(path.join(root, '.nojekyll')), '.nojekyll serves files as-is');
});

test('GitHub Pages: every script and the stylesheet carry the same version, so updates aren\u2019t hidden by the browser cache', () => {
  const html = read('index.html');
  const assets = [...html.matchAll(/(?:<script src|<link rel="stylesheet" href)="((?:js|css)\/[^"]+)"/g)].map((m) => m[1]);
  assert.ok(assets.length > 10);
  const versions = new Set(assets.map((u) => (u.match(/\?v=([\w.-]+)$/) || [])[1]));
  assert.equal(versions.size, 1, `assets have different versions: ${[...versions].join(', ')}`);
  assert.ok(!versions.has(undefined), 'every asset has ?v=');
});

test('GitHub Pages: no code builds absolute paths', () => {
  jsFiles('js').forEach((f) => {
    const src = read(f);
    assert.ok(!/(src|href)\s*[:=]\s*['"`]\//.test(src), `${f} uses an absolute path`);
    assert.ok(!/location\.(pathname|origin)/.test(src), `${f} depends on the URL path`);
  });
  assert.ok(!/url\(\s*['"]?\//.test(read('css/styles.css')), 'CSS uses an absolute url()');
});

test('navigation: every route has a screen; Setup is in the header, views are tabs', () => {
  const routes = JSON.parse(read('js/app.js').match(/const ROUTES = (\[[^\]]+\])/)[1].replace(/'/g, '"'));
  const ui = jsFiles('js/ui').map((f) => read(f)).join('\n');
  routes.forEach((r) => assert.match(ui, new RegExp(`FP\\.screens\\.${r} = \\{`), `no screen for #${r}`));
  const html = read('index.html');
  const header = html.slice(html.indexOf('<header'), html.indexOf('</header>'));
  const tabs = html.slice(html.indexOf('<nav class="tabbar"'), html.indexOf('</nav>', html.indexOf('<nav class="tabbar"')));
  assert.match(header, /href="#setup"/);
  assert.doesNotMatch(tabs, /href="#setup"/);
  const tabRoutes = [...tabs.matchAll(/data-route="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(tabRoutes, ['overview', 'now', 'future', 'scenarios']);
  assert.match(header, /href="#assumptions"/);
  assert.match(header, /href="#data"/);
  tabRoutes.forEach((r) => assert.ok(routes.includes(r)));
});

test('tab bar: one column per tab, each tab named by visible text with a hidden SVG icon', () => {
  const html = read('index.html');
  const start = html.indexOf('<nav class="tabbar"');
  const tabs = html.slice(start, html.indexOf('</nav>', start));
  const links = [...tabs.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/g)].map((m) => m[1]);
  const css = read('css/styles.css');
  const rule = css.match(/\.tabbar\s*\{([^}]*)\}/)[1];
  const fixed = rule.match(/grid-template-columns:\s*repeat\((\d+)/);
  if (fixed) assert.equal(Number(fixed[1]), links.length, 'tab bar column count matches the tabs');
  else assert.match(rule, /grid-auto-flow:\s*column/);
  links.forEach((inner) => {
    assert.match(inner, /<span class="tab-icon" aria-hidden="true"><svg\b/, 'icon is a hidden SVG');
    const text = inner.replace(/<span class="tab-icon"[\s\S]*?<\/span>/, '').replace(/<[^>]+>/g, '').trim();
    assert.ok(/\w/.test(text), 'tab has a visible label');
    assert.ok(!/[←-⟿]/.test(inner), 'no Unicode glyph icons');
  });
});
