#!/usr/bin/env python3
"""Auto-assessment competenze AI — versione Python server-side.

Solo libreria standard: nessun framework, nessun pacchetto da installare.
Estrazione degli item, validazione delle risposte, scoring e radar sono calcolati
in Python; il browser riceve solo HTML e CSS (un frammento di JS opzionale
aggiorna il contatore delle risposte e apre la stampa).

    python app.py                 # http://127.0.0.1:8000, apre il browser
    python app.py --port 9000     # porta diversa
    python app.py --no-browser    # non aprire il browser

Pensato per uso locale (un compilatore per volta sulla propria macchina): lo stato
di sessione sta in memoria e il server ascolta solo su localhost.
"""

from __future__ import annotations

import argparse
import secrets
import threading
import time
import webbrowser
from dataclasses import dataclass, field
from html import escape
from http import HTTPStatus
from http.cookies import SimpleCookie
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs

from assessment import Result, draw_items, fmt, radar_svg, score, stem
from items import (
    DIMENSIONS,
    ITEMS_PER_SESSION,
    MAX_TOTAL,
    MIN_TOTAL,
    SCALE,
    Item,
)

REPO_ROOT = Path(__file__).resolve().parent.parent
CSS_PATH = REPO_ROOT / "css" / "style.css"
COOKIE_NAME = "aiaa_sid"
SESSION_TTL = 6 * 3600  # sessioni abbandonate scartate dopo 6 ore


# ------------------------------------------------------------------- sessioni

@dataclass
class Session:
    items: list[Item]
    answers: dict[str, int] = field(default_factory=dict)
    validated: bool = False  # True dopo il primo tentativo di calcolo
    touched: float = field(default_factory=time.monotonic)

    @property
    def missing(self) -> list[int]:
        """Posizioni (1-based) degli item senza risposta."""
        return [i for i, it in enumerate(self.items, 1) if it.id not in self.answers]

    @property
    def complete(self) -> bool:
        return not self.missing


class SessionStore:
    """Store in memoria, thread-safe: il server è multi-thread."""

    def __init__(self) -> None:
        self._data: dict[str, Session] = {}
        self._lock = threading.Lock()

    def new(self) -> tuple[str, Session]:
        sid = secrets.token_urlsafe(24)
        session = Session(items=draw_items())
        with self._lock:
            self._prune()
            self._data[sid] = session
        return sid, session

    def get(self, sid: str | None) -> Session | None:
        if not sid:
            return None
        with self._lock:
            session = self._data.get(sid)
            if session is not None:
                session.touched = time.monotonic()
            return session

    def _prune(self) -> None:
        now = time.monotonic()
        for sid, session in list(self._data.items()):
            if now - session.touched > SESSION_TTL:
                del self._data[sid]


STORE = SessionStore()


# --------------------------------------------------------------------- layout

def page(title: str, body: str, *, extra_head: str = "") -> bytes:
    return f"""<!DOCTYPE html>
<html lang="it">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{escape(title)}</title>
<link rel="stylesheet" href="/style.css">{extra_head}
</head>
<body>
<header class="site-header">
  <div class="wrap header-inner">
    <div class="brand">
      <span class="brand-mark" aria-hidden="true"></span>
      <span class="brand-name">Auto-assessment competenze AI</span>
    </div>
    <span class="brand-tag">Valutazione individuale</span>
  </div>
</header>
<main class="wrap">
{body}
</main>
<footer class="site-footer">
  <div class="wrap">
    <p class="micro">
      Auto-assessment competenze AI · 5 dimensioni, banca di 30 item, {ITEMS_PER_SESSION} per sessione.
      Le soglie di alert richiamano l'obbligo di alfabetizzazione AI previsto dall'art. 4 del Regolamento UE 2024/1689 (AI Act).
    </p>
  </div>
</footer>
</body>
</html>
""".encode("utf-8")


def scale_legend(inline: bool = False) -> str:
    cls = "scale-legend scale-legend-inline" if inline else "scale-legend"
    rows = "".join(
        f'<li><span class="sc-num">{a.value}</span><span>{escape(a.label)}</span></li>' for a in SCALE
    )
    return f'<ol class="{cls}">{rows}</ol>'


# ----------------------------------------------------------------------- viste

