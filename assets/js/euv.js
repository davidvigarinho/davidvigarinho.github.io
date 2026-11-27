/* How an LPP EUV source makes light: a schematic, slowed-down cycle.
   Public figures only (asml.com): 70 m/s droplets, pre-pulse flattens, main pulse ~500,000 K,
   50,000 cycles per second. One cycle = 20 µs; droplet spacing = 70 m/s x 20 µs = 1.4 mm. */
{
  const root = document.querySelector('.euv');
  if (root) {
    const zone = root.querySelector('.euv-zone');
    const coll = root.querySelector('.euv-collector');
    const range = root.querySelector('input[type=range]');
    const btn = root.querySelector('.euv-play');
    const clock = root.querySelector('.euv-clock');
    const steps = [...root.querySelectorAll('.euv-steps li')];
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const CYCLE_MS = 4000;                // 20 µs shown over 4 s: slowed down 200,000 times
    const T_PRE = 0.30, T_MAIN = 0.52;    // pulse timings within the cycle (schematic)
    const S = 250, ZX = 300, ZY = 190;    // droplet spacing (px) = 1.4 mm; interaction point
    const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
    const ramp = (t, a, b) => clamp((t - a) / (b - a), 0, 1);

    // static parts of the close-up
    zone.setAttribute('viewBox', '0 0 560 380');
    const NS = 'http://www.w3.org/2000/svg';
    const el = (tag, attrs, parent = zone) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); parent.appendChild(e); return e; };
    zone.innerHTML = `
      <defs>
        <radialGradient id="plasma"><stop offset="0" stop-color="#fff"/><stop offset=".35" stop-color="#ffd3c9"/><stop offset=".7" stop-color="var(--red)" stop-opacity=".55"/><stop offset="1" stop-color="var(--red)" stop-opacity="0"/></radialGradient>
      </defs>
      <rect x="6" y="${ZY - 22}" width="34" height="44" class="e-part"/>
      <text x="8" y="${ZY - 32}" class="e-lab">Droplet generator</text>
      <rect x="520" y="${ZY - 22}" width="34" height="44" class="e-part"/>
      <text x="552" y="${ZY - 32}" class="e-lab" text-anchor="end">Catcher</text>
      <line x1="40" y1="${ZY}" x2="520" y2="${ZY}" class="e-path"/>
      <line x1="${ZX}" y1="${ZY + 14}" x2="${ZX}" y2="372" class="e-axis"/>
      <text x="${ZX + 8}" y="366" class="e-lab">Laser in</text>
      <g class="e-scale"><line x1="${ZX}" y1="${ZY + 40}" x2="${ZX - S}" y2="${ZY + 40}"/><line x1="${ZX}" y1="${ZY + 34}" x2="${ZX}" y2="${ZY + 46}"/><line x1="${ZX - S}" y1="${ZY + 34}" x2="${ZX - S}" y2="${ZY + 46}"/>
        <text x="${ZX - S / 2}" y="${ZY + 58}" text-anchor="middle" class="e-lab">1.4 mm between droplets</text></g>`;
    const rays = el('g', { class: 'e-rays' });
    for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; el('line', { x1: ZX, y1: ZY, x2: ZX + Math.cos(a) * 105, y2: ZY + Math.sin(a) * 105 }, rays); }
    const glow = el('circle', { cx: ZX, cy: ZY, r: 0, fill: 'url(#plasma)' });
    const pre = el('rect', { x: ZX - 2, y: ZY, width: 4, height: 190, class: 'e-pre' });
    const main = el('rect', { x: ZX - 9, y: ZY, width: 18, height: 190, class: 'e-main' });
    const drops = [0, 1, 2].map(() => el('ellipse', { rx: 7, ry: 7, class: 'e-drop' }));
    const temp = el('text', { x: ZX + 22, y: ZY - 30, class: 'e-temp' }); temp.textContent = '≈ 500,000 K';
    const euv = el('text', { x: ZX + 22, y: ZY - 12, class: 'e-lab e-euvlab' }); euv.textContent = '13.5 nm light';

    // collector overview: plasma at one focus of an ellipse, light leaves through the other
    coll.setAttribute('viewBox', '0 0 360 300');
    const F1 = [110, 150], F2 = [330, 150], c = (F2[0] - F1[0]) / 2, a = c * 1.22, b = Math.sqrt(a * a - c * c), cx = F1[0] + c;
    const P = th => [cx + a * Math.cos(th), 150 + b * Math.sin(th)];
    let arc = ''; for (let i = 0; i <= 40; i++) { const th = Math.PI * (0.62 + 0.76 * i / 40); const [x, y] = P(th); arc += (i ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1); }
    coll.innerHTML = `<path d="${arc}" class="e-mirror"/>
      <text x="22" y="40" class="e-lab">Collector mirror</text>
      <text x="${F2[0]}" y="${150 + 26}" class="e-lab" text-anchor="end">Intermediate focus</text>
      <text x="${F2[0]}" y="${150 + 42}" class="e-lab" text-anchor="end">to the scanner &rarr;</text>`;
    const cr = el('g', { class: 'e-crays' }, coll);
    for (let i = 0; i <= 8; i++) { const [x, y] = P(Math.PI * (0.66 + 0.68 * i / 8)); el('path', { d: `M${F1[0]} ${F1[1]} L${x.toFixed(1)} ${y.toFixed(1)} L${F2[0]} ${F2[1]}` }, cr); }
    const cglow = el('circle', { cx: F1[0], cy: F1[1], r: 0, fill: 'url(#plasma)' }, coll);
    el('circle', { cx: F2[0], cy: F2[1], r: 3, class: 'e-if' }, coll);
    el('text', { x: F1[0] + 10, y: F1[1] - 10, class: 'e-lab' }, coll).textContent = 'Plasma';

    function draw(t) {
      // droplets: k = 0 is the one being hit this cycle
      drops.forEach((d, k) => {
        const x = ZX + (t - T_PRE) * S - k * S;
        let rx = 7, ry = 7, op = 1;
        if (k === 0 && t > T_PRE) {           // flattened by the pre-pulse
          const f = ramp(t, T_PRE, T_MAIN); rx = 7 + 15 * f; ry = 7 - 4.6 * f;
          if (t > T_MAIN) op = 0;               // vaporised by the main pulse
        }
        d.setAttribute('cx', x.toFixed(1)); d.setAttribute('cy', ZY);
        d.setAttribute('rx', rx.toFixed(2)); d.setAttribute('ry', ry.toFixed(2));
        d.style.opacity = x < 40 || x > 520 ? 0 : op;
      });
      const pulse = (t0, w) => clamp(1 - Math.abs(t - t0) / w, 0, 1);
      pre.style.opacity = pulse(T_PRE, 0.025);
      main.style.opacity = pulse(T_MAIN, 0.025);
      const pl = t > T_MAIN ? Math.exp(-(t - T_MAIN) / 0.08) : 0;
      glow.setAttribute('r', (8 + 60 * Math.min(1, (t - T_MAIN) / 0.03) * pl).toFixed(1));
      glow.style.opacity = pl;
      rays.style.opacity = pl * 0.9;
      temp.style.opacity = euv.style.opacity = clamp(pl * 3, 0, 1);
      cglow.setAttribute('r', (30 * pl).toFixed(1)); cglow.style.opacity = pl;
      cr.style.opacity = pl;
      // steps
      const s = t < T_PRE - 0.02 ? 0 : t < T_MAIN - 0.02 ? 1 : t < T_MAIN + 0.06 ? 2 : 3;
      steps.forEach((li, i) => li.classList.toggle('on', i === s));
      clock.textContent = (t * 20).toFixed(1) + ' µs';
      range.value = Math.round(t * 1000);
    }

    let playing = !reduce, t = 0.05, last = 0;
    const loop = now => {
      if (playing) { if (last) t = (t + (now - last) / CYCLE_MS) % 1; last = now; draw(t); requestAnimationFrame(loop); }
      else last = 0;
    };
    const setPlaying = p => { playing = p; btn.textContent = p ? 'Pause' : 'Play'; btn.setAttribute('aria-pressed', String(p)); if (p) requestAnimationFrame(loop); };
    btn.addEventListener('click', () => setPlaying(!playing));
    range.addEventListener('input', () => { setPlaying(false); t = range.value / 1000; draw(t); });
    root.classList.add('is-live');
    draw(t); setPlaying(playing);
  }
}
