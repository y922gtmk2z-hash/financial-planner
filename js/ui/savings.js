/*
 * Regular savings editor: monthly amounts into cash savings, a cash ISA or a
 * stocks & shares ISA. Shown in Setup; feeds cash flow and projections.
 */
(function (FP) {
  'use strict';

  const { h, money } = FP.dom;

  // opts.embedded: a part of another card (with an h3) rather than its own card.
  function render(ctx, opts) {
    const embedded = !!(opts && opts.embedded);
    const card = h(embedded ? 'div' : 'section', { class: embedded ? 'savings-part' : 'card', id: 'savings', 'aria-labelledby': 'sec-savings' });
    const totals = h('div', { class: 'savings-totals', role: 'status' });

    const drawTotals = () => {
      const p = ctx.profile();
      const t = FP.savings.monthlyTotals(p.savings);
      const a = p.assumptions;
      // Each of you has your own ISA allowance: a saving is yours unless it's your partner's.
      const isaLines = FP.profile.people(p).map((x) => {
        const mine = FP.savings.monthlyTotals(p.savings.filter((sv) => (sv.owner === 'partner' && p.partner ? 1 : 0) === x.index));
        const isaYear = (mine.cashIsa + mine.ssIsa) * 12;
        return mine.cashIsa + mine.ssIsa > 0
          ? h('p', { class: `muted small${isaYear > a.isaAllowance ? ' negative' : ''}` },
            `ISA payments: ${money(isaYear)} of ${FP.profile.whose(p, x.index)} ${money(a.isaAllowance)} allowance this year.`,
            mine.cashIsa * 12 > a.cashIsaLimit ? ` From April 2027, under-65s can put at most ${money(a.cashIsaLimit)} a year into cash ISAs.` : '')
          : null;
      });
      FP.dom.fill(totals,
        h('div', { class: 'total-row' }, h('span', null, 'Total saved'), h('strong', null, `${money(t.total)} a month`)),
        isaLines);
    };

    const draw = () => {
      const list = ctx.profile().savings;
      const full = list.length >= FP.profile.MAX_SAVINGS;
      const add = (type, label) => h('button', {
        type: 'button', class: 'secondary small', disabled: full,
        onclick: () => {
          list.push(FP.profile.newSaving(type));
          ctx.changed();
          draw();
          const inputs = card.querySelectorAll('.saving-row input');
          if (inputs.length) inputs[inputs.length - 1].focus();
        },
      }, label);
      const fields = FP.profile.SAVING_FIELDS;
      FP.dom.fill(card,
        h(embedded ? 'h3' : 'h2', { id: 'sec-savings' }, embedded ? 'What you save' : 'Regular savings'),
        h('p', { class: embedded ? 'help' : 'muted' }, embedded
          ? 'Do you put money aside every month? Add each regular saving here. It comes out of what\u2019s left after spending and debts, and builds up your cash or ISA in the projection until you retire.'
          : 'Money you put aside every month. It comes out of what’s left after spending and debts, and builds up your cash savings or ISA in the projection until you retire.'),
        list.length ? null : h('p', { class: 'empty' }, 'No regular savings added.'),
        h('ul', { class: 'saving-list' }, list.map((sv, i) => h('li', { class: 'saving-row' },
          fields.map((f) => FP.field.render(f, {
            value: sv[f.key], compact: true,
            onChange: (v) => { ctx.update(`savings.${i}.${f.key}`, v); drawTotals(); },
          })),
          // With a partner, whose it is: an ISA uses its owner's allowance.
          ctx.profile().partner ? FP.field.render({ label: 'Whose', type: 'select', options: [
            { value: 'you', label: ctx.profile().about.name || 'You' }, { value: 'partner', label: ctx.profile().partner.name || 'Partner' }] }, {
            value: sv.owner === 'partner' ? 'partner' : 'you', compact: true, ariaLabel: `Saving ${i + 1}: whose`,
            onChange: (v) => { if (v === 'partner') sv.owner = v; else delete sv.owner; ctx.changed(); drawTotals(); },
          }) : null,
          h('button', {
            type: 'button', class: 'icon-btn', 'aria-label': `Remove saving ${i + 1}`,
            onclick: () => { list.splice(i, 1); ctx.changed(); draw(); },
          }, '×')))),
        h('div', { class: 'button-row' },
          add('cash', '+ Cash savings'),
          add('cashIsa', '+ Cash ISA'),
          add('ssIsa', '+ Stocks & shares ISA')),
        totals,
        h('p', { class: 'help' }, 'Cash and cash ISAs earn the savings rate; stocks & shares ISAs grow at the investment return after fees (see Assumptions). What\u2019s left after these is up to you, under \u201cMoney left over each month\u201d below.'));
      drawTotals();
    };
    draw();
    return card;
  }

  FP.savingsEditor = { render };
})(globalThis.FP = globalThis.FP || {});
