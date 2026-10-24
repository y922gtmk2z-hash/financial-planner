/* App shell: loads the workspace, routes between screens and saves changes. */
(function (FP) {
  'use strict';

  const { h } = FP.dom;
  const ROUTES = ['overview', 'now', 'setup', 'future', 'scenarios', 'assumptions', 'data'];
  // Older links: Today and Income are now parts of Now.
  const ALIASES = { today: 'now/own', income: 'now/pay' };

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
      save();
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
      changedSinceLoad = false;
    }
    status.textContent = ok ? 'Saved on this device' : 'Not saved — browser storage unavailable';
    status.classList.toggle('bad', !ok);
  }

  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.hidden = false;
    clearTimeout(toast.t);
    toast.t = setTimeout(() => { toastEl.hidden = true; }, 3500);
  }

  const isSample = () => workspace.scenarios.some((s) => s.profile.isSample);

  function drawBanner() {
    banner.hidden = !isSample();
    if (banner.hidden) return;
    FP.dom.fill(banner,
      h('p', null, h('strong', null, 'This is a fictional example household. '), 'Look around, then put in your own figures.'),
      h('div', { class: 'button-row' },
        h('button', {
          type: 'button', class: 'small',
          onclick: () => {
            if (!confirm('Clear the sample data (and its example scenarios) and start with an empty form?')) return;
            workspace = FP.scenarios.fromProfile(FP.profile.blank());
            save();
            location.hash = '#setup';
            route();
          },
        }, 'Start with my own figures'),
        h('button', {
          type: 'button', class: 'link',
          onclick: () => {
            workspace.scenarios.forEach((s) => { s.profile.isSample = false; });
            save();
            drawBanner();
          },
        }, 'or edit this example as mine')));
  }

  // Shows which scenario every screen is editing, and lets you switch.
  // Hidden until there's more than one scenario (the Scenarios tab adds them).
  function drawScenarioBar() {
    const list = workspace.scenarios;
    scenarioBar.hidden = list.length < 2;
    if (scenarioBar.hidden) return;
    const current = FP.scenarios.active(workspace);
    const select = h('select', { id: 'scenario-select', 'aria-label': 'Scenario you are viewing and editing' },
      list.map((s, i) => h('option', { value: s.id, selected: s.id === current.id }, i === 0 ? `${s.name} (baseline)` : s.name)));
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
    return { id: ROUTES.includes(name) ? name : 'overview', target: rest.length ? decodeURIComponent(rest.join('/')) : null };
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
    const { id, target } = parseHash();
    document.querySelectorAll('[data-route]').forEach((a) => {
      if (a.dataset.route === id) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
    document.getElementById('header-menu').open = false;
    drawBanner();
    drawScenarioBar();
    main.replaceChildren();
    FP.screens[id].render(main, ctx);
    document.title = `${FP.screens[id].title} · Finance planner`;
    return target;
  }

  window.addEventListener('hashchange', () => {
    save();
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
  // The "More" menu closes when you tap elsewhere or press Escape.
  const menu = document.getElementById('header-menu');
  document.addEventListener('click', (e) => { if (menu.open && !menu.contains(e.target)) menu.open = false; });
  menu.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && menu.open) { menu.open = false; menu.querySelector('summary').focus(); }
  });
  // Lets things pinned under the header (Setup's steps) sit just below it.
  const setHeaderHeight = () => document.documentElement.style.setProperty('--header-h', `${header.offsetHeight}px`);
  window.addEventListener('resize', setHeaderHeight);
  setHeaderHeight();
  window.addEventListener('pagehide', save);

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
