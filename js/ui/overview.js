/*
 * Overview: your plan as answers to four questions (each month, debt-free,
 * retirement, next steps). Every figure opens a detail panel where you can
 * change what drives it and see the effect.
 */
(function (FP) {
  'use strict';

  const { h, money, pct } = FP.dom;

  // Which ideas belong on which card, and the panel each card's rows open.
  const AREA_IDEAS = {
    month: ['noSurplus', 'emergency', 'isa'],
    debt: ['debt', 'mortgage', 'studentLoan'],
    retirement: ['taper', 'relief', 'match'],
  };
  const IDEA_PANEL = { noSurplus: 'leftover', emergency: 'emergency', isa: 'leftover', debt: 'leftover', mortgage: 'mortgage', studentLoan: 'studentLoan', taper: 'retirement', relief: 'retirement', match: 'retirement' };

  function render(root, ctx) {
    const p = ctx.profile();
    // Nothing entered yet: say what this is and how to start.
    if (FP.checklist.isEmpty(p)) { FP.welcome.render(root); return; }
    const pay = FP.tax.forProfile(p);
    const today = FP.summary.compute(p, pay.takeHomeMonthly);
    const ready = FP.summary.checklist(p).ready;
    const proj = ready ? FP.projection.project(p) : { ok: false };
    const a = p.assumptions;

    const warnings = today.warnings.concat(proj.ok ? proj.warnings : []);
    const seen = new Set();
    const notices = warnings.filter((w) => !seen.has(w.text) && seen.add(w.text));
    const ideas = ready ? openIdeas(p) : [];
    const panel = (id) => () => FP.explore.open(ctx, id);

    FP.dom.add(root,
      h('h1', null, 'Your plan'),
      FP.checklist.card(p),
      noticeList(notices),
      FP.backup.nudge(ctx),
      monthCard(p, today, pay, ideas, panel, ctx),
      ready && proj.ok ? debtCard(p, proj, ideas, panel, ctx) : null,
      ready && proj.ok ? retirementCard(p, proj, ideas, panel, ctx) : null,
      ready ? FP.checklist.note(p) : null,
      proj.ok ? chartCard(proj, today, a) : null,
      nextCard(ideas, a));
  }

  // Ideas you haven't ticked off or hidden, most pressing first.
  function openIdeas(p) {
    const marks = p.ideas || {};
    return FP.suggest.analyse(p).suggestions.filter((x) => x.tone !== 'good' && !marks[x.id])
      .sort((x, y) => (x.tone === 'warn' ? 0 : 1) - (y.tone === 'warn' ? 0 : 1));
  }

  // A card answering one question: a verdict, the figures behind it (each opens its
  // detail panel) and the top recommendation for it.
  function outcomeCard(id, title, verdict, rows, idea, panel) {
    return h('section', { class: 'card outcome', 'aria-labelledby': `oc-${id}` },
      h('h2', { id: `oc-${id}` }, title),
      h('p', { class: `verdict ${verdict.tone}` }, h('span', { class: 'verdict-icon', 'aria-hidden': 'true' }, verdict.tone === 'ok' ? '\u2713' : verdict.tone === 'warn' ? '!' : '\u2022'), verdict.text),
      h('ul', { class: 'outcome-rows' }, rows.filter(Boolean).map((r) => h('li', null,
        h(r.href ? 'a' : 'button', {
          class: 'outcome-row', type: r.href ? null : 'button', href: r.href || null,
          onclick: r.open || null,
          'aria-label': `${r.label}: ${r.value}${r.sub ? `, ${r.sub}` : ''}. ${r.href ? 'Open' : 'See what drives it and try changes'}`,
        },
        h('span', { class: 'row-label' }, r.label, r.sub ? h('small', null, r.sub) : null),
        h('strong', { class: r.warn ? 'negative' : null }, r.value),
        h('span', { class: 'go', 'aria-hidden': 'true' }, '\u203a'))))),
      idea ? h('button', { type: 'button', class: `card-idea ${idea.tone}`, onclick: panel(IDEA_PANEL[idea.id] || 'leftover') },
        h('span', { class: 'idea-icon', 'aria-hidden': 'true' }, idea.tone === 'warn' ? '!' : 'i'),
        h('span', null, h('strong', null, idea.title), h('span', null, firstSentence(idea.text)))) : null);
  }

  const ideaFor = (area, ideas) => ideas.find((x) => AREA_IDEAS[area].includes(x.id)) || null;

  function monthCard(p, today, pay, ideas, panel) {
    const cf = today.cashFlow;
    const left = cf.surplus;
    const e = FP.summary.checklist(p).ready ? FP.suggest.analyse(p).emergency : null;
    const verdict = !(pay.takeHomeMonthly > 0) && !(cf.spendingMonthly > 0)
      ? { tone: 'info', text: 'Add your pay and spending to see your month.' }
      : left < 0
        ? { tone: 'warn', text: `You\u2019re ${money(-left)} short each month.` }
        : FP.projection.splitShares(p.leftover, left).total === 0 && left > 0
          ? { tone: 'info', text: `${money(left)} left over each month, but you haven\u2019t chosen what to do with it, so your plan doesn\u2019t save any of it.` }
          : { tone: 'ok', text: `${money(left)} left over each month${cf.savingsMonthly > 0 ? `, after saving ${money(cf.savingsMonthly)}` : ''}.` };
    return outcomeCard('month', 'Each month', verdict, [
      { label: 'Take-home pay', value: money(pay.takeHomeMonthly), sub: 'a month', open: panel('takeHome') },
      { label: left < 0 ? 'Short each month' : 'Left over each month', value: money(Math.abs(left)), sub: 'after spending, debts and saving', warn: left < 0, open: panel('leftover') },
      e && Number.isFinite(e.months) ? { label: 'Emergency fund', value: `${e.months >= 24 ? '24+' : e.months.toFixed(1)} months`, sub: `target ${e.targetMonths}`, warn: e.short, open: panel('emergency') } : null,
    ], ideaFor('month', ideas), panel);
  }

  function debtCard(p, proj, ideas, panel) {
    const ev = proj.events;
    const rows = proj.rows;
    const end = rows[rows.length - 1];
    const sl = ev.studentLoan;
    const debts0 = (p.debts || []).reduce((t, d) => t + (d.balance || 0), 0);
    const debtsFree = debts0 > 0 ? rows.find((r, i) => i > 0 && r.debts <= 0) : null;
    const ends = [];
    const out = [];
    if (ev.hasMortgage) {
      out.push({ label: 'Mortgage-free', value: ev.mortgageFree ? `Age ${ev.mortgageFree.age}` : 'Not yet', sub: ev.mortgageFree ? String(ev.mortgageFree.year) : `still owing at ${end.age}`, open: panel('mortgage') });
      ends.push(ev.mortgageFree ? ev.mortgageFree.age : null);
    }
    if (sl && sl.tracked) {
      const age = sl.clearedRow ? sl.clearedRow.age : sl.writtenOffRow ? sl.writtenOffAge : null;
      out.push({ label: sl.clearedRow ? 'Student loan repaid' : sl.writtenOffRow ? 'Student loan written off' : 'Student loan', value: age ? `Age ${age}` : 'Still owing', sub: sl.clearedRow ? String(sl.clearedRow.year) : sl.writtenOffRow ? `April ${sl.writeOffYear}` : `at ${end.age}`, open: panel('studentLoan') });
      ends.push(age);
    } else if (p.income.studentLoanPlan !== 'none') {
      out.push({ label: 'Student loan', value: 'Add balance', sub: 'to see when it ends', open: panel('studentLoan') });
    }
    if (debts0 > 0) {
      out.push({ label: 'Other debts cleared', value: debtsFree ? `Age ${debtsFree.age}` : 'Not yet', sub: debtsFree ? String(debtsFree.year) : `still owing at ${end.age}`, open: panel('leftover') });
      ends.push(debtsFree ? debtsFree.age : null);
    }
    if (!out.length) return null;
    const verdict = ends.some((x) => x == null)
      ? { tone: 'warn', text: 'Not everything is paid off within the projection.' }
      : { tone: 'ok', text: `Debt-free at ${Math.max(...ends)}${Math.max(...ends) <= p.assumptions.retirementAge ? ', before you retire' : ''}.` };
    return outcomeCard('debt', 'Debt-free', verdict, out, ideaFor('debt', ideas), panel);
  }

  function retirementCard(p, proj, ideas, panel) {
    const a = p.assumptions;
    const ev = proj.events;
    const rs = FP.projection.retirementSpend(p);
    const goal = FP.outcomes.goalMonthly(p);
    const ret = ev.retirement ? FP.projection.toReal(proj.rows[ev.retirement.y]) : null;
    let verdict;
    if (!rs) verdict = { tone: 'info', text: `Retiring at ${a.retirementAge} is beyond the projection.` };
    else if (rs.monthly >= goal) verdict = { tone: 'ok', text: `On track: you could spend ${money(rs.monthly)} a month from ${a.retirementAge}, against your goal of ${money(goal)}.` };
    else verdict = { tone: 'warn', text: `Short by ${money(goal - rs.monthly)} a month: you could spend ${money(rs.monthly)} from ${a.retirementAge}, against your goal of ${money(goal)}.` };
    return outcomeCard('retirement', 'Retirement', verdict, [
      rs ? { label: 'You could spend', value: `${money(rs.monthly)} a month`, sub: `from ${a.retirementAge} to ${rs.endAge}, today\u2019s money`, warn: rs.monthly < goal, open: panel('retirement') } : null,
      { label: 'Your goal', value: `${money(goal)} a month`, sub: p.goals && p.goals.retirementIncome > 0 ? 'what you set' : 'what you spend now', open: panel('retirement') },
      ret ? { label: `Pension pot at ${ret.age}`, value: money(ret.pension), sub: 'today\u2019s money', open: panel('retirement') } : null,
      ev.runsOut ? { label: 'Money runs short', value: `Age ${ev.runsOut.age}`, sub: String(ev.runsOut.year), warn: true, open: panel('retirement') } : null,
    ], ideaFor('retirement', ideas), panel);
  }

  function nextCard(ideas, a) {
    return h('section', { class: 'card next-steps', 'aria-labelledby': 'next-h' },
      h('h2', { id: 'next-h' }, 'Next steps'),
      h('ul', null,
        ideas.length ? link('#setup/ideas', `${ideas.length} ${ideas.length === 1 ? 'idea' : 'ideas'} to look at`, 'Tick them off as you go \u2014 general rules of thumb, not advice') : null,
        link('#scenarios', 'Compare scenarios', 'What if you retired earlier, or overpaid the mortgage?'),
        link('#assumptions', 'Check the assumptions', `Inflation ${pct(a.inflation)}, investments ${pct(FP.growth.netRate(a.investmentReturn, a.investmentFees))} after fees, retire at ${a.retirementAge}`)));
  }

  // The first notice in full; any others behind "N more".
  function noticeList(notices) {
    if (!notices.length) return null;
    const item = (w) => h('li', { class: `notice ${w.level}` }, h('span', { class: 'notice-icon', 'aria-hidden': 'true' }, w.level === 'warn' ? '!' : 'i'), w.text);
    const sorted = notices.slice().sort((x, y) => (x.level === 'warn' ? 0 : 1) - (y.level === 'warn' ? 0 : 1));
    return [
      h('ul', { class: 'notices' }, item(sorted[0])),
      sorted.length > 1 ? h('details', { class: 'more-notices' },
        h('summary', null, `${sorted.length - 1} more ${sorted.length === 2 ? 'note' : 'notes'}`),
        h('ul', { class: 'notices' }, sorted.slice(1).map(item))) : null,
    ];
  }

  function firstSentence(text) {
    const m = text.match(/^.*?[.!?](?=\s|$)/);
    return m ? m[0] : text;
  }

  function link(href, title, text) {
    return h('li', null, h('a', { href }, h('strong', null, title), h('span', null, text), h('span', { class: 'go', 'aria-hidden': 'true' }, '›')));
  }

  function chartCard(proj, today, a) {
    const real = FP.screens.future.getView() === 'real';
    const rows = real ? proj.rows.map(FP.projection.toReal) : proj.rows;
    const ev = proj.events;
    const moneyNote = real ? 'today\u2019s money' : 'future pounds';
    const series = [{ label: 'Net worth', color: '--series-7', values: rows.map((x) => x.netWorth) }];
    const markers = [
      ev.retirement ? { index: ev.retirement.y, label: `Retire ${a.retirementAge}` } : null,
      ev.mortgageFree ? { index: ev.mortgageFree.y, label: 'Mortgage-free' } : null,
    ].filter(Boolean);
    return h('section', { class: 'card', 'aria-labelledby': 'ov-chart-h' },
      h('h2', { id: 'ov-chart-h' }, 'Net worth over time'),
      h('p', { class: 'muted' }, h('a', { href: '#now/own' }, `${money(today.netWorth)} today`), ` (${money(today.assets.total)} owned \u2212 ${money(today.liabilities.total)} owed)`),
      FP.chart.timeChart({
        type: 'line', series, markers,
        xLabels: rows.map((x) => String(x.age)),
        xTitle: (i) => `Age ${rows[i].age} \u00b7 ${rows[i].year}`,
        ariaLabel: `Line chart of projected net worth by age, in ${moneyNote}`,
      }),
      h('p', { class: 'muted small' }, `Ages along the bottom, in ${moneyNote}. `, h('a', { href: '#future' }, 'See the full projection')));
  }


  FP.screens = FP.screens || {};
  FP.screens.overview = { title: 'Your plan', render };
})(globalThis.FP = globalThis.FP || {});
