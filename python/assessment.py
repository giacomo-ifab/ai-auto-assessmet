"""Logica dell'auto-assessment: estrazione, scoring, alert, radar SVG.

Nessuna dipendenza esterna: solo libreria standard.
"""

from __future__ import annotations

import math
import secrets
from dataclasses import dataclass, field, replace
from html import escape

from items import (
    BANDS,
    DIMENSIONS,
    ITEMS,
    ITEMS_PER_SESSION,
    Band,
    Item,
)


# --------------------------------------------------------------------- estrazione

def draw_items(rng: secrets.SystemRandom | None = None) -> list[Item]:
    """Estrae gli item della sessione rispettando le quote per dimensione.

    L'ordine restituito è mescolato: durante la compilazione la dimensione di
    appartenenza non deve essere ricostruibile dalla sequenza.
    """
    rng = rng or secrets.SystemRandom()
    picked: list[Item] = []
    for dim in DIMENSIONS:
        pool = [it for it in ITEMS if it.dim == dim.code]
        picked.extend(rng.sample(pool, dim.quota))
    rng.shuffle(picked)
    return picked


# ----------------------------------------------------------------------- scoring

@dataclass(frozen=True)
class DimScore:
    code: str
    label: str
    count: int
    total: int
    mean: float
    pct: int


@dataclass(frozen=True)
class Alert:
    kind: str  # "warn" | "danger"
    title: str
    body: str


@dataclass(frozen=True)
class Result:
    by_dim: list[DimScore]
    total: int
    band: Band
    alerts: list[Alert] = field(default_factory=list)

    def mean_of(self, code: str) -> float:
        return next(d.mean for d in self.by_dim if d.code == code)

    @property
    def strongest(self) -> DimScore:
        return max(self.by_dim, key=lambda d: d.mean)

    @property
    def weakest(self) -> DimScore:
        return min(self.by_dim, key=lambda d: d.mean)


def band_for(total: int) -> Band:
    for band in BANDS:
        if band.lo <= total <= band.hi:
            return band
    # fuori range solo se le quote vengono modificate senza aggiornare le fasce
    return BANDS[0] if total < BANDS[0].lo else BANDS[-1]


def score(items: list[Item], answers: dict[str, int]) -> Result:
    """Calcola medie, totale, fascia e alert. Richiede tutte le risposte."""
    missing = [it.id for it in items if it.id not in answers]
    if missing:
        raise ValueError(f"risposte mancanti: {', '.join(missing)}")

    by_dim: list[DimScore] = []
    for dim in DIMENSIONS:
        vals = [answers[it.id] for it in items if it.dim == dim.code]
        if not vals:
            continue
        total = sum(vals)
        mean = total / len(vals)
        by_dim.append(
            DimScore(
                code=dim.code,
                label=dim.label,
                count=len(vals),
                total=total,
                mean=mean,
                pct=round(mean / 4 * 100),
            )
        )

    total = sum(d.total for d in by_dim)
    result = Result(by_dim=by_dim, total=total, band=band_for(total))
    return replace(result, alerts=build_alerts(result))


def build_alerts(result: Result) -> list[Alert]:
    """Due alert automatici: squilibrio uso/verifica e gap di responsabilità."""
    alerts: list[Alert] = []
    uso, val, resp = result.mean_of("USO"), result.mean_of("VAL"), result.mean_of("RESP")

    if uso - val >= 1:
        alerts.append(
            Alert(
                kind="warn",
                title="Usi l'AI più di quanto la verifichi",
                body=(
                    f"Uso operativo {fmt(uso)} contro Valutazione critica {fmt(val)} "
                    f"(scarto {fmt(uso - val)}). È un profilo di rischio: la produttività cresce più "
                    "della capacità di controllare gli output. Intervento prioritario sulla verifica dei "
                    "risultati — accuratezza dei dati, adeguatezza allo scopo, stima della revisione necessaria."
                ),
            )
        )

    if resp <= 2:
        alerts.append(
            Alert(
                kind="danger",
                title="Gap di conformità",
                body=(
                    f"Responsabilità {fmt(resp)} su 4. Trattamento dei dati aziendali, rischi per terzi, "
                    "trasparenza e rispetto delle policy non sono presidiati: la formazione su questi aspetti "
                    "va considerata obbligatoria, non facoltativa (obbligo di alfabetizzazione AI, art. 4 AI Act)."
                ),
            )
        )

    return alerts


