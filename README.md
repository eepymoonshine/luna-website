# Luna's Webpage

Two static sites and a live metro map, served by nginx (a podman quadlet
container) on **perseus.local**, plus the shared status generator that feeds
both sites:

- `perseus-homepage/`: private LAN dashboard linking to services running on the box
- `eepymoonshine-public/`: the public-facing site at
  **eepymoonshine.world** (and `www.eepymoonshine.world`), including a small
  blog under `blog/`.
- `metro-map/`: live Santiago Metro train map at
  **eepymoonshine.world/metro/**, a small Python service that nginx proxies
  to. See `metro-map/README.md`.
- `infra/`: the nginx container definition, plus `perseus-status.sh` and its
  systemd unit/timer, which write a live system/Jellyfin "now playing" status
  snapshot for both sites every 30s.

## Contents

```
perseus-homepage/
  index.html, style.css, status.js, weather.js, banner.jpg, icons/: the page
  nginx.conf: server block (server_name perseus.local _, default_server)
eepymoonshine-public/
  index.html, main.js, weather.js, about.html/.md, style.css, banner*.jpg, favicon*, icons/
  blog/: index.html, post.html, index.json, posts/*.md
  nginx.conf: server block (server_name eepymoonshine.world www.eepymoonshine.world),
              including the /metro/ proxy to metro-map
metro-map/
  metro_map.py, index.html, stations.json, test_metro_map.py
  deploy/metro-map.service: systemd unit (listens on 10.88.0.1:8765, the podman bridge)
infra/
  nginx/nginx.container: podman quadlet for nginx (host port 80 -> container 8080)
  nginx/nginx.conf: top-level nginx config the container runs with
  perseus-status.sh: writes status.json for both sites (+ now-playing art)
  jellyfin.env.example: template for the Jellyfin API key the script needs
  systemd/perseus-status.service
  systemd/perseus-status.timer: runs the script every 30s
```

`status.json` (both sites) and `eepymoonshine-public/now-playing-art.jpg` are
generated at runtime by `infra/perseus-status.sh` and are gitignored: don't
commit them.

## Setup

On perseus.local:

1. Deploy the site content:

   ```bash
   sudo mkdir -p /var/www/perseus-homepage /var/www/eepymoonshine-public
   sudo cp -r perseus-homepage/* /var/www/perseus-homepage/
   sudo cp -r eepymoonshine-public/* /var/www/eepymoonshine-public/
   sudo rm /var/www/*/nginx.conf
   sudo chown -R www-data:www-data /var/www/perseus-homepage /var/www/eepymoonshine-public
   ```

2. Install the nginx container and its config:

   ```bash
   sudo mkdir -p /etc/nginx-quadlet/conf.d
   sudo cp infra/nginx/nginx.conf /etc/nginx-quadlet/nginx.conf
   sudo cp perseus-homepage/nginx.conf /etc/nginx-quadlet/conf.d/perseus-homepage.conf
   sudo cp eepymoonshine-public/nginx.conf /etc/nginx-quadlet/conf.d/eepymoonshine-public.conf
   sudo cp infra/nginx/nginx.container /etc/containers/systemd/
   sudo systemctl daemon-reload
   ```

3. Install the metro map service:

   ```bash
   sudo mkdir -p /opt/metro-map
   sudo cp metro-map/metro_map.py metro-map/index.html metro-map/stations.json /opt/metro-map/
   sudo cp metro-map/deploy/metro-map.service /etc/systemd/system/
   ```

4. Install the status generator:

   ```bash
   sudo cp infra/perseus-status.sh /usr/local/bin/perseus-status.sh
   sudo chmod +x /usr/local/bin/perseus-status.sh
   sudo cp infra/systemd/perseus-status.service infra/systemd/perseus-status.timer /etc/systemd/system/
   sudo mkdir -p /etc/perseus-status
   sudo cp infra/jellyfin.env.example /etc/perseus-status/jellyfin.env
   sudo $EDITOR /etc/perseus-status/jellyfin.env
   sudo chmod 600 /etc/perseus-status/jellyfin.env
   ```

## Turning it on

```bash
sudo systemctl daemon-reload
sudo systemctl start nginx          # quadlet units are enabled by their [Install] section
sudo systemctl enable --now metro-map
sudo systemctl enable --now perseus-status.timer
```

## Deploying changes

From this repo on your machine. Site content is static, so it's live as soon
as it's copied; the excludes keep runtime files on the server untouched:

```bash
for site in perseus-homepage eepymoonshine-public; do
  rsync -rci --chown=www-data:www-data --chmod=D755,F644 --rsync-path="sudo rsync" \
    --exclude=nginx.conf --exclude=status.json --exclude=now-playing-art.jpg \
    $site/ perseus.local:/var/www/$site/
done
```

The metro map reads `index.html` at startup, so restart it after copying:

```bash
rsync -ci --chown=root:root --chmod=F644 --rsync-path="sudo rsync" \
  metro-map/metro_map.py metro-map/index.html metro-map/stations.json perseus.local:/opt/metro-map/
ssh perseus.local 'sudo systemctl restart metro-map'
```

After editing a server block in `/etc/nginx-quadlet/conf.d/`, test and reload:

```bash
sudo podman exec nginx nginx -t && sudo podman exec nginx nginx -s reload
```

Add `-n` to any rsync above for a dry run that lists what would change.
