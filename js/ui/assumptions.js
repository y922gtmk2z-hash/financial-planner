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
        h('p', { class: 'muted' }, `${countEdited(p)} of ${A.DEFS.length} changed from the defaults (set ${FP.dom.date(A.DEFS[0].setOn)}). Resetting doesn’t touch your balances, salary or spending.`),
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

    // Each group folds to one line showing its values; one is open at a time.
    const groups = A.GROUPS.map((g) => {
      const defs = A.DEFS.filter((d) => d.group === g.id);
      const own = defs.filter((d) => !IN_SETUP.has(d.key));
      const make = (d) => row(d, ctx, () => drawSum());
      const sum = h('span');
      const drawSum = () => {
        const changed = own.filter((d) => p.assumptions[d.key] !== d.default).length;
        // Its main values, or its others when the main ones are set in Your figures.
        const shown = own.some((d) => !d.advanced) ? own.filter((d) => !d.advanced) : own;
        sum.textContent = shown.slice(0, 3).map((d) => `${shortLabel(d)}${d.unit === 'choice' ? ':' : ''} ${valueText(d, p.assumptions[d.key])}`).join(' \u00b7 ')
          + (changed ? ` \u00b7 ${changed} changed` : '');
      };
      drawSum();
      const fold = FP.dom.foldCard(`grp-${g.id}`, g.label, sum,
        own.filter((d) => !d.advanced).map(make),
        own.some((d) => d.advanced)
          ? h('details', { class: 'advanced', id: `adv-${g.id}` }, h('summary', null, 'Advanced'), own.filter((d) => d.advanced).map(make))
          : null,
        setupLine(defs.filter((d) => IN_SETUP.has(d.key)), p));
      fold.addEventListener('toggle', () => {
        if (fold.open) groups.forEach((other) => { if (other !== fold) other.open = false; });
      });
      return fold;
    });
    FP.dom.add(root, groups);
  }

  // A shorter name for the one-line summary.
  const shortLabel = (d) => d.label.replace(/ \(.*\)$/, '').replace(/ in future years$/, '');

  function valueText(d, v) {
    if (v == null) return 'not set';
    if (d.unit === 'choice') return ((d.options.find((o) => o.value === v) || {}).label || v).toLowerCase();
    if (d.unit === 'money') return FP.dom.money(v);
    if (d.unit === 'age') return String(v);
    if (d.unit === 'year') return `${v} yr`;
    if (d.unit === 'pts') return `${v > 0 ? '+' : ''}${v} pts`;
    return `${v}%`;
  }

  // The assumptions you set in Your figures, in one line with a link.
  function setupLine(defs, p) {
    if (!defs.length) return null;
    return h('p', { class: 'help in-setup' }, 'Set in Your figures: ',
      defs.map((d, i) => [i ? ', ' : '', `${shortLabel(d).toLowerCase()} ${valueText(d, p.assumptions[d.key])}`]), '. ',
      h('a', { href: `#setup/assumptions.${defs[0].key}` }, 'Change'));
  }

  // Assumptions that are entered in Your figures (e.g. your mortgage rate) are
  // listed in one line with a link, so each figure has one place to change it.
  const IN_SETUP = new Set(FP.profile.SECTIONS.flatMap((sec) => sec.fields)
    .filter((f) => f.path.startsWith('assumptions.')).map((f) => f.path.slice(12)));

  function row(d, ctx, onChange) {
    const p = ctx.profile();
    const field = { ...FP.profile.assumptionField(d.key), help: d.help, suffix: A.UNIT_SUFFIX[d.unit] };
    const meta = h('p', { class: 'meta' });
    const holder = h('div');
    const drawMeta = () => {
      // Only said when it differs from the default.
      const edited = p.assumptions[d.key] !== d.default;
      meta.hidden = !edited;
      FP.dom.fill(meta,
        edited ? h('span', { class: 'badge edited' }, 'Changed') : null,
        edited ? ` from ${defaultText(d)} ` : null,
        edited ? h('button', {
          type: 'button', class: 'link',
          onclick: () => { p.assumptions[d.key] = d.default; ctx.changed(); draw(); if (onChange) onChange(); },
        }, 'Reset') : null);
    };
    const draw = () => {
      FP.dom.fill(holder, FP.field.render(field, {
        value: p.assumptions[d.key],
        onChange: (v) => { p.assumptions[d.key] = v; ctx.changed(); drawMeta(); if (onChange) onChange(); },
        extra: meta,
      }));
      drawMeta();
    };
    draw();
    return holder;
  }

  function defaultText(d) {
    if (d.default == null) return 'not set';
    if (d.unit === 'choice') return (d.options.find((o) => o.value === d.default) || {}).label || d.default;
    if (d.unit === 'money') return FP.dom.money(d.default);
    if (d.unit === 'pts') return `${d.default} points`;
    return `${d.default}${d.unit.startsWith('pct') ? '%' : ''}`;
  }

  function countEdited(p) {
    return A.DEFS.filter((d) => p.assumptions[d.key] !== d.default).length;
  }

  FP.screens = FP.screens || {};
  FP.screens.assumptions = { title: 'Assumptions', render };
})(globalThis.FP = globalThis.FP || {});