def view_intro() -> bytes:
    body = f"""
  <section class="view">
    <p class="eyebrow">Strumento di autovalutazione</p>
    <h1>Dove sono, oggi, le mie competenze di AI</h1>
    <p class="lead">
      Dodici affermazioni sul tuo lavoro reale. Per ognuna indichi quanto sei in grado di farla,
      su una scala da 1 a 4. Alla fine ottieni un punteggio complessivo, il profilo corrispondente
      e la lettura delle cinque dimensioni che compongono la competenza.
    </p>
    <div class="grid-2">
      <div class="card">
        <h2>Come funziona</h2>
        <ul class="ticks">
          <li>{ITEMS_PER_SESSION} item estratti casualmente da una banca di 30.</li>
          <li>Nessuna risposta giusta o sbagliata: si misura la padronanza dichiarata.</li>
          <li>5–7 minuti. Il calcolo parte solo quando tutte le risposte sono complete.</li>
          <li>Ogni nuova sessione propone una selezione diversa di item.</li>
        </ul>
      </div>
      <div class="card">
        <h2>La scala</h2>
        {scale_legend()}
        <p class="micro">Tutti gli item hanno la stessa radice: <strong>«Sono in grado di…»</strong></p>
      </div>
    </div>
    <p class="micro note-privacy">
      Le risposte restano sul computer che esegue il server: nessun invio a servizi esterni,
      nessun salvataggio su file. Chiudere il server cancella tutto.
    </p>
    <form method="post" action="/inizia">
      <button type="submit" class="btn btn-primary btn-lg">Inizia l'auto-assessment</button>
    </form>
  </section>
"""
    return page("Auto-assessment competenze AI", body)


_LIVE_COUNTER_JS = """
<script>
// Progressive enhancement: il conteggio è comunque ricalcolato dal server a ogni invio.
document.addEventListener('change', function () {
  var n = document.querySelectorAll('#item-list input:checked').length;
  var out = document.getElementById('answered-count');
  var fill = document.getElementById('progress-fill');
  if (out) out.textContent = n;
  if (fill) fill.style.width = (n / %d * 100) + '%%';
});
</script>
""" % ITEMS_PER_SESSION


def view_quiz(session: Session) -> bytes:
    missing = session.missing if session.validated else []
    answered = len(session.answers)

    cards: list[str] = []
    for idx, item in enumerate(session.items, 1):
        is_missing = idx in missing
        classes = "item"
        classes += " is-missing" if is_missing else (" is-answered" if item.id in session.answers else "")
        opts = "".join(
            f'<label class="opt">'
            f'<input type="radio" name="q_{item.id}" value="{a.value}" '
            f'aria-label="{a.value} — {escape(a.label)}"'
            f'{" checked" if session.answers.get(item.id) == a.value else ""}>'
            f'<span class="opt-num">{a.value}</span>'
            f'<span class="opt-txt">{escape(a.label)}</span>'
            f"</label>"
            for a in SCALE
        )
        flag = '<p class="item-flag">Risposta mancante</p>' if is_missing else ""
        cards.append(
            f'<li class="{classes}" id="item-{idx}"><fieldset>'
            f'<legend><span class="item-num">Item {idx} di {ITEMS_PER_SESSION}</span>'
            f'<span class="item-text"><span class="item-stem">Sono in grado di </span>'
            f"{escape(stem(item.text))}</span></legend>"
            f'<div class="opts">{opts}</div>{flag}</fieldset></li>'
        )

    if missing:
        jumps = "".join(f'<li><a href="#item-{n}">Item {n}</a></li>' for n in missing)
        head = (
            "Manca 1 risposta: il risultato non può essere calcolato."
            if len(missing) == 1
            else f"Mancano {len(missing)} risposte: il risultato non può essere calcolato."
        )
        banner = (
            f'<div class="alert alert-warn" role="alert"><strong>{head}</strong>'
            f'<span>Completa gli item evidenziati: </span>'
            f'<ul class="jump-list">{jumps}</ul></div>'
        )
        hint = (
            f'<p class="progress-missing">'
            f'{"Manca 1 risposta" if len(missing) == 1 else f"Mancano {len(missing)} risposte"}</p>'
        )
    else:
        banner = ""
        hint = ""

    body = f"""
  <section class="view">
    <p class="eyebrow">Questionario · {ITEMS_PER_SESSION} item</p>
    <h1>Sono in grado di…</h1>
    <p class="lead lead-tight">
      Valuta ogni affermazione pensando al tuo lavoro attuale, non a quello che potresti fare in teoria.
    </p>

    <div class="sticky-bar">
      {scale_legend(inline=True)}
      <div class="progress-block">
        <div class="progress-row">
          <span class="progress-label">Risposte</span>
          <span class="progress-count"><output id="answered-count">{answered}</output>/{ITEMS_PER_SESSION}</span>
        </div>
        <div class="progress-track"><div class="progress-fill" id="progress-fill"
             style="width: {answered / ITEMS_PER_SESSION * 100:.4f}%"></div></div>
        {hint}
      </div>
    </div>

    <form method="post" action="/questionario">
      <ol class="item-list" id="item-list">{"".join(cards)}</ol>
      <div class="form-footer">
        {banner}
        <div class="actions">
          <button type="submit" class="btn btn-primary btn-lg">Calcola il risultato</button>
          <button type="submit" class="btn btn-ghost" name="azione" value="azzera"
                  formnovalidate>Azzera le risposte</button>
        </div>
      </div>
    </form>
  </section>
"""
    return page("Questionario · Auto-assessment competenze AI", body, extra_head=_LIVE_COUNTER_JS)


