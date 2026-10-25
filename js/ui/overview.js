/*
 * Plan (#plan): your plan as answers to four questions (each month, debt-free,
 * retirement, next steps). Every figure opens a detail panel where you can
 * change what drives it and see the effect. Where you stand today opens as
 * detail sheets (#plan/cash-flow, #plan/own-and-owe, #plan/pay-and-tax; see
 * FP.planSheets) and the full projection as #plan/year-by-year (FP.yearByYear).
 */
(function (FP) {
  'use strict';

  const { h, money, pct, measure, lastsTo } = FP.dom;
  // Runs to your end age, so the chart and debt-free ages aren't cut off at 40 years.
  const toEnd = (p) => ({ maxYears: p.assumptions.endAge - p.about.age });

  // Which ideas belong on which card, and the panel each card's rows open.
  const AREA_IDEAS = {
    month: ['noSurplus', 'emergency', 'isa'],
    debt: ['fixEnds', 'debt', 'mortgage', 'studentLoan'],
    retirement: ['taper', 'claimRelief', 'claimReliefPartner', 'relief', 'statePension', 'statePensionPartner', 'match'],
  };
  const IDEA_PANEL = {
    noSurplus: 'leftover', emergency: 'emergency', isa: 'leftover', debt: 'leftover', mortgage: 'mortgage', fixEnds: 'mortgage', studentLoan: 'studentLoan',
    taper: 'retirement', claimRelief: 'retirement', claimReliefPartner: 'retirement', relief: 'retirement', statePension: 'retirement', statePensionPartner: 'retirement', match: 'retirement',
  };

  const isSheet = (target) => FP.planSheets.SHEETS.some((x) => x.id === target);

  function render(root, ctx, target) {
    const p = ctx.profile();
    // Until the quick start's done: say what this is and how to start.
    if (!FP.summary.checklist(p).ready) { FP.welcome.render(root, ctx); return; }
    if (target === 'year-by-year' || target === 'year-by-year/events') { FP.yearByYear.render(root, ctx, target.split('/')[1]); return; }
    // A detail sheet opens over your plan once it's drawn.
    if (isSheet(target)) setTimeout(() => { if (root.isConnected && location.hash === `#plan/${target}`) FP.planSheets.open(ctx, target); }, 0);
    // The household's take-home (yours, with just you).
    const pay = FP.tax.household(p);
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
      checkLine(p),
      FP.checklist.card(p),
      noticeList(notices),
      prompts(ctx, ready && !rough),
      rough ? null : FP.backup.nudge(ctx),
      monthCard(p, today, pay, ideas, panel, rough),
      ready && proj.ok ? debtCard(p, proj, ideas, panel) : null,
      ready && proj.ok ? retirementCard(p, proj, ideas, panel, rough) : null,
      ready && rough ? moreCard(p) : null,
      ready && !rough ? FP.checklist.note(p) : null,
      rough ? null : commitmentsCard(ctx),
      proj.ok && !rough ? chartCard(proj, today, a, p) : null,
      rough ? null : nextCard(p, a, ctx, root),
      rough ? null : FP.print.attach(ctx, root));
  }

  /*
   * One line above the verdicts when a figure fails its sense check (say, a
   * yearly amount typed as monthly), so the results below aren't taken on trust.
   */
  function checkLine(p) {
    const failed = FP.welcome.failedChecks(p);
    if (!failed.length) return null;
    const names = failed.map((x) => `${x.label.charAt(0).toLowerCase()}${x.label.slice(1)} (${x.shown})`);
    const list = names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0];
    return h('p', { class: 'notice warn plan-check' },
      h('span', { class: 'notice-icon', 'aria-hidden': 'true' }, '!'),
      h('span', null, `${failed.length > 1 ? 'These figures look' : 'This figure looks'} wrong, so the results below may be too: ${list}. `,
        h('a', { href: `#setup/${failed[0].path}` }, failed.length > 1 ? 'Check them' : 'Check it')));
  }

  /*
   * Your commitments: what you said you'd do from Actions, how much, by when,
   * and whether it's done (tick it off here). Null when there are none.
   */
  function commitmentsCard(ctx) {
    const list = ctx.profile().commitments || [];
    if (!list.length) return null;
    const card = h('section', { class: 'card commitments', id: 'commitments', 'aria-labelledby': 'commit-h' });
    const draw = () => {
      const p = ctx.profile();
      const k = FP.commitments.kept(p, isoToday());
      FP.dom.fill(card,
        h('h2', { id: 'commit-h' }, 'Your commitments'),
        h('p', { class: 'muted' }, `${k.done} of ${k.total} done${k.overdue ? ` \u00b7 ${k.overdue} past ${k.overdue === 1 ? 'its' : 'their'} date` : ''}. From what you applied or marked done on Actions.`),
        h('ul', { class: 'commit-list' }, p.commitments.map((c) => commitmentRow(c, (done) => {
          FP.commitments.setStatus(ctx.profile(), c.id, done ? 'done' : 'open');
          ctx.changed();
          draw();
        }))),
        h('div', { class: 'button-row' }, h('button', {
          type: 'button', class: 'small secondary',
          onclick: () => FP.dom.download(FP.csv.commitments(ctx.profile().commitments), `commitments-${isoToday()}.csv`, 'text/csv;charset=utf-8'),
        }, 'Download as CSV')),
        FP.dom.cardFoot('#actions', 'See your actions'));
    };
    draw();
    return card;
  }
  const isoToday = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  // One commitment: done or not (a tick box), what, how much and by when.
  function commitmentRow(c, onToggle) {
    const id = `commit-${c.id}`;
    const late = c.status === 'open' && c.due && c.due < isoToday();
    return h('li', { class: `commit${c.status === 'done' ? ' done' : ''}` },
      h('input', { type: 'checkbox', id, checked: c.status === 'done', onchange: (e) => onToggle(e.target.checked) }),
      h('label', { for: id }, h('span', { class: 'commit-what' }, c.what),
        h('span', { class: 'commit-meta muted small' }, [
          c.amount != null ? `${money(c.amount)} a ${c.per || 'month'}` : null,
          c.due ? `by ${FP.dom.date(c.due)}` : 'no date',
          c.status === 'done' ? 'done' : late ? 'past its date' : 'to do',
        ].filter(Boolean).join(' \u00b7 '))));
  }

  // After the quick start: one clear next move.
  function moreCard(p) {
    return h('section', { class: 'card more-detail', 'aria-labelledby': 'more-h' },
      h('h2', { id: 'more-h' }, 'Make it your plan'),
      FP.checklist.meter(p),
      h('p', null, 'This uses just your quick answers. Add your savings, pensions and any debts and the planner can tell you when you\u2019ll be debt-free, what you could spend in retirement and what to do next.'),
      h('a', { class: 'button', href: FP.checklist.nextSection(p) }, 'Add your pensions and savings'),
      h('p', { class: 'muted small' }, FP.welcome.EFFORT));
  }

  // Ideas you haven't ticked off or hidden, most pressing first.
  function openIdeas(p) {
    const marks = p.ideas || {};
    return FP.suggest.analyse(p, { cashKnown: FP.checklist.cashKnown(p) }).suggestions.filter((x) => x.tone !== 'good' && !marks[x.id])
      .sort((x, y) => (x.safety ? 0 : x.tone === 'warn' ? 1 : 2) - (y.safety ? 0 : y.tone === 'warn' ? 1 : 2));
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
        },
        // Named by what it shows (spaced so the words don't run together), then what it does.
        h('span', { class: 'row-label' }, r.label, r.sub ? [' ', h('small', null, r.sub)] : null),
        ' ',
        h('strong', { class: r.warn ? 'negative' : null }, r.value),
        h('span', { class: 'visually-hidden' }, `. ${r.href ? 'Open' : 'See what drives it and try changes'}`),
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
    ], ideaFor('month', ideas), panel, FP.planSheets.links(), '#setup/income');
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
    // Each of your student loans; with a partner, named ("Sam’s student loan") and at their own age.
    const loans = p.partner && ev.studentLoans ? ev.studentLoans : [sl];
    FP.profile.people(p).forEach((x, i) => {
      const loan = loans[i];
      const name = p.partner ? `${FP.profile.capital(FP.profile.whose(p, i))} student loan` : 'Student loan';
      if (loan && loan.tracked) {
        const row = loan.clearedRow || loan.writtenOffRow;
        const age = loan.clearedRow ? loan.clearedRow.age : loan.writtenOffRow ? loan.writtenOffAge : null;
        out.push({ label: loan.clearedRow ? `${name} repaid` : loan.writtenOffRow ? `${name} written off` : name, value: age ? `Age ${age}` : 'Still owing', sub: loan.clearedRow ? String(loan.clearedRow.year) : loan.writtenOffRow ? `April ${loan.writeOffYear}` : `at ${end.age}`, open: panel('studentLoan') });
        // Debt-free is on your age.
        ends.push(!row ? null : i ? rows[row.y].age - (loan.writtenOffRow ? 1 : 0) : age);
      } else if (x.income.studentLoanPlan !== 'none') {
        out.push({ label: name, value: 'Add balance', sub: 'to see when it ends', open: panel('studentLoan') });
      }
    });
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
    const ra = FP.dom.retireAt(p, need);
    if (!need) lead = `Retiring at ${a.retirementAge} is beyond the projection.`;
    else {
      const goalText = `${money(need.goal)} a month${need.goalIsSet ? '' : ' (what you spend now)'}`;
      const m = ahead(p, true);
      lead = `On course for about ${m(need.have)} by ${ra}. You\u2019d need about ${m(need.needed)}.`;
      const short = need.needed - need.have;
      result = short > 0
        ? h('p', { class: 'first-look-result' }, h('strong', { class: 'negative' }, `Short by about ${m(short)}`))
        : h('p', { class: 'first-look-result' }, h('strong', null, 'On course'));
      how = p.partner
        ? `To spend ${goalText} from ${ra} (once you\u2019ve both retired: ${FP.dom.bothRetire(p)}) to ${need.endAge}, in ${measure('savingsPensions').toLowerCase()}. It assumes each of your workplace pensions and counts each full State Pension from its age, in today\u2019s money.`
        : `To spend ${goalText} from ${a.retirementAge} to ${need.endAge}, in ${measure('savingsPensions').toLowerCase()}. It assumes your ${a.employeePensionPct}% + ${a.employerPensionPct}% workplace pension and counts the full State Pension from ${a.statePensionAge}, in today\u2019s money.`;
    }
    return h('section', { class: 'card outcome', 'aria-labelledby': 'oc-retirement' },
      h('h2', { id: 'oc-retirement' }, 'Retirement'),
      h('p', { class: 'verdict info' }, h('span', { class: 'badge' }, 'Rough'), lead),
      result,
      h('p', { class: 'small' }, `Based on ${n} ${n === 1 ? 'answer' : 'answers'}. ${FP.welcome.isRoughPots(p)
        ? `It includes your rough ${money(p.assets.pension)} in pensions and savings, treated as a pension pot.`
        : 'Your existing pensions and savings aren\u2019t included yet.'}`),
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
    // With a partner, the goal starts once you've both retired.
    const ra = FP.dom.retireAt(p, need);
    let verdict;
    if (!need) verdict = { tone: 'info', text: `Retiring at ${a.retirementAge} is beyond the projection.` };
    else if (need.needed <= 0) verdict = { tone: rough ? 'info' : 'ok', text: `${p.partner ? 'Your State Pensions' : 'Your State Pension'} and other income would cover spending ${goalText} from ${ra}.` };
    else {
      const text = need.lastsUntil
        ? `Spending ${goalText} from ${ra}, your money would last until about ${need.lastsUntil}.`
        : `Spending ${goalText} from ${ra}, your money would last beyond ${need.endAge}.`;
      verdict = { tone: rough ? 'info' : need.lastsUntil ? 'warn' : 'ok', text };
    }
    const rs = rough ? null : FP.projection.retirementSpend(p);
    const m = ahead(p);
    const pot = ahead(p, true);
    // The earliest you could retire spending your target, nothing else changed (goal-seek on retirement age, up to 75).
    const early = need ? FP.goalSeek.earliestRetirement(p) : null;
    const target = need ? `${money(need.goal)} a month${need.goalIsSet ? '' : ', what you spend now'}` : '';
    // How long your money lasts across market paths: run after the page shows (see FP.yearByYear).
    const pathsRow = need ? { label: 'Market paths', value: '\u2026', sub: 'working it out', open: () => { location.hash = '#plan/year-by-year'; } } : null;
    const card = outcomeCard('retirement', 'Retirement', verdict, need ? [
      early ? { label: 'Earliest you could retire at your target spending', value: early.age == null ? `Not by ${FP.goalSeek.MAX_RETIRE_AGE}` : String(early.age), sub: `${target}${p.partner ? ', your own retirement age' : ''}; you plan ${early.now}`, warn: early.age != null && early.age > early.now, open: panel('retirement') } : null,
      pathsRow,
      { label: measure('moneyLastsTo'), value: lastsTo(need), sub: `at ${money(need.goal)} a month${need.lastsUntil ? ', then runs short' : ', the end of your plan'}`, warn: !rough && !!need.lastsUntil, open: panel('retirement') },
      rs ? { label: measure('couldSpend'), value: `${m(rs.monthly)} a month`, sub: `from ${ra} to ${rs.endAge}, today\u2019s money`, open: panel('retirement') } : null,
      { label: measure('savingsPensions', ra), value: `about ${pot(need.have)}`, sub: 'on course to have, today\u2019s money', warn: !rough && need.have < need.needed, open: panel('retirement') },
      { label: `Needed by ${ra}`, value: `about ${pot(need.needed)}`, sub: `in ${measure('savingsPensions').toLowerCase()}, to last to ${need.endAge}`, open: panel('retirement') },
    ] : [], ideaFor('retirement', ideas), panel, h('p', { class: 'small how-link' },
      p.partner ? `Starts once you\u2019ve both retired (${FP.dom.bothRetire(p)}). Includes each State Pension from its age (${FP.profile.people(p).map((x, i) => `${FP.profile.whose(p, i)} ${x.statePensionAge}`).join(', ')}). `
        : `Includes the State Pension from ${a.statePensionAge}. `, h('a', { href: '#assumptions/grp-pension' }, 'How is this worked out?')), '#setup/about');
    if (pathsRow) fillPaths(card, p);
    return card;
  }

  /*
   * "Lasts to 95 in 9 of 10 market paths" on the retirement card, once the
   * paths have run (remembered, so straight away when they have).
   */
  function fillPaths(card, p) {
    const MP = FP.yearByYear.marketPaths;
    const rowOf = () => [...card.querySelectorAll('.outcome-row')].find((r) => r.querySelector('.row-label').textContent.startsWith('Market paths'));
    const put = (paths) => {
      const row = rowOf();
      if (!row || !paths || paths.lasting == null) return;
      const share = FP.paths.outOfTen(paths.lasting, paths.paths);
      row.querySelector('strong').textContent = `Lasts to ${paths.endAge} in ${share}`;
      row.querySelector('small').textContent = paths.lasting < paths.paths && paths.midLastsTo < paths.endAge
        ? `middle path runs short at ${Math.floor(paths.midLastsTo)}` : 'spending your target';
      row.dataset.done = '1';
    };
    const now = MP.cached(p);
    if (now) { setTimeout(() => put(now), 0); return; }
    MP.schedule(p, (paths) => { if (card.isConnected) put(paths); }, (status) => {
      const row = rowOf();
      if (row && card.isConnected) row.querySelector('small').textContent = status.replace('Working out market paths\u2026 ', 'working it out, ');
    });
  }

  // Estimates shown to the nearest £1,000 (or £100 under £10,000), not to the pound.
  function roundTo(n) {
    const step = Math.abs(n) < 10000 ? 100 : 1000;
    return Math.round(n / step) * step;
  }

  function nextCard(p, a, ctx, root) {
    // The same list as the Actions screen, including the suggested split.
    const n = FP.screens.actions.openActions(p).length;
    return h('section', { class: 'card next-steps', 'aria-labelledby': 'next-h' },
      h('h2', { id: 'next-h' }, 'Next steps'),
      FP.checklist.meter(p),
      h('ul', null,
        n ? link('#actions', `${n} ${n === 1 ? 'action' : 'actions'} to look at`, 'Apply them, try them as a scenario, or set a reminder \u2014 general rules of thumb, not advice') : null,
        checkinLink(ctx),
        link('#progress', 'Your progress', 'What you have against what your plan expected'),
        link('#what-if', 'What if\u2026', 'Compare what-ifs, or work out what it would take to reach a goal'),
        link('#assumptions', 'Check the assumptions', `Inflation ${pct(a.inflation)}, ISAs ${pct(FP.mix.netRate(p.mixes.isa, a, 'invest'))} after fees, retire at ${a.retirementAge}`)),
      h('div', { class: 'button-row backup-row' },
        h('button', { type: 'button', class: 'secondary', onclick: () => FP.backup.exportFile(ctx) }, 'Export a backup'),
        FP.print.button(ctx, root),
        h('span', { class: 'muted small' }, 'Your figures live only in this browser.')));
  }

  function checkinLink(ctx) {
    const last = FP.checkins.latest(ctx.workspace());
    return link('#checkin', 'Check in', last ? `Update your balances: last time ${FP.dom.date(last.date)}` : 'Update your balances, about two minutes, to start tracking your progress');
  }

  /*
   * Prompts, each put off for 30 days by "Not now": update your balances once
   * your last check-in is three months (90 days) old, and a new tax year once it has
   * started (on or after 6 April) and the tax rules are from an earlier year.
   */
  const DAY = 24 * 60 * 60 * 1000;
  // Check in every three months (or when your pension statements arrive).
  const CHECKIN_DAYS = 90;
  function taxYearStale(cfg, now) {
    const y = now.getFullYear();
    const current = now >= new Date(y, 3, 6) ? y : y - 1;
    return Number(cfg.yearStart.slice(0, 4)) < current;
  }
  function prompts(ctx, full) {
    const now = new Date();
    const todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const snoozed = (id) => Date.now() < Number(FP.store.pref(`snooze.${id}`) || 0);
    const days = FP.checkins.daysSince(ctx.workspace(), todayIso);
    const list = [
      full && days != null && days >= CHECKIN_DAYS ? { id: 'checkin', text: `It\u2019s ${days} days since your last check-in.`, link: ['#checkin', 'Update your balances'] } : null,
      taxYearStale(FP.taxConfig, now) ? { id: 'taxYear', text: `New tax year: figures use ${FP.taxConfig.taxYear} rules until updated.`, link: null } : null,
    ].filter((x) => x && !snoozed(x.id));
    if (!list.length) return null;
    return h('ul', { class: 'notices prompts' }, list.map((x) => h('li', { class: 'notice info prompt' },
      h('span', { class: 'notice-icon', 'aria-hidden': 'true' }, 'i'),
      h('span', null, x.text, x.link ? [' ', h('a', { href: x.link[0] }, x.link[1])] : null),
      h('button', {
        type: 'button', class: 'link', 'aria-label': `Not now: hide \u201c${x.text}\u201d for 30 days`,
        onclick: () => { FP.store.pref(`snooze.${x.id}`, String(Date.now() + 30 * DAY)); ctx.rerender(); },
      }, 'Not now'))));
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
    const real = FP.yearByYear.getView() === 'real';
    const rows = real ? proj.rows.map(FP.projection.toReal) : proj.rows;
    const ev = proj.events;
    const moneyNote = real ? 'today\u2019s money' : 'future pounds';
    // Net worth by what it's made of: ISAs, pensions, home equity and the rest
    // (a single line if there's nothing to split).
    const parts = FP.yearByYear.componentSeries(rows);
    const series = parts.length ? parts : [{ label: 'Net worth', color: '--series-7', values: rows.map((x) => x.netWorth) }];
    const markers = [
      ev.retirement ? { index: ev.retirement.y, label: `Retire ${a.retirementAge}` } : null,
      ev.mortgageFree ? { index: ev.mortgageFree.y, label: 'Mortgage-free' } : null,
    ].filter(Boolean);
    return h('section', { class: 'card', 'aria-labelledby': 'ov-chart-h' },
      h('h2', { id: 'ov-chart-h' }, 'Net worth over time'),
      h('p', { class: 'muted' }, h('a', { href: '#plan/own-and-owe', 'data-sheet': 'own-and-owe' }, `${money(today.netWorth)} today`), ` (${money(today.assets.total)} owned \u2212 ${money(today.liabilities.total)} owed)`),
      FP.chart.keys(series.map((x) => ({ label: x.label, color: x.color }))),
      FP.chart.timeChart({
        type: parts.length ? 'area' : 'line', series, markers, totalLabel: 'Net worth',
        xLabels: rows.map((x) => String(x.age)),
        xTitle: (i) => `Age ${rows[i].age} \u00b7 ${rows[i].year}`,
        ariaLabel: `Stacked area chart of projected net worth by age, split into home equity, savings, ISAs, pensions and what you owe, in ${moneyNote}`,
      }),
      FP.dom.soWhat(netWorthSoWhat(rows, ev)),
      h('p', { class: 'muted small' }, `Ages along the bottom, to ${rows[rows.length - 1].age}, in ${moneyNote}. Debts, your student loan and any shortfall are shown below zero. `, h('a', { href: '#plan/year-by-year' }, 'See year by year')),
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
  FP.commitmentsUi = { row: commitmentRow };
  FP.screens.plan = {
    title: 'Your plan', render, netWorthSoWhat,
    // Its sub-pages: the year by year view and the detail sheets.
    handles: (target) => target === 'year-by-year' || target === 'year-by-year/events' || isSheet(target),
    titleFor: (target) => (target === 'year-by-year' || target === 'year-by-year/events' ? 'Year by year' : null),
  };
})(globalThis.FP = globalThis.FP || {});
