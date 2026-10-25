"""Live map of Santiago Metro train positions.

Run: python3 metro_map.py [port] [bind-host]   then open http://localhost:8765
Data: mtv.massivachile.cl station boards (no CORS, so this server fetches them and serves one JSON snapshot).
Station coordinates: Wikidata (stations.json). The page itself is index.html.
"""
import html
import json
import os
import re
import sys
import threading
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import NamedTuple, Optional
from zoneinfo import ZoneInfo

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = "https://mtv.massivachile.cl/data.php?estacion={}&via={}"
REFRESH_SECONDS = 60
SANTIAGO = ZoneInfo("America/Santiago")

with open(os.path.join(HERE, "stations.json")) as f:
    STATIONS = json.load(f)  # code -> [lat, lon, name]
with open(os.path.join(HERE, "index.html"), "rb") as f:
    PAGE = f.read()

# Station codes in order. via=1 runs toward the last station, via=2 toward the first.
LINES = {
    "1": ("#e60011", "SP NP PJ LR EC AH US EL LA RP LH LM CH SL UC BA SA MM PV LE TB GO AL EM MQ HM LD"),
    "2": ("#ffc300", "AV ZA DO EI CE CB PT CA AN HE TO PQ RO FR LL SM LV DE CN LO EP LC EB OB CM PI"),
    "3": ("#8b4513", "PQU LCR FER LIB CAR VIV CCH PZC HOS PCA PZA UCH PAL MAT IRA MEY NUN ESP VFR PZE FCV"),
    "4": ("#11469b", "TOB COL BIL PDG SBO PEG LOR RGR LPR RQU LTO MAC VMA VVA RMA TRI SJE LQU ECO HSR PIN LME PPA"),
    "4A": ("#0099e6", "LCI SRA SRO LGR SJU VIM"),
    "5": ("#00996b", "PM SB DS MT LP LS BR PU SO PR BL GL QN RC NA PZ BE BQ PB SI IR NU RA CV AG SJ PE MA LF VV"),
    "6": ("#800080", "CER LVA PAC FRA BIO NUB ESN NUO ISU LEN"),
}
# Lines 3 and 6 use another board system that massiva doesn't serve: shown on the map, never fetched.
NO_BOARDS = {"3", "6"}


class Board(NamedTuple):
    name: str
    status: str             # board text, e.g. "En menos de 3 minutos"
    mins: Optional[int]     # 0 = train at the station, None = unknown
    route: Optional[str]    # next train's express route: "R" (Roja), "V" (Verde) or None
    stype: Optional[str]    # station type: "C" (común), "R", "V", or None on lines without express


NO_DATA = Board("", "no live data", None, None, None)


def parse(page):
    """Parse one massiva board page.

    During express hours the board names the next train's route ("RUTA ROJA"/"RUTA VERDE"); the two
    squares beside the station name give its type: red+green = común, red only = Roja, green only = Verde.
    """
    def grab(id_):
        m = re.search(r'id="%s"[^>]*>([^<]*)' % id_, page)
        return html.unescape(m.group(1)).strip() if m else ""

    name, status = grab("nombreEstacion"), grab("separadortemp1")
    if re.search(r"en estaci|Llegando|Saliendo", status):
        mins = 0
    else:
        m = re.search(r"(\d+) minuto", status)
        mins = int(m.group(1)) if m else None
    route = re.search(r"RUTA (ROJA|VERDE)", page)
    colors = frozenset(re.findall(r"background:(green|red);width:22px", page))
    stype = {frozenset({"green", "red"}): "C", frozenset({"red"}): "R", frozenset({"green"}): "V"}.get(colors)
    return Board(name, status, mins, route and route.group(1)[0], stype)


def infer_trains(etas):
    """etas: minutes per station in travel order. -> list of positions (station index, may be fractional).

    shortcut: assumes ~2 min between stations and coarse "menos de N" ETAs; positions are approximate.
    A train is at station i when eta is 0, or between i-1 and i when eta doesn't grow versus the previous station
    (the same train would need ~2 more minutes to reach the next one).
    """
    trains = []
    for i, e in enumerate(etas):
        if e is None:
            continue
        if e == 0:
            trains.append(float(i))
        elif i > 0 and etas[i - 1] is not None and etas[i - 1] != 0 and e <= etas[i - 1]:
            trains.append(i - min(e, 2) / 2)
        elif i > 0 and etas[i - 1] is None and e <= 2:
            trains.append(i - e / 2)
    return trains


