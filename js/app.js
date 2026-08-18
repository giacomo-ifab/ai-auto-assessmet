/* ==========================================================================
   Auto-assessment competenze AI — logica di sessione, scoring, radar.
   Dipende da js/items.js (DIMENSIONS, ITEMS, SCALE, BANDS, CAL_*).

   Il questionario mostra due tipi di domanda nella stessa lista: i 12 item
   della scala 1–4, che producono medie, totale e fascia, e 4 item di
   calibrazione a scelta multipla, che non entrano in nessun punteggio. La loro
   lettura (confermato / sovrastima / sottostima) sta in js/facilitator.js:
   al partecipante non viene mostrato alcun esito.
   ========================================================================== */

(function () {
  'use strict';

  const TOTAL_ITEMS = DIMENSIONS.reduce((n, d) => n + d.quota, 0); // 12
  const TOTAL_QUESTIONS = TOTAL_ITEMS + CAL_TOTAL;                 // 16

  /** Stato della sessione corrente */
  const session = {
    items: [],            // 12 item della scala, nell'ordine di estrazione
    calItems: [],         // 4 item di calibrazione, con le opzioni già mescolate
    list: [],             // le 16 domande nell'ordine mostrato: { kind, item }
    answers: new Map(),   // id item -> 1..4
    calAnswers: new Map(),// id item di calibrazione -> { choiceId, correct }
    validated: false,     // true dopo il primo tentativo di calcolo
    dbId: null            // id della riga sessions su Supabase, null se non salvata
  };

  /** Punti di "Come funziona" nella intro. */
  const HOW_IT_WORKS = [
    TOTAL_ITEMS + ' item estratti casualmente da una banca di 30.',
    CAL_TOTAL + ' domande a scelta multipla su situazioni concrete, mescolate fra gli item: ' +
      'si risponde una volta sola e non cambiano il punteggio.',
    'Sugli item della scala non ci sono risposte giuste o sbagliate: si misura la padronanza dichiarata.',
    'Il calcolo parte solo quando tutte le risposte sono complete.',
    'Ogni nuova sessione propone una selezione diversa di domande.'
  ];

  const el = {
    views: {
      intro:    document.getElementById('view-intro'),
      register: document.getElementById('view-register'),
      quiz:     document.getElementById('view-quiz'),
      results:  document.getElementById('view-results')
    },
    registerForm:   document.getElementById('register-form'),
    firstName:      document.getElementById('first-name'),
    lastName:       document.getElementById('last-name'),
    registerError:  document.getElementById('register-error'),
    registerSubmit: document.getElementById('register-submit'),
    registerSkip:   document.getElementById('register-skip'),
    registerNote:   document.getElementById('register-note'),
    participantChip: document.getElementById('participant-chip'),
    participantName: document.getElementById('participant-name'),
    changeParticipant: document.getElementById('change-participant'),
    saveStatus:  document.getElementById('save-status'),
    dbNotice:    document.getElementById('db-notice'),
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

  /** Estrae gli item di calibrazione (1 COMP + 2 VAL + 1 RESP) e mescola le
   *  quattro opzioni di ciascuno: la posizione della risposta corretta cambia
   *  a ogni sessione. */
  function drawCalItems() {
    const picked = [];
    CAL_DIMS.forEach(function (code) {
      const pool = CAL_ITEMS.filter(function (it) { return it.dim === code; });
      picked.push.apply(picked, shuffle(pool).slice(0, CAL_QUOTAS[code]));
    });
    return shuffle(picked).map(function (it) {
      return Object.assign({}, it, { options: shuffle(it.options) });
    });
  }

  /** Intreccia le due serie: un item di calibrazione ogni blocco di tre item
   *  della scala, in posizione casuale dentro il blocco. Così il questionario
   *  non apre con una domanda a scelta multipla e non ne mette due di fila. */
  function buildList(items, calItems) {
    const list = [];
    if (!calItems.length) {
      return items.map(function (it) { return { kind: 'scale', item: it }; });
    }

    const block = Math.max(1, Math.floor(items.length / calItems.length));
    let used = 0;

    calItems.forEach(function (cal, b) {
      const chunk = items.slice(b * block, (b + 1) * block);
      const after = 1 + randomInt(chunk.length);   // almeno un item della scala prima
      chunk.forEach(function (it, i) {
        list.push({ kind: 'scale', item: it });
        if (i + 1 === after) list.push({ kind: 'cal', item: cal });
      });
      used = (b + 1) * block;
    });

    items.slice(used).forEach(function (it) { list.push({ kind: 'scale', item: it }); });
    return list;
  }

  /** Posizione (1-based) di una domanda nella lista mostrata. */
  function positionOf(itemId) {
    for (let i = 0; i < session.list.length; i++) {
      if (session.list[i].item.id === itemId) return i + 1;
    }
    return null;
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

  /** Intestazione comune alle due tipologie di domanda: numero + testo. */
  function questionLegend(idx, textNode) {
    const legend = document.createElement('legend');
    const num = document.createElement('span');
    num.className = 'item-num';
    num.textContent = String(idx + 1).padStart(2, '0');
    legend.appendChild(num);
    legend.appendChild(textNode);
    return legend;
  }

  function missingFlag() {
    const flag = document.createElement('p');
    flag.className = 'item-flag';
    flag.appendChild(icon('i-circle-alert'));
    flag.appendChild(document.createElement('span')).textContent = 'Risposta mancante';
    flag.hidden = true;
    return flag;
  }

  /** Item della scala 1–4. */
  function scaleCard(item, idx) {
    const li = document.createElement('li');
    li.className = 'item';
    li.id = 'item-' + (idx + 1);

    const fs = document.createElement('fieldset');

    const text = document.createElement('span');
    text.className = 'item-text';
    const stem = document.createElement('span');
    stem.className = 'item-stem';
    stem.textContent = 'Sono in grado di ';
    text.appendChild(stem);
    text.appendChild(document.createTextNode(lowerFirst(item.text)));
    fs.appendChild(questionLegend(idx, text));

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
    fs.appendChild(missingFlag());
    li.appendChild(fs);

    if (session.answers.has(item.id)) li.classList.add('is-answered');
    return li;
  }

  /** Item di calibrazione: quattro opzioni, una sola scelta, poi si blocca.
   *  Nessun riscontro al partecipante su quale fosse l'opzione corretta. */
  function calCard(item, idx) {
    const given = session.calAnswers.get(item.id) || null;

    const li = document.createElement('li');
    li.className = 'item item-cal' + (given ? ' is-locked' : '');
    li.id = 'item-' + (idx + 1);

    const fs = document.createElement('fieldset');

    const text = document.createElement('span');
    text.className = 'item-text';
    if (item.intro) {
      const intro = document.createElement('span');
      intro.className = 'cal-intro';
      intro.textContent = item.intro;
      text.appendChild(intro);
    }
    if (item.quote) {
      const quote = document.createElement('span');
      quote.className = 'cal-quote';
      quote.textContent = item.quote;
      text.appendChild(quote);
    }
    const question = document.createElement('span');
    question.className = 'cal-question';
    question.textContent = item.text;
    text.appendChild(question);

    fs.appendChild(questionLegend(idx, text));

    const opts = document.createElement('div');
    opts.className = 'cal-opts';

    item.options.forEach(function (opt) {
      const label = document.createElement('label');
      label.className = 'cal-opt';

      const input = document.createElement('input');
      input.type = 'radio';
      input.name = 'c_' + item.id;
      input.value = opt.id;
      if (given) {
        input.disabled = true;
        if (given.choiceId === opt.id) {
          input.checked = true;
          label.classList.add('is-selected');
        }
      }

      const mark = document.createElement('span');
      mark.className = 'cal-mark';
      mark.setAttribute('aria-hidden', 'true');

      const txt = document.createElement('span');
      txt.className = 'cal-txt';
      txt.textContent = opt.text;

      label.appendChild(input);
      label.appendChild(mark);
      label.appendChild(txt);
      opts.appendChild(label);
    });

    fs.appendChild(opts);
    fs.appendChild(missingFlag());

    const locked = document.createElement('p');
    locked.className = 'cal-locked';
    locked.appendChild(icon('i-lock'));
    locked.appendChild(document.createElement('span')).textContent =
      'Risposta registrata: non è modificabile.';
    locked.hidden = !given;
    fs.appendChild(locked);

    li.appendChild(fs);
    if (given) li.classList.add('is-answered');
    return li;
  }

  function renderItems() {
    el.itemList.innerHTML = '';
    session.list.forEach(function (entry, idx) {
      el.itemList.appendChild(
        entry.kind === 'cal' ? calCard(entry.item, idx) : scaleCard(entry.item, idx));
    });
    updateProgress();
  }

  /** Vero se la domanda in quella posizione della lista ha già una risposta. */
  function isAnswered(entry) {
    return entry.kind === 'cal'
      ? session.calAnswers.has(entry.item.id)
      : session.answers.has(entry.item.id);
  }

  function updateProgress() {
    const n = session.answers.size + session.calAnswers.size;
    el.answered.textContent = n;
    el.progress.style.width = (n / TOTAL_QUESTIONS * 100) + '%';
  }

  /** Evidenzia inline le domande senza risposta e restituisce i loro indici (1-based). */
  function markMissing() {
    const missing = [];
    session.list.forEach(function (entry, idx) {
      const li = document.getElementById('item-' + (idx + 1));
      const answered = isAnswered(entry);
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
    p.textContent = 'Completa le domande evidenziate: ';
    body.appendChild(p);

    const ul = document.createElement('ul');
    ul.className = 'jump-list';
    missing.forEach(function (n) {
      const li = document.createElement('li');
      const a = document.createElement('a');
      a.href = '#item-' + n;
      a.textContent = 'Domanda ' + n;
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

  /** Alert automatici sulle due soglie di rischio. Non vengono mostrati al
   *  partecipante — la sua schermata resta punteggio, profilo e dimensioni —
   *  ma restano salvati con la compilazione: servono alle statistiche di
   *  gruppo, dove le etichette leggibili stanno in js/facilitator.js. */
  function alertCodes(byDim) {
    const out = [];
    const uso = dimMean(byDim, 'USO');
    const val = dimMean(byDim, 'VAL');
    const resp = dimMean(byDim, 'RESP');

    if (uso - val >= 1) out.push('uso_oltre_verifica');   // usa l'AI più di quanto la verifichi
    if (resp <= 2) out.push('gap_responsabilita');        // gap di conformità

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
    // Riepilogo di tutte le 16 domande nell'ordine in cui sono state mostrate.
    // Sulle domande a scelta multipla compare la risposta data, non se fosse
    // quella corretta: l'esito è materiale del facilitatore.
    session.list.forEach(function (entry, idx) {
      const item = entry.item;
      const li = document.createElement('li');

      const badge = document.createElement('span');
      badge.className = 'recap-score';

      const txt = document.createElement('span');

      if (entry.kind === 'cal') {
        li.className = 'recap-cal';
        badge.classList.add('is-cal');
        badge.textContent = '–';   // non ha un punteggio: è l'altro asse
        badge.title = 'Domanda a scelta multipla: non entra nel punteggio.';

        const given = session.calAnswers.get(item.id);
        const chosen = given
          ? item.options.filter(function (o) { return o.id === given.choiceId; })[0]
          : null;

        if (item.intro) {
          const intro = document.createElement('span');
          intro.className = 'recap-intro';
          intro.textContent = item.intro;
          txt.appendChild(intro);
        }
        if (item.quote) {
          const quote = document.createElement('span');
          quote.className = 'recap-quote';
          quote.textContent = item.quote;
          txt.appendChild(quote);
        }

        const q = document.createElement('span');
        q.className = 'recap-q';
        q.textContent = item.text;
        const a = document.createElement('span');
        a.className = 'recap-a';
        a.textContent = 'La tua risposta: ' + (chosen ? chosen.text : '—');
        txt.appendChild(q);
        txt.appendChild(a);
      } else {
        badge.textContent = session.answers.get(item.id);
        txt.textContent = 'Sono in grado di ' + lowerFirst(item.text);
      }

      li.appendChild(badge);
      li.appendChild(txt);
      el.recap.appendChild(li);
    });

    window.AIAA_RADAR.draw(el.radar, scores.byDim);
  }

  /* --------------------------------------------------------------- navigazione */

  function showView(name) {
    Object.keys(el.views).forEach(function (k) { el.views[k].hidden = (k !== name); });
    window.scrollTo({ top: 0, behavior: 'auto' });
  }

  /* ------------------------------------------------------- partecipante e DB */

  const PARTICIPANT_KEY = 'aiaa_participant';

  /** Partecipante corrente: { id, firstName, lastName }. id è null se il DB non è attivo. */
  let participant = readParticipant();

  function readParticipant() {
    try {
      const raw = localStorage.getItem(PARTICIPANT_KEY);
      const p = raw ? JSON.parse(raw) : null;
      return p && p.firstName && p.lastName ? p : null;
    } catch (e) {
      return null;
    }
  }

  function storeParticipant(p) {
    participant = p;
    try { localStorage.setItem(PARTICIPANT_KEY, JSON.stringify(p)); } catch (e) { /* modalità privata */ }
    renderParticipantChip();
  }

  function renderParticipantChip() {
    const named = Boolean(participant);
    el.participantChip.hidden = !named;
    if (named) el.participantName.textContent = participant.firstName + ' ' + participant.lastName;
  }

  /** Stato del salvataggio mostrato nella barra del questionario. */
  const SAVE_LABELS = {
    off:    'Salvataggio non attivo',
    idle:   'Pronto',
    saving: 'Salvataggio…',
    saved:  'Risposte salvate',
    error:  'Risposte non salvate'
  };

  function renderSaveStatus(state) {
    if (!el.saveStatus) return;
    el.saveStatus.hidden = false;
    el.saveStatus.className = 'save-status is-' + state;
    el.saveStatus.innerHTML = '';
    el.saveStatus.appendChild(icon(
      state === 'saved' ? 'i-check' : (state === 'error' ? 'i-circle-alert' : 'i-cloud')
    ));
    el.saveStatus.appendChild(document.createElement('span')).textContent = SAVE_LABELS[state] || state;
  }

  /** Righe risposta nel formato atteso dal DB. La posizione è quella nella
   *  lista mostrata, che ora contiene anche gli item di calibrazione. */
  function answerRows() {
    const rows = [];
    session.items.forEach(function (item) {
      if (session.answers.has(item.id)) {
        rows.push({
          itemId: item.id,
          dim: item.dim,
          value: session.answers.get(item.id),
          position: positionOf(item.id)
        });
      }
    });
    return rows;
  }

  /** Righe di calibrazione già date, nel formato atteso dal DB. */
  function calRows() {
    const rows = [];
    session.calItems.forEach(function (item) {
      const given = session.calAnswers.get(item.id);
      if (given) {
        rows.push({
          itemId: item.id,
          dim: item.dim,
          choiceId: given.choiceId,
          correct: given.correct,
          position: positionOf(item.id)
        });
      }
    });
    return rows;
  }

  /** Nuova compilazione: estrae gli item, azzera lo stato e apre la riga sessione sul DB. */
  function startSession() {
    session.items = drawItems();
    session.calItems = drawCalItems();
    session.list = buildList(session.items, session.calItems);
    session.answers.clear();
    session.calAnswers.clear();
    session.validated = false;
    session.dbId = null;
    clearValidation();
    renderItems();
    showView('quiz');

    if (!DB.configured || !participant || !participant.id) return;

    DB.createSession(
      participant.id,
      session.items.map(function (it) { return it.id; }),
      session.calItems.map(function (it) { return it.id; })
    )
      .then(function (row) {
        if (!row) return;
        session.dbId = row.id;
        // Le risposte date prima che la riga esistesse vanno recuperate.
        const pending = answerRows();
        if (pending.length) DB.saveAllAnswers(session.dbId, pending);
        calRows().forEach(function (c) {
          DB.saveCalibration(session.dbId, c).catch(function () { /* segnalato dallo stato */ });
        });
      })
      .catch(function () { /* lo stato "non salvato" è già segnalato dal client */ });
  }

  function goToRegistration() {
    if (participant) {
      el.firstName.value = participant.firstName;
      el.lastName.value = participant.lastName;
    }
    el.registerError.hidden = true;
    showView('register');
    setTimeout(function () { el.firstName.focus(); }, 50);
  }

  function registerError(message) {
    el.registerError.hidden = false;
    el.registerError.innerHTML = '';
    el.registerError.appendChild(icon('i-alert'));
    const body = document.createElement('div');
    body.className = 'alert-body';
    body.textContent = message;
    el.registerError.appendChild(body);
  }

  /* ------------------------------------------------------------------ eventi */

  el.registerForm.addEventListener('submit', function (e) {
    e.preventDefault();

    const first = el.firstName.value.trim().replace(/\s+/g, ' ');
    const last = el.lastName.value.trim().replace(/\s+/g, ' ');

    if (first.length < 2 || last.length < 2) {
      registerError('Inserisci nome e cognome (almeno due caratteri ciascuno).');
      (first.length < 2 ? el.firstName : el.lastName).focus();
      return;
    }

    el.registerError.hidden = true;
    el.registerSubmit.disabled = true;

    // Senza DB configurato la compilazione parte comunque, in locale.
    if (!DB.configured) {
      el.registerSubmit.disabled = false;
      storeParticipant({ id: null, firstName: first, lastName: last });
      startSession();
      return;
    }

    DB.createParticipant(first, last)
      .then(function (row) {
        el.registerSubmit.disabled = false;
        storeParticipant({ id: row ? row.id : null, firstName: first, lastName: last });
        startSession();
      })
      .catch(function (err) {
        el.registerSubmit.disabled = false;
        registerError('Registrazione non salvata sul database (' + err.message +
          '). Puoi riprovare oppure procedere: il risultato verrà comunque calcolato, ' +
          'ma le risposte non saranno registrate.');
        el.registerSkip.hidden = false;
      });
  });

  el.registerSkip.addEventListener('click', function () {
    const first = el.firstName.value.trim() || 'Partecipante';
    const last = el.lastName.value.trim() || 'anonimo';
    storeParticipant({ id: null, firstName: first, lastName: last });
    startSession();
  });

  el.form.addEventListener('change', function (e) {
    const input = e.target;
    if (!input.name) return;

    if (input.name.indexOf('c_') === 0) { onCalibrationChoice(input); return; }
    if (input.name.indexOf('q_') !== 0) return;

    const itemId = input.name.slice(2);
    const value = parseInt(input.value, 10);
    session.answers.set(itemId, value);

    // stato visivo delle opzioni dell'item
    const fieldset = input.closest('fieldset');
    fieldset.querySelectorAll('.opt').forEach(function (opt) {
      opt.classList.toggle('is-selected', opt.contains(input));
    });

    updateProgress();
    if (session.validated) showValidation(markMissing());
    else input.closest('.item').classList.add('is-answered');

    if (session.dbId) {
      const item = session.items.filter(function (it) { return it.id === itemId; })[0];
      DB.queueAnswer(session.dbId, {
        itemId: itemId, dim: item.dim, value: value, position: positionOf(itemId)
      });
    }
  });

  /** Scelta su un item di calibrazione: si registra una volta sola, le opzioni
   *  si bloccano e al partecipante non viene detto se ha risposto correttamente. */
  function onCalibrationChoice(input) {
    const itemId = input.name.slice(2);
    if (session.calAnswers.has(itemId)) return;

    const item = session.calItems.filter(function (it) { return it.id === itemId; })[0];
    if (!item) return;

    const chosen = item.options.filter(function (o) { return o.id === input.value; })[0];
    const given = { choiceId: input.value, correct: Boolean(chosen && chosen.correct) };
    session.calAnswers.set(itemId, given);

    const li = input.closest('.item');
    li.classList.add('is-locked', 'is-answered');
    li.querySelectorAll('.cal-opt').forEach(function (opt) {
      opt.classList.toggle('is-selected', opt.contains(input));
      opt.querySelector('input').disabled = true;
    });
    const locked = li.querySelector('.cal-locked');
    if (locked) locked.hidden = false;

    updateProgress();
    if (session.validated) showValidation(markMissing());

    if (session.dbId) {
      DB.saveCalibration(session.dbId, {
        itemId: itemId,
        dim: item.dim,
        choiceId: given.choiceId,
        correct: given.correct,
        position: positionOf(itemId)
      }).catch(function () { /* segnalato dallo stato di salvataggio */ });
    }
  }

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
    const scores = computeScores();
    renderResults(scores);
    showView('results');
    persistCompletion(scores);
  });

  /** Chiude la sessione sul DB: risposte complete, punteggi, fascia e alert. */
  function persistCompletion(scores) {
    if (!session.dbId) return;

    DB.flushAnswers();
    const dimMeans = {};
    scores.byDim.forEach(function (d) { dimMeans[d.code] = Number(d.mean.toFixed(2)); });

    DB.saveAllAnswers(session.dbId, answerRows())
      .then(function () {
        // Reinvio idempotente: se una scrittura di calibrazione era andata
        // perduta, questa è l'ultima occasione — dopo la chiusura la funzione
        // rifiuta. I duplicati vengono ignorati dal database.
        return Promise.all(calRows().map(function (c) {
          return DB.saveCalibration(session.dbId, c).catch(function () { return null; });
        }));
      })
      .then(function () {
        return DB.completeSession(session.dbId, {
          total: scores.total,
          band: scores.band.name,
          dimMeans: dimMeans,
          alerts: alertCodes(scores.byDim)
        });
      })
      .catch(function () { /* già segnalato nello stato di salvataggio */ });
  }

  document.getElementById('btn-start').addEventListener('click', function () {
    if (participant && (participant.id || !DB.configured)) startSession();
    else goToRegistration();
  });

  el.changeParticipant.addEventListener('click', function (e) {
    e.preventDefault();
    goToRegistration();
  });

  // Azzera solo la scala 1–4: le domande a scelta multipla si rispondono una
  // volta sola, quindi restano bloccate con la risposta già registrata.
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
    startSession();
  });

  document.getElementById('btn-print').addEventListener('click', function () {
    window.print();
  });


  /* ---------------------------------------------------------------- avvio */

  renderHowItWorks();
  renderScaleLegend(el.introScale);
  renderScaleLegend(el.quizScale);
  renderParticipantChip();
  DB.onStatus(renderSaveStatus);

  // Senza configurazione Supabase l'app resta usabile, ma va detto chiaramente
  // che nulla viene registrato.
  if (!DB.configured) {
    el.dbNotice.hidden = false;
    el.registerNote.textContent =
      'Salvataggio non configurato: nome, cognome e risposte restano solo in questo browser.';
  }

  // Sessione pronta anche se si arriva al quiz senza passare dall'intro.
  session.items = drawItems();
  session.calItems = drawCalItems();
  session.list = buildList(session.items, session.calItems);
})();
