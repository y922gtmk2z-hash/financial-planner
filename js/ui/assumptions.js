/* Assumptions panel: every number the model depends on, editable, with dated defaults. */
(function (FP) {
  'use strict';

  const { h } = FP.dom;
  const A = FP.assumptions;

  function render(root, ctx) {
    const p = ctx.profile();
    FP.dom.add(root,
      h('h1', null, 'Assumptions'),
      h('p', { class: 'lead' }, 'These numbers drive every result. Change them to match your view; the defaults are reasonable starting points, not predictions.'),
      h('div', { class: 'card actions' },
        h('p', { class: 'muted' }, `${countEdited(p)} of ${A.DEFS.length} changed from the defaults. Resetting doesn’t touch your balances, salary or spending.`),
        h('button', {
          type: 'button', class: 'secondary',
          onclick: () => {
            if (!confirm('Reset every assumption to its default? This includes your mortgage rate and pension contribution %.')) return;
            p.assumptions = A.defaults();
            ctx.changed();
            ctx.rerender();
            ctx.toast('Assumptions reset to defaults');
          },
        }, 'Reset all to defaults')));

    A.GROUPS.forEach((g) => {
      const defs = A.DEFS.filter((d) => d.group === g.id);
      const make = (d) => row(d, ctx);
      root.appendChild(h('section', { class: 'card', 'aria-labelledby': `grp-${g.id}` },
        h('h2', { id: `grp-${g.id}` }, g.label),
        defs.filter((d) => !d.advanced).map(make),
        defs.some((d) => d.advanced)
          ? h('details', { class: 'advanced' }, h('summary', null, 'Advanced'), defs.filter((d) => d.advanced).map(make))
          : null));
    });
  }

  function row(d, ctx) {
    const p = ctx.profile();
    const field = { ...FP.profile.assumptionField(d.key), help: d.help, suffix: A.UNIT_SUFFIX[d.unit] };
    const meta = h('p', { class: 'meta' });
    const holder = h('div');
    const drawMeta = () => {
      const edited = p.assumptions[d.key] !== d.default;
      const def = d.default == null ? 'not set' : `${d.default}${d.unit.startsWith('pct') ? '%' : ''}`;
      FP.dom.fill(meta,
        `Default ${def} · set ${FP.dom.date(d.setOn)}`,
        edited ? h('span', { class: 'badge edited' }, 'Changed') : null,
        edited ? h('button', {
          type: 'button', class: 'link',
          onclick: () => { p.assumptions[d.key] = d.default; ctx.changed(); draw(); },
        }, 'Reset') : null);
    };
    const draw = () => {
      FP.dom.fill(holder, FP.field.render(field, {
        value: p.assumptions[d.key],
        onChange: (v) => { p.assumptions[d.key] = v; ctx.changed(); drawMeta(); },
        extra: meta,
      }));
      drawMeta();
    };
    draw();
    return holder;
  }

  function countEdited(p) {
    return A.DEFS.filter((d) => p.assumptions[d.key] !== d.default).length;
  }

  FP.screens = FP.screens || {};
  FP.screens.assumptions = { title: 'Assumptions', render };
})(globalThis.FP = globalThis.FP || {});
