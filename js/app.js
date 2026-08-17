/* ==========================================================================
   Auto-assessment competenze AI — logica di sessione, scoring, radar.
   Dipende da js/items.js (DIMENSIONS, ITEMS, SCALE, BANDS).
   ========================================================================== */

(function () {
  'use strict';

  const TOTAL_ITEMS = DIMENSIONS.reduce((n, d) => n + d.quota, 0); // 12

  /** Stato della sessione corrente */
  const session = {
    items: [],            // item estratti, nell'ordine di presentazione
    answers: new Map(),   // id item -> 1..4
    validated: false      // true dopo il primo tentativo di calcolo
  };

  /** Punti di "Come funziona" nella intro. */
  const HOW_IT_WORKS = [
    TOTAL_ITEMS + ' item estratti casualmente da una banca di 30.',
    'Nessuna risposta giusta o sbagliata: si misura la padronanza dichiarata.',
    'Il calcolo parte solo quando tutte le risposte sono complete.',
    'Ogni nuova sessione propone una selezione diversa di item.'
  ];

  const el = {
    views: {
      intro:   document.getElementById('view-intro'),
      quiz:    document.getElementById('view-quiz'),
      results: document.getElementById('view-results')
    },
    introHow:    document.getElementById('intro-how'),
    introScale:  document.getElementById('intro-scale'),
    quizScale:   document.getElementById('quiz-scale'),
    itemList:    document.getElementById('item-list'),
    form:        document.getElementById('quiz-form'),
    answered:    document.getElementById('answered-count'),
    progress:    document.getElementById('progress-fill'),
    validation:  document.getElementById('validation-msg'),
    totalScore:  document.getElementById('total-score'),
    scoreMeter:  document.getElementById('score-meter-fill'),
    bandBadge:   document.getElementById('band-badge'),
    bandName:    document.getElementById('band-name'),
    bandReading: document.getElementById('band-reading'),
    bandPriority: document.getElementById('band-priority'),
    alerts:      document.getElementById('alerts'),
    dimTbody:    document.getElementById('dim-tbody'),
    dimExtremes: document.getElementById('dim-extremes'),
    missingHint: document.getElementById('progress-missing'),
    recap:       document.getElementById('recap-list'),
    radar:       document.getElementById('radar')
  };

  /* ---------------------------------------------------------------- utility */

  /** Interi casuali in [0, max) con crypto quando disponibile. */
  function randomInt(max) {
    if (window.crypto && window.crypto.getRandomValues) {
      const buf = new Uint32Array(1);
      const limit = Math.floor(0xffffffff / max) * max; // evita il bias del modulo
      let v;
      do { window.crypto.getRandomValues(buf); v = buf[0]; } while (v >= limit);
      return v % max;
    }
    return Math.floor(Math.random() * max);
  }

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = randomInt(i + 1);
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function lowerFirst(s) {
    return s.charAt(0).toLowerCase() + s.slice(1);
  }

  /** Icona dallo sprite in index.html: <svg class="icon"><use href="#id"></svg> */
  function icon(id) {
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('class', 'icon');
    svg.setAttribute('aria-hidden', 'true');
    const use = document.createElementNS(NS, 'use');
    use.setAttribute('href', '#' + id);
    svg.appendChild(use);
    return svg;
  }

  /* ------------------------------------------------------------- estrazione */

  /** Estrae gli item della sessione rispettando le quote per dimensione. */
  function drawItems() {
    const picked = [];
    DIMENSIONS.forEach(function (dim) {
      const pool = ITEMS.filter(function (it) { return it.dim === dim.code; });
      picked.push.apply(picked, shuffle(pool).slice(0, dim.quota));
    });
    return shuffle(picked); // ordine mescolato: le dimensioni non sono visibili
  }

  /* ----------------------------------------------------------- rendering UI */

  function renderHowItWorks() {
    el.introHow.innerHTML = '';
    HOW_IT_WORKS.forEach(function (line) {
      const li = document.createElement('li');
      li.appendChild(icon('i-check'));
      li.appendChild(document.createElement('span')).textContent = line;
      el.introHow.appendChild(li);
    });
  }

  function renderScaleLegend(target) {
    target.innerHTML = '';
    SCALE.forEach(function (s) {
      const li = document.createElement('li');
      const num = document.createElement('span');
      num.className = 'sc-num';
      num.textContent = s.value;
      const txt = document.createElement('span');
      txt.textContent = s.label;
      li.appendChild(num);
      li.appendChild(txt);
      target.appendChild(li);
    });
  }

  function renderItems() {
    el.itemList.innerHTML = '';

    session.items.forEach(function (item, idx) {
      const li = document.createElement('li');
      li.className = 'item';
      li.id = 'item-' + (idx + 1);

      const fs = document.createElement('fieldset');

      const legend = document.createElement('legend');
      const num = document.createElement('span');
      num.className = 'item-num';
      num.textContent = String(idx + 1).padStart(2, '0');
      const text = document.createElement('span');
      text.className = 'item-text';
      const stem = document.createElement('span');
      stem.className = 'item-stem';
      stem.textContent = 'Sono in grado di ';
      text.appendChild(stem);
      text.appendChild(document.createTextNode(lowerFirst(item.text)));
      legend.appendChild(num);
      legend.appendChild(text);
      fs.appendChild(legend);

      const opts = document.createElement('div');
      opts.className = 'opts';

      SCALE.forEach(function (s) {
        const label = document.createElement('label');
        label.className = 'opt';

        const input = document.createElement('input');
        input.type = 'radio';
        input.name = 'q_' + item.id;
        input.value = s.value;
        input.setAttribute('aria-label', s.value + ' — ' + s.label);
        if (session.answers.get(item.id) === s.value) {
          input.checked = true;
          label.classList.add('is-selected');
        }

        const numSpan = document.createElement('span');
        numSpan.className = 'opt-num';
        numSpan.textContent = s.value;

        const txtSpan = document.createElement('span');
        txtSpan.className = 'opt-txt';
        txtSpan.textContent = s.label;

        label.appendChild(input);
        label.appendChild(numSpan);
        label.appendChild(txtSpan);
        opts.appendChild(label);
      });

      fs.appendChild(opts);

      const flag = document.createElement('p');
      flag.className = 'item-flag';
      flag.appendChild(icon('i-circle-alert'));
      flag.appendChild(document.createElement('span')).textContent = 'Risposta mancante';
      flag.hidden = true;
      fs.appendChild(flag);

      li.appendChild(fs);
      el.itemList.appendChild(li);

      if (session.answers.has(item.id)) li.classList.add('is-answered');
    });

    updateProgress();
  }

  function updateProgress() {
    const n = session.answers.size;
    el.answered.textContent = n;
    el.progress.style.width = (n / TOTAL_ITEMS * 100) + '%';
  }

  /** Evidenzia inline gli item senza risposta e restituisce i loro indici (1-based). */
  function markMissing() {
    const missing = [];
    session.items.forEach(function (item, idx) {
      const li = document.getElementById('item-' + (idx + 1));
      const answered = session.answers.has(item.id);
      const flag = li.querySelector('.item-flag');
      li.classList.toggle('is-missing', session.validated && !answered);
      li.classList.toggle('is-answered', answered);
      flag.hidden = !(session.validated && !answered);
      if (!answered) missing.push(idx + 1);
    });
    return missing;
  }

  function clearValidation() {
    el.validation.hidden = true;
    el.validation.innerHTML = '';
    el.missingHint.hidden = true;
  }

  function showValidation(missing) {
    const count = missing.length === 1 ? 'Manca 1 risposta' : 'Mancano ' + missing.length + ' risposte';

    // promemoria sempre visibile nella barra sticky
    el.missingHint.hidden = !(session.validated && missing.length);
    el.missingHint.innerHTML = '';
    el.missingHint.appendChild(icon('i-circle-alert'));
    el.missingHint.appendChild(document.createElement('span')).textContent = count;

    if (!missing.length) {
      el.validation.hidden = true;
      el.validation.innerHTML = '';
      return;
    }

    el.validation.hidden = false;
    el.validation.innerHTML = '';
    el.validation.appendChild(icon('i-alert'));

    const body = document.createElement('div');
    body.className = 'alert-body';

    const strong = document.createElement('strong');
    strong.textContent = count + ': il risultato non può essere calcolato.';
    body.appendChild(strong);

    const p = document.createElement('span');
    p.textContent = 'Completa gli item evidenziati: ';
    body.appendChild(p);

    const ul = document.createElement('ul');
    ul.className = 'jump-list';
    missing.forEach(function (n) {
      const li = document.createElement('li');
      const a = document.createElement('a');
      a.href = '#item-' + n;
      a.textContent = 'Item ' + n;
      li.appendChild(a);
      ul.appendChild(li);
    });
    body.appendChild(ul);
    el.validation.appendChild(body);
  }

  /* ---------------------------------------------------------------- scoring */

  function computeScores() {
    const byDim = DIMENSIONS.map(function (dim) {
      const items = session.items.filter(function (it) { return it.dim === dim.code; });
      const sum = items.reduce(function (acc, it) { return acc + session.answers.get(it.id); }, 0);
      const mean = sum / items.length;
      return {
        code: dim.code,
        label: dim.label,
        count: items.length,
        sum: sum,
        mean: mean,
        pct: Math.round(mean / 4 * 100)
      };
    });

    const total = byDim.reduce(function (acc, d) { return acc + d.sum; }, 0);
    const band = BANDS.filter(function (b) { return total >= b.min && total <= b.max; })[0] || BANDS[BANDS.length - 1];

    return { byDim: byDim, total: total, band: band };
  }

  function dimMean(byDim, code) {
    return byDim.filter(function (d) { return d.code === code; })[0].mean;
  }

  function buildAlerts(byDim) {
    const out = [];
    const uso = dimMean(byDim, 'USO');
    const val = dimMean(byDim, 'VAL');
    const resp = dimMean(byDim, 'RESP');

    if (uso - val >= 1) {
      out.push({
        type: 'alert-warn',
        icon: 'i-alert',
        title: "Usi l'AI più di quanto la verifichi",
        body: 'Uso operativo ' + fmt(uso) + ' contro Valutazione critica ' + fmt(val) +
              ' (scarto ' + fmt(uso - val) + '). È un profilo di rischio: la produttività cresce più della capacità di ' +
              "controllare gli output. Intervento prioritario sulla verifica dei risultati — accuratezza dei dati, " +
              'adeguatezza allo scopo, stima della revisione necessaria.'
      });
    }

    if (resp <= 2) {
      out.push({
        type: 'alert-danger',
        icon: 'i-shield-alert',
        title: 'Gap di conformità',
        body: 'Responsabilità ' + fmt(resp) + ' su 4. Trattamento dei dati aziendali, rischi per terzi, ' +
              "trasparenza e rispetto delle policy non sono presidiati: la formazione su questi aspetti va " +
              "considerata obbligatoria, non facoltativa (obbligo di alfabetizzazione AI, art. 4 AI Act)."
      });
    }

    return out;
  }

  function fmt(n) { return n.toFixed(2).replace('.', ','); }

  function renderResults(scores) {
    const minTotal = TOTAL_ITEMS;      // 12
    const maxTotal = TOTAL_ITEMS * 4;  // 48

    el.totalScore.textContent = scores.total;
    el.scoreMeter.style.width = ((scores.total - minTotal) / (maxTotal - minTotal) * 100) + '%';
    el.bandBadge.textContent = scores.band.min + '–' + scores.band.max + ' punti';
    el.bandName.textContent = scores.band.name;
    el.bandReading.textContent = scores.band.reading;
    el.bandPriority.textContent = scores.band.priority;

    // Alert automatici
    el.alerts.innerHTML = '';
    buildAlerts(scores.byDim).forEach(function (a) {
      const div = document.createElement('div');
      div.className = 'alert ' + a.type;
      div.setAttribute('role', 'note');
      div.appendChild(icon(a.icon));

      const body = document.createElement('div');
      body.className = 'alert-body';
      const strong = document.createElement('strong');
      strong.textContent = a.title;
      body.appendChild(strong);
      body.appendChild(document.createTextNode(a.body));
      div.appendChild(body);

      el.alerts.appendChild(div);
    });

    // Tabella dimensioni
    el.dimTbody.innerHTML = '';
    scores.byDim.forEach(function (d) {
      const tr = document.createElement('tr');

      const th = document.createElement('th');
      th.scope = 'row';
      th.className = 'dim-name';
      th.textContent = d.label;
      const bar = document.createElement('span');
      bar.className = 'dim-bar';
      const fill = document.createElement('span');
      fill.style.width = d.pct + '%';
      bar.appendChild(fill);
      th.appendChild(bar);
      tr.appendChild(th);

      const tdMean = document.createElement('td');
      tdMean.className = 'dim-mean';
      tdMean.textContent = fmt(d.mean);
      tr.appendChild(tdMean);

      const tdPct = document.createElement('td');
      tdPct.className = 'dim-pct';
      tdPct.textContent = d.pct + '%';
      tr.appendChild(tdPct);

      el.dimTbody.appendChild(tr);
    });

    // Estremi del profilo
    const sorted = scores.byDim.slice().sort(function (a, b) { return b.mean - a.mean; });
    const top = sorted[0], low = sorted[sorted.length - 1];
    el.dimExtremes.textContent = top.mean === low.mean
      ? 'Profilo uniforme sulle cinque dimensioni (media ' + fmt(top.mean) + ').'
      : 'Dimensione più solida: ' + top.label + ' (' + fmt(top.mean) + '). Più fragile: ' + low.label + ' (' + fmt(low.mean) + ').';

    // Recap risposte
    el.recap.innerHTML = '';
    session.items.forEach(function (item) {
      const li = document.createElement('li');
      const score = document.createElement('span');
      score.className = 'recap-score';
      score.textContent = session.answers.get(item.id);
      const txt = document.createElement('span');
      txt.textContent = 'Sono in grado di ' + lowerFirst(item.text);
      li.appendChild(score);
      li.appendChild(txt);
      el.recap.appendChild(li);
    });

    drawRadar(scores.byDim);
  }

  /* ------------------------------------------------------------------ radar */

  /** Radar su canvas nativo, asse fisso 0–4. */
  function drawRadar(byDim) {
    const canvas = el.radar;
    const size = 520;           // larghezza: serve spazio per le etichette laterali
    const height = 400;         // altezza ritagliata sull'ingombro reale della figura
    const dpr = window.devicePixelRatio || 1;
    canvas.width = size * dpr;
    canvas.height = height * dpr;

    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, height);

    const cx = size / 2;
    const cy = 192;
    const R = 150;              // raggio corrispondente al valore 4
    const MAX = 4;
    const n = byDim.length;
    const step = (Math.PI * 2) / n;
    const start = -Math.PI / 2; // primo asse in alto

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

    // griglia: anello esterno pieno, interni tratteggiati come nei grafici dell'app IFAB
    ctx.lineWidth = 1;
    for (let v = 1; v <= MAX; v++) {
      ring(v);
      ctx.strokeStyle = '#e5e5e5';
      ctx.setLineDash(v === MAX ? [] : [4, 4]);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // raggi
    ctx.strokeStyle = '#e5e5e5';
    for (let i = 0; i < n; i++) {
      const p = point(i, MAX);
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
    }

    // etichette dei livelli sull'asse verticale
    ctx.font = '11px ' + fontStack();
    ctx.fillStyle = '#8a8a8a';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (let v = 1; v <= MAX; v++) {
      ctx.fillText(String(v), cx - 6, cy - R * (v / MAX));
    }

    // area del profilo
    ctx.beginPath();
    byDim.forEach(function (d, i) {
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
    byDim.forEach(function (d, i) {
      const p = point(i, d.mean);
      ctx.beginPath();
      ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
      ctx.fillStyle = '#1b98e0';
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    });

    // etichette delle dimensioni + valore, tenute dentro il canvas
    byDim.forEach(function (d, i) {
      const a = start + i * step;
      const cos = Math.cos(a);
      const align = Math.abs(cos) < 0.25 ? 'center' : (cos > 0 ? 'left' : 'right');
      const ly = cy + (R + 26) * Math.sin(a);
      let lx = cx + (R + 26) * cos;

      ctx.textAlign = align;
      ctx.textBaseline = 'middle';

      ctx.font = '600 13px ' + fontStack();
      const w = ctx.measureText(d.label).width;
      const pad = 8;
      if (align === 'left')  lx = Math.min(lx, size - pad - w);
      if (align === 'right') lx = Math.max(lx, pad + w);
      if (align === 'center') lx = Math.min(Math.max(lx, pad + w / 2), size - pad - w / 2);

      ctx.fillStyle = '#21344d';
      ctx.fillText(d.label, lx, ly);

      ctx.font = '11px ' + fontStack();
      ctx.fillStyle = '#8a8a8a';
      ctx.fillText(fmt(d.mean), lx, ly + 15);
    });

    canvas.setAttribute('aria-label',
      'Radar delle cinque dimensioni su asse 0–4: ' +
      byDim.map(function (d) { return d.label + ' ' + fmt(d.mean); }).join(', ') + '.');
  }

  function fontStack() {
    return '"Geist", "Segoe UI", Arial, Helvetica, sans-serif';
  }

  /* --------------------------------------------------------------- navigazione */

  function showView(name) {
    Object.keys(el.views).forEach(function (k) { el.views[k].hidden = (k !== name); });
    window.scrollTo({ top: 0, behavior: 'auto' });
  }

  function newSession() {
    session.items = drawItems();
    session.answers.clear();
    session.validated = false;
    clearValidation();
    renderItems();
  }

  /* ------------------------------------------------------------------ eventi */

  el.form.addEventListener('change', function (e) {
    const input = e.target;
    if (!input.name || input.name.indexOf('q_') !== 0) return;

    const itemId = input.name.slice(2);
    session.answers.set(itemId, parseInt(input.value, 10));

    // stato visivo delle opzioni dell'item
    const fieldset = input.closest('fieldset');
    fieldset.querySelectorAll('.opt').forEach(function (opt) {
      opt.classList.toggle('is-selected', opt.contains(input));
    });

    updateProgress();
    if (session.validated) showValidation(markMissing());
    else {
      const li = input.closest('.item');
      li.classList.add('is-answered');
    }
  });

  el.form.addEventListener('submit', function (e) {
    e.preventDefault();
    session.validated = true;

    const missing = markMissing();
    if (missing.length) {
      showValidation(missing);
      const first = document.getElementById('item-' + missing[0]);
      first.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const radio = first.querySelector('input[type="radio"]');
      if (radio) radio.focus();
      return;
    }

    showValidation([]);
    renderResults(computeScores());
    showView('results');
  });

  document.getElementById('btn-start').addEventListener('click', function () {
    newSession();
    showView('quiz');
  });

  document.getElementById('btn-reset').addEventListener('click', function () {
    session.answers.clear();
    session.validated = false;
    clearValidation();
    renderItems();
  });

  document.getElementById('btn-back').addEventListener('click', function () {
    showView('quiz');
  });

  document.getElementById('btn-new').addEventListener('click', function () {
    newSession();
    showView('quiz');
  });

  document.getElementById('btn-print').addEventListener('click', function () {
    window.print();
  });

  /* ---------------------------------------------------------------- avvio */

  renderHowItWorks();
  renderScaleLegend(el.introScale);
  renderScaleLegend(el.quizScale);
  session.items = drawItems(); // pronta anche se si arriva al quiz senza passare dall'intro
})();
