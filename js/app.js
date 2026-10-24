/* App shell: loads the workspace, routes between screens and saves changes. */
(function (FP) {
  'use strict';

  const { h } = FP.dom;
  const ROUTES = ['overview', 'now', 'setup', 'future', 'scenarios', 'assumptions', 'data', 'settings'];
  // Older links: Today and Income are now parts of Now.
  const ALIASES = { today: 'now/own', income: 'now/pay' };

  /*
   * The planner opens up as you go, so there's only ever a little to take in:
   *   0 - before the quick start: just the welcome (and Your data, Settings);
   *   1 - after it: Your plan, Your figures and Today;
   *   2 - once you've added more detail: everything.
   */
  const STAGE_ROUTES = [
    ['overview', 'data', 'settings'],
    ['overview', 'data', 'settings', 'setup', 'now'],
    ROUTES,
  ];
  function stage() {
    const p = FP.scenarios.active(workspace).profile;
    if (!FP.summary.checklist(p).ready) return 0;
    return FP.welcome.isRough(p) ? 1 : 2;
  }

  // Shows only the tabs and links for what's open at this stage.
  function drawStage(s) {
    document.body.dataset.stage = String(s);
    document.querySelectorAll('[data-route]').forEach((a) => { a.hidden = !STAGE_ROUTES[s].includes(a.dataset.route); });
    const tabs = document.querySelector('.tabbar');
    tabs.hidden = tabs.querySelectorAll('a:not([hidden])').length < 2;
  }

  // Theme: 'system' (no attribute, follows the device), 'light' or 'dark'.
  FP.theme = {
    get: () => (['light', 'dark'].includes(FP.store.pref('theme')) ? FP.store.pref('theme') : 'system'),
    set(value) {
      FP.store.pref('theme', value === 'system' ? null : value);
      FP.theme.apply();
    },
    apply() {
      const t = FP.theme.get();
      if (t === 'system') delete document.documentElement.dataset.theme;
      else document.documentElement.dataset.theme = t;
    },
  };
  FP.theme.apply();

  const loaded = FP.store.load();
  let workspace = loaded.workspace;
  let saveTimer = null;
  let changedSinceLoad = false;

  const main = document.getElementById('main');
  const banner = document.getElementById('sample-banner');
  const scenarioBar = document.getElementById('scenario-bar');
  const status = document.getElementById('save-status');
  const toastEl = document.getElementById('toast');
  const header = document.getElementById('app-header');

  const ctx = {
    storageError: loaded.error || null,
    workspace: () => workspace,
    // Every screen edits the active scenario's profile.
    profile: () => FP.scenarios.active(workspace).profile,
    update(path, value) {
      FP.profile.set(ctx.profile(), path, value);
      ctx.changed();
    },
    changed() {
      changedSinceLoad = true;
      clearTimeout(saveTimer);
      status.textContent = 'Saving…';
      saveTimer = setTimeout(save, 300);
    },
    // Replace the scenario you're editing with a changed copy (from a detail panel).
    replaceProfile(p) {
      const sc = FP.scenarios.active(workspace);
      sc.profile = FP.profile.normalise({ ...p, isSample: sc.profile.isSample });
      ctx.changed();
      route();
    },
    replaceWorkspace(ws) {
      workspace = ws;
      save();
      ctx.rerender();
    },
    setActive(id) {
      if (FP.scenarios.setActive(workspace, id)) {
        save();
        ctx.rerender();
      }
    },
    rerender: () => route(),
    // Save now and go to a screen (used by Setup's Calculate button).
    go(id) {
      flush();
      if (location.hash === `#${id}`) route(); else location.hash = `#${id}`;
    },
    toast,
  };

  function save() {
    clearTimeout(saveTimer);
    const ok = FP.store.save(workspace);
    // When you last changed something (for the backup reminder).
    if (ok && changedSinceLoad) {
      FP.store.pref('lastChange', new Date().toISOString());
      FP.store.pref('editsSinceExport', (Number(FP.store.pref('editsSinceExport')) || 0) + 1);
      changedSinceLoad = false;
    }
    status.textContent = ok ? 'Saved on this device' : 'Not saved — browser storage unavailable';
    status.classList.toggle('bad', !ok);
  }

  // Saves only if there's an edit waiting, so a tab you haven't changed never
  // writes its older copy over what another tab saved.
  function flush() {
    if (changedSinceLoad) save();
  }

  // Another tab saved (or cleared) the planner: show what it saved.
  function reloadFromStorage() {
    clearTimeout(saveTimer);
    changedSinceLoad = false;
    const fresh = FP.store.load();
    workspace = fresh.workspace;
    status.textContent = fresh.source === 'saved' ? 'Saved on this device' : '';
    route();
  }
  window.addEventListener('storage', (e) => {
    // Get started in another tab: leave the front page here too.
    if (e.key === 'ukfp.pref.started') { if (main.querySelector('.gate')) route(); return; }
    if (e.key !== FP.store.KEY && e.key !== null) return;
    document.querySelectorAll('dialog[open]').forEach((d) => d.close());
    reloadFromStorage();
    toast('Updated with changes from another tab');
  });
  // Back from the browser's page cache: other tabs may have saved since.
  window.addEventListener('pageshow', (e) => { if (e.persisted) reloadFromStorage(); });

  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.hidden = false;
    clearTimeout(toast.t);
    toast.t = setTimeout(() => { toastEl.hidden = true; }, 3500);
  }

  const isSample = () => workspace.scenarios.some((s) => s.profile.isSample);

  // The sample banner is in full on the first screen you see (once per
  // browser, remembered like the disclaimer), then one line.
  let bannerSeen = FP.store.pref('seenSampleBanner') === '1';
  function drawBanner() {
    banner.hidden = !isSample();
    if (banner.hidden) return;
    const ownFigures = () => {
      if (!confirm('Clear the sample data (and its example scenarios) and start with an empty form?')) return;
      workspace = FP.scenarios.fromProfile(FP.profile.blank());
      save();
      location.hash = '#overview';
      route();
    };
    banner.classList.toggle('slim', bannerSeen);
    if (bannerSeen) {
      FP.dom.fill(banner, h('p', null, h('strong', null, 'Fictional example. '),
        h('button', { type: 'button', class: 'link', onclick: ownFigures }, 'Use my own figures')));
      return;
    }
    bannerSeen = true;
    FP.store.pref('seenSampleBanner', '1');
    FP.dom.fill(banner,
      h('p', null, h('strong', null, 'This is a fictional example household. '), 'Look around, then ',
        h('button', { type: 'button', class: 'link', onclick: ownFigures }, 'start with your own figures'),
        ' or ',
        h('button', {
          type: 'button', class: 'link',
          onclick: () => {
            workspace.scenarios.forEach((sc) => { sc.profile.isSample = false; });
            save();
            drawBanner();
          },
        }, 'edit this example as yours'),
        '.'));
  }

  // Shows which scenario every screen is editing, and lets you switch.
  // Hidden until there's more than one scenario (the Scenarios tab adds them).
  function drawScenarioBar() {
    const list = workspace.scenarios;
    scenarioBar.hidden = list.length < 2;
    if (scenarioBar.hidden) return;
    const current = FP.scenarios.active(workspace);
    const select = h('select', { id: 'scenario-select', 'aria-label': 'Scenario you are viewing and editing' },
      list.map((s, i) => h('option', { value: s.id, selected: s.id === current.id }, i === 0 && s.name !== 'Baseline' ? `${s.name} (baseline)` : s.name)));
    select.addEventListener('change', () => ctx.setActive(select.value));
    FP.dom.fill(scenarioBar,
      h('label', { for: 'scenario-select', class: 'scenario-label' }, 'Scenario'),
      h('div', { class: 'input-wrap scenario-select' }, select),
      h('a', { href: '#scenarios', class: 'header-link' }, 'Compare'));
    scenarioBar.classList.toggle('not-baseline', !FP.scenarios.isBaseline(workspace, current.id));
  }

  // "#setup/about.age" or "#setup/leftover": a screen, then optionally a
  // field (by its profile path) or a section (by id) to scroll to.
  function parseHash() {
    const raw = (location.hash || '#overview').slice(1);
    const alias = ALIASES[raw.split('/')[0]];
    if (alias) history.replaceState(null, '', `#${alias}`);
    const [name, ...rest] = (alias || raw).split('/');
    let target = null;
    try { target = rest.length ? decodeURIComponent(rest.join('/')) : null; } catch (e) { /* malformed link: just open the screen */ }
    return { id: ROUTES.includes(name) ? name : 'overview', target };
  }

  function goToTarget(target) {
    const el = document.getElementById(target)
      || main.querySelector(`[data-path="${CSS.escape(target)}"]`);
    if (!el) return false;
    el.dispatchEvent(new CustomEvent('fp:reveal', { bubbles: true })); // e.g. Setup opens the right step
    for (let d = el.closest('details'); d; d = d.parentElement && d.parentElement.closest('details')) d.open = true;
    el.scrollIntoView({ block: 'center' });
    const input = el.matches('input, select, button') ? el : el.querySelector('input[inputmode], select') || el.querySelector('input');
    if (input) input.focus({ preventScroll: true });
    else { el.setAttribute('tabindex', '-1'); el.focus({ preventScroll: true }); }
    return true;
  }

  function route() {
    let { id, target } = parseHash();
    const s = stage();
    drawStage(s);
    if (!STAGE_ROUTES[s].includes(id)) {
      // Not open yet: back to Your plan (the welcome, until the quick start's done).
      history.replaceState(null, '', '#overview');
      id = 'overview';
      target = null;
    }
    document.querySelectorAll('[data-route]').forEach((a) => {
      if (a.dataset.route === id) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
    document.getElementById('header-menu').open = false;
    drawBanner();
    drawScenarioBar();
    main.replaceChildren();
    FP.screens[id].render(main, ctx);
    restoreOpened();
    document.title = `${FP.screens[id].title} · Finance planner`;
    return target;
  }

  /*
   * Sections you open or close stay that way while you move between screens
   * (each screen is redrawn when you come back). Any <details> with an id
   * takes part; until you touch one, its screen decides.
   */
  const opened = new Map();
  main.addEventListener('click', (e) => {
    const summary = e.target.closest && e.target.closest('summary');
    const d = summary && summary.parentElement;
    if (!d || d.tagName !== 'DETAILS' || !d.id) return;
    // The click toggles it just after this handler runs.
    setTimeout(() => opened.set(d.id, d.open));
  });
  function restoreOpened() {
    main.querySelectorAll('details[id]').forEach((d) => {
      if (opened.has(d.id)) d.open = opened.get(d.id);
    });
  }

  window.addEventListener('hashchange', () => {
    flush();
    const target = route();
    window.scrollTo(0, 0);
    header.classList.remove('is-hidden');
    if (!(target && goToTarget(target))) main.focus({ preventScroll: true });
  });

  // The header (with Setup) stays pinned to the top, slides away while you
  // scroll down and comes back as soon as you scroll up.
  let lastY = window.scrollY;
  window.addEventListener('scroll', () => {
    const y = Math.max(0, window.scrollY);
    if (Math.abs(y - lastY) < 6) return;
    header.classList.toggle('is-hidden', y > lastY && y > header.offsetHeight);
    lastY = y;
  }, { passive: true });
  header.addEventListener('focusin', () => header.classList.remove('is-hidden'));
  // On touch screens, typing in a field hides the tab bar so the keyboard
  // leaves room for the form. A short delay on blur stops it flickering as you
  // move between fields.
  const touch = window.matchMedia('(hover: none) and (pointer: coarse)');
  const typing = (el) => el && el.matches && el.matches('input:not([type="radio"]):not([type="checkbox"]):not([type="file"]):not([type="range"]), select, textarea');
  let kbdTimer = null;
  document.addEventListener('focusin', (e) => {
    if (!touch.matches || !typing(e.target)) return;
    clearTimeout(kbdTimer);
    document.body.classList.add('kbd-open');
  });
  document.addEventListener('focusout', () => {
    clearTimeout(kbdTimer);
    kbdTimer = setTimeout(() => { if (!typing(document.activeElement)) document.body.classList.remove('kbd-open'); }, 150);
  });
  // The "More" menu closes when you tap elsewhere or press Escape.
  const menu = document.getElementById('header-menu');
  document.addEventListener('click', (e) => { if (menu.open && !menu.contains(e.target)) menu.open = false; });
  menu.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && menu.open) { menu.open = false; menu.querySelector('summary').focus(); }
  });
  // Lets things pinned under the header (Setup's steps) sit just below it.
  // Measured whenever the header changes size, including when it comes back
  // after the front page (which hides it, so it measures 0 there).
  const setHeaderHeight = () => {
    if (header.offsetHeight) document.documentElement.style.setProperty('--header-h', `${header.offsetHeight}px`);
  };
  new ResizeObserver(setHeaderHeight).observe(header);
  window.addEventListener('pagehide', flush);

  // The full disclaimer shows on your first visit; after that it's one line (tap for more).
  const disclaimer = document.getElementById('disclaimer');
  disclaimer.open = !FP.store.pref('seenDisclaimer');
  FP.store.pref('seenDisclaimer', '1');
  document.getElementById('show-disclaimer').addEventListener('click', () => {
    disclaimer.open = true;
    disclaimer.scrollIntoView({ block: 'start' });
    disclaimer.querySelector('summary').focus();
  });

  status.textContent = loaded.source === 'saved' ? 'Saved on this device' : '';
  if (loaded.error) toast(loaded.error);
  const firstTarget = route();
  if (firstTarget) goToTarget(firstTarget);
})(globalThis.FP = globalThis.FP || {});
