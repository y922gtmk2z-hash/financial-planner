/*
 * Salary sacrifice editor: car schemes, cycle to work and other arrangements.
 * Used under Income in Your figures, which supplies the heading (#sacrifice-h). Each arrangement
 * shows what it really costs you after the tax and NI you save.
 */
(function (FP) {
  'use strict';

  const { h, money } = FP.dom;
  const F = () => FP.profile.SACRIFICE_FIELDS;

  // Take-home a month you give up for one arrangement (tax and NI savings counted).
  function realCost(profile, index) {
    const withAll = FP.tax.forProfile(profile).takeHome;
    const others = profile.income.sacrifices.filter((_, i) => i !== index);
    const without = FP.tax.forProfile({ ...profile, income: { ...profile.income, sacrifices: others } }).takeHome;
    return (without - withAll) / 12;
  }

  // onChange: called after any edit, add or remove (e.g. to redraw results).
  function render(ctx, onChange) {
    const wrap = h('div', { class: 'sacrifice-editor', id: 'sacrifices', role: 'group', 'aria-labelledby': 'sacrifice-h' });
    const changed = () => { if (onChange) onChange(); };

    const draw = () => {
      const p = ctx.profile();
      const list = p.income.sacrifices;
      const full = list.length >= FP.profile.MAX_SACRIFICES;
      const add = (type, label) => h('button', {
        type: 'button', class: 'secondary small', disabled: full,
        onclick: () => {
          list.push(FP.profile.newSacrifice(type));
          ctx.changed();
          draw();
          changed();
          const inputs = wrap.querySelectorAll('.sacrifice-item:last-of-type input');
          if (inputs.length) inputs[0].focus();
        },
      }, label);

      FP.dom.fill(wrap,
        h('p', { class: 'help' }, 'Schemes where you give up some salary before tax — such as an electric car or cycle to work — so you pay less income tax and National Insurance. Pension salary sacrifice is set under “How your pension is paid”. If a scheme replaces something you pay for now (like a car lease), remove that from your spending.'),
        list.length ? null : h('p', { class: 'empty' }, 'No salary sacrifice schemes added.'),
        h('ul', { class: 'sacrifice-list' }, list.map((a, i) => item(ctx, a, i, draw, changed))),
        h('div', { class: 'button-row' },
          add('car', '+ Car scheme'),
          add('cycle', '+ Cycle to work'),
          add('other', '+ Other')));
    };
    draw();
    return wrap;
  }

  function item(ctx, a, i, redraw, changed) {
    const p = ctx.profile();
    const cost = h('p', { class: 'sacrifice-cost', role: 'status' });
    const drawCost = () => {
      const c = realCost(ctx.profile(), i);
      FP.dom.fill(cost, a.monthly > 0
        ? [h('strong', null, `Costs you about ${money(c)} a month`), ` from take-home, for ${money(a.monthly)} sacrificed`,
          a.type === 'car' ? ' (including tax on the car’s benefit in kind)' : '', '.']
        : '');
    };
    const typeLabel = (FP.profile.SACRIFICE_TYPES.find((t) => t.value === a.type) || {}).label || 'Scheme';
    const fields = F().filter((f) => !f.carOnly || a.type === 'car').map((f) => FP.field.render(
      { ...f, label: f.key === 'type' ? 'Type' : f.label },
      {
        value: a[f.key],
        compact: f.key === 'type',
        onChange: (v) => {
          ctx.update(`income.sacrifices.${i}.${f.key}`, v);
          if (f.key === 'type') {
            // Switching to a car fills in the default benefit-in-kind rate.
            if (v === 'car' && !a.bikRate) a.bikRate = FP.taxConfig.electricCarBikPct;
            redraw();
          } else {
            drawCost();
          }
          changed();
        },
      }));
    drawCost();
    return h('li', { class: 'sacrifice-item' },
      h('fieldset', { class: 'row-card' },
        h('legend', null, `${typeLabel} ${i + 1}`),
        fields,
        cost,
        h('button', {
          type: 'button', class: 'link danger',
          onclick: () => { p.income.sacrifices.splice(i, 1); ctx.changed(); redraw(); changed(); },
        }, 'Remove')));
  }

  FP.sacrificeEditor = { render, realCost };
})(globalThis.FP = globalThis.FP || {});
