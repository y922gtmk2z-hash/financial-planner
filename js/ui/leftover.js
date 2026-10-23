/*
 * "Your leftover money": how much is left each month after spending, debts
 * and regular savings, what you want to do with it (the split the projection
 * uses), and suggestions based on your figures. Used on Setup and Future.
 */
(function (FP) {
  'use strict';

  const { h, money } = FP.dom;
  const TONE_ICON = { warn: '!', tip: 'i', good: '✓' };

  /*
   * opts.onChange: called after the split changes (e.g. to redraw a projection).
   * Returns the card; card.refresh() updates the figures without touching inputs.
   */
  function render(ctx, opts) {
    opts = opts || {};
    const card = h('section', { class: 'card leftover', id: opts.id || null, 'aria-labelledby': 'leftover-h' });
    const headline = h('div', { class: 'leftover-amount', role: 'status', 'aria-live': 'polite' });
    const rows = h('div', { class: 'leftover-rows' });
    const status = h('p', { class: 'split-status', role: 'status' });
    const suggested = h('div', { class: 'suggested-split' });
    const ideas = h('ul', { class: 'ideas' });
    const amounts = {};
    const fundStatus = h('p', { class: 'help fund-status', role: 'status' });

    const changed = () => { if (opts.onChange) opts.onChange(); };

    function drawFields() {
      const p = ctx.profile();
      const target = FP.profile.EMERGENCY_MONTHS_FIELD;
      FP.dom.fill(rows, FP.profile.LEFTOVER_FIELDS.map((f) => {
        amounts[f.key] = h('span', { class: 'leftover-money' });
        return h('div', { class: `leftover-row${f.key === 'emergency' ? ' emergency' : ''}` },
          FP.field.render(f, {
            value: p.leftover[f.key], compact: false,
            onChange: (v) => { ctx.update(`leftover.${f.key}`, v); refresh(); changed(); },
            extra: amounts[f.key],
          }),
          f.key === 'emergency' ? [
            FP.field.render(target, {
              value: p.leftover[target.key], compact: false,
              onChange: (v) => { ctx.update(`leftover.${target.key}`, v); refresh(); changed(); },
            }),
            fundStatus,
          ] : null);
      }));
    }

    // How full the emergency fund is, and what happens to its share.
    function drawFund(r, shares, left) {
      const e = r.emergency;
      if (!(r.essentials > 0)) { FP.dom.fill(fundStatus, 'Add your spending above to see how far your cash goes.'); return; }
      const have = `Your cash covers ${e.months >= 24 ? 'over 24' : e.months.toFixed(1)} of ${e.targetMonths} months (${money(e.target)}).`;
      if (!e.short) {
        FP.dom.fill(fundStatus, h('span', { class: 'positive' }, '✓ '), have,
          shares.emergency > 0 ? ' It’s full, so in your projection this share goes to your other choices until rising costs need a top-up.' : '');
        return;
      }
      const n = e.monthsToFill(shares.emergency);
      FP.dom.fill(fundStatus, have, ' ',
        n > 0 && left > 0
          ? `At ${money(left * shares.emergency)} a month it’s full in ${FP.suggest.duration(n)}, then this share goes to your other choices.`
          : 'Put a share of your leftover money here to build it up.');
    }

    function refresh() {
      const p = ctx.profile();
      const r = FP.suggest.analyse(p);
      const cf = r.today.cashFlow;
      const shares = FP.projection.splitShares(p.leftover);
      const left = Math.max(0, r.left || 0);

      FP.dom.fill(headline,
        h('span', { class: 'eyebrow' }, 'Left over each month'),
        h('strong', { class: r.left < 0 ? 'negative' : null }, r.left < 0 ? `−${money(-r.left)}` : money(r.left)),
        h('span', { class: 'muted small' },
          `${money(cf.takeHomeMonthly)} take-home − ${money(cf.spendingMonthly)} spending − ${money(cf.mortgageMonthly + cf.debtMonthly)} mortgage and debts`,
          cf.savingsMonthly > 0 ? ` − ${money(cf.savingsMonthly)} regular savings` : '',
          '. Bonus months add more.'));

      FP.profile.LEFTOVER_FIELDS.forEach((f) => {
        const share = f.key === 'cash' ? shares.cash : shares[f.key];
        if (amounts[f.key]) amounts[f.key].textContent = `= ${money(left * share)} a month${f.key === 'cash' && shares.status === 'under' ? ' (including the unallocated part)' : ''}`;
      });
      drawFund(r, shares, left);
      FP.screens.future.drawSplitStatus(status, p.leftover);

      if (r.split) {
        const same = FP.profile.LEFTOVER_FIELDS.every((f) => p.leftover[f.key] === r.split[f.key]);
        FP.dom.fill(suggested,
          h('p', null, h('strong', null, 'Suggested split: '),
            FP.profile.LEFTOVER_FIELDS.filter((f) => r.split[f.key] > 0).map((f) => `${r.split[f.key]}% ${f.label.toLowerCase()}`).join(' · ')),
          h('p', { class: 'muted small' }, r.splitReason),
          same
            ? h('p', { class: 'small positive' }, '✓ You’re using this split.')
            : h('button', {
              type: 'button', class: 'secondary small',
              onclick: () => {
                FP.profile.LEFTOVER_FIELDS.forEach((f) => { p.leftover[f.key] = r.split[f.key]; });
                ctx.changed();
                drawFields();
                refresh();
                changed();
                ctx.toast('Suggested split applied');
              },
            }, 'Use this split'));
      } else {
        FP.dom.fill(suggested);
      }
      suggested.hidden = !r.split;

      FP.dom.fill(ideas, r.suggestions.map((s) => h('li', { class: `idea ${s.tone}` },
        h('span', { class: 'idea-icon', 'aria-hidden': 'true' }, TONE_ICON[s.tone]),
        h('div', null, h('strong', null, s.title), h('p', null, s.text)))));
    }

    FP.dom.fill(card,
      h('h2', { id: 'leftover-h' }, 'Your leftover money'),
      headline,
      h('h3', null, 'What do you want to do with it?'),
      h('p', { class: 'help' }, 'Choose how it’s shared out each year in your projection. Anything you don’t allocate goes to cash savings.'),
      rows,
      status,
      suggested,
      h('h3', null, 'Ideas based on your figures'),
      h('p', { class: 'help' }, 'General rules of thumb to consider — not financial advice.'),
      ideas);
    drawFields();
    refresh();
    card.refresh = refresh;
    return card;
  }

  FP.leftoverCard = { render };
})(globalThis.FP = globalThis.FP || {});