def infer_routes(etas, types, routes):
    """Like infer_trains, but express trains (boards labelled with a route) are inferred per route on that route's
    stations: a Roja-only board only shows Roja trains, and a común board shows whichever train comes first.
    Unlabelled boards are normal all-stop service; express ends station by station, so both can coexist.
    -> list of (position, route or None)."""
    out = [(p, None) for p in infer_trains([e if r is None else None for e, r in zip(etas, routes)])]
    for r in ("R", "V"):
        idx = [i for i, t in enumerate(types) if t in (None, "C", r)]
        for k in infer_trains([etas[i] if routes[i] == r else None for i in idx]):
            a = int(k)  # map the position on this route's stations back to the full line
            out.append((float(idx[a]) if k == a else idx[a] + (k - a) * (idx[a + 1] - idx[a]), r))
    return out


def fetch(code, via):
    try:
        with urllib.request.urlopen(SRC.format(code, via), timeout=10) as r:
            return parse(r.read().decode("utf-8", "replace"))
    except Exception as e:  # one bad station shouldn't blank the map
        return Board("", f"error: {e}", None, None, None)


def snapshot():
    jobs = [(line, code, via) for line, (_, codes) in LINES.items() if line not in NO_BOARDS
            for code in codes.split() for via in (1, 2)]
    with ThreadPoolExecutor(12) as pool:
        boards = dict(zip(jobs, pool.map(lambda j: fetch(j[1], j[2]), jobs)))
    out = []
    for line, (color, codes) in LINES.items():
        codes = codes.split()
        b = {(c, v): boards.get((line, c, v), NO_DATA) for c in codes for v in (1, 2)}
        types = [b[c, 1].stype or b[c, 2].stype for c in codes]
        stations = [{"code": c, "name": b[c, 1].name or b[c, 2].name or STATIONS[c][2], "ll": STATIONS[c][:2],
                     "type": t, "status": {v: b[c, v].status for v in (1, 2)}, "route": {v: b[c, v].route for v in (1, 2)}}
                    for c, t in zip(codes, types)]
        n = len(codes) - 1
        trains = [{"via": 1, "pos": p, "route": r}
                  for p, r in infer_routes([b[c, 1].mins for c in codes], types, [b[c, 1].route for c in codes])]
        # via 2 travels backwards, so infer on the reversed lists and map the index back
        rc = codes[::-1]
        trains += [{"via": 2, "pos": n - p, "route": r}
                   for p, r in infer_routes([b[c, 2].mins for c in rc], types[::-1], [b[c, 2].route for c in rc])]
        out.append({"line": line, "color": color, "live": line not in NO_BOARDS, "stations": stations, "trains": trains})
    return {"updated": time.strftime("%H:%M:%S"), "lines": out}


def no_service(now):
    """No trains run 01:00-06:00 Santiago time, so skip fetching then."""
    return 1 <= now.hour < 6


# Served until the worker's first fetch lands; requests never hit massiva themselves.
latest_json = json.dumps({"updated": None, "lines": []}).encode()


def worker():
    global latest_json
    while True:
        try:
            if not no_service(datetime.now(SANTIAGO)):
                latest_json = json.dumps(snapshot()).encode()
        except Exception as e:  # keep serving the last good snapshot
            print(f"refresh failed: {e}", flush=True)
        time.sleep(REFRESH_SECONDS)


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        data, ctype = (latest_json, "application/json") if self.path.endswith("/api") else (PAGE, "text/html")
        self.send_response(200)
        self.send_header("Content-Type", ctype + "; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, *a):
        pass


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
    host = sys.argv[2] if len(sys.argv) > 2 else "127.0.0.1"
    threading.Thread(target=worker, daemon=True).start()
    print(f"http://{host}:{port}", flush=True)
    ThreadingHTTPServer((host, port), Handler).serve_forever()


if __name__ == "__main__":
    main()
