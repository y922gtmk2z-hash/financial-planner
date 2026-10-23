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
        if (!confirm('Replace everything in the planner with the imported file?')) return;
        ctx.replaceProfile(r.profile);
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
        h('div', { class: 'button-row' },
          h('button', { type: 'button', onclick: () => exportFile(ctx) }, 'Export to a file'),
          h('label', { for: 'import-file', class: 'button secondary', tabindex: '0',
            onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); } } }, 'Import a file'),
          fileInput),
        h('p', { class: 'muted' }, 'Exports are plain JSON files containing your figures. Keep them somewhere private.')),
      h('section', { class: 'card' },
        h('h2', null, 'Start again'),
        h('div', { class: 'button-row' },
          h('button', {
            type: 'button', class: 'secondary',
            onclick: () => {
              if (!confirm('Replace everything with the fictional sample data?')) return;
              ctx.replaceProfile(FP.sample());
              ctx.toast('Sample data loaded');
            },
          }, 'Load sample data'),
          h('button', {
            type: 'button', class: 'danger',
            onclick: () => {
              if (!confirm('Delete all your data from this browser? This can’t be undone. Export a file first if you want a backup.')) return;
              FP.store.clear();
              ctx.replaceProfile(FP.profile.blank());
              ctx.toast('All data cleared');
            },
          }, 'Clear all data')),
        h('p', { class: 'muted' }, '“Clear all data” removes everything this planner saved in your browser and leaves you with an empty form.')));
  }

  function exportFile(ctx) {
    const blob = new Blob([FP.store.exportJson(ctx.profile())], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = h('a', { href: url, download: `finance-planner-export-${new Date().toISOString().slice(0, 10)}.json` });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  FP.screens = FP.screens || {};
  FP.screens.data = { title: 'Data', render };
})(globalThis.FP = globalThis.FP || {});
