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

  const SVG = 'http://www.w3.org/2000/svg';
  function s(tag, attrs) {
    const el = document.createElementNS(SVG, tag);
    Object.entries(attrs || {}).forEach(([k, v]) => { if (v != null) el.setAttribute(k, v); });
    return el;
  }

  // £1.2m, £250k, £900
  function compactMoney(n) {
    const a = Math.abs(n);
    const sign = n < 0 ? '\u2212' : '';
    if (a >= 1e6) return `${sign}\u00a3${Number((a / 1e6).toFixed(a >= 1e7 ? 0 : 1))}m`;
    if (a >= 1e3) return `${sign}\u00a3${Math.round(a / 1e3)}k`;
    return `${sign}\u00a3${Math.round(a)}`;
  }

  function niceTicks(min, max, count) {
    const span = max - min || 1;
    const raw = span / count;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((st) => st >= raw) || raw;
    const lo = Math.floor(min / step) * step;
    const hi = Math.ceil(max / step) * step;
    const ticks = [];
    for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Math.abs(v) < step / 1e6 ? 0 : v);
    return ticks;
  }

  /*
   * Line or stacked-area chart over time, sized to its container.
   * opts: {
   *   type: 'line' | 'area',
   *   xLabels: ['38', '39', ...]        (one per point; shown as "Age 38")
   *   xTitle: (i) => 'Age 38 (2026)'    (tooltip heading)
   *   series: [{ label, color, values: [] }]   (area: stacked in order; negatives stack downward)
   *   markers: [{ index, label }]        (dashed vertical lines)
   *   band: { label, color, low: [], high: [] }   (line only: a shaded range behind the lines)
   *   directLabels: true                 (write series names on the chart)
   *   ariaLabel
   * }
   */
  function timeChart(opts) {
    const wrap = h('div', { class: 'tchart' });
    const holder = h('div', { class: 'tchart-svg' });
    const tip = h('div', { class: 'chart-tip tchart-tip', role: 'status', hidden: true });
    wrap.append(holder, tip);
    const n = opts.xLabels.length;
    let active = null;
    let lastWidth = 0;

    // Precompute stacks / extents
    const stacks = opts.series.map(() => []);
    const downward = opts.series.map((ser) => ser.values.some((v) => v < 0));
    let min = 0;
    let max = 0;
    for (let i = 0; i < n; i += 1) {
      let pos = 0;
      let neg = 0;
      opts.series.forEach((ser, si) => {
        const v = ser.values[i] || 0;
        if (opts.type === 'area') {
          // A series with any negative value (e.g. debts) always stacks below zero,
          // so its band stays put when it reaches zero.
          const down = downward[si];
          const base = down ? neg : pos;
          const top = base + (down ? Math.min(v, 0) : Math.max(v, 0));
          stacks[si][i] = [base, top];
          if (down) neg = top; else pos = top;
        } else {
          // Lines may have gaps (null), e.g. scenarios with different lengths.
          const lv = ser.values[i] == null ? null : v;
          stacks[si][i] = [lv, lv];
          if (lv == null) return;
        }
        min = Math.min(min, stacks[si][i][1]);
        max = Math.max(max, stacks[si][i][1]);
      });
    }
    const band = opts.type === 'line' && opts.band ? opts.band : null;
    if (band) {
      for (let i = 0; i < n; i += 1) {
        if (band.low[i] != null) min = Math.min(min, band.low[i]);
        if (band.high[i] != null) max = Math.max(max, band.high[i]);
      }
    }
    let ticks = niceTicks(min, max, 4);
    let yMin = ticks[0];
    // A small dip below zero (e.g. a little debt) gets just enough room, not a whole tick.
    const step = ticks.length > 1 ? ticks[1] - ticks[0] : 1;
    if (min < 0 && -min < step * 0.25) {
      ticks = ticks.filter((t) => t >= 0);
      yMin = min * 1.6;
    }
    const yMax = ticks[ticks.length - 1];

    function draw() {
      const W = Math.max(280, holder.clientWidth || wrap.clientWidth || 340);
      lastWidth = W;
      const H = Math.round(Math.min(320, Math.max(220, W * 0.55)));
      const m = { l: 52, r: 12, t: 18, b: 28 };
      const pw = W - m.l - m.r;
      const x = (i) => m.l + (n <= 1 ? 0 : (i / (n - 1)) * pw);
      // Marker labels that would overlap go on a second (third...) row above the plot.
      const markers = (opts.markers || []).filter((mk) => mk.index != null && mk.index >= 0 && mk.index < n)
        .slice().sort((p, q) => p.index - q.index);
      const rowEnds = [];
      markers.forEach((mk) => {
        const px = x(mk.index);
        let row = rowEnds.findIndex((end) => px - end > 96);
        if (row === -1) { row = rowEnds.length; rowEnds.push(0); }
        rowEnds[row] = px;
        mk.row = row;
      });
      m.t += Math.max(0, rowEnds.length - 1) * 13;
      const ph = H - m.t - m.b;
      const y = (v) => m.t + (1 - (v - yMin) / (yMax - yMin || 1)) * ph;

      const svg = s('svg', {
        width: W, height: H, viewBox: `0 0 ${W} ${H}`, class: 'tchart-plot', role: 'img', tabindex: '0',
        'aria-label': `${opts.ariaLabel}. Use the left and right arrow keys to read values year by year.`,
      });

      // Grid + y labels
      ticks.forEach((t) => {
        svg.appendChild(s('line', { x1: m.l, x2: W - m.r, y1: y(t), y2: y(t), class: t === 0 ? 'axis-zero' : 'grid' }));
        const lbl = s('text', { x: m.l - 6, y: y(t) + 4, class: 'tick', 'text-anchor': 'end' });
        lbl.textContent = compactMoney(t);
        svg.appendChild(lbl);
      });
      // x labels: about every 5 or 10 points
      const every = n > 30 ? 10 : 5;
      for (let i = 0; i < n; i += 1) {
        if (i % every !== 0 && i !== n - 1) continue;
        if (i !== n - 1 && n - 1 - i < every / 2) continue;
        const lbl = s('text', { x: x(i), y: H - 8, class: 'tick', 'text-anchor': i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle' });
        lbl.textContent = opts.xLabels[i];
        svg.appendChild(lbl);
      }

      // Markers
      markers.forEach((mk) => {
        svg.appendChild(s('line', { x1: x(mk.index), x2: x(mk.index), y1: m.t - mk.row * 13, y2: m.t + ph, class: 'marker' }));
        const lbl = s('text', { x: x(mk.index) + 4, y: m.t - 5 - mk.row * 13, class: 'marker-label', 'text-anchor': mk.index > n * 0.8 ? 'end' : 'start' });
        if (mk.index > n * 0.8) lbl.setAttribute('x', x(mk.index) - 4);
        lbl.textContent = mk.label;
        svg.appendChild(lbl);
      });

      // Range band, behind the lines
      if (band) {
        let d = '';
        for (let i = 0; i < n; i += 1) d += `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(band.high[i]).toFixed(1)}`;
        for (let i = n - 1; i >= 0; i -= 1) d += `L${x(i).toFixed(1)},${y(band.low[i]).toFixed(1)}`;
        svg.appendChild(s('path', { d: `${d}Z`, fill: `var(${band.color})`, class: 'band' }));
      }

      // Series
      opts.series.forEach((ser, si) => {
        const pts = stacks[si];
        if (opts.type === 'area') {
          if (!ser.values.some((v) => Math.abs(v || 0) > 0.5)) return;
          let d = '';
          for (let i = 0; i < n; i += 1) d += `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(pts[i][1]).toFixed(1)}`;
          for (let i = n - 1; i >= 0; i -= 1) d += `L${x(i).toFixed(1)},${y(pts[i][0]).toFixed(1)}`;
          svg.appendChild(s('path', { d: `${d}Z`, fill: `var(${ser.color})`, class: 'area' }));
        } else {
          let d = '';
          let pen = 'M';
          for (let i = 0; i < n; i += 1) {
            if (pts[i][1] == null) { pen = 'M'; continue; }
            d += `${pen}${x(i).toFixed(1)},${y(pts[i][1]).toFixed(1)}`;
            pen = 'L';
          }
          svg.appendChild(s('path', { d, stroke: `var(${ser.color})`, class: `line${ser.dashed ? ' dashed' : ''}` }));
        }
      });

      if (opts.directLabels) drawLabels(svg, x, y, W - m.r, m.l, m.t, m.t + ph);

      // Hover layer
      const cross = s('line', { y1: m.t, y2: m.t + ph, class: 'crosshair', visibility: 'hidden' });
      svg.appendChild(cross);
      const dots = opts.type === 'line'
        ? opts.series.map((ser) => { const c = s('circle', { r: 4.5, fill: `var(${ser.color})`, class: 'dot', visibility: 'hidden' }); svg.appendChild(c); return c; })
        : [];
      const hit = s('rect', { x: m.l, y: m.t, width: pw, height: ph, fill: 'transparent' });
      svg.appendChild(hit);

      function show(i) {
        active = Math.max(0, Math.min(n - 1, i));
        cross.setAttribute('x1', x(active));
        cross.setAttribute('x2', x(active));
        cross.setAttribute('visibility', 'visible');
        dots.forEach((c, si) => {
          const v = stacks[si][active][1];
          c.setAttribute('cx', x(active));
          c.setAttribute('cy', v == null ? 0 : y(v));
          c.setAttribute('visibility', v == null ? 'hidden' : 'visible');
        });
        // Points are a year apart from today, so from the fifth on they're estimates: rounded.
        // (opts.approxFrom: the first point to round; Infinity for figures that are all actual.)
        const fmt = (v) => FP.dom.money(v, { approx: active >= (opts.approxFrom == null ? FP.dom.APPROX_YEARS : opts.approxFrom) });
        const items = opts.series.map((ser) => ({ ser, v: ser.values[active] }))
          .filter((it) => opts.type !== 'area' || Math.abs(it.v || 0) > 0.5);
        const ordered = opts.type === 'area' ? items.slice().reverse() : items;
        FP.dom.fill(tip,
          h('strong', null, opts.xTitle(active)),
          h('ul', null, ordered.map((it) => h('li', null,
            h('span', { class: 'swatch', style: `background:var(${it.ser.color})` }),
            h('span', { class: 'tip-label' }, it.ser.label),
            h('span', { class: 'tip-value' }, it.v == null ? '\u2014' : fmt(it.v))))),
          band ? h('p', { class: 'tip-total' }, h('span', null, band.label), h('span', null, `${fmt(band.low[active])} \u2013 ${fmt(band.high[active])}`)) : null,
          opts.type === 'area' && opts.totalLabel
            ? h('p', { class: 'tip-total' }, h('span', null, opts.totalLabel), h('span', null, fmt(items.reduce((t, it) => t + (it.v || 0), 0))))
            : null);
        tip.hidden = false;
        const tw = tip.offsetWidth;
        const px = x(active);
        const left = px + 14 + tw > W ? px - 14 - tw : px + 14;
        tip.style.left = `${Math.max(0, left)}px`;
        tip.style.top = `${m.t}px`;
      }
      function hide() {
        active = null;
        tip.hidden = true;
        cross.setAttribute('visibility', 'hidden');
        dots.forEach((c) => c.setAttribute('visibility', 'hidden'));
      }
      const fromEvent = (e) => {
        const r = svg.getBoundingClientRect();
        return Math.round(((e.clientX - r.left - m.l) / pw) * (n - 1));
      };
      svg.addEventListener('pointermove', (e) => show(fromEvent(e)));
      svg.addEventListener('pointerdown', (e) => show(fromEvent(e)));
      svg.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') hide(); });
      svg.addEventListener('blur', hide);
      svg.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
          e.preventDefault();
          const step = e.key === 'ArrowRight' ? 1 : -1;
          show(active == null ? (step > 0 ? 0 : n - 1) : active + step);
        } else if (e.key === 'Escape') hide();
      });

      holder.replaceChildren(svg);
      if (active != null) show(active);
    }

    /*
     * Series names written on the chart, so colour isn't the only way to tell
     * them apart: lines are named at their last point, areas where they are
     * thickest (skipped if too thin or if they'd overlap another label).
     */
    function drawLabels(svg, x, y, right, left, top, bottom) {
      const LH = 14;
      const placed = [];
      opts.series.forEach((ser, si) => {
        const pts = stacks[si];
        const w = ser.label.length * 7.2;
        let i;
        let ly;
        let anchor;
        if (opts.type === 'area') {
          let best = -1;
          for (let k = 0; k < n; k += 1) {
            const t = Math.abs(y(pts[k][0]) - y(pts[k][1]));
            if (best === -1 || t > Math.abs(y(pts[best][0]) - y(pts[best][1]))) best = k;
          }
          if (best === -1 || Math.abs(y(pts[best][0]) - y(pts[best][1])) < LH + 2) return;
          i = best;
          ly = (y(pts[i][0]) + y(pts[i][1])) / 2 + 4;
          anchor = 'middle';
        } else {
          for (i = n - 1; i >= 0 && pts[i][1] == null; i -= 1);
          if (i < 0) return;
          ly = y(pts[i][1]) - 6;
          anchor = 'end';
        }
        let lx = anchor === 'end' ? Math.min(x(i), right) - 2 : Math.min(Math.max(x(i), left + w / 2), right - w / 2);
        ly = Math.min(Math.max(ly, top + LH), bottom - 2);
        // Lines that end close together: nudge the label up or down a row.
        const box = () => (anchor === 'end' ? [lx - w, lx] : [lx - w / 2, lx + w / 2]);
        const clash = () => placed.some((p) => Math.abs(p.y - ly) < LH && box()[0] < p.x[1] && p.x[0] < box()[1]);
        if (opts.type !== 'area') {
          const base = ly;
          [0, -1, 1, -2, 2, -3, 3].some((k) => { ly = base + k * LH; return !clash() && ly >= top + LH - 4 && ly <= bottom; });
        }
        if (clash() || ly < top + LH - 4 || ly > bottom) return;
        placed.push({ x: box(), y: ly });
        const t = s('text', { x: lx, y: ly, class: 'series-label', 'text-anchor': anchor, 'aria-hidden': 'true' });
        t.textContent = ser.label;
        svg.appendChild(t);
      });
    }

    // Draw once attached, and again when the width changes.
    requestAnimationFrame(draw);
    if (typeof ResizeObserver === 'function') {
      new ResizeObserver(() => {
        const w = holder.clientWidth;
        if (w && Math.abs(w - lastWidth) > 2) draw();
      }).observe(holder);
    }
    return wrap;
  }

  // Legend without values (for charts over time).
  function keys(items) {
    return h('ul', { class: 'legend legend-inline' }, items.map((it) => h('li', null,
      h('span', { class: `swatch${it.line ? ' swatch-line' : ''}${it.dashed ? ' swatch-dashed' : ''}${it.band ? ' swatch-band' : ''}`, style: `background:var(${it.color})`, 'aria-hidden': 'true' }),
      h('span', { class: 'legend-label' }, it.label))));
  }

  FP.chart = { stackedBars, legend, timeChart, keys, compactMoney };
})(globalThis.FP = globalThis.FP || {});
