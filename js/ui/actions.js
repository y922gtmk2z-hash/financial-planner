/*
 * Actions: one card per idea, ranked by its value a year (safety problems
 * first), with ideas worth under £100 a year folded under Smaller ideas and
 * ones you can't afford yet under When you have room. Each has Apply (to the
 * scenario you're editing, with Undo), Try as a scenario, Done / Not for me,
 * how to do it, and a calendar reminder. Opened from Your plan's Next steps.
 */
(function (FP) {
  'use strict';

  const { h, money } = FP.dom;
  const TONE_ICON = { warn: '!', tip: 'i' };
  const MARKED = { done: '✓ Done', hidden: 'Not for me', applied: '✓ Applied to your plan' };

  // The ideas worth acting on (not the "already fine" ones), the suggested
  // split and the typical mix for your risk level (see FP.suggest.actions).
  const actionsFor = (p) => FP.suggest.actions(p, { cashKnown: FP.checklist.cashKnown(p) });
  // Ones you haven't marked done, not for you or applied.
  const openActions = (p) => actionsFor(p).filter((x) => !(p.ideas || {})[x.id]);

  // A scenario's name for an action: what it changes (patch: the change made, if not its own).
  function scenarioName(x, p, patch) {
    const c = (patch || x.patch)[0];
    if (x.id === 'relief' || x.id === 'taper') return `Pension +${c.value}%`;
    if (x.id === 'mortgage') return `Overpay ${money((p.mortgage.monthlyOverpayment || 0) + c.value)} a month`;
    if (x.id === 'isa') return `ISA ${money(c.value.slice(p.savings.length).reduce((t, r) => t + r.monthly, 0))} a month`;
    if (x.id === 'debt') return `Pay ${money(c.value)} more off debts`;
    if (x.id === 'split') return 'Suggested split';
    if (x.id === 'mix') return `Typical ${p.about.riskAppetite} mix`;
    return x.title;
  }

  // "+£2,520 a year in retirement", "saves about £410 interest a year", "£84 a month less left over now".
  function figureText(f, p) {
    const years = (n) => `${n} ${n === 1 ? 'year' : 'years'}`;
    const ahead = FP.dom.far(p.assumptions.retirementAge - p.about.age);
    const cover = (n) => `${n >= 24 ? 'over 24' : (Math.round(n * 10) / 10).toLocaleString('en-GB')} month${n === 1 ? '' : 's'}`;
    switch (f.key) {
      case 'retirementPerYear': return `+${money(f.value, { approx: ahead })} a year to spend in retirement`;
      case 'interestPerYear': return `saves about ${money(f.value)} interest a year`;
      case 'taxPerYear': return `saves about ${money(f.value)} tax a year`;
      case 'paymentRise': return `payments up about ${money(f.value)} a month`;
      case 'coverNow': return `covers ${cover(f.value)} of outgoings now`;
      case 'coverIn': return `${f.target} months covered in ${FP.suggest.duration(f.value)}`;
      case 'retirementSpend': return `+${money(f.value, { approx: ahead })} a month in retirement`;
      case 'interestSaved': return `saves ${money(f.value, { approx: true })} interest`;
      case 'debtFreeSooner': return `debt-free ${years(f.value)} sooner`;
      case 'lastsLonger': return `money lasts ${years(f.value)} longer`;
      case 'atRetirement': return `+${money(f.value, { approx: ahead })} in savings and pensions at ${p.assumptions.retirementAge}`;
      case 'leftoverCost': return `${money(f.value)} a month less left over now`;
      case 'retirementSpendCost': return `${money(f.value, { approx: ahead })} a month less in retirement`;
      case 'interestCost': return `${money(f.value, { approx: true })} more interest`;
      case 'debtFreeLater': return `debt-free ${years(f.value)} later`;
      default: return '';
    }
  }

  const COSTS = ['leftoverCost', 'retirementSpendCost', 'interestCost', 'debtFreeLater'];

  // Names for ideas you've marked that aren't suggested right now (your figures have changed).
  const NAMES = {
    relief: 'Higher-rate pension relief', taper: 'Use your pension to avoid the 60% band', match: 'Check for employer matching',
    isa: 'Use your ISA allowance', mortgage: 'Overpay the mortgage', mortgageLow: 'Your mortgage is cheap',
    debt: 'Clear your most expensive debt first', emergency: 'Build your emergency fund', studentLoan: 'Don\u2019t rush to overpay your student loan',
    noSurplus: 'Nothing left over each month', split: 'Use the suggested split', mix: 'Use a typical mix for your risk level',
    claimRelief: 'Claim higher-rate pension relief', claimReliefPartner: 'Claim your partner\u2019s higher-rate pension relief',
    fixEnds: 'Your fixed rate ends soon', statePension: 'Check your State Pension record', statePensionPartner: 'Check your partner\u2019s State Pension record',
  };

  const firstSentence = (text) => { const m = text.match(/^.*?[.!?](?=\s|$)/); return m ? m[0] : text; };

  // What you applied this visit, so you can undo it: { [id]: { before, after } }.
  const undoable = {};

  function render(root, ctx) {
    const p = ctx.profile();
    const list = h('div', { class: 'action-list', 'aria-busy': 'true' },
      h('p', { class: 'muted', role: 'status' }, 'Working out what each idea would do for you…'));
    FP.dom.add(root,
      FP.dom.pageHead('Actions', 'What to do next, most valuable first'),
      h('p', { class: 'lead' }, 'Each one is a change you could make. Apply it to your plan, try it as a scenario first, or set a reminder. General rules of thumb, not advice.'),
      list);
    // Ranking re-runs the plan for each idea, so the page shows first.
    setTimeout(() => {
      if (!list.isConnected) return;
      const all = actionsFor(p);
      const marks = p.ideas || {};
      const g = FP.suggest.groupActions(all.filter((x) => !marks[x.id]));
      // Everything you've marked, including ideas your figures no longer bring up.
      const put = Object.keys(marks).map((k) => all.find((x) => x.id === k) || { id: k, title: NAMES[k] || k });
      list.removeAttribute('aria-busy');
      FP.dom.fill(list,
        g.main.length ? h('ol', { class: 'actions' }, g.main.map((x) => card(x, ctx, { later: !!(x.afford && x.afford.none) }))) : h('section', { class: 'card' },
          h('p', null, g.smaller.length || g.later.length ? 'Nothing big to act on right now: see the ideas below.' : 'Nothing to act on right now. Your figures change over time, so check back after you update them.')),
        g.smaller.length ? h('details', { class: 'card fold-card', id: 'actions-smaller' },
          h('summary', null, h('span', { class: 'fold-title' }, 'Smaller ideas'), h('span', { class: 'fold-sum' }, `${g.smaller.length} worth under ${money(FP.suggest.SMALL_VALUE)} a year`)),
          h('ol', { class: 'actions' }, g.smaller.map((x) => card(x, ctx)))) : null,
        g.later.length ? h('section', { class: 'card fold-card later', id: 'actions-later', 'aria-labelledby': 'actions-later-h' },
          h('h2', { id: 'actions-later-h' }, 'When you have room'),
          h('p', { class: 'muted' }, 'These cost more each month than you have left over now. Free up some room first.'),
          h('ul', { class: 'actions' }, g.later.map((x) => card(x, ctx, { later: true })))) : null,
        put.length ? h('details', { class: 'card fold-card', id: 'actions-put-away' },
          h('summary', null, h('span', { class: 'fold-title' }, `${put.length} done, applied or not for you`), h('span', { class: 'fold-sum' }, 'Bring any back')),
          h('ul', { class: 'actions put-away' }, put.map((x) => putAway(x, ctx)))) : null,
        FP.dom.cardFoot('#setup', 'Edit your figures'));
    }, 0);
  }

  // opts.later: nothing affordable yet, so no Apply.
  function card(x, ctx, opts) {
    const p = ctx.profile();
    const later = !!(opts && opts.later);
    const figs = FP.suggest.highlights(x);
    const id = `act-${x.id}`;
    const af = x.afford;
    // More than is left over: offer what you can afford instead.
    const scaled = af && af.scaled;
    const patch = scaled ? scaled.patch : x.patch;
    const left = Math.max(0, FP.summary.compute(p, FP.tax.household(p).takeHomeMonthly).cashFlow.surplus || 0);
    return h('li', { class: `card action ${x.tone}`, 'aria-labelledby': `${id}-h` },
      h('div', { class: 'action-head' },
        h('span', { class: 'idea-icon', 'aria-hidden': 'true' }, TONE_ICON[x.tone] || 'i'),
        h('h2', { id: `${id}-h` }, x.title)),
      h('p', null, firstSentence(x.text)),
      x.tradeOff ? h('p', { class: 'help' }, x.tradeOff) : null,
      x.notice ? h('p', { class: 'notice info mix-notice' }, h('span', { class: 'notice-icon', 'aria-hidden': 'true' }, 'i'), h('span', null, x.notice)) : null,
      figs.length && !later ? h('ul', { class: 'action-figures', 'aria-label': 'What it would do' },
        figs.map((f) => h('li', { class: COSTS.includes(f.key) ? 'cost' : 'gain' }, figureText(f, p)))) : null,
      later && af ? h('p', { class: 'help' }, `It would cost about ${money(af.cost)} a month; you have ${money(left)} left over now.`) : null,
      scaled ? h('p', { class: 'help afford-note' }, `The full change would cost ${money(af.cost)} a month, more than the ${money(left)} you have left over, so this is the part you can afford.`) : null,
      x.link ? h('p', null, h('a', { href: x.link.href, rel: 'noopener noreferrer', target: '_blank' }, x.link.text)) : null,
      patch && !later ? h('div', { class: 'button-row' },
        h('button', { type: 'button', class: 'small', onclick: () => apply(x, ctx, patch) }, scaled ? `Apply ${money(scaled.monthly)} a month (what you can afford)` : 'Apply'),
        h('button', { type: 'button', class: 'small secondary', onclick: () => tryIt(x, ctx, patch) }, 'Try as a scenario')) : null,
      h('div', { class: 'idea-actions' },
        h('button', { type: 'button', class: 'link', onclick: () => mark(x, 'done', ctx), 'aria-label': `Mark “${x.title}” as done` }, '✓ Done'),
        h('button', { type: 'button', class: 'link muted', onclick: () => mark(x, 'hidden', ctx), 'aria-label': `“${x.title}” is not for me` }, 'Not for me')),
      x.howTo.length ? h('details', { class: 'advanced', id: `${id}-how` },
        h('summary', null, 'How to do it'),
        h('ol', { class: 'how-to' }, x.howTo.map((step) => h('li', null, step)))) : null,
      remindMe(x, id));
  }

  // Applies the change to the scenario you're editing, with Undo.
  function apply(x, ctx, patch) {
    const before = JSON.parse(JSON.stringify(ctx.profile()));
    const after = FP.patch.applyPatch(before, patch || x.patch);
    after.ideas = { ...after.ideas, [x.id]: 'applied' };
    ctx.replaceProfile(after);
    undoable[x.id] = { before, after: JSON.stringify(ctx.profile()) };
    ctx.toast(`Applied: ${x.title}`, { action: { label: 'Undo', run: () => undo(x, ctx) } });
  }

  // Puts the plan back as it was, unless it's been changed since.
  function canUndo(x, ctx) {
    const u = undoable[x.id];
    return !!u && JSON.stringify(ctx.profile()) === u.after;
  }
  function undo(x, ctx) {
    if (!canUndo(x, ctx)) { ctx.toast('Your plan has changed since, so this can’t be undone here.'); return; }
    const u = undoable[x.id];
    delete undoable[x.id];
    ctx.replaceProfile(u.before);
    ctx.toast(`Undone: ${x.title}`);
  }

  function tryIt(x, ctx, patch) {
    const ws = ctx.workspace();
    const p = ctx.profile();
    const sc = FP.scenarios.addProfile(ws, FP.patch.applyPatch(p, patch || x.patch), scenarioName(x, p, patch));
    if (!sc) { ctx.toast(`You have ${FP.scenarios.MAX_SCENARIOS} scenarios already. Delete one on What if to add another.`); return; }
    ctx.changed();
    ctx.go('what-if');
    ctx.toast(`Added “${sc.name}” — compare it with your plan`);
  }

  function mark(x, v, ctx) {
    const p = ctx.profile();
    p.ideas = p.ideas || {};
    if (v) p.ideas[x.id] = v; else delete p.ideas[x.id];
    ctx.changed();
    ctx.rerender();
  }

  function putAway(x, ctx) {
    const v = ctx.profile().ideas[x.id];
    return h('li', { class: 'action put' },
      h('strong', null, x.title),
      h('div', { class: 'idea-actions' },
        h('span', { class: 'muted small' }, MARKED[v] || ''),
        v === 'applied' && canUndo(x, ctx) ? h('button', { type: 'button', class: 'link', onclick: () => undo(x, ctx) }, 'Undo') : null,
        h('button', { type: 'button', class: 'link', onclick: () => mark(x, null, ctx) }, 'Bring back')));
  }

  // A calendar reminder on a date you pick, downloaded as an .ics file.
  function remindMe(x, id) {
    const inWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const local = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const date = h('input', { type: 'date', id: `${id}-date`, value: local(inWeek), min: local(new Date()) });
    const err = h('p', { class: 'field-error', role: 'alert', hidden: true });
    const go = () => {
      const text = FP.ics.reminder({
        date: date.value,
        title: x.title,
        description: [firstSentence(x.text)].concat(x.howTo.map((s, i) => `${i + 1}. ${s}`)).join('\n'),
      });
      err.hidden = !!text;
      err.textContent = text ? '' : 'Choose a date for the reminder.';
      if (!text) return;
      const url = URL.createObjectURL(new Blob([text], { type: 'text/calendar;charset=utf-8' }));
      const a = h('a', { href: url, download: `reminder-${x.id}.ics` });
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    };
    return h('details', { class: 'advanced', id: `${id}-remind` },
      h('summary', null, 'Remind me'),
      h('div', { class: 'field' },
        h('label', { for: `${id}-date` }, 'On'),
        h('div', { class: 'input-wrap' }, date)),
      err,
      h('button', { type: 'button', class: 'small secondary', onclick: go }, 'Download a calendar reminder'),
      h('p', { class: 'help' }, 'An .ics file for your calendar app. It’s made in your browser; nothing is sent anywhere.'));
  }

  FP.screens = FP.screens || {};
  // An idea's name: as it's suggested now, or its usual name.
  function nameOf(id, p) {
    const x = actionsFor(p).find((a) => a.id === id);
    return x ? x.title : NAMES[id] || id;
  }

  FP.screens.actions = { title: 'Actions', render, openActions, actionsFor, nameOf, figureText };
})(globalThis.FP = globalThis.FP || {});
