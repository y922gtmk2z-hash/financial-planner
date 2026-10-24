// Rewrites tests/golden/ from the current code. Only run when results are
// meant to change: GOLDEN_UPDATE=1 npm run golden:update
const fs = require('node:fs');

if (process.env.GOLDEN_UPDATE !== '1') {
  console.error('Refusing to rewrite the golden snapshots. If the results are meant to change, run:\n  GOLDEN_UPDATE=1 npm run golden:update');
  process.exit(1);
}

const G = require('./golden-lib');

G.names().forEach((name) => {
  const now = G.snapshot(G.profileFrom(G.readFixture(name)));
  let changes = null;
  if (fs.existsSync(G.goldenPath(name))) changes = G.diff(G.readGolden(name), now);
  fs.writeFileSync(G.goldenPath(name), `${JSON.stringify(now, null, 2)}\n`);
  if (!changes) console.log(`${name}: created`);
  else if (!changes.length) console.log(`${name}: unchanged`);
  else console.log(`${name}: ${changes.length} value(s) changed\n${G.describe(changes, 200)}`);
});
