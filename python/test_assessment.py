"""Test della versione Python: banca item, estrazione, scoring, alert, radar, flusso HTTP.

    python -m unittest discover -s python -v      (dalla radice della repo)
    python -m unittest -v                         (dalla cartella python/)
"""

from __future__ import annotations

import re
import threading
import unittest
import urllib.error
import urllib.request
from html import unescape
from http.cookiejar import CookieJar
from http.server import ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlencode

import app as app_module
from assessment import band_for, draw_items, fmt, radar_svg, score, stem
from items import (
    BANDS,
    DIMENSION_BY_CODE,
    DIMENSIONS,
    ITEMS,
    ITEMS_PER_SESSION,
    MAX_TOTAL,
    MIN_TOTAL,
    SCALE,
    Item,
)


def answers_for(items: list[Item], per_dim: dict[str, int]) -> dict[str, int]:
    """Assegna a ogni item il valore previsto per la sua dimensione."""
    return {it.id: per_dim[it.dim] for it in items}


class TestBank(unittest.TestCase):
    def test_size_and_unique_ids(self) -> None:
        self.assertEqual(len(ITEMS), 30)
        self.assertEqual(len({it.id for it in ITEMS}), 30)

    def test_six_items_per_dimension(self) -> None:
        for dim in DIMENSIONS:
            with self.subTest(dim=dim.code):
                self.assertEqual(len([it for it in ITEMS if it.dim == dim.code]), 6)

    def test_id_prefix_matches_dimension(self) -> None:
        prefix = {"COMP": "C", "USO": "U", "VAL": "V", "RESP": "R", "SVIL": "S"}
        for it in ITEMS:
            with self.subTest(item=it.id):
                self.assertEqual(it.id[0], prefix[it.dim])
                self.assertTrue(it.id[1:].isdigit() and 1 <= int(it.id[1:]) <= 6)

    def test_quotas_and_bounds(self) -> None:
        self.assertEqual(ITEMS_PER_SESSION, 12)
        self.assertEqual((MIN_TOTAL, MAX_TOTAL), (12, 48))
        self.assertEqual([d.quota for d in DIMENSIONS], [2, 3, 3, 2, 2])

    def test_scale(self) -> None:
        self.assertEqual([a.value for a in SCALE], [1, 2, 3, 4])
        self.assertTrue(all(a.label for a in SCALE))

    def test_bands_cover_every_total_once(self) -> None:
        for total in range(MIN_TOTAL, MAX_TOTAL + 1):
            hits = [b for b in BANDS if b.lo <= total <= b.hi]
            with self.subTest(total=total):
                self.assertEqual(len(hits), 1)
                self.assertIs(band_for(total), hits[0])

    def test_band_names(self) -> None:
        self.assertEqual(
            [(b.lo, b.hi, b.name) for b in BANDS],
            [(12, 21, "Esplorativo"), (22, 31, "Utilizzatore"),
             (32, 40, "Praticante consapevole"), (41, 48, "Moltiplicatore")],
        )


class TestDraw(unittest.TestCase):
    def test_quotas_respected_and_no_repeats(self) -> None:
        for _ in range(300):
            drawn = draw_items()
            self.assertEqual(len(drawn), ITEMS_PER_SESSION)
            self.assertEqual(len({it.id for it in drawn}), ITEMS_PER_SESSION)
            for dim in DIMENSIONS:
                self.assertEqual(len([it for it in drawn if it.dim == dim.code]), dim.quota)

    def test_every_item_can_be_drawn(self) -> None:
        seen: set[str] = set()
        for _ in range(500):
            seen.update(it.id for it in draw_items())
        self.assertEqual(len(seen), len(ITEMS))

    def test_order_is_shuffled(self) -> None:
        """La sequenza non deve essere raggruppata per dimensione."""
        grouped = 0
        for _ in range(50):
            codes = [it.dim for it in draw_items()]
            blocks = len([1 for a, b in zip(codes, codes[1:]) if a != b]) + 1
            if blocks <= len(DIMENSIONS):  # cinque blocchi contigui = ordinato per dimensione
                grouped += 1
        self.assertLess(grouped, 10, "l'ordine sembra raggruppato per dimensione")


