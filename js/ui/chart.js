/*
 * Tiny charts, no library. Colours come from CSS custom properties
 * (--series-1 ... --series-8) so light and dark themes both work.
 */
(function (FP) {
  'use strict';

  const { h } = FP.dom;

  /*
   * Horizontal stacked bars on one shared scale, built from HTML so they
   * resize cleanly on any screen width.
   * rows: [{ label, total, segments: [{ label, value, color }] }]
   */
  function stackedBars(rows, opts) {
    const max = Math.max(1, ...rows.map((r) => r.total));
    const tip = h('div', { class: 'chart-tip', role: 'status', hidden: true });
    const wrap = h('div', { class: 'chart-wrap', role: 'group', 'aria-label': opts.ariaLabel });

    rows.forEach((row) => {
      const track = h('div', { class: 'bar-track' });
      const bar = h('div', { class: 'bar', style: `width:${(row.total / max) * 100}%` });
      row.segments.filter((seg) => seg.value > 0).forEach((seg) => {
        const el = h('div', {
          class: 'seg', tabindex: '0', role: 'img',
          style: `flex-grow:${seg.value};background:var(${seg.color})`,
          'aria-label': `${row.label}: ${seg.label} ${FP.dom.money(seg.value)}`,
        });
        const show = (evt) => showTip(seg, row, el, evt);
        el.addEventListener('pointerenter', show);
        el.addEventListener('pointermove', show);
        el.addEventListener('focus', show);
        el.addEventListener('pointerleave', hideTip);
        el.addEventListener('blur', hideTip);
        bar.appendChild(el);
      });
      if (row.total <= 0) track.classList.add('empty');
      track.appendChild(bar);
      wrap.appendChild(h('div', { class: 'bar-row' },
        h('div', { class: 'bar-label' }, h('span', null, row.label), h('strong', null, FP.dom.money(row.total))),
        track));
    });
    wrap.appendChild(tip);

    function showTip(seg, row, el, evt) {
      const share = row.total > 0 ? ` · ${FP.dom.pct((seg.value / row.total) * 100, 0)} of ${row.label.toLowerCase()}` : '';
      tip.textContent = `${seg.label}: ${FP.dom.money(seg.value)}${share}`;
      tip.hidden = false;
      const box = wrap.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      const px = evt && evt.type !== 'focus' && evt.clientX != null ? evt.clientX - box.left : r.left - box.left + r.width / 2;
      const tw = tip.offsetWidth;
      tip.style.left = `${Math.min(Math.max(px - tw / 2, 0), Math.max(box.width - tw, 0))}px`;
      tip.style.top = `${r.top - box.top - tip.offsetHeight - 6}px`;
    }
    function hideTip() { tip.hidden = true; }

    return wrap;
  }

  function legend(items) {
    return h('ul', { class: 'legend' }, items.map((it) => h('li', null,
      h('span', { class: 'swatch', style: `background:var(${it.color})`, 'aria-hidden': 'true' }),
      h('span', { class: 'legend-label' }, it.label),
      h('span', { class: 'legend-value' }, FP.dom.money(it.value)))));
  }

  FP.chart = { stackedBars, legend };
})(globalThis.FP = globalThis.FP || {});
