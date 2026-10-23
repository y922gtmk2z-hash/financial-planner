/*
 * Bonus list editor: add any number of bonuses, each with an amount and the
 * month it's paid in. Used by Setup and the Income screen (same profile data).
 */
(function (FP) {
  'use strict';

  const { h } = FP.dom;

  // onChange: called after any edit, add or remove (e.g. to redraw results).
  function render(ctx, onChange) {
    const wrap = h('div', { class: 'bonus-editor', role: 'group', 'aria-labelledby': 'bonus-h' });
    const changed = () => { if (onChange) onChange(); };

    const draw = () => {
      const list = ctx.profile().income.bonuses;
      FP.dom.fill(wrap,
        h('h3', { id: 'bonus-h' }, 'Bonuses'),
        h('p', { class: 'help' }, 'Add each bonus you expect in a year, before tax. Choose the month it’s paid to see that month’s payslip, or spread it evenly across the year.'),
        list.length ? null : h('p', { class: 'empty' }, 'No bonuses added.'),
        list.map((b, i) => h('div', { class: 'bonus-row' },
          FP.field.render({ ...FP.profile.BONUS_FIELDS[0], label: `Bonus ${i + 1} amount` }, {
            value: b.amount, compact: true,
            onChange: (v) => { ctx.update(`income.bonuses.${i}.amount`, v); changed(); },
          }),
          FP.field.render({ ...FP.profile.BONUS_FIELDS[1], label: `Bonus ${i + 1} paid in` }, {
            value: b.month, compact: true,
            onChange: (v) => { ctx.update(`income.bonuses.${i}.month`, v); changed(); },
          }),
          h('button', {
            type: 'button', class: 'icon-btn', 'aria-label': `Remove bonus ${i + 1}`,
            onclick: () => { list.splice(i, 1); ctx.changed(); draw(); changed(); },
          }, '×'))),
        h('button', {
          type: 'button', class: 'secondary',
          disabled: list.length >= FP.profile.MAX_BONUSES,
          onclick: () => {
            list.push(FP.profile.newBonus());
            ctx.changed();
            draw();
            changed();
            const inputs = wrap.querySelectorAll('.bonus-row input');
            if (inputs.length) inputs[inputs.length - 1].focus();
          },
        }, '+ Add bonus'));
    };
    draw();
    return wrap;
  }

  FP.bonusEditor = { render };
})(globalThis.FP = globalThis.FP || {});
