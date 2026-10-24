/* Data & privacy: export, import, sample data and clearing everything. */
(function (FP) {
  'use strict';

  const { h } = FP.dom;

  function render(root, ctx) {
    const fileInput = h('input', { type: 'file', accept: 'application/json,.json', class: 'visually-hidden', id: 'import-file' });
    fileInput.addEventListener('change', () => {
      const file = fileInput.files && fileInput.files[0];
      if (!file) return;
      if (file.size > 1024 * 1024) { ctx.toast('That file is too large to be a planner export.'); return; }
      const reader = new FileReader();
      reader.onload = () => {
        const r = FP.store.importJson(String(reader.result));
        fileInput.value = '';
        if (!r.ok) { ctx.toast(r.error); return; }
        if (!confirm('Replace everything in the planner (all scenarios) with the imported file?')) return;
        ctx.replaceWorkspace(r.workspace);
        ctx.toast('Imported');
      };
      reader.readAsText(file);
    });

    FP.dom.add(root,
      h('h1', null, 'Your data'),
      h('section', { class: 'card' },
        h('h2', null, 'Privacy'),
        h('p', null, 'Everything you enter stays in this browser on this device (local storage). Nothing is sent to a server, and there are no accounts.'),
        h('p', { class: 'muted' }, 'Clearing your browser data, or using a private window, will remove it. Export a file to keep a backup or move to another device.'),
        ctx.storageError ? h('p', { class: 'notice warn' }, ctx.storageError) : null),
      h('section', { class: 'card' },
        h('h2', null, 'Back up or move your data'),
        backupStatus(),
        h('div', { class: 'button-row' },
          h('button', { type: 'button', onclick: () => exportFile(ctx) }, 'Export to a file'),
          h('label', { for: 'import-file', class: 'button secondary', tabindex: '0',
            onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); } } }, 'Import a file'),
          fileInput),
        h('p', { class: 'muted' }, 'Exports are plain JSON files containing your figures for every scenario. Keep them somewhere private.')),
      h('section', { class: 'card' },
        h('h2', null, 'Start again'),
        h('div', { class: 'button-row' },
          h('button', {
            type: 'button', class: 'secondary',
            onclick: () => {
              if (!confirm('Replace everything (all scenarios) with the fictional sample data?')) return;
              ctx.replaceWorkspace(FP.sampleWorkspace());
              ctx.toast('Sample data loaded');
            },
          }, 'Load sample data'),
          h('button', {
            type: 'button', class: 'danger',
            onclick: () => {
              if (!confirm('Delete all your data from this browser? This can’t be undone. Export a file first if you want a backup.')) return;
              FP.store.clear();
              ctx.replaceWorkspace(FP.scenarios.fromProfile(FP.profile.blank()));
              ctx.toast('All data cleared');
            },
          }, 'Clear all data')),
        h('p', { class: 'muted' }, '“Clear all data” removes everything this planner saved in your browser and leaves you with an empty form.')));
  }

  function backupStatus() {
    const b = FP.backup.status();
    return h('p', { class: b.due ? 'notice info' : 'muted' },
      b.lastExport
        ? `Last exported on ${FP.dom.date(b.lastExport.slice(0, 10))}${b.changedSince ? ', and you\u2019ve made changes since.' : '.'}`
        : 'You haven\u2019t exported a backup from this browser yet.');
  }

  function exportFile(ctx) {
    const blob = new Blob([FP.store.exportJson(ctx.workspace())], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = h('a', { href: url, download: `finance-planner-export-${new Date().toISOString().slice(0, 10)}.json` });
    document.body.appendChild(a);
    a.click();
    a.remove();
    FP.store.pref('lastExport', new Date().toISOString());
    FP.store.pref('backupNudgeUntil', null);
    ctx.rerender();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const DAY = 24 * 60 * 60 * 1000;

  /*
   * Whether a backup is due: you've changed something since your last export
   * (or never exported), and that export is over 30 days old.
   */
  function status(now) {
    now = now || Date.now();
    const lastExport = FP.store.pref('lastExport');
    const lastChange = FP.store.pref('lastChange');
    const changedSince = !!lastChange && (!lastExport || lastChange > lastExport);
    const old = !lastExport || now - Date.parse(lastExport) > 30 * DAY;
    return { lastExport, lastChange, changedSince, due: changedSince && old };
  }

  // A gentle reminder on Your plan, which you can put off for 30 days.
  function nudge(ctx) {
    const until = FP.store.pref('backupNudgeUntil');
    if (!status().due || (until && Date.now() < Date.parse(until))) return null;
    if (ctx.workspace().scenarios.some((sc) => sc.profile.isSample)) return null;
    const el = h('p', { class: 'notice info backup-nudge' },
      h('span', { class: 'notice-icon', 'aria-hidden': 'true' }, 'i'),
      h('span', null, 'Your figures are saved only in this browser. ', h('a', { href: '#data' }, 'Export a backup'), ' so you don\u2019t lose them. ',
        h('button', {
          type: 'button', class: 'link',
          onclick: () => { FP.store.pref('backupNudgeUntil', new Date(Date.now() + 30 * DAY).toISOString()); el.remove(); },
        }, 'Not now')));
    return el;
  }

  FP.backup = { status, nudge };
  FP.screens = FP.screens || {};
  FP.screens.data = { title: 'Data', render };
})(globalThis.FP = globalThis.FP || {});
