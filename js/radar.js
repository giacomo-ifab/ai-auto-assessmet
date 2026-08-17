/* ==========================================================================
   Radar su canvas con asse fisso 0–4, condiviso fra il profilo individuale e
   la pagina facilitatore: la scala non si adatta ai dati, così due grafici
   diversi restano confrontabili a vista.
   ========================================================================== */

window.AIAA_RADAR = (function () {
  'use strict';

  const FONT = '"Geist", "Segoe UI", Arial, Helvetica, sans-serif';
  const MAX = 4;

  function fmt(n) { return n.toFixed(2).replace('.', ','); }

  /**
   * @param {HTMLCanvasElement} canvas
   * @param {Array<{label: string, mean: number}>} series
   */
  function draw(canvas, series) {
    const width = 520;
    const height = 400;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;

    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const cx = width / 2;
    const cy = 192;
    const R = 150;                 // raggio del valore massimo
    const n = series.length;
    const step = (Math.PI * 2) / n;
    const start = -Math.PI / 2;    // primo asse in alto

    function point(i, value) {
      const r = R * (value / MAX);
      const a = start + i * step;
      return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
    }

    function ring(value) {
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const p = point(i, value);
        if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
      }
      ctx.closePath();
    }

    // griglia: anello esterno pieno, interni tratteggiati
    ctx.lineWidth = 1;
    ctx.strokeStyle = '#e5e5e5';
    for (let v = 1; v <= MAX; v++) {
      ring(v);
      ctx.setLineDash(v === MAX ? [] : [4, 4]);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // raggi
    for (let i = 0; i < n; i++) {
      const p = point(i, MAX);
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
    }

    // livelli sull'asse verticale
    ctx.font = '11px ' + FONT;
    ctx.fillStyle = '#8a8a8a';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (let v = 1; v <= MAX; v++) {
      ctx.fillText(String(v), cx - 6, cy - R * (v / MAX));
    }

    // area del profilo
    ctx.beginPath();
    series.forEach(function (d, i) {
      const p = point(i, d.mean);
      if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
    });
    ctx.closePath();
    ctx.fillStyle = 'rgba(27, 152, 224, 0.14)';
    ctx.fill();
    ctx.strokeStyle = '#1b98e0';
    ctx.lineWidth = 2;
    ctx.stroke();

    // vertici
    series.forEach(function (d, i) {
      const p = point(i, d.mean);
      ctx.beginPath();
      ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
      ctx.fillStyle = '#1b98e0';
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    });

    // etichette con il valore, tenute dentro il canvas
    series.forEach(function (d, i) {
      const a = start + i * step;
      const cos = Math.cos(a);
      const align = Math.abs(cos) < 0.25 ? 'center' : (cos > 0 ? 'left' : 'right');
      const ly = cy + (R + 26) * Math.sin(a);
      let lx = cx + (R + 26) * cos;

      ctx.textAlign = align;
      ctx.textBaseline = 'middle';

      ctx.font = '600 13px ' + FONT;
      const w = ctx.measureText(d.label).width;
      const pad = 8;
      if (align === 'left') lx = Math.min(lx, width - pad - w);
      else if (align === 'right') lx = Math.max(lx, pad + w);
      else lx = Math.min(Math.max(lx, pad + w / 2), width - pad - w / 2);

      ctx.fillStyle = '#21344d';
      ctx.fillText(d.label, lx, ly);

      ctx.font = '11px ' + FONT;
      ctx.fillStyle = '#8a8a8a';
      ctx.fillText(fmt(d.mean), lx, ly + 15);
    });

    canvas.setAttribute('aria-label',
      'Radar su asse 0–' + MAX + ': ' +
      series.map(function (d) { return d.label + ' ' + fmt(d.mean); }).join(', ') + '.');
  }

  return { draw: draw, fmt: fmt };
})();
