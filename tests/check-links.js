// Checks every GOV.UK link the planner opens resolves (HTTP 200 after
// redirects). Needs the internet, so it runs in CI, not with `npm test`:
//   npm run check:links
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const files = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(path.join(dir, e.name)) : [path.join(dir, e.name)]));
const urls = [...new Set(files(path.join(root, 'js')).filter((f) => f.endsWith('.js'))
  .flatMap((f) => fs.readFileSync(f, 'utf8').match(/https:\/\/www\.gov\.uk\/[a-z0-9\-/]+/g) || []))].sort();

(async () => {
  let bad = 0;
  for (const url of urls) {
    let status;
    try {
      const r = await fetch(url, { redirect: 'follow', headers: { 'user-agent': 'finance-planner-link-check' } });
      status = r.status;
    } catch (e) {
      status = e.message;
    }
    const ok = status === 200;
    if (!ok) bad += 1;
    console.log(`${ok ? 'ok ' : 'BAD'} ${status} ${url}`);
  }
  console.log(`${urls.length} links, ${bad} not resolving`);
  process.exit(bad ? 1 : 0);
})();
