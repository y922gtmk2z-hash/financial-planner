/*
 * Workplace benefits editor: private medical insurance and other taxable
 * benefits (benefits in kind). Each shows what it costs you in tax.
 */
(function (FP) {
  'use strict';

  const { h, money } = FP.dom;

  // Extra tax a month for one benefit.
  function taxCost(profile, index) {
    const withAll = FP.tax.forProfile(profile).takeHome;
    const others = profile.income.benefits.filter((_, i) => i !== index);
    const without = FP.tax.forProfile({ ...profile, income: { ...profile.income, benefits: others } }).takeHome;
    return (without - withAll) / 12;
  }

  function render(ctx) {
    const wrap = h('div', { class: 'benefit-editor', id: 'benefits', role: 'group', 'aria-labelledby': 'benefit-h' });
    const draw = () => {
      const p = ctx.profile();
      const list = p.income.benefits;
      const full = list.length >= FP.profile.MAX_BENEFITS;
      const add = (type, label) => h('button', {
        type: 'button', class: 'secondary small', disabled: full,
        onclick: () => {
          list.push(FP.profile.newBenefit(type));
          ctx.changed();
          draw();
          const inputs = wrap.querySelectorAll('.benefit-item:last-of-type input');
          if (inputs.length) inputs[inputs.length - 1].focus();
        },
      }, label);
      FP.dom.fill(wrap,
        h('h3', { id: 'benefit-h' }, 'Workplace benefits'),
        h('p', { class: 'help' }, 'Benefits your employer pays for, such as private medical insurance. You don’t receive them as pay, but their value is taxed as income (no National Insurance for you).'),
        list.length ? null : h('p', { class: 'empty' }, 'No taxable benefits added.'),
        h('ul', { class: 'benefit-list' }, list.map((b, i) => {
          const cost = h('p', { class: 'help', role: 'status' });
          const drawCost = () => {
            const c = taxCost(ctx.profile(), i);
            cost.textContent = b.yearly > 0 ? `Costs you about ${money(c)} a month in income tax.` : '';
          };
          const li = h('li', { class: 'row-card benefit-item' },
            FP.profile.BENEFIT_FIELDS.map((f) => FP.field.render(f, {
              value: b[f.key], compact: f.key === 'type',
              onChange: (v) => { ctx.update(`income.benefits.${i}.${f.key}`, v); drawCost(); },
            })),
            cost,
            h('button', { type: 'button', class: 'link danger', onclick: () => { list.splice(i, 1); ctx.changed(); draw(); } }, 'Remove'));
          drawCost();
          return li;
        })),
        h('div', { class: 'button-row' },
          add('medical', '+ Private medical insurance'),
          add('other', '+ Other benefit')));
    };
    draw();
    return wrap;
  }

  FP.benefitsEditor = { render };
})(globalThis.FP = globalThis.FP || {});