class TestScoring(unittest.TestCase):
    def setUp(self) -> None:
        self.items = draw_items()

    def test_minimum(self) -> None:
        res = score(self.items, answers_for(self.items, dict.fromkeys(DIMENSION_BY_CODE, 1)))
        self.assertEqual(res.total, MIN_TOTAL)
        self.assertEqual(res.band.name, "Esplorativo")
        self.assertTrue(all(d.mean == 1.0 and d.pct == 25 for d in res.by_dim))

    def test_maximum(self) -> None:
        res = score(self.items, answers_for(self.items, dict.fromkeys(DIMENSION_BY_CODE, 4)))
        self.assertEqual(res.total, MAX_TOTAL)
        self.assertEqual(res.band.name, "Moltiplicatore")
        self.assertTrue(all(d.pct == 100 for d in res.by_dim))
        self.assertEqual(res.alerts, [])

    def test_means_and_percentages(self) -> None:
        answers = answers_for(self.items, {"COMP": 3, "USO": 4, "VAL": 2, "RESP": 2, "SVIL": 3})
        res = score(self.items, answers)
        by_code = {d.code: d for d in res.by_dim}
        self.assertEqual(by_code["COMP"].mean, 3.0)
        self.assertEqual(by_code["COMP"].pct, 75)
        self.assertEqual(by_code["USO"].pct, 100)
        self.assertEqual(by_code["VAL"].pct, 50)
        self.assertEqual(res.total, 3 * 2 + 4 * 3 + 2 * 3 + 2 * 2 + 3 * 2)  # 34
        self.assertEqual(res.band.name, "Praticante consapevole")

    def test_mixed_values_two_decimals(self) -> None:
        """Media non intera: 3+4 su due item COMP -> 3,50 e 88%."""
        comp = [it for it in self.items if it.dim == "COMP"]
        answers = answers_for(self.items, {"COMP": 3, "USO": 3, "VAL": 3, "RESP": 3, "SVIL": 3})
        answers[comp[0].id] = 4
        res = score(self.items, answers)
        comp_score = next(d for d in res.by_dim if d.code == "COMP")
        self.assertEqual(comp_score.mean, 3.5)
        self.assertEqual(fmt(comp_score.mean), "3,50")
        self.assertEqual(comp_score.pct, 88)

    def test_incomplete_raises(self) -> None:
        answers = answers_for(self.items, dict.fromkeys(DIMENSION_BY_CODE, 3))
        answers.pop(self.items[0].id)
        with self.assertRaises(ValueError) as ctx:
            score(self.items, answers)
        self.assertIn(self.items[0].id, str(ctx.exception))

    def test_band_boundaries(self) -> None:
        for total, name in [(21, "Esplorativo"), (22, "Utilizzatore"), (31, "Utilizzatore"),
                            (32, "Praticante consapevole"), (40, "Praticante consapevole"),
                            (41, "Moltiplicatore")]:
            with self.subTest(total=total):
                self.assertEqual(band_for(total).name, name)


