# metro-map

Live map of Santiago Metro train positions, served at https://eepymoonshine.world/metro/.

A background worker fetches every station board from `mtv.massivachile.cl` once a minute (skipping 01:00–06:00),
estimates where trains are from the ETAs, and serves the result as one JSON snapshot at `/api`. The page
(`index.html`, Leaflet + OpenStreetMap) polls that. Lines 3 and 6 use another board system, so they're drawn
without trains. During express hours, Ruta Roja and Ruta Verde trains are tracked separately.

No dependencies beyond Python 3.9+.

```
python3 metro_map.py              # http://127.0.0.1:8765
python3 metro_map.py 8765 0.0.0.0 # port, bind address
python3 test_metro_map.py         # tests
```

## Files

- `metro_map.py` — worker, board parsing, train inference, HTTP server
- `index.html` — the map page
- `stations.json` — station code → `[lat, lon, name]` (coordinates from Wikidata)
- `deploy/` — systemd unit and nginx block used on perseus

## Deploy (perseus)

```
scp metro_map.py index.html stations.json perseus.local:/opt/metro-map/
ssh perseus.local 'systemctl restart metro-map'
```
