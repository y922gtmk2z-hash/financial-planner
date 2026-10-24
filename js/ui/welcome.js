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
    ['Retirement', 'Whether you’re on track, and how much you could spend each month.'],
    ['What to do next', 'Ideas based on your figures, and the changes that would make the biggest difference.'],
  ];

  function render(root) {
    FP.dom.add(root,
      h('section', { class: 'welcome', 'aria-labelledby': 'welcome-h' },
        h('h1', { id: 'welcome-h' }, 'Plan your money, privately'),
        h('p', { class: 'lead' }, 'A UK personal finance planner. Put in your figures once and see:'),
        h('ul', { class: 'welcome-answers' }, ANSWERS.map(([title, text]) => h('li', null, h('strong', null, title), h('span', null, text)))),
        h('a', { class: 'button welcome-start', href: '#setup' }, 'Get started'),
        h('p', { class: 'muted small' }, 'Used it before on another device? ', h('a', { href: '#data' }, 'Import your backup file'), '.')),
      h('section', { class: 'card', 'aria-labelledby': 'welcome-how' },
        h('h2', { id: 'welcome-how' }, 'How it works'),
        h('ol', { class: 'welcome-steps' },
          h('li', null, h('strong', null, 'Setup'), ' takes about five minutes, in four short sections: About you, What you spend and save, Assets, and Debts. A rough figure is fine — you can change anything later.'),
          h('li', null, h('strong', null, 'Your plan'), ' answers the questions above, each with a clear verdict.'),
          h('li', null, h('strong', null, 'Tap any result'), ' to see what drives it, try changes and see the effect straight away.')),
        h('p', { class: 'muted' }, 'Useful to have to hand: a recent payslip (with your tax code), your savings, investment and pension balances, and your mortgage and any loan statements.')),
      h('section', { class: 'card', 'aria-labelledby': 'welcome-private' },
        h('h2', { id: 'welcome-private' }, 'Your data stays with you'),
        h('p', null, 'Everything is saved in this browser on this device. Nothing is sent anywhere, and there are no accounts. You can export a backup or clear everything at any time in Your data.'),
        h('p', { class: 'muted' }, 'This is a planning illustration, not financial advice. Results depend on your figures and the assumptions you can see and change.')));
  }

  FP.welcome = { render };
})(globalThis.FP = globalThis.FP || {});
