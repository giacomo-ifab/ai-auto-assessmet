/* ==========================================================================
   Pagina facilitatore: login con account Supabase e statistiche di gruppo.
   Gli aggregati sono calcolati qui dai dati letti in una sola richiesta.
   Da qui si eliminano anche partecipanti e compilazioni: la cancellazione va
   sul database (DELETE con il token del facilitatore) e non è reversibile,
   quindi passa sempre da un dialogo di conferma che elenca ciò che sparisce.
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
    peopleBody:  document.getElementById('people-tbody'),
    peopleCount: document.getElementById('people-count'),
    statsNote:   document.getElementById('stats-note'),
    loadedAt:    document.getElementById('loaded-at'),
    radar:       document.getElementById('radar'),

    refresh:     document.getElementById('btn-refresh'),
    sessionsAll: document.getElementById('sessions-all'),
    peopleAll:   document.getElementById('people-all'),
    delSessions: document.getElementById('btn-del-sessions'),
    delSessionsLabel: document.getElementById('btn-del-sessions-label'),
    delPeople:   document.getElementById('btn-del-people'),
    delPeopleLabel: document.getElementById('btn-del-people-label'),
    delAll:      document.getElementById('btn-del-all'),

    dialog:      document.getElementById('confirm-dialog'),
    dlgTitle:    document.getElementById('confirm-title'),
    dlgText:     document.getElementById('confirm-text'),
    dlgList:     document.getElementById('confirm-list'),
    dlgTyped:    document.getElementById('confirm-typed'),
    dlgWord:     document.getElementById('confirm-word'),
    dlgOk:       document.getElementById('confirm-ok'),
    dlgOkLabel:  document.getElementById('confirm-ok-label'),
    dlgCancel:   document.getElementById('confirm-cancel')
  };

  /* Le due tabelle selezionabili si comportano allo stesso modo: cambia solo
     il testo del pulsante di gruppo. */
  const GROUPS = {
    sessions: {
      tbody: el.sessionsBody,
      all: el.sessionsAll,
      button: el.delSessions,
      label: el.delSessionsLabel,
      none: 'Elimina le selezionate',
      some: function (n) { return 'Elimina ' + n + (n === 1 ? ' compilazione' : ' compilazioni'); }
    },
    people: {
      tbody: el.peopleBody,
      all: el.peopleAll,
      button: el.delPeople,
      label: el.delPeopleLabel,
      none: 'Elimina i selezionati',
      some: function (n) { return 'Elimina ' + n + (n === 1 ? ' partecipante' : ' partecipanti'); }
    }
  };

  const ALERT_LABELS = {
    uso_oltre_verifica: "Usa l'AI più di quanto la verifichi",
    gap_responsabilita: 'Gap di conformità (RESP ≤ 2)'
  };

  const ITEM_TEXT = {};
  ITEMS.forEach(function (it) { ITEM_TEXT[it.id] = it.text; });

  let rows = [];     // sessioni con partecipante e risposte
  let people = [];   // partecipanti registrati, anche senza compilazioni

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

  let noteTimer = null;

  /** Esito di una cancellazione: si spegne da sé, non richiede una chiusura. */
  function showNote(message) {
    el.statsNote.hidden = false;
    el.statsNote.innerHTML = '';
    el.statsNote.appendChild(icon('i-check'));
    const body = document.createElement('div');
    body.className = 'alert-body';
    body.textContent = message;
    el.statsNote.appendChild(body);
    clearTimeout(noteTimer);
    noteTimer = setTimeout(function () { el.statsNote.hidden = true; }, 6000);
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

  function personName(participant) {
    return participant ? participant.first_name + ' ' + participant.last_name : '—';
  }

  /** Cella con la casella di selezione della riga. */
  function checkCell(id, label) {
    const td = document.createElement('td');
    td.className = 'cell-check';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.className = 'row-check';
    cb.value = id;
    cb.setAttribute('aria-label', 'Seleziona ' + label);
    td.appendChild(cb);
    return td;
  }

  /** Cella con il cestino di riga. */
  function trashCell(id, label) {
    const td = document.createElement('td');
    td.className = 'cell-act';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn-icon';
    btn.dataset.id = id;
    btn.title = 'Elimina ' + label;
    btn.setAttribute('aria-label', 'Elimina ' + label);
    btn.appendChild(icon('i-trash'));
    td.appendChild(btn);
    return td;
  }

  function emptyRow(tbody, colspan, message) {
    const tr = document.createElement('tr');
    tr.className = 'is-empty';
    const td = document.createElement('td');
    td.colSpan = colspan;
    td.textContent = message;
    tr.appendChild(td);
    tbody.appendChild(tr);
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

  function sessionsOf(participantId) {
    return rows.filter(function (r) { return r.participants && r.participants.id === participantId; });
  }

  /** Ultimo momento in cui il partecipante ha toccato il questionario. */
  function lastActivity(sessions) {
    const stamps = sessions.map(function (r) {
      return r.completed_at || r.updated_at || r.started_at;
    }).filter(Boolean).sort();
    return stamps.length ? stamps[stamps.length - 1] : null;
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

    // Un partecipante registrato che non ha ancora avviato nulla non produce righe
    // in `rows`, ma deve restare visibile: è uno di quelli da poter cancellare.
    const hasData = rows.length > 0 || people.length > 0;
    el.statsEmpty.hidden = hasData;
    el.statsBody.hidden = !hasData;
    el.loadedAt.textContent = 'Aggiornato alle ' +
      new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });

    if (!hasData) return;

    // --- KPI
    const participants = {};
    rows.forEach(function (r) { if (r.participants) participants[r.participants.id] = true; });
    const totals = done.map(function (r) { return r.total; }).filter(function (t) { return typeof t === 'number'; });
    const avgTotal = totals.length ? totals.reduce(function (a, b) { return a + b; }, 0) / totals.length : 0;

    el.kpiGrid.innerHTML = '';
    el.kpiGrid.appendChild(kpi('Partecipanti', people.length,
      Object.keys(participants).length + ' con almeno una compilazione'));
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
    if (!rows.length) emptyRow(el.sessionsBody, 8, 'Nessuna compilazione registrata.');

    rows.forEach(function (r) {
      const tr = document.createElement('tr');
      tr.appendChild(checkCell(r.id, 'la compilazione di ' + personName(r.participants)));

      const name = document.createElement('td');
      name.className = 'name';
      name.textContent = personName(r.participants);
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

      tr.appendChild(trashCell(r.id, 'la compilazione di ' + personName(r.participants)));

      el.sessionsBody.appendChild(tr);
    });

    renderPeople();
    syncSelection('sessions');
    syncSelection('people');
  }

  /* ------------------------------------------------------- partecipanti */

  function renderPeople() {
    el.peopleCount.textContent = people.length + (people.length === 1 ? ' registrato' : ' registrati');
    el.peopleBody.innerHTML = '';

    if (!people.length) {
      emptyRow(el.peopleBody, 6, 'Nessun partecipante registrato.');
      return;
    }

    people.forEach(function (p) {
      const own = sessionsOf(p.id);
      const done = own.filter(function (r) { return r.completed_at; }).length;
      const label = p.first_name + ' ' + p.last_name;

      const tr = document.createElement('tr');
      tr.appendChild(checkCell(p.id, label));

      const name = document.createElement('td');
      name.className = 'name';
      name.textContent = label;
      tr.appendChild(name);

      const created = document.createElement('td');
      created.textContent = dateLabel(p.created_at);
      tr.appendChild(created);

      const count = document.createElement('td');
      count.textContent = own.length
        ? own.length + (done < own.length ? ' · ' + done + ' complete' : '')
        : 'nessuna';
      tr.appendChild(count);

      const last = document.createElement('td');
      last.textContent = dateLabel(lastActivity(own));
      tr.appendChild(last);

      tr.appendChild(trashCell(p.id, label));
      el.peopleBody.appendChild(tr);
    });
  }

  /* --------------------------------------------------- selezione multipla */

  function boxesOf(group) {
    return Array.prototype.slice.call(GROUPS[group].tbody.querySelectorAll('input.row-check'));
  }

  function selectedIds(group) {
    return boxesOf(group).filter(function (cb) { return cb.checked; })
      .map(function (cb) { return cb.value; });
  }

  /** Tiene allineati riga evidenziata, pulsante di gruppo e casella «tutti». */
  function syncSelection(group) {
    const g = GROUPS[group];
    const boxes = boxesOf(group);
    let n = 0;

    boxes.forEach(function (cb) {
      const tr = cb.parentNode.parentNode;
      if (tr) tr.classList.toggle('is-selected', cb.checked);
      if (cb.checked) n += 1;
    });

    g.button.disabled = n === 0;
    g.label.textContent = n ? g.some(n) : g.none;
    g.all.checked = boxes.length > 0 && n === boxes.length;
    g.all.indeterminate = n > 0 && n < boxes.length;
    g.all.disabled = boxes.length === 0;
  }

  /* --------------------------------------------------- conferma e cancellazioni */

  // Il dialogo è uno solo, riusato: elenca sempre che cosa sta per sparire e,
  // per lo svuotamento totale, chiede di scrivere la parola per intero.
  const hasDialog = el.dialog && typeof el.dialog.showModal === 'function';
  const MAX_LINES = 30;
  let resolveConfirm = null;

  function closeConfirm(answer) {
    const resolve = resolveConfirm;
    resolveConfirm = null;
    if (hasDialog && el.dialog.open) el.dialog.close();
    if (resolve) resolve(answer);
  }

  function askConfirm(opts) {
    const lines = opts.lines || [];

    if (!hasDialog) {   // browser senza <dialog>: resta la conferma del browser
      return Promise.resolve(window.confirm(opts.title + ' ' + opts.text));
    }

    el.dlgTitle.textContent = opts.title;
    el.dlgText.textContent = opts.text;
    el.dlgOkLabel.textContent = opts.cta || 'Elimina';

    el.dlgList.innerHTML = '';
    lines.slice(0, MAX_LINES).forEach(function (line) {
      const li = document.createElement('li');
      li.textContent = line;
      el.dlgList.appendChild(li);
    });
    if (lines.length > MAX_LINES) {
      const li = document.createElement('li');
      li.className = 'micro';
      li.textContent = '… e altri ' + (lines.length - MAX_LINES);
      el.dlgList.appendChild(li);
    }

    el.dlgTyped.hidden = !opts.typed;
    el.dlgWord.value = '';
    el.dlgOk.disabled = !!opts.typed;

    return new Promise(function (resolve) {
      resolveConfirm = resolve;
      el.dialog.showModal();
      (opts.typed ? el.dlgWord : el.dlgCancel).focus();
    });
  }

  if (hasDialog) {
    el.dlgCancel.addEventListener('click', function () { closeConfirm(false); });
    el.dlgOk.addEventListener('click', function () {
      if (!el.dlgOk.disabled) closeConfirm(true);
    });
    // Esc: il dialogo si chiude comunque, ma la promessa va risolta a mano.
    el.dialog.addEventListener('cancel', function (e) {
      e.preventDefault();
      closeConfirm(false);
    });
    el.dlgWord.addEventListener('input', function () {
      el.dlgOk.disabled = el.dlgWord.value.trim().toUpperCase() !== 'ELIMINA';
    });
    el.dlgWord.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !el.dlgOk.disabled) { e.preventDefault(); closeConfirm(true); }
    });
  }

  let busy = false;

  function setBusy(on) {
    el.delAll.disabled = on;
    el.refresh.disabled = on;
    if (on) {
      el.delSessions.disabled = true;
      el.delPeople.disabled = true;
    } else {
      syncSelection('sessions');
      syncSelection('people');
    }
  }

  /** Esegue la cancellazione, ricarica i dati e riferisce quante righe sono uscite. */
  function runDelete(promise, describe) {
    if (busy) return Promise.resolve();
    busy = true;
    setBusy(true);
    el.statsNote.hidden = true;

    return promise.then(function (count) {
      return load().then(function () { showNote(describe(count)); });
    }).catch(function (err) {
      showError(el.statsError, 'Eliminazione non riuscita: ' + err.message);
    }).then(function () {
      busy = false;
      setBusy(false);
    });
  }

  function sessionLine(r) {
    return personName(r.participants) + ' · avviata ' + dateLabel(r.started_at) + ' · ' +
      (r.completed_at ? 'completa' : (r.answers || []).length + '/12');
  }

  function askDeleteSessions(ids) {
    const wanted = {};
    ids.forEach(function (id) { wanted[id] = true; });
    const chosen = rows.filter(function (r) { return wanted[r.id]; });
    if (!chosen.length) return;

    const n = chosen.length;
    askConfirm({
      title: n === 1 ? 'Eliminare questa compilazione?' : 'Eliminare ' + n + ' compilazioni?',
      text: 'Spariscono dal database anche le risposte collegate. I partecipanti restano ' +
            'registrati, con le loro eventuali altre compilazioni. Non si può annullare.',
      lines: chosen.map(sessionLine)
    }).then(function (ok) {
      if (!ok) return;
      runDelete(DB.deleteSessions(chosen.map(function (r) { return r.id; })), function (k) {
        return k === 1 ? 'Compilazione eliminata.' : k + ' compilazioni eliminate.';
      });
    });
  }

  function askDeletePeople(ids) {
    const wanted = {};
    ids.forEach(function (id) { wanted[id] = true; });
    const chosen = people.filter(function (p) { return wanted[p.id]; });
    if (!chosen.length) return;

    const n = chosen.length;
    const affected = chosen.reduce(function (sum, p) { return sum + sessionsOf(p.id).length; }, 0);

    const text = affected === 0
      ? (n === 1 ? 'Non ha nessuna compilazione: sparisce solo la sua registrazione.'
                 : 'Nessuno di loro ha compilazioni: spariscono solo le registrazioni.') +
        ' Non si può annullare.'
      : 'Insieme ' + (n === 1 ? 'al partecipante' : 'ai partecipanti') + ' spariscono ' +
        affected + (affected === 1 ? ' compilazione' : ' compilazioni') +
        ' e tutte le risposte. Gli aggregati si ricalcolano senza di ' +
        (n === 1 ? 'lui' : 'loro') + '. Non si può annullare.';

    askConfirm({
      title: n === 1 ? 'Eliminare questo partecipante?' : 'Eliminare ' + n + ' partecipanti?',
      text: text,
      lines: chosen.map(function (p) {
        const own = sessionsOf(p.id).length;
        return p.first_name + ' ' + p.last_name + ' · ' +
          (own ? own + (own === 1 ? ' compilazione' : ' compilazioni') : 'nessuna compilazione');
      })
    }).then(function (ok) {
      if (!ok) return;
      runDelete(DB.deleteParticipants(chosen.map(function (p) { return p.id; })), function (k) {
        return k === 1 ? 'Partecipante eliminato.' : k + ' partecipanti eliminati.';
      });
    });
  }

  function askDeleteAll() {
    if (!people.length && !rows.length) return;

    askConfirm({
      title: "Svuotare tutto l'archivio?",
      text: 'Vengono eliminati ' + people.length +
            (people.length === 1 ? ' partecipante, ' : ' partecipanti, ') + rows.length +
            (rows.length === 1 ? ' compilazione ' : ' compilazioni ') +
            'e tutte le risposte. Se ti servono, esporta prima il CSV: dopo non si recuperano.',
      lines: [],
      typed: true,
      cta: 'Elimina tutto'
    }).then(function (ok) {
      if (!ok) return;
      runDelete(DB.deleteAllData(), function (k) {
        return 'Archivio svuotato: ' + k + (k === 1 ? ' partecipante' : ' partecipanti') +
               ' e tutti i dati collegati.';
      });
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

  /** Partecipanti ricavati dalle sessioni: rete di sicurezza se l'elenco
   *  completo non arriva (schema più vecchio, richiesta fallita). */
  function derivePeople() {
    const seen = {};
    const out = [];
    rows.forEach(function (r) {
      if (r.participants && !seen[r.participants.id]) {
        seen[r.participants.id] = true;
        out.push({
          id: r.participants.id,
          first_name: r.participants.first_name,
          last_name: r.participants.last_name,
          created_at: null
        });
      }
    });
    return out;
  }

  function load() {
    el.statsError.hidden = true;
    return Promise.all([
      DB.fetchOverview(),
      DB.fetchParticipants().catch(function () { return null; })
    ]).then(function (res) {
      rows = Array.isArray(res[0]) ? res[0] : [];
      people = Array.isArray(res[1]) ? res[1] : derivePeople();
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

  el.refresh.addEventListener('click', load);
  document.getElementById('btn-csv').addEventListener('click', downloadCsv);

  document.getElementById('btn-logout').addEventListener('click', function () {
    DB.signOut().then(function () {
      rows = [];
      people = [];
      el.statsNote.hidden = true;
      el.userChip.hidden = true;
      showView('login');
    });
  });

  /* --- selezione: casella «tutti» e caselle di riga (delega sul tbody) --- */

  Object.keys(GROUPS).forEach(function (group) {
    const g = GROUPS[group];

    g.all.addEventListener('change', function () {
      boxesOf(group).forEach(function (cb) { cb.checked = g.all.checked; });
      syncSelection(group);
    });

    g.tbody.addEventListener('change', function (e) {
      if (e.target && e.target.classList.contains('row-check')) syncSelection(group);
    });
  });

  /* --- cestino di riga --- */

  el.sessionsBody.addEventListener('click', function (e) {
    const btn = e.target.closest ? e.target.closest('.btn-icon') : null;
    if (btn) askDeleteSessions([btn.dataset.id]);
  });

  el.peopleBody.addEventListener('click', function (e) {
    const btn = e.target.closest ? e.target.closest('.btn-icon') : null;
    if (btn) askDeletePeople([btn.dataset.id]);
  });

  /* --- cancellazioni di gruppo e svuotamento --- */

  el.delSessions.addEventListener('click', function () {
    askDeleteSessions(selectedIds('sessions'));
  });

  el.delPeople.addEventListener('click', function () {
    askDeletePeople(selectedIds('people'));
  });

  el.delAll.addEventListener('click', askDeleteAll);

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