def view_results(session: Session, result: Result) -> bytes:
    alerts = "".join(
        f'<div class="alert alert-{a.kind}" role="note"><strong>{escape(a.title)}</strong>{escape(a.body)}</div>'
        for a in result.alerts
    )

    rows = "".join(
        f'<tr><th scope="row" class="dim-name">{escape(d.label)}'
        f'<span class="dim-bar"><span style="width: {d.pct}%"></span></span></th>'
        f"<td>{fmt(d.mean)}</td><td>{d.pct}%</td></tr>"
        for d in result.by_dim
    )

    top, low = result.strongest, result.weakest
    extremes = (
        f"Profilo uniforme sulle cinque dimensioni (media {fmt(top.mean)})."
        if top.mean == low.mean
        else (
            f"Dimensione più solida: {escape(top.label)} ({fmt(top.mean)}). "
            f"Più fragile: {escape(low.label)} ({fmt(low.mean)})."
        )
    )

    recap = "".join(
        f'<li><span class="recap-score">{session.answers[it.id]}</span>'
        f"<span>Sono in grado di {escape(stem(it.text))}</span></li>"
        for it in session.items
    )

    body = f"""
  <section class="view">
    <p class="eyebrow">Esito</p>
    <h1>Il tuo profilo</h1>

    <div class="score-hero">
      <div class="score-figure">
        <span class="score-value">{result.total}</span>
        <span class="score-scale">su {MAX_TOTAL} <span class="micro">(min {MIN_TOTAL})</span></span>
      </div>
      <div class="score-band">
        <p class="band-name">{escape(result.band.name)}</p>
        <p class="band-reading">{escape(result.band.reading)}</p>
        <p class="band-priority">{escape(result.band.priority)}</p>
      </div>
    </div>

    <div class="alerts">{alerts}</div>

    <div class="grid-2 grid-results">
      <div class="card">
        <h2>Le cinque dimensioni</h2>
        <table class="dim-table">
          <caption class="sr-only">Media e percentuale sul massimo per ciascuna dimensione</caption>
          <thead><tr><th scope="col">Dimensione</th><th scope="col">Media (1–4)</th>
          <th scope="col">% sul max</th></tr></thead>
          <tbody>{rows}</tbody>
        </table>
        <p class="micro">{extremes}</p>
      </div>
      <div class="card">
        <h2>Radar del profilo</h2>
        <div class="chart-holder">{radar_svg(result.by_dim)}</div>
        <p class="micro">Asse fisso 0–4: la forma è confrontabile fra profili diversi.</p>
      </div>
    </div>

    <details class="detail-answers">
      <summary>Rivedi le risposte di questa sessione</summary>
      <ol class="recap-list">{recap}</ol>
    </details>

    <div class="actions actions-end">
      <button type="button" class="btn btn-primary" onclick="window.print()">Stampa / salva PDF</button>
      <a class="btn btn-outline" href="/questionario">Torna alle risposte</a>
      <form method="post" action="/inizia" style="display:inline">
        <button type="submit" class="btn btn-ghost">Nuova sessione</button>
      </form>
    </div>
  </section>
"""
    return page("Profilo · Auto-assessment competenze AI", body)


# --------------------------------------------------------------------- handler

