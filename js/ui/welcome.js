/*
 * Welcome: the front page (the app's name, what happens next and Get
 * started), then the quick start, shown on Your plan until it's done.
 */
(function (FP) {
  'use strict';

  const { h } = FP.dom;

  // The answers behind a first, rough plan. Same profile fields as Your figures.
  const QUICK = ['about.age', 'income.grossSalary', 'spending.0.monthly', 'assumptions.retirementAge', 'goals.retirementIncome'];
  const SPEND_FIELD = { path: 'spending.0.monthly', label: 'What you spend in a month', type: 'money', suffix: 'a month',
    help: 'Apart from your mortgage and debt payments. A rough figure is fine.' };

  // Spending already split into categories is edited in Setup, not here.
  function quickPaths(p) {
    return QUICK.filter((path) => path !== SPEND_FIELD.path || p.spending.length <= 1);
  }
  const COUNT_WORDS = ['no', 'one', 'two', 'three', 'four', 'five'];
  const questionCount = (p) => COUNT_WORDS[quickPaths(p).length];

  function quickField(path) {
    if (path === SPEND_FIELD.path) return SPEND_FIELD;
    return FP.profile.SECTIONS.flatMap((sec) => sec.fields).find((f) => f.path === path);
  }

  /*
   * Quick start: up to five answers, then a first look at your plan. Where the same
   * fields also appear further down the page (Setup), typing in one copy
   * updates the other.
   */
  function quickStart(ctx, root) {
    const p = ctx.profile();
    if (!p.spending.length) p.spending.push(FP.profile.newSpending());
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
          onChange: (v) => ctx.update(path, v),
        });
      }),
      h('button', { type: 'button', class: 'quick-go', onclick: () => {
        const bad = card.querySelector('[aria-invalid="true"]');
        if (bad) { bad.focus(); ctx.toast('Fix the highlighted box first.'); return; }
        // Your plan shows this page again until these are in, so say what's missing.
        const missing = FP.summary.checklist(ctx.profile()).blocking;
        if (missing.length) {
          const first = missing[0].id === 'spending' ? SPEND_FIELD.path : missing[0].target;
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
    [`Answer ${questionCount(p)} quick questions`, 'Your age, pay, spending and when you’d like to retire. About a minute; rough figures are fine.'],
    ['See your first plan', 'What’s left each month, and how much you’d need for retirement.'],
    ['Add detail when you’re ready', 'Savings, pensions and debts sharpen the picture and unlock your next steps.'],
  ];

  // Ways in other than the quick start: the sample household, or a backup.
  function otherWays(ctx) {
    return h('p', { class: 'gate-other' }, 'Just looking? ',
      h('button', {
        type: 'button', class: 'link',
        onclick: () => { ctx.replaceWorkspace(FP.sampleWorkspace()); ctx.toast('Sample data loaded'); },
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
      || (p.savings || []).length > 0 || p.spending.length > 1 || FP.projection.splitShares(p.leftover, 1).total > 0
      || inc.studentLoanPlan !== 'none' || inc.bonuses.length > 0 || inc.sacrifices.length > 0 || (inc.benefits || []).length > 0
      || inc.otherIncome > 0 || inc.taxFreeIncome > 0 || !!inc.taxCode;
    return !added && !(visited.includes('assets') && visited.includes('debts'));
  }

  FP.welcome = { render, quickStart, isRough };
})(globalThis.FP = globalThis.FP || {});
