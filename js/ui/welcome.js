/*
 * Welcome: the front page (the app's name, what happens next and Get
 * started), then the quick start, shown on Your plan until it's done.
 */
(function (FP) {
  'use strict';

  const { h, money } = FP.dom;

  // The answers behind a first, rough plan. Same profile fields as Your figures.
  const QUICK = ['about.age', 'income.grossSalary', 'outgoings.estimate', 'assumptions.retirementAge', 'goals.retirementIncome'];
  const SPEND_FIELD = { path: 'outgoings.estimate', label: 'Everything going out each month', type: 'money', suffix: 'a month', nullable: true,
    nullPlaceholder: '0',
    help: 'Include your rent or mortgage, bills and any loan or card payments, as well as everyday spending. An estimate is fine: you can refine it later.' };

  const spendTotal = (p) => p.spending.reduce((t, r) => t + (Number(r.monthly) || 0), 0);
  // Outgoings already itemised without an estimate are edited in Your figures, not here.
  const itemisedOnly = (p) => p.outgoings.estimate == null && spendTotal(p) > 0;
  function quickPaths(p) {
    return QUICK.filter((path) => path !== SPEND_FIELD.path || !itemisedOnly(p));
  }
  const COUNT_WORDS = ['no', 'one', 'two', 'three', 'four', 'five'];
  const questionCount = (p) => COUNT_WORDS[quickPaths(p).length];

  function quickField(path) {
    if (path === SPEND_FIELD.path) return SPEND_FIELD;
    return FP.profile.SECTIONS.flatMap((sec) => sec.fields).find((f) => f.path === path);
  }

  /*
   * Sense checks on the figures most often typed in the wrong period (a yearly
   * amount in a monthly box, or the other way round). Never blocking: each asks,
   * and offers the likely figure. Returns null or { text, fix, fixLabel }.
   */
  const maybeYearly = (v) => ({
    text: `That\u2019s ${money(v * 12)} a year. Did you mean ${money(v)} a year (${money(v / 12)} a month)?`,
    // To the penny, so the yearly figure comes back exactly.
    fix: Math.round((v / 12) * 100) / 100,
    fixLabel: `Use ${money(v / 12)} a month`,
  });
  const CHECKS = {
    'goals.retirementIncome': (v, p) => {
      if (!(v > 0)) return null;
      const takeHome = FP.tax.household(p).takeHomeMonthly;
      const out = FP.summary.compute(p, takeHome).cashFlow.outgoings;
      return (out > 0 && v > out * 2) || (takeHome > 0 && v > takeHome) ? maybeYearly(v) : null;
    },
    'outgoings.estimate': (v, p) => {
      const takeHome = FP.tax.household(p).takeHomeMonthly;
      return v > 0 && takeHome > 0 && v > takeHome * 1.5 ? maybeYearly(v) : null;
    },
    'income.grossSalary': (v) => {
      if (v > 0 && v < 1000) {
        return { text: `That\u2019s ${money(v)} a year. Did you mean ${money(v * 12)} a year (${money(v)} a month)?`, fix: v * 12, fixLabel: `Use ${money(v * 12)} a year` };
      }
      if (v > 1000000) {
        const fix = Math.round(v / 10);
        return { text: `That\u2019s ${money(v)} a year. Did you mean ${money(fix)} a year?`, fix, fixLabel: `Use ${money(fix)} a year` };
      }
      return null;
    },
  };
  // The sense check for a field in this profile, as FP.field.render's `check`, or undefined.
  function senseCheck(path, profile) {
    const c = CHECKS[path];
    return c ? (v) => c(v, profile()) : undefined;
  }

  // How many of the quick-start questions have an answer.
  function answerCount(p) {
    return quickPaths(p).filter((path) => {
      const v = FP.profile.get(p, path);
      return v != null && v !== 0;
    }).length;
  }

  /*
   * Quick start: up to five answers, then a first look at your plan. Where the same
   * fields also appear further down the page (Setup), typing in one copy
   * updates the other.
   */
  function quickStart(ctx, root) {
    const p = ctx.profile();
    // Older plans started with nine empty categories: clear them for your estimate.
    if (p.spending.length > 1 && !(spendTotal(p) > 0)) p.spending = [FP.profile.newRest()];
    const paths = quickPaths(p);
    const card = h('section', { class: 'card quick-start', 'aria-labelledby': 'quick-h' },
      h('h1', { id: 'quick-h' }, 'Quick start'),
      h('p', { class: 'muted' }, `${questionCount(p).replace(/^./, (c) => c.toUpperCase())} questions for a first look at your plan. You can add detail afterwards.`),
      paths.map((path) => {
        const f = quickField(path);
        return FP.field.render(f, {
          value: FP.profile.get(ctx.profile(), path),
          nullPlaceholder: f.nullPlaceholder,
          noBlankNote: true,
          check: senseCheck(path, ctx.profile),
          onChange: (v) => {
            FP.profile.set(ctx.profile(), path, v);
            // Your estimate goes into your outgoings as the rest not itemised yet.
            if (path === SPEND_FIELD.path) FP.summary.syncOutgoings(ctx.profile());
            ctx.changed();
            // The checks compare your answers with each other.
            FP.field.recheckAll(card);
          },
        });
      }),
      h('button', { type: 'button', class: 'quick-go', onclick: () => {
        const bad = card.querySelector('[aria-invalid="true"]');
        if (bad) { bad.focus(); ctx.toast('Fix the highlighted box first.'); return; }
        // Your plan shows this page again until these are in, so say what's missing.
        const missing = FP.summary.checklist(ctx.profile()).blocking;
        if (missing.length) {
          const first = missing[0].target;
          const input = card.querySelector(`[data-path="${CSS.escape(first)}"] input`);
          if (input) input.focus();
          ctx.toast(`Add ${missing.map((i) => i.label.toLowerCase()).join(' and ')} first.`);
          return;
        }
        ctx.go('overview');
      } }, 'See my plan'));
    (root || card).addEventListener('input', (e) => {
      const wrap = e.target.closest && e.target.closest('[data-path]');
      if (!wrap || !paths.includes(wrap.dataset.path)) return;
      (root || card).querySelectorAll(`[data-path="${CSS.escape(wrap.dataset.path)}"] input`).forEach((i) => { if (i !== e.target) i.value = e.target.value; });
    });
    return card;
  }

  // Set when Get started couldn't be saved (storage blocked), so the button still works this visit.
  let startedUnsaved = false;

  /*
   * Until you start: a front page with the app's name, what happens next and
   * one button. Then the quick start on its own. Someone who has already
   * entered something goes straight to the quick start.
   */
  function render(root, ctx) {
    const started = startedUnsaved || FP.store.pref('started') === '1' || !FP.checklist.isEmpty(ctx.profile());
    if (started) quickStartPage(root, ctx); else frontPage(root, ctx);
  }

  const steps = (p) => [
    [`Answer ${questionCount(p)} quick questions`, 'Your age, pay, what goes out each month and when you’d like to retire. About a minute; rough figures are fine.'],
    ['See your first plan', 'What’s left each month, and how much you’d need for retirement.'],
    ['Add detail when you’re ready', 'Savings, pensions and debts sharpen the picture and unlock your next steps.'],
  ];

  // Ways in other than the quick start: the sample household, or a backup.
  function otherWays(ctx) {
    return h('p', { class: 'gate-other' }, 'Just looking? ',
      h('button', {
        type: 'button', class: 'link',
        onclick: () => {
          // The front page has just shown the notice, so the bar stays one line.
          document.getElementById('disclaimer').open = false;
          ctx.replaceWorkspace(FP.sampleWorkspace());
          ctx.toast('Sample data loaded');
        },
      }, 'See a fictional example'),
      ' · Used it before? ', h('a', { href: '#data' }, 'Import a backup'));
  }

  function frontPage(root, ctx) {
    FP.dom.add(root,
      h('section', { class: 'gate', 'aria-labelledby': 'gate-h' },
        h('span', { class: 'gate-mark', 'aria-hidden': 'true' }, '£'),
        h('h1', { id: 'gate-h' }, 'Finance planner'),
        h('p', { class: 'gate-tag' }, 'Plan your money, privately. A UK planner for your pay, spending, debts and retirement.'),
        h('ol', { class: 'gate-steps' }, steps(ctx.profile()).map(([title, text]) => h('li', null, h('strong', null, title), h('span', null, text)))),
        h('button', {
          type: 'button', class: 'gate-go',
          onclick: () => {
            FP.store.pref('started', '1');
            startedUnsaved = FP.store.pref('started') !== '1';
            // The front page has just shown the notice, so the bar stays one line.
            document.getElementById('disclaimer').open = false;
            ctx.rerender();
            window.scrollTo(0, 0);
            const head = document.getElementById('quick-h');
            if (head) { head.setAttribute('tabindex', '-1'); head.focus({ preventScroll: true }); }
          },
        }, 'Get started'),
        otherWays(ctx),
        h('p', { class: 'gate-note' }, 'Everything stays in this browser: no accounts, nothing sent anywhere.'),
        h('p', { class: 'gate-note' }, h('a', { href: '#data' }, 'Your data'), ' · ', h('a', { href: '#settings' }, 'Settings')),
        h('details', { class: 'gate-notice', open: true },
          h('summary', null, 'A planning illustration, not financial advice'),
          // Same wording as the notice under the header, kept in one place (index.html).
          h('p', null, document.querySelector('#disclaimer p').textContent))));
  }

  function quickStartPage(root, ctx) {
    FP.dom.add(root, quickStart(ctx), h('section', { class: 'card', 'aria-label': 'Other ways to start' }, otherWays(ctx)));
  }

  /*
   * Whether your plan rests on little more than the quick-start answers: no
   * savings, pensions or debts entered, no pay details beyond salary, and you
   * haven't yet been through the Assets and Debts sections of Your figures
   * (someone with none of those has nothing to add there).
   */
  function isRough(p) {
    const inc = p.income;
    const visited = (FP.store.pref('setupVisited') || '').split(',');
    const added = Object.values(p.assets).some((v) => v > 0) || p.mortgage.balance > 0 || (p.debts || []).length > 0
      || (p.savings || []).length > 0 || p.spending.some((r) => !r.rest && r.monthly > 0) || FP.projection.splitShares(p.leftover, 1).total > 0
      || inc.studentLoanPlan !== 'none' || inc.bonuses.length > 0 || inc.sacrifices.length > 0 || (inc.benefits || []).length > 0
      || inc.otherIncome > 0 || inc.taxFreeIncome > 0 || !!inc.taxCode;
    return !added && !(visited.includes('assets') && visited.includes('debts'));
  }

  FP.welcome = { render, quickStart, isRough, senseCheck, answerCount };
})(globalThis.FP = globalThis.FP || {});
