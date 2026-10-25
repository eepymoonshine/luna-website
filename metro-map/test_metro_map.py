"""Run: python3 test_metro_map.py   (or pytest)"""
from datetime import datetime

from metro_map import LINES, STATIONS, Board, infer_routes, infer_trains, no_service, parse


def test_no_service_hours():
    assert no_service(datetime(2026, 1, 1, 1, 0)) and no_service(datetime(2026, 1, 1, 5, 59))
    assert not no_service(datetime(2026, 1, 1, 0, 59)) and not no_service(datetime(2026, 1, 1, 6, 0))


def test_infer_trains():
    assert infer_trains([0, 1, 3, 5]) == [0.0]          # one train at the first station
    assert infer_trains([4, 6, 1, 3]) == [1.5]          # new train just before station 2
    assert infer_trains([None, None, 2, 4]) == [1.0]    # train right after an unknown stretch
    assert infer_trains([0, 1, 1]) == [0.0, 1.5]        # equal ETAs at neighbours = two trains


def test_parse():
    assert parse('<span id="nombreEstacion">Baquedano </span><div id="separadortemp1" x>En menos de 8 minutos</div>') \
        == Board("Baquedano", "En menos de 8 minutos", 8, None, None)
    # Verde-only station (two green squares) whose next train is Ruta Verde
    assert parse('<span id="nombreEstacion">Santa Isabel <span><span style="background:green;width:22px;height:22px"></span>'
                 '<span style="background:green;width:22px;height:22px"></span></span></span>'
                 '<div id="separadortemp1" x>En menos de 4 minutos</div><div id="separadortemp2" x>RUTA VERDE</div>') \
        == Board("Santa Isabel", "En menos de 4 minutos", 4, "V", "V")


def test_infer_routes():
    # común, roja, verde, común: Roja train at 0; Verde train approaching station 2, passing the Roja-only station 1
    assert infer_routes([0, 1, 1, 2], ["C", "R", "V", "C"], ["R", "R", "V", "V"]) == [(0.0, "R"), (1.0, "V")]
    assert infer_routes([0, 1, 3], [None] * 3, [None] * 3) == [(0.0, None)]   # no express: plain inference
    # express already over at a Verde station while a later board still shows Roja: the unlabelled train still counts
    assert infer_routes([0, 2], ["V", "R"], [None, "R"]) == [(0.0, None)]


def test_every_station_has_coordinates():
    assert all(c in STATIONS for _, codes in LINES.values() for c in codes.split())


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_"):
            fn()
    print("all tests pass")