class TestAlerts(unittest.TestCase):
    def setUp(self) -> None:
        self.items = draw_items()

    def _kinds(self, per_dim: dict[str, int], tweak=None) -> list[str]:
        answers = answers_for(self.items, per_dim)
        if tweak:
            tweak(answers)
        return [a.kind for a in score(self.items, answers).alerts]

    def test_uso_val_gap_triggers(self) -> None:
        kinds = self._kinds({"COMP": 3, "USO": 4, "VAL": 3, "RESP": 3, "SVIL": 3})
        self.assertEqual(kinds, ["warn"])

    def test_gap_below_one_does_not_trigger(self) -> None:
        """Scarto 0,67 (USO 4/4/3 vs VAL 3): sotto soglia."""
        uso = [it for it in self.items if it.dim == "USO"]

        def tweak(answers: dict[str, int]) -> None:
            answers[uso[0].id] = 3

        self.assertEqual(self._kinds({"COMP": 3, "USO": 4, "VAL": 3, "RESP": 3, "SVIL": 3}, tweak), [])

    def test_resp_gap_triggers(self) -> None:
        self.assertEqual(self._kinds({"COMP": 3, "USO": 3, "VAL": 3, "RESP": 2, "SVIL": 3}), ["danger"])

    def test_resp_just_above_threshold(self) -> None:
        resp = [it for it in self.items if it.dim == "RESP"]

        def tweak(answers: dict[str, int]) -> None:
            answers[resp[0].id] = 3  # media 2,5

        self.assertEqual(self._kinds({"COMP": 3, "USO": 3, "VAL": 3, "RESP": 2, "SVIL": 3}, tweak), [])

    def test_both_alerts(self) -> None:
        kinds = self._kinds({"COMP": 3, "USO": 4, "VAL": 2, "RESP": 2, "SVIL": 3})
        self.assertEqual(kinds, ["warn", "danger"])

    def test_alert_text_mentions_ai_act(self) -> None:
        answers = answers_for(self.items, {"COMP": 3, "USO": 3, "VAL": 3, "RESP": 1, "SVIL": 3})
        danger = next(a for a in score(self.items, answers).alerts if a.kind == "danger")
        self.assertIn("art. 4", danger.body)


class TestRadarSvg(unittest.TestCase):
    def test_fixed_axis_and_geometry(self) -> None:
        items = draw_items()
        res = score(items, answers_for(items, {"COMP": 1, "USO": 4, "VAL": 2, "RESP": 3, "SVIL": 4}))
        svg = radar_svg(res.by_dim)

        self.assertTrue(svg.startswith("<svg") and svg.endswith("</svg>"))
        self.assertEqual(svg.count("<polygon"), 5)  # 4 anelli (asse fisso 0-4) + area del profilo
        self.assertEqual(svg.count("<circle"), 5)   # un vertice per dimensione
        for dim in DIMENSIONS:
            self.assertIn(dim.label, svg)
        # tutte le coordinate stanno dentro il viewBox
        coords = [float(v) for v in re.findall(r'(?:x|y|cx|cy|x1|y1|x2|y2)="(-?\d+(?:\.\d+)?)"', svg)]
        self.assertTrue(coords and all(-1 <= c <= 521 for c in coords), "coordinate fuori dal viewBox")

    def test_uniform_profiles_differ_by_value_only(self) -> None:
        """Asse fisso: profili diversi producono poligoni diversi, non riscalati."""
        items = draw_items()
        low = radar_svg(score(items, answers_for(items, dict.fromkeys(DIMENSION_BY_CODE, 1))).by_dim)
        high = radar_svg(score(items, answers_for(items, dict.fromkeys(DIMENSION_BY_CODE, 4))).by_dim)
        self.assertNotEqual(low, high)
        # l'anello esterno (valore 4) è identico nei due grafici
        ring = re.findall(r'<polygon points="([^"]+)" fill="none" stroke="#b9c4cf"', low)
        self.assertEqual(ring, re.findall(r'<polygon points="([^"]+)" fill="none" stroke="#b9c4cf"', high))


class TestHelpers(unittest.TestCase):
    def test_stem_lowercases_first_letter(self) -> None:
        self.assertEqual(stem("Spiegare a un collega"), "spiegare a un collega")

    def test_fmt_uses_comma(self) -> None:
        self.assertEqual(fmt(2), "2,00")
        self.assertEqual(fmt(3.333), "3,33")
        self.assertEqual(fmt(2.666), "2,67")

    def test_every_item_reads_naturally_with_stem(self) -> None:
        for it in ITEMS:
            with self.subTest(item=it.id):
                self.assertTrue(stem(it.text)[0].islower())
                self.assertTrue(it.text.endswith(("." , '".')), f"{it.id} senza punto finale")


