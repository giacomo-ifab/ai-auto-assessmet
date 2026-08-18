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
    calDims:     document.getElementById('cal-dims'),
    calNote:     document.getElementById('cal-note'),
    calItemBars: document.getElementById('cal-item-bars'),
    calLegend:   document.getElementById('cal-legend'),

    areaChips:   document.getElementById('a-chips'),
    areaHint:    document.getElementById('a-hint'),
    areaBody:    document.getElementById('a-body'),
    areaEmpty:   document.getElementById('a-empty'),
    areasList:   document.getElementById('areas-list'),
    areasCount:  document.getElementById('areas-count'),
    areasError:  document.getElementById('areas-error'),
    areaAddForm: document.getElementById('area-add-form'),
    areaNew:     document.getElementById('area-new'),
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

  let rows = [];         // sessioni con partecipante e risposte
  let people = [];       // partecipanti registrati, anche senza compilazioni
  let areas = [];        // aree aziendali configurate, nell'ordine scelto
  let currentArea = null;// area mostrata nella scheda "Statistiche per area"
  let globalStats = null;// aggregati del gruppo intero, per il confronto per area

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

  /** Le compilazioni concluse di un insieme di righe. Prende la lista come
   *  argomento perché gli stessi calcoli servono sul gruppo intero e su una
   *  singola area aziendale. */
  function completed(list) {
    return list.filter(function (r) { return r.completed_at; });
  }

  /** Medie per dimensione sulle compilazioni complete, dalle risposte grezze. */
  function dimensionMeans(list) {
    const acc = {};
    DIMENSIONS.forEach(function (d) { acc[d.code] = { sum: 0, n: 0 }; });

    completed(list).forEach(function (r) {
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

  function itemMeans(list) {
    const acc = {};
    completed(list).forEach(function (r) {
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

  /* ------------------------------------------------------------- taratura */

  // Gli item di calibrazione sono un asse separato: non entrano in medie,
  // totale o fascia (quelli restano l'autovalutazione dichiarata). Servono solo
  // a etichettare la dimensione, e l'etichetta la vede solo questa pagina.

  const CAL_LABELS = ['Confermato', 'Sovrastima', 'Sottostima', 'Coerente'];

  const CAL_LABEL_CLASS = {
    Confermato: 'tag-conf',
    Sovrastima: 'tag-over',
    Sottostima: 'tag-under',
    Coerente:   'tag-coer'
  };

  const CAL_LABEL_HINT = {
    Confermato: 'dichiara alto e risponde correttamente',
    Sovrastima: 'dichiara alto ma non risponde correttamente',
    Sottostima: 'dichiara basso e risponde correttamente',
    Coerente:   'dichiara basso e non risponde correttamente'
  };

  function dimLabel(code) {
    const d = DIMENSIONS.filter(function (x) { return x.code === code; })[0];
    return d ? d.label : code;
  }

  /** Media dichiarata di una dimensione: dalle risposte grezze, con i valori
   *  salvati come ripiego. */
  function selfMean(row, code) {
    const vals = (row.answers || [])
      .filter(function (a) { return a.dimension === code; })
      .map(function (a) { return a.value; });

    if (vals.length) {
      return vals.reduce(function (a, b) { return a + b; }, 0) / vals.length;
    }
    const stored = row.dim_means && row.dim_means[code];
    return typeof stored === 'number' ? stored : null;
  }

  /** Taratura di una compilazione, dimensione per dimensione.
   *  L'etichetta compare solo se la compilazione è completa e tutti gli item di
   *  calibrazione estratti hanno una risposta registrata: altrimenti resta null,
   *  perché non ha senso stimarla. */
  function calibrationOf(row) {
    const out = {};
    const extracted = row.cal_item_ids || [];
    const given = {};
    (row.calibrations || []).forEach(function (c) { given[c.item_id] = c; });

    CAL_DIMS.forEach(function (code) {
      const ids = extracted.filter(function (id) {
        return CAL_BY_ID[id] && CAL_BY_ID[id].dim === code;
      });
      if (!ids.length) return;

      const answered = ids.filter(function (id) { return given[id]; });
      const correct = answered.filter(function (id) { return given[id].correct; });
      const mean = selfMean(row, code);
      const complete = Boolean(row.completed_at) && answered.length === ids.length;

      out[code] = {
        total: ids.length,
        answered: answered.length,
        correct: correct.length,
        mean: mean,
        label: (complete && mean !== null)
          ? calibrationLabel(mean, correct.length === ids.length)
          : null
      };
    });

    return out;
  }

  /** Distribuzione delle etichette per dimensione calibrata. */
  function calibrationSummary(list) {
    const acc = {};
    CAL_DIMS.forEach(function (code) {
      acc[code] = { labels: {}, labelled: 0, correct: 0, answered: 0, meanSum: 0, meanN: 0 };
      CAL_LABELS.forEach(function (l) { acc[code].labels[l] = 0; });
    });

    completed(list).forEach(function (r) {
      const cal = calibrationOf(r);
      CAL_DIMS.forEach(function (code) {
        const cell = cal[code];
        if (!cell) return;
        acc[code].correct += cell.correct;
        acc[code].answered += cell.answered;
        if (typeof cell.mean === 'number') {
          acc[code].meanSum += cell.mean;
          acc[code].meanN += 1;
        }
        if (cell.label) {
          acc[code].labels[cell.label] += 1;
          acc[code].labelled += 1;
        }
      });
    });

    return CAL_DIMS.map(function (code) {
      const cell = acc[code];
      return {
        code: code,
        label: dimLabel(code),
        labels: cell.labels,
        labelled: cell.labelled,
        correct: cell.correct,
        answered: cell.answered,
        mean: cell.meanN ? cell.meanSum / cell.meanN : null
      };
    });
  }

  /** Percentuale di risposte corrette per singolo item di calibrazione. */
  function calItemStats(list) {
    const acc = {};
    completed(list).forEach(function (r) {
      (r.calibrations || []).forEach(function (c) {
        if (!acc[c.item_id]) acc[c.item_id] = { n: 0, ok: 0, dim: c.dimension };
        acc[c.item_id].n += 1;
        if (c.correct) acc[c.item_id].ok += 1;
      });
    });

    return Object.keys(acc).map(function (id) {
      return { id: id, dim: acc[id].dim, n: acc[id].n, ok: acc[id].ok, rate: acc[id].ok / acc[id].n };
    }).sort(function (a, b) { return a.rate - b.rate; });
  }

  /** Dimensioni in cui la sovrastima è l'etichetta prevalente: sono le sole a
   *  ricevere un marcatore sul radar, che per il resto non cambia. */
  function overratedDims(summary) {
    return summary.filter(function (s) {
      if (!s.labelled) return false;
      const over = s.labels.Sovrastima;
      return over > 0 && CAL_LABELS.every(function (l) {
        return l === 'Sovrastima' || s.labels[l] <= over;
      }) && over / s.labelled >= 0.5;
    }).map(function (s) { return s.code; });
  }

  /** In tabella la dimensione è una sola lettera: la riga ha già otto colonne
   *  e le sigle intere la mandavano fuori larghezza. La legenda sotto la
   *  tabella scioglie lettere e colori. */
  function calTag(code, label) {
    const span = document.createElement('span');
    span.className = 'tag tag-cal ' + (CAL_LABEL_CLASS[label] || '');
    span.textContent = code.charAt(0);
    span.title = dimLabel(code) + ': ' + label.toLowerCase() + ' — ' + CAL_LABEL_HINT[label];
    return span;
  }

  /** Legenda della colonna Taratura, costruita dalle dimensioni calibrate:
   *  se cambiano le quote in items.js resta corretta da sé. */
  function renderCalLegend() {
    if (!el.calLegend) return;
    el.calLegend.innerHTML = '';

    const lead = document.createElement('span');
    lead.textContent = 'Colonna Taratura — ' + CAL_DIMS.map(function (code) {
      return code.charAt(0) + ' ' + dimLabel(code).toLowerCase();
    }).join(', ') + ". Il colore dice l'esito: ";
    el.calLegend.appendChild(lead);

    CAL_LABELS.forEach(function (label, i) {
      const chip = document.createElement('span');
      chip.className = 'tag tag-cal ' + CAL_LABEL_CLASS[label];
      chip.textContent = CAL_DIMS[0].charAt(0);
      el.calLegend.appendChild(chip);
      const txt = document.createElement('span');
      txt.textContent = label.toLowerCase() + (i === CAL_LABELS.length - 1 ? '.' : ' · ');
      el.calLegend.appendChild(txt);
    });
  }

  function renderCalibration(summary, t, list) {
    // --- etichette per dimensione
    t.calDims.innerHTML = '';
    summary.forEach(function (s) {
      const li = document.createElement('li');

      const head = document.createElement('div');
      head.className = 'bar-head';
      const name = document.createElement('span');
      name.className = 'bar-name';
      name.textContent = s.label;
      const value = document.createElement('span');
      value.className = 'bar-value';
      value.textContent = s.answered
        ? 'dichiarata ' + (s.mean === null ? '—' : fmt(s.mean)) + ' · ' +
          pct(s.correct, s.answered) + '% corrette'
        : 'nessuna risposta';
      head.appendChild(name);
      head.appendChild(value);
      li.appendChild(head);

      const chips = document.createElement('div');
      chips.className = 'cal-chips';
      CAL_LABELS.forEach(function (label) {
        const n = s.labels[label];
        const chip = document.createElement('span');
        chip.className = 'tag ' + CAL_LABEL_CLASS[label] +
          (n ? '' : ' is-empty') + (label === 'Sovrastima' && n ? ' is-priority' : '');
        chip.textContent = label + ' ' + n;
        chip.title = CAL_LABEL_HINT[label];
        chips.appendChild(chip);
      });
      li.appendChild(chips);

      t.calDims.appendChild(li);
    });

    // --- priorità formativa: la dimensione con più sovrastime
    const worst = summary.slice().sort(function (a, b) {
      return (b.labels.Sovrastima / (b.labelled || 1)) - (a.labels.Sovrastima / (a.labelled || 1));
    })[0];

    if (!worst || !worst.labelled) {
      t.calNote.textContent = 'Le etichette compaiono al primo questionario concluso. ' +
        'Non modificano medie, totale e fascia: sono un asse separato.';
    } else if (!worst.labels.Sovrastima) {
      t.calNote.textContent = 'Nessuna sovrastima rilevata: dove la dichiarazione è alta, ' +
        'le domande di calibrazione risultano corrette.';
    } else {
      t.calNote.textContent = 'Priorità formativa: ' + worst.label + ' — ' +
        worst.labels.Sovrastima + ' compilazion' + (worst.labels.Sovrastima === 1 ? 'e' : 'i') +
        ' su ' + worst.labelled + ' in sovrastima (dichiarazione alta, risposta non corretta).';
    }

    // --- % corrette per item
    const stats = calItemStats(list);
    t.calItemBars.innerHTML = '';
    if (!stats.length) {
      const li = document.createElement('li');
      li.className = 'micro';
      li.textContent = 'Nessuna risposta di calibrazione registrata.';
      t.calItemBars.appendChild(li);
      return;
    }
    stats.forEach(function (s) {
      const item = CAL_BY_ID[s.id];
      const text = item ? (item.intro || item.text) : '';
      const label = s.id + ' · ' + text.slice(0, 80) + (text.length > 80 ? '…' : '');
      t.calItemBars.appendChild(
        bar(label, s.ok + '/' + s.n + ' · ' + pct(s.ok, s.n) + '%', s.rate, s.rate < 0.5));
    });
  }

  /* -------------------------------------------------- aggregati riutilizzabili */

  // Gli aggregati sono gli stessi per il gruppo intero e per una singola area:
  // qui si calcolano su una lista di compilazioni e si scrivono in un insieme di
  // nodi passati come argomento. La vista globale resta quella di prima, la
  // vista per area riusa lo stesso codice su un sottoinsieme.

  const TARGETS = {
    global: {
      kpiGrid: el.kpiGrid,
      dimBars: el.dimBars,
      dimNote: el.dimNote,
      radar: el.radar,
      bandBars: el.bandBars,
      alertBars: el.alertBars,
      itemBars: el.itemBars,
      calDims: el.calDims,
      calNote: el.calNote,
      calItemBars: el.calItemBars
    },
    area: {
      kpiGrid: document.getElementById('a-kpi-grid'),
      dimBars: document.getElementById('a-dim-bars'),
      dimNote: document.getElementById('a-dim-note'),
      radar: document.getElementById('a-radar'),
      bandBars: document.getElementById('a-band-bars'),
      alertBars: document.getElementById('a-alert-bars'),
      itemBars: document.getElementById('a-item-bars'),
      calDims: document.getElementById('a-cal-dims'),
      calNote: document.getElementById('a-cal-note'),
      calItemBars: document.getElementById('a-cal-item-bars')
    }
  };

  /** Scarto rispetto al gruppo, con il segno. */
  function delta(value, reference) {
    const diff = value - reference;
    if (Math.abs(diff) < 0.005) return 'in linea col gruppo';
    return (diff > 0 ? '+' : '−') + fmt(Math.abs(diff)) + ' vs gruppo';
  }

  /**
   * @param ctx { rows, peopleCount, peopleHint, targets, reference }
   *   `reference` è l'aggregato globale: se c'è, accanto ai valori compare il
   *   confronto. Su liste vuote non si divide per zero: pct() e le medie
   *   restituiscono 0 e le card si mostrano vuote.
   */
  function renderStats(ctx) {
    const t = ctx.targets;
    const list = ctx.rows;
    const ref = ctx.reference || null;
    const done = completed(list);

    const totals = done.map(function (r) { return r.total; })
      .filter(function (x) { return typeof x === 'number'; });
    const avgTotal = totals.length ? totals.reduce(function (a, b) { return a + b; }, 0) / totals.length : 0;

    // --- KPI
    t.kpiGrid.innerHTML = '';
    t.kpiGrid.appendChild(kpi('Partecipanti', ctx.peopleCount, ctx.peopleHint));
    t.kpiGrid.appendChild(kpi('Compilazioni', list.length, done.length + ' complete'));
    t.kpiGrid.appendChild(kpi('Completamento', pct(done.length, list.length) + '%',
      (list.length - done.length) + ' interrotte'));
    t.kpiGrid.appendChild(kpi('Punteggio medio', totals.length ? fmt(avgTotal) : '—',
      ref && totals.length && ref.totalsCount
        ? 'su 48 · gruppo ' + fmt(ref.avgTotal)
        : 'su 48'));

    // --- dimensioni + radar
    const dims = dimensionMeans(list);
    t.dimBars.innerHTML = '';
    dims.forEach(function (d, i) {
      const refMean = ref ? ref.dims[i].mean : null;
      const value = fmt(d.mean) + ' / 4' +
        (refMean !== null && done.length ? ' · ' + delta(d.mean, refMean) : '');
      t.dimBars.appendChild(bar(d.label, value, d.mean / 4));
    });

    // Taratura: asse separato. Il radar resta l'autovalutazione, il marcatore
    // segnala solo le dimensioni in cui prevale la sovrastima.
    const calSummary = calibrationSummary(list);
    renderCalibration(calSummary, t, list);

    // Senza compilazioni complete il radar non ha nulla da disegnare: va
    // nascosto, altrimenti resterebbe visibile il disegno dell'insieme precedente.
    t.radar.hidden = !done.length;
    if (done.length) {
      const sorted = dims.slice().sort(function (a, b) { return b.mean - a.mean; });
      t.dimNote.textContent = 'Più solida: ' + sorted[0].label + ' (' + fmt(sorted[0].mean) +
        '). Più fragile: ' + sorted[sorted.length - 1].label + ' (' + fmt(sorted[sorted.length - 1].mean) + ').';
      window.AIAA_RADAR.draw(t.radar, dims, { mark: overratedDims(calSummary) });
    } else {
      t.dimNote.textContent = 'Nessuna compilazione completa: le medie compaiono al primo questionario concluso.';
    }

    // --- fasce
    t.bandBars.innerHTML = '';
    BANDS.forEach(function (b) {
      const n = done.filter(function (r) { return r.band === b.name; }).length;
      t.bandBars.appendChild(bar(b.name + ' (' + b.min + '–' + b.max + ')',
        n + (done.length ? ' · ' + pct(n, done.length) + '%' : ''), done.length ? n / done.length : 0));
    });

    // --- alert
    t.alertBars.innerHTML = '';
    Object.keys(ALERT_LABELS).forEach(function (code) {
      const n = done.filter(function (r) { return (r.alerts || []).indexOf(code) !== -1; }).length;
      t.alertBars.appendChild(bar(ALERT_LABELS[code],
        n + (done.length ? ' · ' + pct(n, done.length) + '%' : ''),
        done.length ? n / done.length : 0, true));
    });

    // --- item più critici
    const items = itemMeans(list).slice(0, 6);
    t.itemBars.innerHTML = '';
    if (!items.length) {
      const li = document.createElement('li');
      li.className = 'micro';
      li.textContent = 'Servono almeno due risposte per item.';
      t.itemBars.appendChild(li);
    }
    items.forEach(function (it) {
      const label = it.id + ' · ' + (ITEM_TEXT[it.id] || '').slice(0, 90) +
        ((ITEM_TEXT[it.id] || '').length > 90 ? '…' : '');
      t.itemBars.appendChild(bar(label, fmt(it.mean) + ' / 4 · ' + it.n + ' risp.', it.mean / 4));
    });

    return { dims: dims, avgTotal: avgTotal, totalsCount: totals.length, doneCount: done.length };
  }

  function render() {
    // Un partecipante registrato che non ha ancora avviato nulla non produce righe
    // in `rows`, ma deve restare visibile: è uno di quelli da poter cancellare.
    const hasData = rows.length > 0 || people.length > 0;
    el.statsEmpty.hidden = hasData;
    el.statsBody.hidden = !hasData;
    el.loadedAt.textContent = 'Aggiornato alle ' +
      new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });

    renderAreasConfig();

    if (!hasData) {
      globalStats = null;
      renderAreaTab();
      return;
    }

    const withSession = {};
    rows.forEach(function (r) { if (r.participants) withSession[r.participants.id] = true; });

    globalStats = renderStats({
      rows: rows,
      peopleCount: people.length,
      peopleHint: Object.keys(withSession).length + ' con almeno una compilazione',
      targets: TARGETS.global,
      reference: null
    });
    renderCalLegend();

    renderSessionsTable();
    renderPeople();
    syncSelection('sessions');
    syncSelection('people');
    renderAreaTab();
  }

  function renderSessionsTable() {
    // --- tabella compilazioni
    el.sessionsCount.textContent = rows.length + (rows.length === 1 ? ' riga' : ' righe');
    el.sessionsBody.innerHTML = '';
    if (!rows.length) emptyRow(el.sessionsBody, 9, 'Nessuna compilazione registrata.');

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

      const taratura = document.createElement('td');
      const cal = calibrationOf(r);
      const labelled = CAL_DIMS.filter(function (code) { return cal[code] && cal[code].label; });
      if (labelled.length) {
        labelled.forEach(function (code) { taratura.appendChild(calTag(code, cal[code].label)); });
      } else {
        taratura.textContent = '—';
      }
      tr.appendChild(taratura);

      tr.appendChild(trashCell(r.id, 'la compilazione di ' + personName(r.participants)));

      el.sessionsBody.appendChild(tr);
    });

  }

  /* ------------------------------------------------------- partecipanti */

  function renderPeople() {
    el.peopleCount.textContent = people.length + (people.length === 1 ? ' registrato' : ' registrati');
    el.peopleBody.innerHTML = '';

    if (!people.length) {
      emptyRow(el.peopleBody, 7, 'Nessun partecipante registrato.');
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

      const areaCell = document.createElement('td');
      areaCell.textContent = areaOf(p);
      tr.appendChild(areaCell);

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

  /* ------------------------------------------------------- aree aziendali */

  // L'elenco vive su Supabase e lo governa questa pagina; i partecipanti lo
  // leggono al momento della registrazione. Sulle compilazioni resta scritto il
  // nome dell'area, così la segmentazione storica non si perde se l'area viene
  // poi eliminata dall'elenco.

  /** Area di un partecipante (o del partecipante di una compilazione). */
  function areaOf(participant) {
    const name = participant && participant.area ? String(participant.area).trim() : '';
    return name || AREA_NONE_LABEL;
  }

  /**
   * Voci del selettore: le aree configurate, più quelle che compaiono nei dati
   * ma non sono (più) in elenco — comprese le persone senza area. Così nessun
   * partecipante resta fuori da tutte le viste.
   */
  function areaOptions() {
    const counts = {};
    people.forEach(function (p) {
      const name = areaOf(p);
      counts[name] = (counts[name] || 0) + 1;
    });

    const out = [];
    const seen = {};
    areas.forEach(function (a) {
      seen[a.name] = true;
      out.push({ name: a.name, count: counts[a.name] || 0, configured: true });
    });
    Object.keys(counts).sort().forEach(function (name) {
      if (!seen[name]) out.push({ name: name, count: counts[name], configured: false });
    });
    return out;
  }

  function rowsOfArea(name) {
    return rows.filter(function (r) { return areaOf(r.participants) === name; });
  }

  function peopleOfArea(name) {
    return people.filter(function (p) { return areaOf(p) === name; });
  }

  function renderAreaTab() {
    const options = areaOptions();

    // L'area scelta resta selezionata fra un aggiornamento e l'altro; se
    // sparisce si ripiega sulla prima che ha partecipanti.
    if (!options.some(function (o) { return o.name === currentArea; })) {
      const withPeople = options.filter(function (o) { return o.count > 0; })[0];
      currentArea = (withPeople || options[0] || { name: null }).name;
    }

    el.areaChips.innerHTML = '';
    options.forEach(function (o) {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'chip-toggle' + (o.name === currentArea ? ' is-active' : '') +
        (o.configured ? '' : ' is-legacy');
      chip.dataset.area = o.name;
      chip.textContent = o.name;
      const badge = document.createElement('span');
      badge.className = 'chip-count';
      badge.textContent = o.count;
      chip.appendChild(badge);
      if (!o.configured) chip.title = 'Area non più in elenco: resta per i partecipanti già registrati';
      el.areaChips.appendChild(chip);
    });

    if (!options.length) {
      el.areaHint.textContent = '';
      el.areaBody.hidden = true;
      el.areaEmpty.hidden = false;
      el.areaEmpty.textContent = 'Nessuna area configurata: aggiungine una nella scheda «Aree aziendali».';
      return;
    }

    const areaRows = rowsOfArea(currentArea);
    const areaPeople = peopleOfArea(currentArea);

    el.areaHint.textContent = areaPeople.length + (areaPeople.length === 1 ? ' partecipante' : ' partecipanti') +
      ' su ' + people.length + ' del gruppo';

    // Area senza nessuno: si mostra vuota, senza aggregati e senza divisioni per zero.
    const empty = areaPeople.length === 0 && areaRows.length === 0;
    el.areaBody.hidden = empty;
    el.areaEmpty.hidden = !empty;
    if (empty) {
      el.areaEmpty.textContent = 'Nessun partecipante in quest’area.';
      return;
    }

    renderStats({
      rows: areaRows,
      peopleCount: areaPeople.length,
      peopleHint: 'su ' + people.length + ' del gruppo',
      targets: TARGETS.area,
      reference: globalStats
    });
  }

  /* ------------------------------------------ configurazione dell'elenco */

  function renderAreasConfig() {
    const counts = {};
    people.forEach(function (p) {
      const name = areaOf(p);
      counts[name] = (counts[name] || 0) + 1;
    });

    el.areasCount.textContent = areas.length + (areas.length === 1 ? ' area' : ' aree');
    el.areasList.innerHTML = '';

    if (!areas.length) {
      const li = document.createElement('li');
      li.className = 'micro';
      li.textContent = 'Elenco vuoto: finché è così, il menù della registrazione resta senza opzioni.';
      el.areasList.appendChild(li);
      return;
    }

    areas.forEach(function (area, idx) {
      const li = document.createElement('li');

      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'area-name';
      input.value = area.name;
      input.maxLength = 60;
      input.dataset.id = area.id;
      input.setAttribute('aria-label', 'Nome dell’area ' + area.name);
      li.appendChild(input);

      const n = counts[area.name] || 0;
      const count = document.createElement('span');
      count.className = 'micro area-count';
      count.textContent = n === 1 ? '1 partecipante' : n + ' partecipanti';
      li.appendChild(count);

      const actions = document.createElement('span');
      actions.className = 'area-actions';
      actions.appendChild(areaButton('up', 'i-up', 'Sposta su ' + area.name, area.id, idx === 0));
      actions.appendChild(areaButton('down', 'i-down', 'Sposta giù ' + area.name, area.id,
        idx === areas.length - 1));
      actions.appendChild(areaButton('del', 'i-trash', 'Elimina ' + area.name, area.id, false));
      li.appendChild(actions);

      el.areasList.appendChild(li);
    });
  }

  function areaButton(act, iconId, label, id, disabled) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn-icon';
    b.dataset.act = act;
    b.dataset.id = id;
    b.title = label;
    b.setAttribute('aria-label', label);
    b.disabled = Boolean(disabled);
    b.appendChild(icon(iconId));
    return b;
  }

  let areaBusy = false;

  /** Esegue una modifica all'elenco, poi rilegge elenco e dati. */
  function runAreaOp(promise, message) {
    if (areaBusy) return Promise.resolve();
    areaBusy = true;
    el.areasError.hidden = true;

    return promise
      .then(function () { return load(); })
      .then(function () { showNote(message); })
      .catch(function (err) {
        showError(el.areasError, 'Modifica non riuscita: ' + areaErrorText(err));
      })
      .then(function () { areaBusy = false; });
  }

  /** I messaggi del database sono espliciti: qui si tiene solo la parte utile. */
  function areaErrorText(err) {
    const raw = err && err.message ? err.message : 'errore sconosciuto';
    const match = /"message":"([^"]+)"/.exec(raw);
    return match ? match[1] : raw;
  }

  function moveArea(id, direction) {
    const idx = areas.findIndex(function (a) { return a.id === id; });
    const target = idx + direction;
    if (idx < 0 || target < 0 || target >= areas.length) return;

    const ids = areas.map(function (a) { return a.id; });
    ids.splice(target, 0, ids.splice(idx, 1)[0]);
    runAreaOp(DB.reorderAreas(ids), 'Ordine delle aree aggiornato.');
  }

  function askDeleteArea(id) {
    const area = areas.filter(function (a) { return a.id === id; })[0];
    if (!area) return;

    const n = peopleOfArea(area.name).length;
    askConfirm({
      title: 'Eliminare l’area «' + area.name + '»?',
      text: n
        ? 'Non cancella nessun partecipante: i ' + n + ' già registrati in quest’area restano, ' +
          'con la loro etichetta, e continuano a comparire nelle statistiche per area. ' +
          'L’area non sarà più proponibile a chi si registra.'
        : 'Nessun partecipante è registrato in quest’area: sparisce solo dal menù della registrazione.',
      cta: 'Elimina'
    }).then(function (ok) {
      if (!ok) return;
      runAreaOp(DB.deleteArea(id), 'Area eliminata.');
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
    // Le colonne storiche restano dove sono: la calibrazione si aggiunge in coda.
    const header = ['partecipante', 'avviata', 'completata', 'totale', 'profilo', 'alert']
      .concat(DIMENSIONS.map(function (d) { return 'media_' + d.code; }))
      .concat(ITEMS.map(function (it) { return it.id; }))
      .concat(['cal_item_estratti'])
      .concat(CAL_ITEMS.map(function (it) { return it.id; }))
      .concat(CAL_DIMS.map(function (code) { return 'taratura_' + code; }))
      .concat(['area']);

    const lines = [header.join(';')];

    rows.forEach(function (r) {
      const byItem = {};
      (r.answers || []).forEach(function (a) { byItem[a.item_id] = a.value; });
      const byCal = {};
      (r.calibrations || []).forEach(function (c) { byCal[c.item_id] = c; });
      const cal = calibrationOf(r);
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
      })).concat([(r.cal_item_ids || []).join('|')]).concat(CAL_ITEMS.map(function (it) {
        const given = byCal[it.id];
        return given ? (given.correct ? 1 : 0) : '';   // vuoto se non estratto o senza risposta
      })).concat(CAL_DIMS.map(function (code) {
        return (cal[code] && cal[code].label) || '';
      })).concat([r.participants && r.participants.area ? r.participants.area : '']);

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
      DB.fetchParticipants().catch(function () { return null; }),
      DB.fetchAreas().catch(function () { return null; })
    ]).then(function (res) {
      rows = Array.isArray(res[0]) ? res[0] : [];
      people = Array.isArray(res[1]) ? res[1] : derivePeople();
      // Se l'elenco aree non arriva si tiene quello già in memoria: le
      // statistiche per area restano leggibili dai dati dei partecipanti.
      if (Array.isArray(res[2])) {
        areas = res[2].filter(function (a) { return a && a.name; });
      }
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

  /* --- schede: globali / per area / configurazione dell'elenco --- */

  const TABS = [
    { btn: 'tab-btn-global', panel: 'tab-global' },
    { btn: 'tab-btn-area', panel: 'tab-area' },
    { btn: 'tab-btn-areas', panel: 'tab-areas' }
  ].map(function (t) {
    return { button: document.getElementById(t.btn), panel: document.getElementById(t.panel) };
  });

  function showTab(index) {
    TABS.forEach(function (t, i) {
      const active = i === index;
      t.button.classList.toggle('is-active', active);
      t.button.setAttribute('aria-selected', active ? 'true' : 'false');
      t.panel.hidden = !active;
    });
  }

  TABS.forEach(function (t, i) {
    t.button.addEventListener('click', function () { showTab(i); });
  });

  /* --- selettore dell'area nelle statistiche per area --- */

  el.areaChips.addEventListener('click', function (e) {
    const chip = e.target.closest ? e.target.closest('.chip-toggle') : null;
    if (!chip) return;
    currentArea = chip.dataset.area;
    renderAreaTab();
  });

  /* --- configurazione dell'elenco aree --- */

  el.areaAddForm.addEventListener('submit', function (e) {
    e.preventDefault();
    const name = el.areaNew.value.trim();
    if (!name) {
      showError(el.areasError, 'Scrivi il nome della nuova area.');
      el.areaNew.focus();
      return;
    }
    runAreaOp(DB.createArea(name), 'Area «' + name + '» aggiunta.').then(function () {
      el.areaNew.value = '';
    });
  });

  el.areasList.addEventListener('click', function (e) {
    const btn = e.target.closest ? e.target.closest('.btn-icon') : null;
    if (!btn || btn.disabled) return;
    const id = btn.dataset.id;
    if (btn.dataset.act === 'up') moveArea(id, -1);
    else if (btn.dataset.act === 'down') moveArea(id, 1);
    else if (btn.dataset.act === 'del') askDeleteArea(id);
  });

  // Rinomina: si conferma uscendo dal campo o con Invio.
  el.areasList.addEventListener('change', function (e) {
    const input = e.target;
    if (!input.classList || !input.classList.contains('area-name')) return;

    const area = areas.filter(function (a) { return a.id === input.dataset.id; })[0];
    const name = input.value.trim();

    if (!area) return;
    if (!name) {
      input.value = area.name;
      showError(el.areasError, 'Il nome dell’area non può essere vuoto.');
      return;
    }
    if (name === area.name) return;

    runAreaOp(DB.renameArea(area.id, name), 'Area rinominata in «' + name + '».');
  });

  el.areasList.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && e.target.classList && e.target.classList.contains('area-name')) {
      e.preventDefault();
      e.target.blur();
    }
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
