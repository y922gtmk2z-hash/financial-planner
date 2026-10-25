/*
 * Today (route #now): where you stand today, in three parts you switch between: this month
 * (cash flow), what you own and owe, and your pay and tax.
 */
(function (FP) {
  'use strict';

  const { h } = FP.dom;
  const VIEWS = [
    { id: 'month', label: 'This month' },
    { id: 'own', label: 'Own and owe' },
    { id: 'pay', label: 'Pay and tax' },
  ];

  function render(root, ctx) {
    const p = ctx.profile();
    const a = p.assumptions;
    const pay = FP.tax.forProfile(p);
    const s = FP.summary.compute(p, FP.tax.household(p).takeHomeMonthly);
    const T = FP.screens.today.parts;
    const I = FP.screens.income.parts;
    const target = location.hash.split('/')[1];
    let view = VIEWS.some((v) => v.id === target) ? target : (FP.store.pref('nowView') || 'month');
    if (!VIEWS.some((v) => v.id === view)) view = 'month';

    const body = h('div', { id: 'now-view' });
    const nav = h('div', { class: 'segmented', role: 'tablist', 'aria-label': 'Today' });

    function draw() {
      FP.dom.fill(nav, VIEWS.map((v) => h('button', {
        type: 'button', role: 'tab', id: `now-tab-${v.id}`, 'aria-selected': String(v.id === view), 'aria-controls': 'now-view',
        tabindex: v.id === view ? '0' : '-1',
        onclick: () => { view = v.id; FP.store.pref('nowView', view); draw(); },
        onkeydown: (e) => {
          const i = VIEWS.findIndex((x) => x.id === view);
          if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
          view = VIEWS[(i + (e.key === 'ArrowRight' ? 1 : VIEWS.length - 1)) % VIEWS.length].id;
          FP.store.pref('nowView', view);
          draw();
          nav.querySelector('[aria-selected="true"]').focus();
        },
      }, v.label)));
      body.setAttribute('role', 'tabpanel');
      body.setAttribute('aria-labelledby', `now-tab-${view}`);
      FP.dom.fill(body,
        view === 'month' ? T.cashFlowCard(s, a, p, pay) : null,
        view === 'own' ? [T.netWorthCard(s), T.chartCard(s), T.homeCard(s, a, p)] : null,
        view === 'pay' ? payView() : null);
    }

    /*
     * Pay and tax: yours, or with a partner, a switch between yours and
     * theirs (each worked out on its own allowance) and what you take home together.
     */
    let person = 0;
    function payView() {
      if (!p.partner) return [I.taxYearNotice(), I.resultsView(p), I.yourPayCard(p)];
      const P = FP.profile;
      const hh = FP.tax.household(p);
      const own = P.asPerson(p, person);
      const whose = person ? P.capital(P.whose(p, 1)) : null;
      const label = (i) => (i ? p.partner.name || 'Your partner' : p.about.name ? `${p.about.name} (you)` : 'You');
      return [
        I.taxYearNotice(),
        h('p', { class: 'together' }, 'Together you take home ', h('strong', null, `${FP.dom.money(hh.takeHomeMonthly)} a month`),
          ` (${hh.people.map((x, i) => `${i ? P.who(p, 1) : 'you'} ${FP.dom.money(x.takeHomeMonthly)}`).join(', ')}).`),
        FP.field.render({ path: 'pay-person', label: 'Whose pay?', type: 'toggle', options: [{ value: '0', label: label(0) }, { value: '1', label: label(1) }] }, {
          value: String(person), compact: true,
          onChange: (v) => {
            person = Number(v);
            draw();
            const on = body.querySelector('[data-path="pay-person"] input:checked');
            if (on) on.focus();
          },
        }),
        person ? h('p', { class: 'notice info small' }, `${whose} pay and tax, on ${P.whose(p, 1)} own personal allowance. Where it says \u2018you\u2019, it means ${P.who(p, 1)}.`) : null,
        I.resultsView(own, whose),
        I.yourPayCard(own, person),
      ];
    }

    if (FP.checklist.isEmpty(p)) {
      FP.dom.add(root, FP.dom.pageHead('Today', 'Where you stand this month'), FP.checklist.emptyCard('where you stand today'));
      return;
    }
    FP.dom.add(root,
      FP.dom.pageHead('Today', 'Where you stand this month'),
      s.warnings.length ? h('ul', { class: 'notices' }, s.warnings.map((w) =>
        h('li', { class: `notice ${w.level}` }, h('span', { class: 'notice-icon', 'aria-hidden': 'true' }, w.level === 'warn' ? '!' : 'i'), w.text))) : null,
      nav, body);
    draw();
  }

  FP.screens = FP.screens || {};
  FP.screens.now = { title: 'Today', render };
})(globalThis.FP = globalThis.FP || {});