class TestParityWithJs(unittest.TestCase):
    """Le due implementazioni condividono il modello: qui si verifica che non divergano."""

    @classmethod
    def setUpClass(cls) -> None:
        path = Path(__file__).resolve().parent.parent / "js" / "items.js"
        cls.js = path.read_text(encoding="utf-8")

    @staticmethod
    def _unquote(raw: str) -> str:
        return raw.replace("\\'", "'").replace('\\"', '"').replace("\\\\", "\\")

    def js_items(self) -> dict[str, tuple[str, str]]:
        pattern = re.compile(
            r"\{\s*id:\s*'([^']+)',\s*dim:\s*'([^']+)',\s*text:\s*(['\"])((?:\\.|(?!\3).)*)\3\s*\}",
            re.DOTALL,
        )
        found = {m[0]: (m[1], self._unquote(m[3])) for m in pattern.findall(self.js)}
        self.assertEqual(len(found), 30, "parsing di js/items.js incompleto")
        return found

    def test_same_items(self) -> None:
        js_items = self.js_items()
        self.assertEqual(set(js_items), {it.id for it in ITEMS})
        for it in ITEMS:
            with self.subTest(item=it.id):
                self.assertEqual((it.dim, it.text), js_items[it.id])

    def test_same_quotas(self) -> None:
        found = re.findall(r"code:\s*'(\w+)',\s*label:\s*'([^']+)',\s*quota:\s*(\d)", self.js)
        self.assertEqual(
            [(c, self._unquote(label), int(q)) for c, label, q in found],
            [(d.code, d.label, d.quota) for d in DIMENSIONS],
        )

    def test_same_scale(self) -> None:
        found = re.findall(r"\{\s*value:\s*(\d),\s*label:\s*'((?:\\.|[^'])*)'\s*\}", self.js)
        self.assertEqual(
            [(int(v), self._unquote(label)) for v, label in found],
            [(a.value, a.label) for a in SCALE],
        )

    def test_same_bands(self) -> None:
        found = re.findall(r"min:\s*(\d+),\s*max:\s*(\d+),\s*name:\s*'([^']+)'", self.js)
        self.assertEqual(
            [(int(lo), int(hi), name) for lo, hi, name in found],
            [(b.lo, b.hi, b.name) for b in BANDS],
        )


