/* App shell: loads the workspace, routes between screens and saves changes. */
(function (FP) {
  'use strict';

  const { h } = FP.dom;
  const ROUTES = ['overview', 'today', 'setup', 'income', 'future', 'scenarios', 'assumptions', 'data'];

  const loaded = FP.store.load();
  let workspace = loaded.workspace;
  let saveTimer = null;

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
      clearTimeout(saveTimer);
      status.textContent = 'Saving…';
      saveTimer = setTimeout(save, 300);
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
      h('p', null, h('strong', null, 'You’re looking at fictional sample data. '), 'Edit it in Setup, or start with an empty form.'),
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
        }, 'Start with my own data'),
        h('button', {
          type: 'button', class: 'small secondary',
          onclick: () => {
            workspace.scenarios.forEach((s) => { s.profile.isSample = false; });
            save();
            drawBanner();
          },
        }, 'Keep these figures as mine')));
  }

  // Shows which scenario every screen is editing, and lets you switch.
  function drawScenarioBar() {
    const list = workspace.scenarios;
    const current = FP.scenarios.active(workspace);
    const select = h('select', { id: 'scenario-select', 'aria-label': 'Scenario you are viewing and editing' },
      list.map((s, i) => h('option', { value: s.id, selected: s.id === current.id }, i === 0 ? `${s.name} (baseline)` : s.name)));
    select.addEventListener('change', () => ctx.setActive(select.value));
    FP.dom.fill(scenarioBar,
      h('label', { for: 'scenario-select', class: 'scenario-label' }, 'Scenario'),
      h('div', { class: 'input-wrap scenario-select' }, select),
      h('a', { href: '#scenarios', class: 'header-link' }, list.length > 1 ? 'Compare' : 'Add scenario'));
    scenarioBar.classList.toggle('not-baseline', !FP.scenarios.isBaseline(workspace, current.id));
  }

  function route() {
    const name = (location.hash || '#overview').slice(1);
    const id = ROUTES.includes(name) ? name : 'overview';
    document.querySelectorAll('[data-route]').forEach((a) => {
      if (a.dataset.route === id) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
    drawBanner();
    drawScenarioBar();
    main.replaceChildren();
    FP.screens[id].render(main, ctx);
    document.title = `${FP.screens[id].title} · Finance planner`;
  }

  window.addEventListener('hashchange', () => {
    save();
    route();
    window.scrollTo(0, 0);
    header.classList.remove('is-hidden');
    main.focus({ preventScroll: true });
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
  window.addEventListener('pagehide', save);

  status.textContent = loaded.source === 'saved' ? 'Saved on this device' : 'Sample data';
  if (loaded.error) toast(loaded.error);
  route();
})(globalThis.FP = globalThis.FP || {});
