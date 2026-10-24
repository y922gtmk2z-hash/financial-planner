/* Data & privacy: export, import, sample data and clearing everything. */
(function (FP) {
  'use strict';

  const { h } = FP.dom;

  function render(root, ctx) {
    const fileInput = h('input', { type: 'file', accept: 'application/json,.json', class: 'visually-hidden', id: 'import-file' });
    fileInput.addEventListener('change', () => {
      const file = fileInput.files && fileInput.files[0];
      if (!file) return;
      if (file.size > 1024 * 1024) { fileInput.value = ''; ctx.toast('That file is too large to be a planner export.'); return; }
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
        h('p', { class: 'muted' }, 'Exports are plain JSON files containing your figures for every scenario. Keep them somewhere private.'),
        unreadCopy(),
        h('p', { class: 'muted small' }, 'If you use this planner on a github.io address, its browser storage is shared with other sites under the same github.io account name. Another site there could read your saved figures, so export a backup and clear your data on shared or unfamiliar setups.')),
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
            type: 'button', class: 'danger', 'aria-expanded': 'false', 'aria-controls': 'clear-confirm',
            onclick: (e) => {
              const box = document.getElementById('clear-confirm');
              box.hidden = !box.hidden;
              e.currentTarget.setAttribute('aria-expanded', String(!box.hidden));
              if (!box.hidden) box.querySelector('input').focus();
            },
          }, 'Clear all data')),
        clearConfirm(ctx),
        h('p', { class: 'muted' }, '“Clear all data” removes everything this planner saved in your browser and leaves you with an empty form.')));
  }

  // Second step for "Clear all data": say what goes, and ask for DELETE to be typed.
  function clearConfirm(ctx) {
    const ws = ctx.workspace();
    const n = ws.scenarios.length;
    const input = h('input', { type: 'text', id: 'clear-word', autocomplete: 'off', spellcheck: 'false', autocapitalize: 'characters', 'aria-describedby': 'clear-what' });
    const go = h('button', {
      type: 'button', class: 'danger', disabled: true,
      onclick: () => {
        if (input.value.trim() !== 'DELETE') return;
        FP.store.clear();
        FP.theme.apply();
        ctx.replaceWorkspace(FP.scenarios.fromProfile(FP.profile.blank()));
        ctx.toast('All data cleared');
      },
    }, 'Delete everything');
    input.addEventListener('input', () => { go.disabled = input.value.trim() !== 'DELETE'; });
    return h('div', { class: 'clear-confirm notice warn', id: 'clear-confirm', hidden: true },
      h('div', null,
        h('p', { id: 'clear-what' }, h('strong', null, 'This removes from this browser: '),
          `your figures in ${n === 1 ? 'your plan' : `all ${n} scenarios`}, your assumptions, ideas you\u2019ve ticked off, and settings such as theme and backup reminders. It can\u2019t be undone. `,
          h('a', { href: '#data', onclick: (e) => { e.preventDefault(); exportFile(ctx); } }, 'Export a backup first'), ' if you might want them back.'),
        h('div', { class: 'field compact' }, h('label', { for: 'clear-word' }, 'Type DELETE to confirm'), h('div', { class: 'input-wrap' }, input)),
        h('div', { class: 'button-row' }, go,
          h('button', { type: 'button', class: 'secondary', onclick: () => { document.getElementById('clear-confirm').hidden = true; } }, 'Cancel'))));
  }

  // Saved data the planner couldn't use (see FP.store.load), kept so it isn't lost.
  function unreadCopy() {
    const raw = FP.store.unreadBackup();
    if (!raw) return null;
    // Readable copies get the export label, so Import accepts them later.
    let text = raw;
    try { text = JSON.stringify({ ...JSON.parse(raw), app: 'uk-finance-planner' }, null, 2); } catch (e) { /* keep it exactly as saved */ }
    return h('p', { class: 'notice warn' },
      'Some saved data couldn\u2019t be used by this version of the planner, so a copy was kept. ',
      h('button', { type: 'button', class: 'link', onclick: () => download(text, `finance-planner-export-kept-${new Date().toISOString().slice(0, 10)}.json`) }, 'Download the kept copy'),
      text === raw ? '. It may be damaged, so the planner may not be able to import it.' : '. Import it once you have the latest version of the planner.');
  }

  function download(text, name) {
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const a = h('a', { href: url, download: name });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function backupStatus() {
    const b = FP.backup.status();
    return h('p', { class: b.due ? 'notice info' : 'muted' },
      b.lastExport
        ? `Last exported on ${FP.dom.date(b.lastExport.slice(0, 10))}${b.changedSince ? ', and you\u2019ve made changes since.' : '.'}`
        : 'You haven\u2019t exported a backup from this browser yet.');
  }

  function exportFile(ctx) {
    download(FP.store.exportJson(ctx.workspace()), `finance-planner-export-${new Date().toISOString().slice(0, 10)}.json`);
    FP.store.pref('lastExport', new Date().toISOString());
    FP.store.pref('backupNudgeUntil', null);
    FP.store.pref('editsSinceExport', null);
    ctx.rerender();
  }

  const DAY = 24 * 60 * 60 * 1000;

  /*
   * Whether a backup is due: you've changed something since your last export
   * (or never exported), and that export is over 30 days old or you've made
   * a good number of edits since.
   */
  const MANY_EDITS = 15;
  function status(now) {
    now = now || Date.now();
    const lastExport = FP.store.pref('lastExport');
    const lastChange = FP.store.pref('lastChange');
    const changedSince = !!lastChange && (!lastExport || lastChange > lastExport);
    const old = !lastExport || now - Date.parse(lastExport) > 30 * DAY;
    const many = Number(FP.store.pref('editsSinceExport')) >= MANY_EDITS;
    return { lastExport, lastChange, changedSince, due: changedSince && (old || many) };
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

  FP.backup = { status, nudge, exportFile };
  FP.screens = FP.screens || {};
  FP.screens.data = { title: 'Data', render };
})(globalThis.FP = globalThis.FP || {});
