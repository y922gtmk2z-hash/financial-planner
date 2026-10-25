/*
 * "Money left over each month": how much is left each month after spending, debts
 * and regular savings, what you want to do with it (the split the projection
 * uses), and suggestions based on your figures. Used on Setup and Future.
 */
(function (FP) {
  'use strict';

  const { h, money } = FP.dom;
  const TONE_ICON = { warn: '!', tip: 'i', good: '✓' };
  const SPLIT_COLORS = { emergency: '--series-1', debts: '--series-8', cash: '--series-3', invest: '--series-7', mortgage: '--series-2', pension: '--series-5' };

  /*
   * opts.onChange: called after the split changes (e.g. to redraw a projection).
   * opts.fold: fold the card to a one-line summary (open while nothing's chosen).
   * Returns the card; card.refresh() updates the figures without touching inputs.
   */
  function render(ctx, opts) {
    opts = opts || {};
    const body = h('div', { class: 'leftover-body' });
    const sum = h('span');
    const card = opts.fold
      ? FP.dom.foldCard(opts.id || 'leftover', 'Money left over each month', sum, body)
      : h('section', { class: 'card leftover', id: opts.id || null, 'aria-labelledby': 'leftover-h' }, body);
    card.classList.add('leftover');
    const choose = h('p', { class: 'help' }, 'Your plan only saves it once you choose what to do with it.');
    const headline = h('div', { class: 'leftover-amount', role: 'status', 'aria-live': 'polite' });
    const rows = h('div', { class: 'leftover-rows' });
    const status = h('p', { class: 'split-status', role: 'status' });
    const alloc = h('div', { class: 'alloc' });
    const suggested = h('div', { class: 'suggested-split' });
    const ideas = h('ul', { class: 'ideas' });
    const amounts = {};
    const unitHolder = h('div', { class: 'leftover-unit' });
    const fundStatus = h('p', { class: 'help fund-status', role: 'status' });

    const changed = () => { if (opts.onChange) opts.onChange(); };

    const leftNow = () => FP.summary.compute(ctx.profile(), FP.tax.household(ctx.profile()).takeHomeMonthly).cashFlow.surplus;

    function drawFields() {
      const p = ctx.profile();
      const unit = p.leftover.unit === 'gbp' ? 'gbp' : 'pct';
      const target = FP.profile.EMERGENCY_MONTHS_FIELD;
      // Enter the split as % of what's left or as £ a month; switching converts what you've entered.
      FP.dom.fill(unitHolder, FP.field.render({
        label: 'Enter it as', type: 'toggle',
        options: [{ value: 'pct', label: '% of what\u2019s left' }, { value: 'gbp', label: '\u00a3 a month' }],
      }, {
        value: unit, compact: true,
        onChange: (v) => {
          const left = leftNow();
          const pct = FP.projection.splitAsPct(p.leftover, left);
          p.leftover.unit = v;
          FP.projection.setSplitFromPct(p.leftover, pct, left);
          ctx.changed();
          drawFields();
          refresh();
          changed();
        },
      }));
      FP.dom.fill(rows, FP.profile.LEFTOVER_FIELDS.map((base) => {
        const f = FP.profile.leftoverField(base, unit);
        amounts[f.key] = h('span', { class: 'leftover-money' });
        return h('div', { class: `leftover-row${f.key === 'emergency' ? ' emergency' : ''}` },
          FP.field.render(f, {
            value: p.leftover[f.key], foldHelp: true,
            onChange: (v) => { ctx.update(`leftover.${f.key}`, v); refresh(); changed(); },
            extra: amounts[f.key],
          }),
          // The fund's target only matters once some money goes to it.
          f.key === 'emergency' ? h('div', { class: 'fund-target' },
            FP.field.render(target, {
              value: p.leftover[target.key], foldHelp: true,
              onChange: (v) => { ctx.update(`leftover.${target.key}`, v); refresh(); changed(); },
            }),
            fundStatus) : null);
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
          : 'Put a share of what\u2019s left over each month here to build it up.');
    }

    function refresh() {
      const p = ctx.profile();
      const r = FP.suggest.analyse(p);
      const cf = r.today.cashFlow;
      const shares = FP.projection.splitShares(p.leftover, r.left);
      const left = Math.max(0, r.left || 0);
      const byAmount = p.leftover.unit === 'gbp';
      const pct = FP.projection.splitAsPct(p.leftover, left);

      FP.dom.fill(headline,
        h('span', { class: 'eyebrow' }, 'Left over each month'),
        h('strong', { class: r.left < 0 ? 'negative' : null }, r.left < 0 ? `−${money(-r.left)}` : money(r.left)),
        h('span', { class: 'muted small' },
          `${money(cf.takeHomeMonthly)} take-home − ${money(cf.spendingMonthly)} spending − ${money(cf.mortgageMonthly + cf.debtMonthly)} mortgage and debts`,
          cf.savingsMonthly > 0 ? ` − ${money(cf.savingsMonthly)} regular savings` : '',
          '. Bonus months add more.'));

      // Each choice in the other unit, for reference.
      FP.profile.LEFTOVER_FIELDS.forEach((f) => {
        if (!amounts[f.key]) return;
        amounts[f.key].textContent = byAmount
          ? (left > 0 ? `= ${Math.round(pct[f.key])}% of what\u2019s left` : '')
          : `= ${money(left * shares[f.key])} a month`;
      });
      drawFund(r, shares, left);
      rows.querySelectorAll('.fund-target').forEach((el) => { el.hidden = !(shares.emergency > 0); });
      drawAlloc(shares, left);
      FP.screens.future.drawSplitStatus(status, p.leftover, r.left);
      // Under 100% is said in the allocation notice; the line below covers the rest.
      status.hidden = shares.status === 'under';

      if (r.split) {
        const same = FP.profile.LEFTOVER_FIELDS.every((f) => Math.abs((pct[f.key] || 0) - r.split[f.key]) < 0.5);
        FP.dom.fill(suggested,
          h('p', null, h('strong', null, 'Suggested split: '),
            FP.profile.LEFTOVER_FIELDS.filter((f) => r.split[f.key] > 0).map((f) => `${r.split[f.key]}% ${f.label.toLowerCase()} (${money(left * r.split[f.key] / 100)})`).join(' · ')),
          h('p', { class: 'muted small' }, r.splitReason),
          same
            ? h('p', { class: 'small positive' }, '✓ You’re using this split.')
            : h('button', {
              type: 'button', class: 'secondary small',
              onclick: () => {
                // The same change as "Use the suggested split" on Actions.
                const act = FP.suggest.splitAction(p, r);
                if (act) Object.assign(p.leftover, FP.patch.applyPatch(p, act.patch).leftover);
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

      drawIdeas(r.suggestions);

      // The one-line summary when folded, and the nudge while nothing's chosen.
      const state = !(r.left > 0) ? 'nothing left over'
        : shares.total === 0 ? 'nothing chosen yet'
          : hasOwnSplit(p) ? 'your own split' : 'using the suggested split';
      sum.textContent = `${money(Math.max(0, r.left || 0))} a month \u00b7 ${state}`;
      choose.hidden = shares.total > 0;
    }

    // One bar across your choices, a running total, and what's left unallocated.
    function drawAlloc(shares, left) {
      const keys = FP.profile.LEFTOVER_FIELDS.filter((f) => shares[f.key] > 0);
      const allocated = keys.reduce((t, f) => t + shares[f.key], 0);
      const rest = Math.max(0, 1 - allocated);
      // Nothing chosen yet: the line above the suggestion already says so.
      if (!(left > 0) || allocated === 0) { FP.dom.fill(alloc); alloc.hidden = true; return; }
      alloc.hidden = false;
      const label = keys.map((f) => `${f.label} ${Math.round(shares[f.key] * 100)}%`)
        .concat(rest > 0.0005 ? [`not allocated ${Math.round(rest * 100)}%`] : []).join(', ');
      const key = FP.chart.legend(keys.map((f) => ({ label: f.label, color: SPLIT_COLORS[f.key], value: left * shares[f.key] }))
        .concat(rest > 0.0005 ? [{ label: 'Not allocated', color: '--surface-2', value: left * rest }] : []));
      if (rest > 0.0005) {
        const sw = key.lastChild.querySelector('.swatch');
        sw.removeAttribute('style');
        sw.classList.add('alloc-rest');
      }
      FP.dom.fill(alloc,
        h('p', { class: 'alloc-total' }, h('strong', null, `${money(left * allocated)} of ${money(left)} a month`), ` allocated (${Math.round(allocated * 100)}%)`),
        h('div', { class: 'alloc-bar', role: 'img', 'aria-label': `How what\u2019s left is shared out: ${label || 'nothing chosen yet'}` },
          keys.map((f) => h('span', { class: 'alloc-seg', style: `flex-grow:${shares[f.key]};background:var(${SPLIT_COLORS[f.key]})` })),
          rest > 0.0005 ? h('span', { class: 'alloc-seg alloc-rest', style: `flex-grow:${rest}` }) : null),
        key,
        rest > 0.0005 ? h('p', { class: 'notice warn alloc-notice' },
          h('span', { class: 'notice-icon', 'aria-hidden': 'true' }, '!'),
          `${money(left * rest)} a month is not allocated and is treated as spent.`) : null);
    }

    // Ideas you can tick off or hide; those go into a folded list you can bring back from.
    function drawIdeas(list) {
      const p = ctx.profile();
      const marks = p.ideas || (p.ideas = {});
      const mark = (id, v) => {
        if (v) marks[id] = v; else delete marks[id];
        ctx.changed();
        drawIdeas(list);
      };
      const open = list.filter((s) => s.tone === 'good' || !marks[s.id]);
      const put = list.filter((s) => s.tone !== 'good' && marks[s.id]);
      const idea = (s, actions) => h('li', { class: `idea ${s.tone}` },
        h('span', { class: 'idea-icon', 'aria-hidden': 'true' }, TONE_ICON[s.tone]),
        h('div', null, h('strong', null, s.title), h('p', null, s.text), actions));
      FP.dom.fill(ideas,
        open.map((s) => idea(s, s.tone === 'good' ? null : h('div', { class: 'idea-actions' },
          h('button', { type: 'button', class: 'link', onclick: () => mark(s.id, 'done'), 'aria-label': `Mark \u201c${s.title}\u201d as done` }, '\u2713 Done'),
          h('button', { type: 'button', class: 'link muted', onclick: () => mark(s.id, 'hidden'), 'aria-label': `Hide \u201c${s.title}\u201d` }, 'Not for me')))),
        put.length ? h('li', { class: 'ideas-put-away' }, h('details', null,
          h('summary', null, `${put.length} done or hidden`),
          h('ul', { class: 'ideas' }, put.map((s) => idea(s, h('div', { class: 'idea-actions' },
            h('span', { class: 'muted small' }, marks[s.id] === 'done' ? '\u2713 Done' : marks[s.id] === 'applied' ? '\u2713 Applied' : 'Hidden'),
            h('button', { type: 'button', class: 'link', onclick: () => mark(s.id, null) }, 'Bring back'))))))) : null);
    }

    // The suggested split comes first; choosing your own is folded away (open
    // once you have a split of your own), and so are the ideas.
    const own = h('details', { class: 'advanced', id: 'own-split' },
      h('summary', null, 'Choose your own split'),
      h('p', { class: 'help' }, 'Share it out as a share of what\u2019s left or as amounts a month (which rise with prices). Anything you don\u2019t allocate is treated as spent.'),
      unitHolder,
      rows);
    FP.dom.fill(body,
      opts.fold ? null : h('h2', { id: 'leftover-h' }, 'Money left over each month'),
      headline,
      choose,
      suggested,
      alloc,
      status,
      own,
      h('details', { class: 'advanced', id: 'ideas-box' },
        h('summary', null, 'Ideas based on your figures'),
        h('p', { class: 'help' }, 'General rules of thumb to consider \u2014 not financial advice.'),
        ideas));
    ideas.id = 'ideas';
    drawFields();
    refresh();
    own.open = hasOwnSplit(ctx.profile());
    if (opts.fold) {
      const left = leftNow();
      card.open = left > 0 && FP.projection.splitShares(ctx.profile().leftover, left).total === 0;
    }
    card.refresh = refresh;
    return card;
  }

  // Whether you've chosen a split that isn't the suggested one (or there's no suggestion).
  function hasOwnSplit(p) {
    const r = FP.suggest.analyse(p);
    if (!r.split) return true;
    const mine = FP.projection.splitAsPct(p.leftover, Math.max(0, r.left || 0));
    const chosen = FP.projection.splitShares(p.leftover, r.left).total > 0;
    return chosen && !FP.profile.LEFTOVER_FIELDS.every((f) => Math.abs((mine[f.key] || 0) - r.split[f.key]) < 0.5);
  }

  FP.leftoverCard = { render };
})(globalThis.FP = globalThis.FP || {});
