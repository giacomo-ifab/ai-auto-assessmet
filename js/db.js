/* ==========================================================================
   Client Supabase minimale: chiamate REST dirette a PostgREST e GoTrue.
   Nessuna libreria esterna, nessun bundler.

   Scritture (chiave anon):
     createParticipant → POST /rest/v1/participants
     createSession     → POST /rest/v1/sessions
     queueAnswer       → POST /rest/v1/answers  (upsert, con debounce per item)
     completeSession   → PATCH /rest/v1/sessions?id=eq.<id>

   Letture (solo utenti autenticati, pagina facilitatore):
     signIn / signOut / currentUser / fetchOverview
   ========================================================================== */

window.DB = (function () {
  'use strict';

  const cfg = window.AIAA_CONFIG || {};
  const url = String(cfg.supabaseUrl || '').replace(/\/+$/, '');
  const anonKey = String(cfg.supabaseAnonKey || '');

  /** true solo se la configurazione è stata compilata davvero. */
  const configured = /^https:\/\/[a-z0-9-]+\.supabase\.(co|in)$/i.test(url) && anonKey.length > 40;

  const TOKEN_KEY = 'aiaa_facilitator_token';
  const DEBOUNCE_MS = 800;
  const RETRY_MS = 4000;

  /* ------------------------------------------------------------- richieste */

  function authToken() {
    try { return sessionStorage.getItem(TOKEN_KEY) || null; } catch (e) { return null; }
  }

  function request(path, options) {
    options = options || {};
    if (!configured) return Promise.reject(new Error('Supabase non configurato'));

    const headers = Object.assign({
      apikey: anonKey,
      Authorization: 'Bearer ' + (options.useAuth ? (authToken() || anonKey) : anonKey),
      'Content-Type': 'application/json'
    }, options.headers || {});

    return fetch(url + path, {
      method: options.method || 'GET',
      headers: headers,
      body: options.body ? JSON.stringify(options.body) : undefined
    }).then(function (res) {
      if (!res.ok) {
        return res.text().then(function (text) {
          throw new Error('HTTP ' + res.status + (text ? ' — ' + text.slice(0, 300) : ''));
        });
      }
      if (res.status === 204) return null;
      const type = res.headers.get('Content-Type') || '';
      return type.indexOf('application/json') === 0 ? res.json() : res.text();
    });
  }

  /* -------------------------------------------------- stato del salvataggio */

  // 'idle' | 'saving' | 'saved' | 'error' | 'off' (non configurato)
  let status = configured ? 'idle' : 'off';
  let onStatus = function () {};
  let pending = 0;

  function setStatus(next) {
    status = next;
    try { onStatus(next); } catch (e) { /* la UI non deve poter rompere le scritture */ }
  }

  function track(promise) {
    pending++;
    setStatus('saving');
    return promise.then(function (result) {
      pending--;
      if (pending === 0 && status !== 'error') setStatus('saved');
      return result;
    }, function (err) {
      pending--;
      setStatus('error');
      console.warn('[db] scrittura non riuscita:', err.message);
      throw err;
    });
  }

  /* ------------------------------------------------------------ scritture */

  function createParticipant(firstName, lastName) {
    return track(request('/rest/v1/participants?select=id,first_name,last_name', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: [{ first_name: firstName, last_name: lastName }]
    }).then(function (rows) { return rows && rows[0]; }));
  }

  function createSession(participantId, itemIds) {
    return track(request('/rest/v1/sessions?select=id', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: [{
        participant_id: participantId,
        item_ids: itemIds,
        user_agent: (navigator.userAgent || '').slice(0, 300)
      }]
    }).then(function (rows) { return rows && rows[0]; }));
  }

  function putAnswer(sessionId, answer) {
    return track(request('/rest/v1/answers?on_conflict=session_id,item_id', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: [{
        session_id: sessionId,
        item_id: answer.itemId,
        dimension: answer.dim,
        value: answer.value,
        position: answer.position
      }]
    }));
  }

  // Una risposta cambiata più volte di seguito produce una sola scrittura;
  // se la rete manca si riprova una volta, poi resta il segnale di errore.
  const timers = {};

  function queueAnswer(sessionId, answer) {
    if (!configured || !sessionId) return;
    const key = sessionId + ':' + answer.itemId;
    clearTimeout(timers[key]);
    timers[key] = setTimeout(function () {
      delete timers[key];
      putAnswer(sessionId, answer).catch(function () {
        setTimeout(function () {
          putAnswer(sessionId, answer).catch(function () { /* segnalato dallo stato */ });
        }, RETRY_MS);
      });
    }, DEBOUNCE_MS);
  }

  /** Scrive subito tutto ciò che è ancora in attesa di debounce. */
  function flushAnswers() {
    Object.keys(timers).forEach(function (key) {
      clearTimeout(timers[key]);
      delete timers[key];
    });
  }

  function completeSession(sessionId, result) {
    if (!configured || !sessionId) return Promise.resolve(null);
    return track(request('/rest/v1/sessions?id=eq.' + encodeURIComponent(sessionId), {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: {
        total: result.total,
        band: result.band,
        dim_means: result.dimMeans,
        alerts: result.alerts,
        completed_at: new Date().toISOString()
      }
    }));
  }

  /** Salva in blocco le risposte già date (usato prima di chiudere la sessione). */
  function saveAllAnswers(sessionId, answers) {
    if (!configured || !sessionId || !answers.length) return Promise.resolve(null);
    return track(request('/rest/v1/answers?on_conflict=session_id,item_id', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: answers.map(function (a) {
        return {
          session_id: sessionId,
          item_id: a.itemId,
          dimension: a.dim,
          value: a.value,
          position: a.position
        };
      })
    }));
  }

  /* ------------------------------------------------- autenticazione (auth) */

  function signIn(email, password) {
    return request('/auth/v1/token?grant_type=password', {
      method: 'POST',
      body: { email: email, password: password }
    }).then(function (data) {
      if (!data || !data.access_token) throw new Error('Risposta di login inattesa');
      try {
        sessionStorage.setItem(TOKEN_KEY, data.access_token);
      } catch (e) { /* sessionStorage non disponibile: resta valido per questa pagina */ }
      return data.user || null;
    });
  }

  function signOut() {
    const token = authToken();
    try { sessionStorage.removeItem(TOKEN_KEY); } catch (e) { /* nulla da fare */ }
    if (!token) return Promise.resolve();
    return request('/auth/v1/logout', { method: 'POST', useAuth: true }).catch(function () {
      // il token è già stato dimenticato dal browser: l'errore non cambia nulla
    });
  }

  function currentUser() {
    if (!authToken()) return Promise.resolve(null);
    return request('/auth/v1/user', { useAuth: true }).catch(function () {
      try { sessionStorage.removeItem(TOKEN_KEY); } catch (e) { /* nulla da fare */ }
      return null;
    });
  }

  /* ------------------------------------------------- letture facilitatore */

  /** Sessioni con partecipante e risposte, in una sola richiesta. */
  function fetchOverview(limit) {
    const select = 'id,started_at,updated_at,completed_at,total,band,dim_means,alerts,item_ids,' +
                   'participants(id,first_name,last_name),answers(item_id,dimension,value)';
    return request('/rest/v1/sessions?select=' + encodeURIComponent(select) +
                   '&order=started_at.desc&limit=' + (limit || 1000), { useAuth: true });
  }

  function countParticipants() {
    return fetch(url + '/rest/v1/participants?select=id', {
      method: 'HEAD',
      headers: {
        apikey: anonKey,
        Authorization: 'Bearer ' + (authToken() || anonKey),
        Prefer: 'count=exact'
      }
    }).then(function (res) {
      const range = res.headers.get('Content-Range') || '';
      const total = parseInt(range.split('/')[1], 10);
      return isNaN(total) ? null : total;
    }).catch(function () { return null; });
  }

  return {
    configured: configured,
    get status() { return status; },
    onStatus: function (fn) { onStatus = fn || function () {}; fn && fn(status); },
    createParticipant: createParticipant,
    createSession: createSession,
    queueAnswer: queueAnswer,
    flushAnswers: flushAnswers,
    saveAllAnswers: saveAllAnswers,
    completeSession: completeSession,
    signIn: signIn,
    signOut: signOut,
    currentUser: currentUser,
    fetchOverview: fetchOverview,
    countParticipants: countParticipants
  };
})();
