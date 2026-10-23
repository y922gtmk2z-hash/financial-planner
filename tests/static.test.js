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
  const tags = [...html.matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]);
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
  const refs = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1])
    .filter((u) => !u.startsWith('#') && !u.startsWith('data:') && !/^https?:/.test(u));
  assert.ok(refs.length > 10);
  refs.forEach((u) => {
    assert.ok(!u.startsWith('/'), `${u} must be relative so the site works from a subfolder`);
    assert.ok(fs.existsSync(path.join(root, u)), `${u} is missing`);
  });
  assert.ok(!/<base\b/i.test(html), 'no <base> tag');
  assert.ok(fs.existsSync(path.join(root, '.nojekyll')), '.nojekyll serves files as-is');
});

test('GitHub Pages: no code builds absolute paths', () => {
  jsFiles('js').forEach((f) => {
    const src = read(f);
    assert.ok(!/(src|href)\s*[:=]\s*['"`]\//.test(src), `${f} uses an absolute path`);
    assert.ok(!/location\.(pathname|origin)/.test(src), `${f} depends on the URL path`);
  });
  assert.ok(!/url\(\s*['"]?\//.test(read('css/styles.css')), 'CSS uses an absolute url()');
});
