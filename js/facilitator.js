/* ==========================================================================
   Pagina facilitatore: login con account Supabase e statistiche di gruppo.
   Gli aggregati sono calcolati qui dai dati letti in una sola richiesta.
   Dipende da items.js, db.js, radar.js.
   ========================================================================== */

(function () {
  'use strict';

  const el = {
    views: {
      login: document.getElementById('view-login'),
      stats: document.getElementById('view-stats')
    },
    loginForm:   document.getElementById('login-form'),
    email:       document.getElementById('email'),
    password:    document.getElementById('password'),
    loginError:  document.getElementById('login-error'),
    loginSubmit: document.getElementById('login-submit'),
    userChip:    document.getElementById('user-chip'),
    userEmail:   document.getElementById('user-email'),
    statsError:  document.getElementById('stats-error'),
    statsEmpty:  document.getElementById('stats-empty'),
    statsBody:   document.getElementById('stats-body'),
    kpiGrid:     document.getElementById('kpi-grid'),
    dimBars:     document.getElementById('dim-bars'),
    dimNote:     document.getElementById('dim-note'),
    bandBars:    document.getElementById('band-bars'),
    alertBars:   document.getElementById('alert-bars'),
    itemBars:    document.getElementById('item-bars'),
    sessionsBody: document.getElementById('sessions-tbody'),
    sessionsCount: document.getElementById('sessions-count'),
    loadedAt:    document.getElementById('loaded-at'),
    radar:       document.getElementById('radar')
  };

  const ALERT_LABELS = {
    uso_oltre_verifica: "Usa l'AI più di quanto la verifichi",
    gap_responsabilita: 'Gap di conformità (RESP ≤ 2)'
  };

  const ITEM_TEXT = {};
  ITEMS.forEach(function (it) { ITEM_TEXT[it.id] = it.text; });

  let rows = [];   // sessioni con partecipante e risposte

  /* --------------------------------------------------------------- utility */

  function fmt(n) { return n.toFixed(2).replace('.', ','); }

  function pct(part, total) { return total ? Math.round(part / total * 100) : 0; }

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

  function showView(name) {
    Object.keys(el.views).forEach(function (k) { el.views[k].hidden = (k !== name); });
  }

  function showError(target, message) {
    target.hidden = false;
    target.innerHTML = '';
    target.appendChild(icon('i-alert'));
    const body = document.createElement('div');
    body.className = 'alert-body';
    body.textContent = message;
    target.appendChild(body);
  }

  function dateLabel(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: '2-digit' }) +
           ' ' + d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
  }

  function kpi(label, value, hint) {
    const div = document.createElement('div');
    div.className = 'kpi';
    div.appendChild(document.createElement('p')).className = 'kpi-label';
    div.lastChild.textContent = label;
    const v = document.createElement('p');
    v.className = 'kpi-value';
    v.textContent = value;
    div.appendChild(v);
    if (hint) {
      const h = document.createElement('p');
      h.className = 'kpi-hint';
      h.textContent = hint;
      div.appendChild(h);
    }
    return div;
  }

  /** Barra orizzontale con etichetta e valore. */
  function bar(name, valueLabel, ratio, isAlert) {
    const li = document.createElement('li');

    const head = document.createElement('div');
    head.className = 'bar-head';
    const n = document.createElement('span');
    n.className = 'bar-name';
    n.textContent = name;
    const v = document.createElement('span');
    v.className = 'bar-value';
    v.textContent = valueLabel;
    head.appendChild(n);
    head.appendChild(v);

    const track = document.createElement('div');
    track.className = 'bar-track' + (isAlert ? ' is-alert' : '');
    const fill = document.createElement('span');
    fill.style.width = Math.max(0, Math.min(100, ratio * 100)) + '%';
    track.appendChild(fill);

    li.appendChild(head);
    li.appendChild(track);
    return li;
  }

  /* ---------------------------------------------------------- statistiche */

  function completed() {
    return rows.filter(function (r) { return r.completed_at; });
  }

  /** Medie per dimensione sulle compilazioni complete, dalle risposte grezze. */
  function dimensionMeans() {
    const acc = {};
    DIMENSIONS.forEach(function (d) { acc[d.code] = { sum: 0, n: 0 }; });

    completed().forEach(function (r) {
      (r.answers || []).forEach(function (a) {
        if (acc[a.dimension]) {
          acc[a.dimension].sum += a.value;
          acc[a.dimension].n += 1;
        }
      });
    });

    return DIMENSIONS.map(function (d) {
      const cell = acc[d.code];
      return { code: d.code, label: d.label, mean: cell.n ? cell.sum / cell.n : 0, count: cell.n };
    });
  }

  function itemMeans() {
    const acc = {};
    completed().forEach(function (r) {
      (r.answers || []).forEach(function (a) {
        if (!acc[a.item_id]) acc[a.item_id] = { sum: 0, n: 0, dim: a.dimension };
        acc[a.item_id].sum += a.value;
        acc[a.item_id].n += 1;
      });
    });

    return Object.keys(acc).map(function (id) {
      return { id: id, dim: acc[id].dim, n: acc[id].n, mean: acc[id].sum / acc[id].n };
    }).filter(function (x) { return x.n >= 2; })
      .sort(function (a, b) { return a.mean - b.mean; });
  }

  function render() {
    const done = completed();

    el.statsEmpty.hidden = rows.length > 0;
    el.statsBody.hidden = rows.length === 0;
    el.loadedAt.textContent = 'Aggiornato alle ' +
      new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });

    if (!rows.length) return;

    // --- KPI
    const participants = {};
    rows.forEach(function (r) { if (r.participants) participants[r.participants.id] = true; });
    const totals = done.map(function (r) { return r.total; }).filter(function (t) { return typeof t === 'number'; });
    const avgTotal = totals.length ? totals.reduce(function (a, b) { return a + b; }, 0) / totals.length : 0;

    el.kpiGrid.innerHTML = '';
    el.kpiGrid.appendChild(kpi('Partecipanti', Object.keys(participants).length));
    el.kpiGrid.appendChild(kpi('Compilazioni', rows.length, done.length + ' complete'));
    el.kpiGrid.appendChild(kpi('Completamento', pct(done.length, rows.length) + '%',
      (rows.length - done.length) + ' interrotte'));
    el.kpiGrid.appendChild(kpi('Punteggio medio', totals.length ? fmt(avgTotal) : '—', 'su 48'));

    // --- dimensioni + radar
    const dims = dimensionMeans();
    el.dimBars.innerHTML = '';
    dims.forEach(function (d) {
      el.dimBars.appendChild(bar(d.label, fmt(d.mean) + ' / 4', d.mean / 4));
    });

    if (done.length) {
      const sorted = dims.slice().sort(function (a, b) { return b.mean - a.mean; });
      el.dimNote.textContent = 'Più solida: ' + sorted[0].label + ' (' + fmt(sorted[0].mean) +
        '). Più fragile: ' + sorted[sorted.length - 1].label + ' (' + fmt(sorted[sorted.length - 1].mean) + ').';
      window.AIAA_RADAR.draw(el.radar, dims);
    } else {
      el.dimNote.textContent = 'Nessuna compilazione completa: le medie compaiono al primo questionario concluso.';
    }

    // --- fasce
    el.bandBars.innerHTML = '';
    BANDS.forEach(function (b) {
      const n = done.filter(function (r) { return r.band === b.name; }).length;
      el.bandBars.appendChild(bar(b.name + ' (' + b.min + '–' + b.max + ')',
        n + (done.length ? ' · ' + pct(n, done.length) + '%' : ''), done.length ? n / done.length : 0));
    });

    // --- alert
    el.alertBars.innerHTML = '';
    Object.keys(ALERT_LABELS).forEach(function (code) {
      const n = done.filter(function (r) { return (r.alerts || []).indexOf(code) !== -1; }).length;
      el.alertBars.appendChild(bar(ALERT_LABELS[code],
        n + (done.length ? ' · ' + pct(n, done.length) + '%' : ''),
        done.length ? n / done.length : 0, true));
    });

    // --- item più critici
    const items = itemMeans().slice(0, 6);
    el.itemBars.innerHTML = '';
    if (!items.length) {
      const li = document.createElement('li');
      li.className = 'micro';
      li.textContent = 'Servono almeno due risposte per item.';
      el.itemBars.appendChild(li);
    }
    items.forEach(function (it) {
      const label = it.id + ' · ' + (ITEM_TEXT[it.id] || '').slice(0, 90) +
        ((ITEM_TEXT[it.id] || '').length > 90 ? '…' : '');
      el.itemBars.appendChild(bar(label, fmt(it.mean) + ' / 4 · ' + it.n + ' risp.', it.mean / 4));
    });

    // --- tabella compilazioni
    el.sessionsCount.textContent = rows.length + (rows.length === 1 ? ' riga' : ' righe');
    el.sessionsBody.innerHTML = '';
    rows.forEach(function (r) {
      const tr = document.createElement('tr');

      const name = document.createElement('td');
      name.className = 'name';
      name.textContent = r.participants
        ? r.participants.first_name + ' ' + r.participants.last_name
        : '—';
      tr.appendChild(name);

      const started = document.createElement('td');
      started.textContent = dateLabel(r.started_at);
      tr.appendChild(started);

      const state = document.createElement('td');
      const tag = document.createElement('span');
      tag.className = 'tag' + (r.completed_at ? '' : ' tag-open');
      tag.textContent = r.completed_at
        ? 'completa'
        : (r.answers || []).length + '/12 in corso';
      state.appendChild(tag);
      tr.appendChild(state);

      const total = document.createElement('td');
      total.className = 'num';
      total.textContent = typeof r.total === 'number' ? r.total : '—';
      tr.appendChild(total);

      const band = document.createElement('td');
      band.textContent = r.band || '—';
      tr.appendChild(band);

      const alerts = document.createElement('td');
      if ((r.alerts || []).length) {
        r.alerts.forEach(function (code) {
          const t = document.createElement('span');
          t.className = 'tag tag-alert';
          t.textContent = code === 'uso_oltre_verifica' ? 'uso > verifica' : 'conformità';
          alerts.appendChild(t);
        });
      } else {
        alerts.textContent = '—';
      }
      tr.appendChild(alerts);

      el.sessionsBody.appendChild(tr);
    });
  }

  /* ------------------------------------------------------------- CSV export */

  function toCsv() {
    const header = ['partecipante', 'avviata', 'completata', 'totale', 'profilo', 'alert']
      .concat(DIMENSIONS.map(function (d) { return 'media_' + d.code; }))
      .concat(ITEMS.map(function (it) { return it.id; }));

    const lines = [header.join(';')];

    rows.forEach(function (r) {
      const byItem = {};
      (r.answers || []).forEach(function (a) { byItem[a.item_id] = a.value; });
      const means = r.dim_means || {};

      const cells = [
        r.participants ? r.participants.first_name + ' ' + r.participants.last_name : '',
        r.started_at || '',
        r.completed_at || '',
        typeof r.total === 'number' ? r.total : '',
        r.band || '',
        (r.alerts || []).join('|')
      ].concat(DIMENSIONS.map(function (d) {
        return typeof means[d.code] === 'number' ? String(means[d.code]).replace('.', ',') : '';
      })).concat(ITEMS.map(function (it) {
        return typeof byItem[it.id] === 'number' ? byItem[it.id] : '';
      }));

      lines.push(cells.map(function (c) {
        const s = String(c);
        return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
      }).join(';'));
    });

    return lines.join('\r\n');
  }

  function downloadCsv() {
    const blob = new Blob(['﻿' + toCsv()], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'auto-assessment-ai-' + new Date().toISOString().slice(0, 10) + '.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }

  /* ------------------------------------------------------------- caricamento */

  function load() {
    el.statsError.hidden = true;
    return DB.fetchOverview().then(function (data) {
      rows = Array.isArray(data) ? data : [];
      render();
    }).catch(function (err) {
      showError(el.statsError, 'Lettura dei dati non riuscita: ' + err.message);
    });
  }

  function enterStats(user) {
    el.userChip.hidden = false;
    el.userEmail.textContent = (user && user.email) || 'autenticato';
    showView('stats');
    load();
  }

  /* ------------------------------------------------------------------ eventi */

  el.loginForm.addEventListener('submit', function (e) {
    e.preventDefault();
    el.loginError.hidden = true;

    if (!DB.configured) {
      showError(el.loginError, 'Supabase non è configurato: compila js/config.js con URL e chiave anon.');
      return;
    }

    const email = el.email.value.trim();
    const password = el.password.value;
    if (!email || !password) {
      showError(el.loginError, 'Inserisci email e password.');
      return;
    }

    el.loginSubmit.disabled = true;
    DB.signIn(email, password).then(function (user) {
      el.loginSubmit.disabled = false;
      el.password.value = '';
      enterStats(user);
    }).catch(function (err) {
      el.loginSubmit.disabled = false;
      const message = /400|invalid/i.test(err.message)
        ? 'Credenziali non valide.'
        : 'Accesso non riuscito: ' + err.message;
      showError(el.loginError, message);
    });
  });

  document.getElementById('btn-refresh').addEventListener('click', load);
  document.getElementById('btn-csv').addEventListener('click', downloadCsv);

  document.getElementById('btn-logout').addEventListener('click', function () {
    DB.signOut().then(function () {
      rows = [];
      el.userChip.hidden = true;
      showView('login');
    });
  });

  /* ---------------------------------------------------------------- avvio */

  if (!DB.configured) {
    showView('login');
    showError(el.loginError, 'Supabase non è configurato: compila js/config.js con URL e chiave anon.');
  } else {
    // Un token ancora valido in sessionStorage evita di ripetere il login.
    DB.currentUser().then(function (user) {
      if (user) enterStats(user); else showView('login');
    });
  }
})();
