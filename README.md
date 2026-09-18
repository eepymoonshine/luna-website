# Luna's Webpage

Two static sites served by nginx on **perseus.local**, plus the shared status
generator that feeds both of them:

- `perseus-homepage/`: private LAN dashboard linking to services running on the box
- `eepymoonshine-public/`: the public-facing site at
  **eepymoonshine.world** (and `www.eepymoonshine.world`), including a small
  blog under `blog/`.
- `infra/`: `perseus-status.sh` and its systemd unit/timer, which write a
  live system/Jellyfin "now playing" status snapshot for both sites every
  30s.

## Contents

```
perseus-homepage/
  index.html, style.css, status.js, banner.jpg, icons/: the page
  nginx.conf: server block (server_name perseus.local _, default_server)
eepymoonshine-public/
  index.html, main.js, about.html/.md, style.css, banner*.jpg, favicon*, icons/
  blog/: index.html, post.html, index.json, posts/*.md
  nginx.conf: server block (server_name eepymoonshine.world www.eepymoonshine.world)
infra/
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

1. Install nginx if needed:

   ```bash
   sudo pacman -S nginx
   ```

2. Deploy the site content:

   ```bash
   sudo mkdir -p /var/www/perseus-homepage /var/www/eepymoonshine-public
   sudo cp -r perseus-homepage/* /var/www/perseus-homepage/
   sudo cp -r eepymoonshine-public/* /var/www/eepymoonshine-public/
   sudo chown -R www-data:www-data /var/www/perseus-homepage /var/www/eepymoonshine-public
   ```

3. Install the server blocks:

   ```bash
   sudo cp perseus-homepage/nginx.conf /etc/nginx/sites-available/perseus-homepage
   sudo cp eepymoonshine-public/nginx.conf /etc/nginx/sites-available/eepymoonshine-public
   sudo ln -sf /etc/nginx/sites-available/perseus-homepage /etc/nginx/sites-enabled/perseus-homepage
   sudo ln -sf /etc/nginx/sites-available/eepymoonshine-public /etc/nginx/sites-enabled/eepymoonshine-public
   sudo nginx -t
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
sudo systemctl enable --now nginx
sudo systemctl enable --now perseus-status.timer
```

Reload after editing site content or a server block:

```bash
sudo nginx -t && sudo systemctl reload nginx
```