def fmt(n: float) -> str:
    """Due decimali con virgola decimale."""
    return f"{n:.2f}".replace(".", ",")


def stem(text: str) -> str:
    """Item con la radice comune, iniziale minuscola."""
    return text[:1].lower() + text[1:]


# ------------------------------------------------------------------- radar SVG

def radar_svg(by_dim: list[DimScore], size: int = 520, max_value: int = 4) -> str:
    """Radar delle dimensioni con asse fisso 0–max_value, come SVG inline.

    L'asse non si adatta ai dati: serve a confrontare profili diversi.
    """
    cx, cy, radius = size / 2, size / 2 + 6, 150.0
    n = len(by_dim)
    step = 2 * math.pi / n
    start = -math.pi / 2  # primo asse in alto

    def point(i: int, value: float) -> tuple[float, float]:
        r = radius * (value / max_value)
        a = start + i * step
        return cx + r * math.cos(a), cy + r * math.sin(a)

    def polygon(values: list[float]) -> str:
        return " ".join(f"{x:.1f},{y:.1f}" for x, y in (point(i, v) for i, v in enumerate(values)))

    parts: list[str] = []
    labels = ", ".join(f"{d.label} {fmt(d.mean)}" for d in by_dim)
    parts.append(
        f'<svg viewBox="0 0 {size} {size}" width="{size}" height="{size}" role="img" '
        f'xmlns="http://www.w3.org/2000/svg" aria-label="Radar delle cinque dimensioni '
        f'su asse 0–{max_value}: {_esc(labels)}.">'
    )

    # griglia
    for v in range(1, max_value + 1):
        stroke = "#b9c4cf" if v == max_value else "#e2e7ec"
        parts.append(f'<polygon points="{polygon([v] * n)}" fill="none" stroke="{stroke}" stroke-width="1"/>')

    # raggi
    for i in range(n):
        x, y = point(i, max_value)
        parts.append(f'<line x1="{cx:.1f}" y1="{cy:.1f}" x2="{x:.1f}" y2="{y:.1f}" stroke="#e2e7ec"/>')

    # etichette dei livelli sull'asse verticale
    for v in range(1, max_value + 1):
        y = cy - radius * (v / max_value)
        parts.append(
            f'<text x="{cx - 6:.1f}" y="{y:.1f}" dy="0.35em" text-anchor="end" '
            f'font-size="11" fill="#8b97a3" font-family="{_FONT}">{v}</text>'
        )

    # area del profilo
    parts.append(
        f'<polygon points="{polygon([d.mean for d in by_dim])}" fill="#00b8d4" fill-opacity="0.22" '
        f'stroke="#0b2545" stroke-width="2"/>'
    )
    for i, d in enumerate(by_dim):
        x, y = point(i, d.mean)
        parts.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="4" fill="#0b2545" stroke="#ffffff" stroke-width="1.5"/>')

    # etichette delle dimensioni, tenute dentro il viewBox
    for i, d in enumerate(by_dim):
        a = start + i * step
        cos = math.cos(a)
        x = cx + (radius + 26) * cos
        y = cy + (radius + 26) * math.sin(a)
        anchor = "middle" if abs(cos) < 0.25 else ("start" if cos > 0 else "end")
        width = 6.6 * len(d.label)  # stima a 13px semibold
        pad = 8
        if anchor == "start":
            x = min(x, size - pad - width)
        elif anchor == "end":
            x = max(x, pad + width)
        else:
            x = min(max(x, pad + width / 2), size - pad - width / 2)
        parts.append(
            f'<text x="{x:.1f}" y="{y:.1f}" text-anchor="{anchor}" font-size="13" font-weight="600" '
            f'fill="#0b2545" font-family="{_FONT}">{_esc(d.label)}</text>'
        )
        parts.append(
            f'<text x="{x:.1f}" y="{y + 15:.1f}" text-anchor="{anchor}" font-size="11" '
            f'fill="#4d565f" font-family="{_FONT}">{fmt(d.mean)}</text>'
        )

    parts.append("</svg>")
    return "".join(parts)


_FONT = "Inter, Helvetica Neue, Helvetica, Arial, Segoe UI, system-ui, sans-serif"


def _esc(s: str) -> str:
    return escape(s, quote=True)
