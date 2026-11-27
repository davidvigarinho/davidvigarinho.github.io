/* Two small interactive figures. Everything works without this file:
   the exploded view shows exploded, the tilt table falls back to the static plot. */
{
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

  /* ---------- exploded corner assembly ----------
     Layers sit at their exploded positions in the HTML. JS pulls them together
     along the explode axis; t = 1 assembled, t = 0 exploded. Offsets are in source-image px. */
  const AXIS = [0.969, -0.248];
  const OFF = { A: 260, B: 170, C: 150, D: 0, E: -150, F: -260 };
  const SRC_W = 1663;

  function setT(stage, t) {
    const k = stage.clientWidth / SRC_W;
    stage.querySelectorAll('[data-layer]').forEach(el => {
      const o = OFF[el.dataset.layer] * t * k;
      el.style.transform = `translate(${(AXIS[0] * o).toFixed(1)}px, ${(AXIS[1] * o).toFixed(1)}px)`;
    });
    stage.style.setProperty('--labels', clamp((0.35 - t) / 0.35, 0, 1).toFixed(3));
  }

  // scroll-driven (project page)
  const track = document.querySelector('.explode-track');
  if (track) {
    const stage = track.querySelector('.stage');
    if (reduce) { setT(stage, 0); }
    else {
      track.classList.add('is-live');
      let ticking = false;
      const update = () => {
        ticking = false;
        const r = track.getBoundingClientRect();
        const span = r.height - innerHeight;
        const p = span > 0 ? clamp(-r.top / span, 0, 1) : 1;
        setT(stage, 1 - ease(clamp(p / 0.8, 0, 1)));
      };
      const req = () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } };
      addEventListener('scroll', req, { passive: true });
      addEventListener('resize', req);
      update();
    }
    // parts list <-> layers
    const rows = document.querySelectorAll('.parts [data-for]');
    rows.forEach(row => {
      const on = () => { stage.dataset.focus = row.dataset.for; };
      const off = () => { delete stage.dataset.focus; };
      row.addEventListener('mouseenter', on); row.addEventListener('mouseleave', off);
      row.addEventListener('focusin', on); row.addEventListener('focusout', off);
    });
  }

  // one-time assemble -> explode on load (home page)
  document.querySelectorAll('.stage[data-auto]').forEach(stage => {
    if (reduce) return setT(stage, 0);
    setT(stage, 1);
    const start = performance.now() + 450, dur = 1600;
    const step = now => {
      const p = clamp((now - start) / dur, 0, 1);
      setT(stage, 1 - ease(p));
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
    addEventListener('resize', () => setT(stage, 0));
  });

  /* ---------- tilt table ----------
     Values read off the thesis tilt-table plots: body angle minus platform angle, in degrees. */
  const tilt = document.querySelector('.tilt');
  if (tilt) {
    const STD = [[12, .4], [13, .4], [14, .4], [15, .4], [16, .4], [17, .45], [18, .5], [19, .55], [20, .6], [21, .6], [22, .7], [23, .7], [24, .8], [25, .9], [26, .9], [27, 2.0], [27.5, 2.6], [28, 3.0], [28.5, 3.5]];
    const REA = [[12, -.69], [13, -.72], [14, -.74], [15, -.75], [16, -.95], [17, -1.10], [18, -1.27], [19, -1.38], [20, -1.48]];
    const EXAG = 10;
    const lerp = (data, x) => {
      if (x < data[0][0] || x > data[data.length - 1][0]) return null;
      for (let i = 1; i < data.length; i++) {
        const [x0, y0] = data[i - 1], [x1, y1] = data[i];
        if (x <= x1) return y0 + (y1 - y0) * (x - x0) / (x1 - x0);
      }
      return data[data.length - 1][1];
    };
    const input = tilt.querySelector('input[type=range]');
    const out = tilt.querySelector('.tilt-angle');
    const panels = [...tilt.querySelectorAll('.tilt-panel')];
    const chart = tilt.querySelector('.tilt-chart svg');
    const fmt = v => (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(1) + '°';

    function vehicle(svg, platform, rel) {
      const W = 320, H = 250, cx = 160, base = 165;          // pivot of the table at (cx, base)
      const a = -platform, r = rel === null ? 0 : -rel * EXAG;
      const dim = rel === null ? ' opacity=".2"' : '';
      const by = 104, bc = 90;                               // body bottom, body rotation centre
      const rad = r * Math.PI / 180, rot = (x, y) => [
        cx + (x - cx) * Math.cos(rad) - (y - bc) * Math.sin(rad),
        bc + (x - cx) * Math.sin(rad) + (y - bc) * Math.cos(rad)];
      const [lx, ly] = rot(cx - 52, by), [rx, ry] = rot(cx + 52, by);
      const wy = base - 21;
      const wheel = x => `<circle cx="${x}" cy="${wy}" r="21" class="t-tyre"/><circle cx="${x}" cy="${wy}" r="7" class="t-hub"/>`;
      svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
      svg.innerHTML = `
        <line x1="0" y1="${base}" x2="${W}" y2="${base}" class="t-level" />
        <g transform="rotate(${a} ${cx} ${base})">
          <rect x="${cx - 125}" y="${base}" width="250" height="7" class="t-plat" />
          <line x1="${cx}" y1="${base}" x2="${cx}" y2="22" class="t-normal" />
          <g${dim}>
            <path d="M${cx - 70} ${wy} L${lx.toFixed(1)} ${ly.toFixed(1)} M${cx + 70} ${wy} L${rx.toFixed(1)} ${ry.toFixed(1)}" class="t-arm" />
            ${wheel(cx - 70)}${wheel(cx + 70)}
            <g transform="rotate(${r} ${cx} ${bc})">
              <rect x="${cx - 64}" y="62" width="128" height="${by - 62}" rx="3" class="t-body" />
              <circle cx="${cx}" cy="${bc - 7}" r="3.5" class="t-cg" />
              <line x1="${cx}" y1="56" x2="${cx}" y2="22" class="t-body-axis" />
            </g>
          </g>
        </g>`;
    }

    function drawChart(x) {
      const w = chart.clientWidth || 600, h = chart.clientHeight || 220;
      const m = { l: 40, r: 12, t: 14, b: 30 };
      const X = v => m.l + (v - 12) / (29 - 12) * (w - m.l - m.r);
      const Y = v => m.t + (3.6 - v) / (3.6 + 1.8) * (h - m.t - m.b);
      const line = d => d.map(([a, b], i) => (i ? 'L' : 'M') + X(a).toFixed(1) + ' ' + Y(b).toFixed(1)).join(' ');
      const ys = [-1, 0, 1, 2, 3], xs = [12, 16, 20, 24, 28];
      const s = lerp(STD, x), q = lerp(REA, x);
      chart.setAttribute('viewBox', `0 0 ${w} ${h}`);
      chart.innerHTML = `
        ${ys.map(v => `<line x1="${m.l}" x2="${w - m.r}" y1="${Y(v)}" y2="${Y(v)}" class="${v === 0 ? 'c-zero' : 'c-grid'}"/><text x="${m.l - 8}" y="${Y(v) + 4}" text-anchor="end" class="c-tick">${v > 0 ? '+' : ''}${v}°</text>`).join('')}
        ${xs.map(v => `<text x="${X(v)}" y="${h - 8}" text-anchor="middle" class="c-tick">${v}°</text>`).join('')}
        <line x1="${X(x)}" x2="${X(x)}" y1="${m.t}" y2="${h - m.b}" class="c-cursor"/>
        <path d="${line(STD)}" class="c-std"/>
        <path d="${line(REA)}" class="c-rea"/>
        ${s !== null ? `<circle cx="${X(x)}" cy="${Y(s)}" r="4.5" class="c-dot-std"/>` : ''}
        ${q !== null ? `<circle cx="${X(x)}" cy="${Y(q)}" r="4.5" class="c-dot-rea"/>` : ''}`;
    }

    function render() {
      const x = +input.value;
      out.textContent = x.toFixed(1).replace('.0', '') + '°';
      input.setAttribute('aria-valuetext', `Platform ${x} degrees`);
      [[panels[0], lerp(STD, x)], [panels[1], lerp(REA, x)]].forEach(([p, rel]) => {
        vehicle(p.querySelector('svg'), x, rel);
        p.querySelector('.tilt-val').textContent = rel === null ? 'No data past 20°' : fmt(rel);
      });
      drawChart(x);
    }
    input.addEventListener('input', render);
    new ResizeObserver(() => drawChart(+input.value)).observe(chart);
    tilt.classList.add('is-live');
    render();
  }
}
