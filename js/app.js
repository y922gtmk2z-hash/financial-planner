/* App shell: loads the profile, routes between screens and saves changes. */
(function (FP) {
  'use strict';

  const { h } = FP.dom;
  const ROUTES = ['today', 'setup', 'income', 'assumptions', 'data'];

  const loaded = FP.store.load();
  let profile = loaded.profile;
  let saveTimer = null;

  const main = document.getElementById('main');
  const banner = document.getElementById('sample-banner');
  const status = document.getElementById('save-status');
  const toastEl = document.getElementById('toast');

  const ctx = {
    storageError: loaded.error || null,
    profile: () => profile,
    update(path, value) {
      FP.profile.set(profile, path, value);
      ctx.changed();
    },
    changed() {
      clearTimeout(saveTimer);
      status.textContent = 'Saving…';
      saveTimer = setTimeout(save, 300);
    },
    replaceProfile(p) {
      profile = p;
      save();
      ctx.rerender();
    },
    rerender: () => route(),
    toast,
  };

  function save() {
    clearTimeout(saveTimer);
    const ok = FP.store.save(profile);
    status.textContent = ok ? 'Saved on this device' : 'Not saved — browser storage unavailable';
    status.classList.toggle('bad', !ok);
  }

  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.hidden = false;
    clearTimeout(toast.t);
    toast.t = setTimeout(() => { toastEl.hidden = true; }, 3500);
  }

  function drawBanner() {
    banner.hidden = !profile.isSample;
    if (!profile.isSample) return;
    FP.dom.fill(banner,
      h('p', null, h('strong', null, 'You’re looking at fictional sample data. '), 'Edit it in Setup, or start with an empty form.'),
      h('div', { class: 'button-row' },
        h('button', {
          type: 'button', class: 'small',
          onclick: () => {
            if (!confirm('Clear the sample data and start with an empty form?')) return;
            profile = FP.profile.blank();
            save();
            location.hash = '#setup';
            route();
          },
        }, 'Start with my own data'),
        h('button', {
          type: 'button', class: 'small secondary',
          onclick: () => { profile.isSample = false; save(); drawBanner(); },
        }, 'Keep these figures as mine')));
  }

  function route() {
    const name = (location.hash || '#today').slice(1);
    const id = ROUTES.includes(name) ? name : 'today';
    document.querySelectorAll('[data-route]').forEach((a) => {
      if (a.dataset.route === id) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
    drawBanner();
    main.replaceChildren();
    FP.screens[id].render(main, ctx);
    document.title = `${FP.screens[id].title} · Finance planner`;
  }

  window.addEventListener('hashchange', () => {
    save();
    route();
    window.scrollTo(0, 0);
    main.focus({ preventScroll: true });
  });
  window.addEventListener('pagehide', save);

  status.textContent = loaded.source === 'saved' ? 'Saved on this device' : 'Sample data';
  if (loaded.error) toast(loaded.error);
  route();
})(globalThis.FP = globalThis.FP || {});
