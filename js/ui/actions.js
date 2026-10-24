/*
 * Actions: one card per idea, ranked by what it does for you, with Apply (to the
 * scenario you're editing, with Undo), Try as a scenario, Done / Not for me,
 * how to do it, and a calendar reminder. Opened from Your plan's Next steps.
 */
(function (FP) {
  'use strict';

  const { h, money } = FP.dom;
  const TONE_ICON = { warn: '!', tip: 'i' };
  const MARKED = { done: '✓ Done', hidden: 'Not for me', applied: '✓ Applied to your plan' };

  // The ideas worth acting on (not the "already fine" ones), plus the suggested split.
  function actionsFor(p) {
    const r = FP.suggest.analyse(p);
    const list = r.suggestions.filter((s) => s.tone !== 'good');
    const split = FP.suggest.splitAction(p, r);
    // "Build your emergency fund" already means using the suggested split: one
    // card, making exactly the change the split action makes.
    const fund = list.find((s) => s.id === 'emergency');
    if (fund && split) { fund.patch = split.patch; return list; }
    return list.concat(split || []);
  }
  // Ones you haven't marked done, not for you or applied.
  const openActions = (p) => actionsFor(p).filter((x) => !(p.ideas || {})[x.id]);

  // A scenario's name for an action: what it changes.
  function scenarioName(x, p) {
    const c = x.patch[0];
    if (x.id === 'relief' || x.id === 'taper') return `Pension +${c.value}%`;
    if (x.id === 'mortgage') return `Overpay ${money((p.mortgage.monthlyOverpayment || 0) + c.value)} a month`;
    if (x.id === 'isa') return `ISA ${money(c.value[c.value.length - 1].monthly)} a month`;
    if (x.id === 'debt') return `Pay ${money(c.value)} more off debts`;
    if (x.id === 'split') return 'Suggested split';
    return x.title;
  }

  // "+£210 a month in retirement", "saves £1,900 interest", "£84 a month less left over now".
  function figureText(f, p) {
    const years = (n) => `${n} ${n === 1 ? 'year' : 'years'}`;
    const ahead = FP.dom.far(p.assumptions.retirementAge - p.about.age);
    switch (f.key) {
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
    noSurplus: 'Nothing left over each month', split: 'Use the suggested split',
  };

  const firstSentence = (text) => { const m = text.match(/^.*?[.!?](?=\s|$)/); return m ? m[0] : text; };

  // What you applied this visit, so you can undo it: { [id]: { before, after } }.
  const undoable = {};

  function render(root, ctx) {
    const p = ctx.profile();
    const list = h('div', { class: 'action-list', 'aria-busy': 'true' },
      h('p', { class: 'muted', role: 'status' }, 'Working out what each idea would do for you…'));
    FP.dom.add(root,
      FP.dom.pageHead('Actions', 'What to do next, biggest gain first'),
      h('p', { class: 'lead' }, 'Each one is a change you could make. Apply it to your plan, try it as a scenario first, or set a reminder. General rules of thumb, not advice.'),
      list);
    // Ranking re-runs the plan for each idea, so the page shows first.
    setTimeout(() => {
      if (!list.isConnected) return;
      const all = actionsFor(p);
      const marks = p.ideas || {};
      const open = FP.suggest.rankActions(all.filter((x) => !marks[x.id]));
      // Everything you've marked, including ideas your figures no longer bring up.
      const put = Object.keys(marks).map((k) => all.find((x) => x.id === k) || { id: k, title: NAMES[k] || k });
      list.removeAttribute('aria-busy');
      FP.dom.fill(list,
        open.length ? h('ol', { class: 'actions' }, open.map((x) => card(x, ctx))) : h('section', { class: 'card' },
          h('p', null, 'Nothing to act on right now. Your figures change over time, so check back after you update them.')),
        put.length ? h('details', { class: 'card fold-card', id: 'actions-put-away' },
          h('summary', null, h('span', { class: 'fold-title' }, `${put.length} done, applied or not for you`), h('span', { class: 'fold-sum' }, 'Bring any back')),
          h('ul', { class: 'actions put-away' }, put.map((x) => putAway(x, ctx)))) : null,
        FP.dom.cardFoot('#setup', 'Edit your figures'));
    }, 0);
  }

  function card(x, ctx) {
    const p = ctx.profile();
    const figs = x.patch ? FP.suggest.highlights(x) : [];
    const id = `act-${x.id}`;
    // Costing more each month than is left over would leave you short.
    const cost = figs.find((f) => f.key === 'leftoverCost');
    const left = FP.summary.compute(p, FP.tax.forProfile(p).takeHomeMonthly).cashFlow.surplus;
    const tooMuch = cost && cost.value > Math.max(0, left || 0) + 0.5;
    return h('li', { class: `card action ${x.tone}`, 'aria-labelledby': `${id}-h` },
      h('div', { class: 'action-head' },
        h('span', { class: 'idea-icon', 'aria-hidden': 'true' }, TONE_ICON[x.tone] || 'i'),
        h('h2', { id: `${id}-h` }, x.title)),
      h('p', null, firstSentence(x.text)),
      figs.length ? h('ul', { class: 'action-figures', 'aria-label': 'What it would do' },
        figs.map((f) => h('li', { class: COSTS.includes(f.key) ? 'cost' : 'gain' }, figureText(f, p)))) : null,
      tooMuch ? h('p', { class: 'notice warn' }, h('span', { class: 'notice-icon', 'aria-hidden': 'true' }, '!'),
        `That\u2019s more than the ${money(Math.max(0, left))} a month you have left over now, so you\u2019d be short each month. Free up some spending first, or make a smaller change in Your figures.`) : null,
      x.patch ? h('div', { class: 'button-row' },
        h('button', { type: 'button', class: 'small', onclick: () => apply(x, ctx) }, 'Apply'),
        h('button', { type: 'button', class: 'small secondary', onclick: () => tryIt(x, ctx) }, 'Try as a scenario')) : null,
      h('div', { class: 'idea-actions' },
        h('button', { type: 'button', class: 'link', onclick: () => mark(x, 'done', ctx), 'aria-label': `Mark “${x.title}” as done` }, '✓ Done'),
        h('button', { type: 'button', class: 'link muted', onclick: () => mark(x, 'hidden', ctx), 'aria-label': `“${x.title}” is not for me` }, 'Not for me')),
      x.howTo.length ? h('details', { class: 'advanced', id: `${id}-how` },
        h('summary', null, 'How to do it'),
        h('ol', { class: 'how-to' }, x.howTo.map((step) => h('li', null, step)))) : null,
      remindMe(x, id));
  }

  // Applies the change to the scenario you're editing, with Undo.
  function apply(x, ctx) {
    const before = JSON.parse(JSON.stringify(ctx.profile()));
    const after = FP.patch.applyPatch(before, x.patch);
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

  function tryIt(x, ctx) {
    const ws = ctx.workspace();
    const p = ctx.profile();
    const sc = FP.scenarios.addProfile(ws, FP.patch.applyPatch(p, x.patch), scenarioName(x, p));
    if (!sc) { ctx.toast(`You have ${FP.scenarios.MAX_SCENARIOS} scenarios already. Delete one on Scenarios to add another.`); return; }
    ctx.changed();
    ctx.go('scenarios');
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
  FP.screens.actions = { title: 'Actions', render, openActions };
})(globalThis.FP = globalThis.FP || {});