class Handler(BaseHTTPRequestHandler):
    server_version = "AutoAssessmentAI/1.0"
    protocol_version = "HTTP/1.1"

    # --- helper di risposta

    def _send(self, body: bytes, status: int = HTTPStatus.OK, content_type: str = "text/html; charset=utf-8",
              cookie: str | None = None) -> None:
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        if cookie:
            self.send_header("Set-Cookie", f"{COOKIE_NAME}={cookie}; Path=/; HttpOnly; SameSite=Lax")
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def _redirect(self, location: str, cookie: str | None = None) -> None:
        self.send_response(HTTPStatus.SEE_OTHER)
        self.send_header("Location", location)
        self.send_header("Content-Length", "0")
        if cookie:
            self.send_header("Set-Cookie", f"{COOKIE_NAME}={cookie}; Path=/; HttpOnly; SameSite=Lax")
        self.end_headers()

    def _session(self) -> Session | None:
        raw = self.headers.get("Cookie")
        if not raw:
            return None
        morsel = SimpleCookie(raw).get(COOKIE_NAME)
        return STORE.get(morsel.value if morsel else None)

    def _form(self) -> dict[str, list[str]]:
        length = int(self.headers.get("Content-Length") or 0)
        raw = self.rfile.read(length).decode("utf-8") if length else ""
        return parse_qs(raw, keep_blank_values=True)

    # --- routing

    def do_GET(self) -> None:  # noqa: N802 (nome imposto da BaseHTTPRequestHandler)
        path = self.path.split("?", 1)[0]

        if path == "/":
            self._send(view_intro())
        elif path == "/style.css":
            self._send_css()
        elif path == "/questionario":
            session = self._session()
            if session is None:
                self._redirect("/")
            else:
                self._send(view_quiz(session))
        elif path == "/risultati":
            session = self._session()
            if session is None or not session.complete:
                self._redirect("/questionario" if session else "/")
            else:
                self._send(view_results(session, score(session.items, session.answers)))
        else:
            self._not_found()

    def do_HEAD(self) -> None:  # noqa: N802
        self.do_GET()

    def do_POST(self) -> None:  # noqa: N802
        path = self.path.split("?", 1)[0]

        if path == "/inizia":
            sid, _ = STORE.new()
            self._redirect("/questionario", cookie=sid)
            return

        if path == "/questionario":
            session = self._session()
            if session is None:
                self._redirect("/")
                return

            form = self._form()
            if form.get("azione", [""])[0] == "azzera":
                session.answers.clear()
                session.validated = False
                self._redirect("/questionario")
                return

            valid_values = {a.value for a in SCALE}
            for item in session.items:
                raw = form.get(f"q_{item.id}", [""])[0]
                if raw.isdigit() and int(raw) in valid_values:
                    session.answers[item.id] = int(raw)

            session.validated = True
            # Nessun calcolo finché le risposte non sono tutte presenti.
            self._redirect("/risultati" if session.complete else "/questionario")
            return

        self._not_found()

    # --- risorse statiche / errori

    def _send_css(self) -> None:
        try:
            body = CSS_PATH.read_bytes()
        except OSError:
            self._send(
                f"/* {CSS_PATH} non trovato: la versione Python riusa il CSS della repo */".encode(),
                status=HTTPStatus.NOT_FOUND,
                content_type="text/css; charset=utf-8",
            )
            return
        self._send(body, content_type="text/css; charset=utf-8")

    def _not_found(self) -> None:
        body = page(
            "Pagina non trovata",
            '<section class="view"><p class="eyebrow">Errore 404</p>'
            "<h1>Pagina non trovata</h1>"
            '<p class="lead">L\'indirizzo richiesto non esiste.</p>'
            '<a class="btn btn-primary" href="/">Torna all\'inizio</a></section>',
        )
        self._send(body, status=HTTPStatus.NOT_FOUND)

    def log_message(self, format: str, *args: object) -> None:  # noqa: A002
        print(f"[{self.log_date_time_string()}] {format % args}")


# ------------------------------------------------------------------------ main

def serve(host: str = "127.0.0.1", port: int = 8000, open_browser: bool = True) -> None:
    httpd = ThreadingHTTPServer((host, port), Handler)
    url = f"http://{host}:{port}/"
    print(f"Auto-assessment competenze AI · {url}")
    print(f"{len(DIMENSIONS)} dimensioni, {ITEMS_PER_SESSION} item per sessione. Ctrl+C per fermare.")
    if open_browser:
        threading.Timer(0.4, webbrowser.open, args=[url]).start()
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nServer fermato.")
    finally:
        httpd.server_close()


def main() -> None:
    parser = argparse.ArgumentParser(description="Auto-assessment competenze AI (server locale).")
    parser.add_argument("--host", default="127.0.0.1", help="indirizzo di ascolto (default: 127.0.0.1)")
    parser.add_argument("--port", type=int, default=8000, help="porta (default: 8000)")
    parser.add_argument("--no-browser", action="store_true", help="non aprire il browser all'avvio")
    args = parser.parse_args()
    serve(args.host, args.port, open_browser=not args.no_browser)


if __name__ == "__main__":
    main()
