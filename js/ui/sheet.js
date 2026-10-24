/*
 * A panel over the page: a bottom sheet on phones, a side panel on wide
 * screens. Built on <dialog>, so focus stays inside and Escape closes it.
 */
(function (FP) {
  'use strict';

  const { h } = FP.dom;

  /*
   * opts: { title, body (node), onClose }
   * Returns { el, close, setTitle, setStatus(nodes) } (status: a line under the title that stays in view).
   */
  function open(opts) {
    const title = h('h2', { id: 'sheet-h' }, opts.title);
    const closeBtn = h('button', { type: 'button', class: 'icon-btn sheet-close', 'aria-label': 'Close' }, '×');
    const status = h('p', { class: 'sheet-status', role: 'status', 'aria-live': 'polite', hidden: true });
    const dlg = h('dialog', { class: 'sheet', 'aria-labelledby': 'sheet-h' },
      h('div', { class: 'sheet-head' }, h('div', { class: 'sheet-titles' }, title, status), closeBtn),
      h('div', { class: 'sheet-body' }, opts.body));
    const close = () => { if (dlg.open) dlg.close(); };
    closeBtn.addEventListener('click', close);
    // A tap on the dimmed backdrop (outside the panel) closes it.
    dlg.addEventListener('click', (e) => { if (e.target === dlg) close(); });
    dlg.addEventListener('close', () => {
      dlg.remove();
      document.documentElement.classList.remove('sheet-open');
      if (opts.onClose) opts.onClose();
    });
    document.body.appendChild(dlg);
    document.documentElement.classList.add('sheet-open');
    dlg.showModal();
    closeBtn.focus();
    const setStatus = (...nodes) => {
      FP.dom.fill(status, ...nodes);
      status.hidden = !status.textContent;
    };
    return { el: dlg, close, setTitle: (t) => { title.textContent = t; }, setStatus };
  }

  FP.sheet = { open };
})(globalThis.FP = globalThis.FP || {});