class TestHttpFlow(unittest.TestCase):
    """Flusso completo sul server reale: intro -> sessione -> validazione -> risultati."""

    @classmethod
    def setUpClass(cls) -> None:
        cls.httpd = ThreadingHTTPServer(("127.0.0.1", 0), app_module.Handler)
        cls.base = f"http://127.0.0.1:{cls.httpd.server_address[1]}"
        cls.thread = threading.Thread(target=cls.httpd.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls) -> None:
        cls.httpd.shutdown()
        cls.httpd.server_close()
        cls.thread.join(timeout=5)

    def setUp(self) -> None:
        self.opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(CookieJar()))

    def get(self, path: str) -> tuple[int, str]:
        with self.opener.open(self.base + path) as resp:
            return resp.status, unescape(resp.read().decode("utf-8"))

    def post(self, path: str, data: dict[str, str]) -> tuple[int, str]:
        req = urllib.request.Request(self.base + path, data=urlencode(data).encode())
        with self.opener.open(req) as resp:
            return resp.status, unescape(resp.read().decode("utf-8"))

    def item_ids(self, html: str) -> list[str]:
        return re.findall(r'name="q_([A-Z]\d)"', html)[::4]  # 4 radio per item

    def test_intro_page(self) -> None:
        status, html = self.get("/")
        self.assertEqual(status, 200)
        self.assertIn("Dove sono, oggi, le mie competenze di AI", html)
        for anchor in SCALE:
            self.assertIn(anchor.label, html)

    def test_css_served(self) -> None:
        status, css = self.get("/style.css")
        self.assertEqual(status, 200)
        self.assertIn("--navy", css)

    def test_questionario_requires_session(self) -> None:
        status, html = self.get("/questionario")
        self.assertEqual(status, 200)
        self.assertIn("Dove sono, oggi", html)  # redirect alla intro

    def test_quiz_has_twelve_items_with_quotas_and_hides_dimensions(self) -> None:
        self.post("/inizia", {})
        _, html = self.get("/questionario")
        ids = self.item_ids(html)
        self.assertEqual(len(ids), ITEMS_PER_SESSION)
        self.assertEqual(len(set(ids)), ITEMS_PER_SESSION)
        for dim in DIMENSIONS:
            self.assertEqual(len([i for i in ids if i[0] == dim.code[0]]), dim.quota)
        self.assertIn("Sono in grado di", html)
        for dim in DIMENSIONS:  # etichette delle dimensioni assenti dal questionario
            self.assertNotIn(dim.label, html)

    def test_incomplete_submission_is_flagged_and_not_scored(self) -> None:
        self.post("/inizia", {})
        _, html = self.get("/questionario")
        ids = self.item_ids(html)

        data = {f"q_{i}": "3" for i in ids[:-2]}  # due risposte mancanti
        status, html = self.post("/questionario", data)
        self.assertEqual(status, 200)
        self.assertIn("Mancano 2 risposte", html)
        self.assertIn("Risposta mancante", html)
        self.assertNotIn("Il tuo profilo", html)
        self.assertIn('<output id="answered-count">10</output>', html)
        self.assertEqual(html.count(" checked>"), 10)  # le risposte date sono conservate

        # i risultati restano inaccessibili anche via URL diretto
        _, direct = self.get("/risultati")
        self.assertNotIn("Il tuo profilo", direct)

    def test_complete_submission_scores_and_shows_alerts(self) -> None:
        self.post("/inizia", {})
        _, html = self.get("/questionario")
        ids = self.item_ids(html)
        # USO 4, VAL 2, RESP 2, resto 3 -> entrambi gli alert, totale 34
        value = {"U": "4", "V": "2", "R": "2", "C": "3", "S": "3"}
        status, html = self.post("/questionario", {f"q_{i}": value[i[0]] for i in ids})

        self.assertEqual(status, 200)
        self.assertIn("Il tuo profilo", html)
        self.assertIn(">34<", html)
        self.assertIn("Praticante consapevole", html)
        self.assertIn("Usi l'AI più di quanto la verifichi", html)
        self.assertIn("Gap di conformità", html)
        self.assertIn("<svg", html)
        self.assertIn("4,00", html)  # media USO
        self.assertIn("2,00", html)  # media VAL/RESP

    def test_reset_clears_answers(self) -> None:
        self.post("/inizia", {})
        _, html = self.get("/questionario")
        ids = self.item_ids(html)
        self.post("/questionario", {f"q_{i}": "3" for i in ids[:5]})
        status, html = self.post("/questionario", {"azione": "azzera"})
        self.assertEqual(status, 200)
        self.assertNotIn(" checked>", html)
        self.assertIn('<output id="answered-count">0</output>', html)

    def test_new_session_redraws_items(self) -> None:
        seen: set[tuple[str, ...]] = set()
        for _ in range(6):
            self.post("/inizia", {})
            _, html = self.get("/questionario")
            seen.add(tuple(self.item_ids(html)))
        self.assertGreater(len(seen), 1, "la nuova sessione non riestrae gli item")

    def test_invalid_values_are_ignored(self) -> None:
        self.post("/inizia", {})
        _, html = self.get("/questionario")
        ids = self.item_ids(html)
        data = {f"q_{i}": "3" for i in ids}
        data[f"q_{ids[0]}"] = "9"  # fuori scala
        data[f"q_{ids[1]}"] = "abc"
        _, html = self.post("/questionario", data)
        self.assertIn("Mancano 2 risposte", html)

    def test_unknown_path_returns_404(self) -> None:
        with self.assertRaises(urllib.error.HTTPError) as ctx:
            self.get("/non-esiste")
        self.assertEqual(ctx.exception.code, 404)


if __name__ == "__main__":
    unittest.main(verbosity=2)
