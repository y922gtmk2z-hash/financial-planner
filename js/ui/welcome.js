/*
 * Welcome: what this planner is, shown on Your plan until you've added any
 * figures (a first visit, or after clearing your data).
 */
(function (FP) {
  'use strict';

  const { h } = FP.dom;

  const ANSWERS = [
    ['Each month', 'What you take home after tax, and what’s left after spending and debts.'],
    ['Debt-free', 'When your mortgage, student loan and other debts will be paid off.'],
    ['Retirement', 'How much you’d need when you retire, and how long your money would last.'],
    ['What to do next', 'Ideas based on your figures, and the changes that would make the biggest difference.'],
  ];

  // The answers behind a first, rough plan. Same profile fields as Your figures.
  const QUICK = ['about.age', 'income.grossSalary', 'spending.0.monthly', 'assumptions.retirementAge', 'goals.retirementIncome'];
  const SPEND_FIELD = { path: 'spending.0.monthly', label: 'What you spend in a month', type: 'money', suffix: 'a month',
    help: 'Apart from your mortgage and debt payments. A rough figure is fine.' };

  function quickField(path) {
    if (path === SPEND_FIELD.path) return SPEND_FIELD;
    return FP.profile.SECTIONS.flatMap((sec) => sec.fields).find((f) => f.path === path);
  }

  /*
   * Quick start: four answers, then a first look at your plan. Where the same
   * fields also appear further down the page (Setup), typing in one copy
   * updates the other.
   */
  function quickStart(ctx, root) {
    const p = ctx.profile();
    if (!p.spending.length) p.spending.push(FP.profile.newSpending());
    // Spending already split into categories is edited in Setup, not here.
    const paths = QUICK.filter((path) => path !== SPEND_FIELD.path || p.spending.length === 1);
    const card = h('section', { class: 'card quick-start', 'aria-labelledby': 'quick-h' },
      h('h2', { id: 'quick-h' }, 'Quick start'),
      h('p', { class: 'muted' }, 'A few questions for a first look at your plan. You can add detail afterwards.'),
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
        ctx.go('overview');
      } }, 'See my plan'));
    (root || card).addEventListener('input', (e) => {
      const wrap = e.target.closest && e.target.closest('[data-path]');
      if (!wrap || !paths.includes(wrap.dataset.path)) return;
      (root || card).querySelectorAll(`[data-path="${CSS.escape(wrap.dataset.path)}"] input`).forEach((i) => { if (i !== e.target) i.value = e.target.value; });
    });
    return card;
  }

  function render(root, ctx) {
    FP.dom.add(root,
      h('section', { class: 'welcome', 'aria-labelledby': 'welcome-h' },
        h('h1', { id: 'welcome-h' }, 'Plan your money, privately'),
        h('p', { class: 'lead' }, 'A UK personal finance planner. Start with a few questions; everything stays in this browser.')),
      quickStart(ctx),
      h('section', { class: 'card', 'aria-labelledby': 'welcome-see' },
        h('h2', { id: 'welcome-see' }, 'What you\u2019ll see'),
        h('ul', { class: 'welcome-answers' }, ANSWERS.map(([title, text]) => h('li', null, h('strong', null, title), h('span', null, text))))),
      h('section', { class: 'card', 'aria-label': 'Other ways to start' },
        h('div', { class: 'button-row' },
          h('a', { class: 'button secondary', href: '#setup' }, 'Fill in all your figures'),
          h('button', {
            type: 'button', class: 'secondary',
            onclick: () => { ctx.replaceWorkspace(FP.sampleWorkspace()); ctx.toast('Sample data loaded'); },
          }, 'Load sample data')),
        h('p', { class: 'muted small' }, 'The sample is a fictional household to look around with. Used the planner before on another device? ', h('a', { href: '#data' }, 'Import your backup file'), '.')),
      h('section', { class: 'card', 'aria-labelledby': 'welcome-how' },
        h('h2', { id: 'welcome-how' }, 'How it works'),
        h('ol', { class: 'welcome-steps' },
          h('li', null, h('strong', null, 'Your figures'), ' takes about five minutes, in short sections: About you, Income, Outgoings, Assets and Debts. A rough figure is fine — you can change anything later.'),
          h('li', null, h('strong', null, 'Your plan'), ' answers those questions. With just the quick start it\u2019s a first look; it fills in as you add detail.'),
          h('li', null, h('strong', null, 'Tap any result'), ' to see what drives it, try changes and see the effect straight away.')),
        h('p', { class: 'muted' }, 'Useful to have to hand: a recent payslip (with your tax code), your savings, investment and pension balances, and your mortgage and any loan statements.')),
      h('section', { class: 'card', 'aria-labelledby': 'welcome-private' },
        h('h2', { id: 'welcome-private' }, 'Your data stays with you'),
        h('p', null, 'Everything is saved in this browser on this device. Nothing is sent anywhere, and there are no accounts. You can export a backup or clear everything at any time in Your data.'),
        h('p', { class: 'muted' }, 'This is a planning illustration, not financial advice. Results depend on your figures and the assumptions you can see and change.')));
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
