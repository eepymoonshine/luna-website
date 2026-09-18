#!/bin/bash
set -euo pipefail

OUT="/var/www/perseus-homepage/status.json"
OUT_PUBLIC="/var/www/eepymoonshine-public/status.json"
STATE_DIR="/var/lib/perseus-status"
HISTORY_FILE="$STATE_DIR/cpu_history"
HISTORY_LEN=20
JELLYFIN_ENV="/etc/perseus-status/jellyfin.env"
JELLYFIN_USER="eepymoonshine"
PUBLIC_DIR="$(dirname "$OUT_PUBLIC")"

mkdir -p "$STATE_DIR"

JELLYFIN_API_KEY=""
if [ -r "$JELLYFIN_ENV" ]; then
  source "$JELLYFIN_ENV"
fi

read -r load1 load5 load15 _ < /proc/loadavg
cores="$(nproc)"

mem_total_kb="$(awk '/MemTotal/{print $2}' /proc/meminfo)"
mem_avail_kb="$(awk '/MemAvailable/{print $2}' /proc/meminfo)"
mem_used_kb=$((mem_total_kb - mem_avail_kb))
mem_percent=$(( 100 * mem_used_kb / mem_total_kb ))

disk_line="$(df -kP / | tail -1)"
disk_total_kb="$(echo "$disk_line" | awk '{print $2}')"
disk_used_kb="$(echo "$disk_line" | awk '{print $3}')"
disk_percent="$(echo "$disk_line" | awk '{print $5}' | tr -d '%')"

uptime_hours="$(awk '{printf "%.1f", $1/3600}' /proc/uptime)"

cpu_percent="$(awk -v l1="$load1" -v cores="$cores" 'BEGIN { p = 100 * l1 / cores; if (p > 100) p = 100; printf "%d", p + 0.5 }')"

echo "$cpu_percent" >> "$HISTORY_FILE"
tail -n "$HISTORY_LEN" "$HISTORY_FILE" > "$HISTORY_FILE.tmp" && mv "$HISTORY_FILE.tmp" "$HISTORY_FILE"
cpu_history_json="[$(paste -sd, "$HISTORY_FILE")]"

containers_json="[]"
containers_total=0
containers_running=0
if command -v podman >/dev/null 2>&1; then
  containers_json="$(
    podman ps -a --format '{{.Names}}|{{.State}}|{{.Status}}' | \
    awk -F'|' '
      function esc(s) { gsub(/\\/, "\\\\", s); gsub(/"/, "\\\"", s); return s }
      BEGIN { printf "[" ; first=1 }
      {
        if (!first) printf ","
        first=0
        healthy = ($3 ~ /healthy/) ? "true" : "null"
        printf "{\"name\":\"%s\",\"state\":\"%s\",\"status\":\"%s\",\"healthy\":%s}", esc($1), esc($2), esc($3), healthy
      }
      END { printf "]" }
    '
  )"
  containers_total="$(podman ps -a --format '{{.Names}}' | wc -l)"
  containers_running="$(podman ps --format '{{.Names}}' | wc -l)"
fi

now="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

now_playing_json="$(JELLYFIN_API_KEY="$JELLYFIN_API_KEY" JELLYFIN_USER="$JELLYFIN_USER" STATE_DIR="$STATE_DIR" PUBLIC_DIR="$PUBLIC_DIR" python3 - <<'PY' || echo '{"active": false}'
import json
import os
import sys
import urllib.request

api_key = os.environ.get("JELLYFIN_API_KEY", "")
target_user = os.environ.get("JELLYFIN_USER", "")
state_dir = os.environ["STATE_DIR"]
public_dir = os.environ["PUBLIC_DIR"]
art_tag_file = os.path.join(state_dir, "now_playing_art_tag")
art_public_path = os.path.join(public_dir, "now-playing-art.jpg")


def emit(obj):
    print(json.dumps(obj, ensure_ascii=False))
    sys.exit(0)


if not api_key or not target_user:
    emit({"active": False})

auth = (
    'MediaBrowser Token="%s", Client="perseus-status", '
    'Device="perseus-status", DeviceId="perseus-status", Version="1.0"' % api_key
)

try:
    req = urllib.request.Request("http://localhost:8096/Sessions", headers={"Authorization": auth})
    with urllib.request.urlopen(req, timeout=5) as resp:
        sessions = json.load(resp)
except Exception:
    emit({"active": False})

session = None
for s in sessions:
    item = s.get("NowPlayingItem")
    if s.get("UserName") == target_user and item and item.get("MediaType") == "Audio":
        session = s
        break

if not session:
    emit({"active": False})

item = session["NowPlayingItem"]
play_state = session.get("PlayState", {})
position_ticks = play_state.get("PositionTicks") or 0
runtime_ticks = item.get("RunTimeTicks") or 0

result = {
    "active": True,
    "paused": bool(play_state.get("IsPaused", False)),
    "title": item.get("Name") or "",
    "artist": ", ".join(item.get("Artists") or []) or (item.get("AlbumArtist") or ""),
    "album": item.get("Album") or "",
    "position_seconds": round(position_ticks / 10_000_000),
    "duration_seconds": round(runtime_ticks / 10_000_000),
    "image": None,
}

album_id = item.get("AlbumId")
image_tag = (item.get("ImageTags") or {}).get("Primary") or item.get("AlbumPrimaryImageTag")

if album_id and image_tag:
    prev_tag = ""
    try:
        with open(art_tag_file) as f:
            prev_tag = f.read().strip()
    except FileNotFoundError:
        pass

    if image_tag != prev_tag or not os.path.exists(art_public_path):
        try:
            img_req = urllib.request.Request(
                "http://localhost:8096/Items/%s/Images/Primary?tag=%s" % (album_id, image_tag)
            )
            with urllib.request.urlopen(img_req, timeout=5) as img_resp:
                data = img_resp.read()
            tmp_path = art_public_path + ".tmp"
            with open(tmp_path, "wb") as f:
                f.write(data)
            os.replace(tmp_path, art_public_path)
            os.chmod(art_public_path, 0o644)
            with open(art_tag_file, "w") as f:
                f.write(image_tag)
        except Exception:
            image_tag = prev_tag

    if image_tag:
        result["image"] = "now-playing-art.jpg?v=" + image_tag

emit(result)
PY
)"

write_status() {
  local out_file="$1" containers_field="$2" tmp
  tmp="$(mktemp)"
  cat > "$tmp" <<JSON
{
  "generated_at": "$now",
  "uptime_hours": $uptime_hours,
  "load": { "1m": $load1, "5m": $load5, "15m": $load15, "cores": $cores },
  "cpu": { "percent": $cpu_percent, "history": $cpu_history_json },
  "mem": { "used_kb": $mem_used_kb, "total_kb": $mem_total_kb, "percent": $mem_percent },
  "disk": { "used_kb": $disk_used_kb, "total_kb": $disk_total_kb, "percent": $disk_percent },
  $containers_field,
  "now_playing": $now_playing_json
}
JSON
  mv "$tmp" "$out_file"
  chown www-data:www-data "$out_file"
}

write_status "$OUT" "\"containers\": $containers_json"
write_status "$OUT_PUBLIC" "\"containers_summary\": { \"running\": $containers_running, \"total\": $containers_total }"

if [ -f "$PUBLIC_DIR/now-playing-art.jpg" ]; then
  chown www-data:www-data "$PUBLIC_DIR/now-playing-art.jpg"
fi
