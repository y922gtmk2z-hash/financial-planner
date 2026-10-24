/*
 * Overview: your plan as answers to four questions (each month, debt-free,
 * retirement, next steps). Every figure opens a detail panel where you can
 * change what drives it and see the effect.
 */
(function (FP) {
  'use strict';

  const { h, money, pct, measure, lastsTo } = FP.dom;
  // Runs to your end age, so the chart and debt-free ages aren't cut off at 40 years.
  const toEnd = (p) => ({ maxYears: p.assumptions.endAge - p.about.age });

  // Which ideas belong on which card, and the panel each card's rows open.
  const AREA_IDEAS = {
    month: ['noSurplus', 'emergency', 'isa'],
    debt: ['debt', 'mortgage', 'studentLoan'],
    retirement: ['taper', 'relief', 'match'],
  };
  const IDEA_PANEL = { noSurplus: 'leftover', emergency: 'emergency', isa: 'leftover', debt: 'leftover', mortgage: 'mortgage', studentLoan: 'studentLoan', taper: 'retirement', relief: 'retirement', match: 'retirement' };

  function render(root, ctx) {
    const p = ctx.profile();
    // Until the quick start's done: say what this is and how to start.
    if (!FP.summary.checklist(p).ready) { FP.welcome.render(root, ctx); return; }
    const pay = FP.tax.forProfile(p);
    const today = FP.summary.compute(p, pay.takeHomeMonthly);
    const ready = FP.summary.checklist(p).ready;
    const proj = ready ? FP.projection.project(p, toEnd(p)) : { ok: false };
    const a = p.assumptions;

    // Only the quick-start answers so far: a first look, kept short. Ideas,
    // next steps and the chart wait until there's more to go on.
    const rough = FP.welcome.isRough(p);
    // The projection's warnings rest on what you'd save, so they wait for more detail too.
    const warnings = today.warnings.concat(proj.ok && !rough ? proj.warnings : []);
    const seen = new Set();
    // The split notice repeats what the Each month card says.
    const notices = warnings.filter((w) => w.key !== 'split' && !seen.has(w.text) && seen.add(w.text) && (!rough || w.level === 'warn'));
    const ideas = ready && !rough ? openIdeas(p) : [];
    const panel = (id) => () => FP.explore.open(ctx, id);

    FP.dom.add(root,
      FP.dom.pageHead('Your plan', rough && ready ? 'A first look, from your quick answers' : 'Four questions, answered'),
      FP.checklist.card(p),
      noticeList(notices),
      rough ? null : FP.backup.nudge(ctx),
      monthCard(p, today, pay, ideas, panel, rough),
      ready && proj.ok ? debtCard(p, proj, ideas, panel) : null,
      ready && proj.ok ? retirementCard(p, proj, ideas, panel, rough) : null,
      ready && rough ? moreCard(p) : null,
      ready && !rough ? FP.checklist.note(p) : null,
      proj.ok && !rough ? chartCard(proj, today, a, p) : null,
      rough ? null : nextCard(p, a, ctx));
  }

  // After the quick start: one clear next move.
  function moreCard(p) {
    return h('section', { class: 'card more-detail', 'aria-labelledby': 'more-h' },
      h('h2', { id: 'more-h' }, 'Make it your plan'),
      FP.checklist.meter(p),
      h('p', null, 'This uses just your quick answers. Add your savings, pensions and any debts and the planner can tell you when you\u2019ll be debt-free, what you could spend in retirement and what to do next.'),
      h('a', { class: 'button', href: FP.checklist.nextSection(p) }, 'Add your pensions and savings'),
      h('p', { class: 'muted small' }, 'About five minutes. A rough figure is fine.'));
  }

  // Ideas you haven't ticked off or hidden, most pressing first.
  function openIdeas(p) {
    const marks = p.ideas || {};
    return FP.suggest.analyse(p).suggestions.filter((x) => x.tone !== 'good' && !marks[x.id])
      .sort((x, y) => (x.tone === 'warn' ? 0 : 1) - (y.tone === 'warn' ? 0 : 1));
  }

  // A card answering one question: a verdict, the figures behind it (each opens its
  // detail panel) and the top recommendation for it.
  function outcomeCard(id, title, verdict, rows, idea, panel, after, foot) {
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
        h('span', null, h('strong', null, idea.title), h('span', null, firstSentence(idea.text)))) : null,
      after || null,
      FP.dom.cardFoot(foot));
  }

  const ideaFor = (area, ideas) => ideas.find((x) => AREA_IDEAS[area].includes(x.id)) || null;

  function monthCard(p, today, pay, ideas, panel, rough) {
    const cf = today.cashFlow;
    const left = cf.surplus;
    const e = FP.summary.checklist(p).ready && !rough ? FP.suggest.analyse(p).emergency : null;
    const verdict = !(pay.takeHomeMonthly > 0) && !(cf.spendingMonthly > 0)
      ? { tone: 'info', text: 'Add your pay and spending to see your month.' }
      : left < 0
        ? { tone: 'warn', text: `You\u2019re ${money(-left)} short each month.` }
        : rough
          ? { tone: 'info', text: `${money(left)} left over each month after spending.` }
          : FP.projection.splitShares(p.leftover, left).total === 0 && left > 0
          ? { tone: 'info', text: `${money(left)} left over each month, but you haven\u2019t chosen what to do with it, so your plan doesn\u2019t save any of it.` }
          : { tone: 'ok', text: `${money(left)} left over each month${cf.savingsMonthly > 0 ? `, after saving ${money(cf.savingsMonthly)}` : ''}.` };
    return outcomeCard('month', 'Each month', verdict, [
      { label: 'Take-home pay', value: money(pay.takeHomeMonthly), sub: 'a month', open: panel('takeHome') },
      { label: left < 0 ? 'Short each month' : 'Left over each month', value: money(Math.abs(left)), sub: 'after spending, debts and saving', warn: left < 0, open: panel('leftover') },
      e && Number.isFinite(e.months) ? { label: 'Emergency fund', value: `${e.months >= 24 ? '24+' : e.months.toFixed(1)} months`, sub: `target ${e.targetMonths} ${e.targetMonths === 1 ? 'month' : 'months'}`, warn: e.short, open: panel('emergency') } : null,
    ], ideaFor('month', ideas), panel, null, '#setup/income');
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
    return outcomeCard('debt', 'Debt-free', verdict, out, ideaFor('debt', ideas), panel, null, '#setup/debts');
  }

  /*
   * The first look: what you're on course for by the time you retire (from
   * the projection, with the default workplace pension) against what you'd
   * need to spend your goal to the end of your plan, both from
   * retirementNeed and in today's money. Marked Rough: it rests on the quick
   * answers alone, with nothing yet for pensions and savings you already have.
   */
  function firstLookCard(p) {
    const a = p.assumptions;
    const need = FP.projection.retirementNeed(p);
    const n = FP.welcome.answerCount(p);
    let lead;
    let result = null;
    let how = null;
    if (!need) lead = `Retiring at ${a.retirementAge} is beyond the projection.`;
    else {
      const goalText = `${money(need.goal)} a month${need.goalIsSet ? '' : ' (what you spend now)'}`;
      const m = ahead(p, true);
      lead = `On course for about ${m(need.have)} by ${a.retirementAge}. You\u2019d need about ${m(need.needed)}.`;
      const short = need.needed - need.have;
      result = short > 0
        ? h('p', { class: 'first-look-result' }, h('strong', { class: 'negative' }, `Short by about ${m(short)}`))
        : h('p', { class: 'first-look-result' }, h('strong', null, 'On course'));
      how = `To spend ${goalText} from ${a.retirementAge} to ${need.endAge}, in ${measure('savingsPensions').toLowerCase()}. It assumes your ${a.employeePensionPct}% + ${a.employerPensionPct}% workplace pension and counts the full State Pension from ${a.statePensionAge}, in today\u2019s money.`;
    }
    return h('section', { class: 'card outcome', 'aria-labelledby': 'oc-retirement' },
      h('h2', { id: 'oc-retirement' }, 'Retirement'),
      h('p', { class: 'verdict info' }, h('span', { class: 'badge' }, 'Rough'), lead),
      result,
      h('p', { class: 'small' }, `Based on ${n} ${n === 1 ? 'answer' : 'answers'}. Your existing pensions and savings aren\u2019t included yet.`),
      how ? h('p', { class: 'muted small' }, how) : null,
      FP.dom.cardFoot('#setup/about'));
  }

  /*
   * Money at retirement: three significant figures if it's five or more years
   * away; nearer than that, to the pound (or, for a pot, the nearest £1,000).
   */
  const ahead = (p, pot) => (n) => (FP.dom.far(p.assumptions.retirementAge - p.about.age)
    ? money(n, { approx: true }) : money(pot ? roundTo(n) : n));

  function retirementCard(p, proj, ideas, panel, rough) {
    if (rough) return firstLookCard(p);
    const a = p.assumptions;
    const need = FP.projection.retirementNeed(p);
    const goalText = need ? `${money(need.goal)} a month${need.goalIsSet ? '' : ' (what you spend now)'}` : '';
    let verdict;
    if (!need) verdict = { tone: 'info', text: `Retiring at ${a.retirementAge} is beyond the projection.` };
    else if (need.needed <= 0) verdict = { tone: rough ? 'info' : 'ok', text: `Your State Pension and other income would cover spending ${goalText} from ${a.retirementAge}.` };
    else {
      const text = need.lastsUntil
        ? `Spending ${goalText} from ${a.retirementAge}, your money would last until about ${need.lastsUntil}.`
        : `Spending ${goalText} from ${a.retirementAge}, your money would last beyond ${need.endAge}.`;
      verdict = { tone: rough ? 'info' : need.lastsUntil ? 'warn' : 'ok', text };
    }
    const rs = rough ? null : FP.projection.retirementSpend(p);
    const m = ahead(p);
    const pot = ahead(p, true);
    return outcomeCard('retirement', 'Retirement', verdict, need ? [
      { label: measure('moneyLastsTo'), value: lastsTo(need), sub: `at ${money(need.goal)} a month${need.lastsUntil ? ', then runs short' : ', the end of your plan'}`, warn: !rough && !!need.lastsUntil, open: panel('retirement') },
      rs ? { label: measure('couldSpend'), value: `${m(rs.monthly)} a month`, sub: `from ${a.retirementAge} to ${rs.endAge}, today\u2019s money`, open: panel('retirement') } : null,
      { label: measure('savingsPensions', a.retirementAge), value: `about ${pot(need.have)}`, sub: 'on course to have, today\u2019s money', warn: !rough && need.have < need.needed, open: panel('retirement') },
      { label: `Needed by ${a.retirementAge}`, value: `about ${pot(need.needed)}`, sub: `in ${measure('savingsPensions').toLowerCase()}, to last to ${need.endAge}`, open: panel('retirement') },
    ] : [], ideaFor('retirement', ideas), panel, h('p', { class: 'small how-link' },
      `Includes the State Pension from ${a.statePensionAge}. `, h('a', { href: '#assumptions/grp-pension' }, 'How is this worked out?')), '#setup/about');
  }

  // Estimates shown to the nearest £1,000 (or £100 under £10,000), not to the pound.
  function roundTo(n) {
    const step = Math.abs(n) < 10000 ? 100 : 1000;
    return Math.round(n / step) * step;
  }

  function nextCard(p, a, ctx) {
    // The same list as the Actions screen, including the suggested split.
    const n = FP.screens.actions.openActions(p).length;
    return h('section', { class: 'card next-steps', 'aria-labelledby': 'next-h' },
      h('h2', { id: 'next-h' }, 'Next steps'),
      FP.checklist.meter(p),
      h('ul', null,
        n ? link('#actions', `${n} ${n === 1 ? 'action' : 'actions'} to look at`, 'Apply them, try them as a scenario, or set a reminder \u2014 general rules of thumb, not advice') : null,
        link('#scenarios', 'Compare scenarios', 'What if you retired earlier, or overpaid the mortgage?'),
        link('#assumptions', 'Check the assumptions', `Inflation ${pct(a.inflation)}, investments ${pct(FP.growth.netRate(a.investmentReturn, a.investmentFees))} after fees, retire at ${a.retirementAge}`)),
      h('div', { class: 'button-row backup-row' },
        h('button', { type: 'button', class: 'secondary', onclick: () => FP.backup.exportFile(ctx) }, 'Export a backup'),
        h('span', { class: 'muted small' }, 'Your figures live only in this browser.')));
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

  function chartCard(proj, today, a, p) {
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
      FP.dom.soWhat(netWorthSoWhat(rows, ev)),
      h('p', { class: 'muted small' }, `Ages along the bottom, to ${rows[rows.length - 1].age}, in ${moneyNote}. `, h('a', { href: '#future' }, 'See the full projection')),
      FP.dom.cardFoot('#setup/assets'));
  }

  // Shared with Future: how net worth moves between now and retirement.
  function netWorthSoWhat(rows, ev) {
    const start = rows[0];
    const at = ev.retirement ? rows[ev.retirement.y] : rows[rows.length - 1];
    const when = ev.retirement ? `when you retire at ${at.age}` : `by ${at.age}`;
    const move = at.netWorth >= start.netWorth ? 'grows' : 'falls';
    return `your net worth ${move} from ${money(start.netWorth)} to ${money(at.netWorth, { approx: FP.dom.far(at.y) })} ${when}${ev.runsOut ? `, but your money runs short at ${ev.runsOut.age}` : ''}.`;
  }


  FP.screens = FP.screens || {};
  FP.screens.overview = { title: 'Your plan', render, netWorthSoWhat };
})(globalThis.FP = globalThis.FP || {});
