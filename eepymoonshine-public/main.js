(function () {
  var ring = document.getElementById('webring');
  var buttons = Array.prototype.slice.call(ring.children);
  for (var i = buttons.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var tmp = buttons[i];
    buttons[i] = buttons[j];
    buttons[j] = tmp;
  }
  buttons.forEach(function (btn) { ring.appendChild(btn); });
})();

(function () {
  var dot = document.getElementById('status-dot');
  var title = document.getElementById('status-title');
  var updated = document.getElementById('status-updated');

  function barClass(pct) {
    if (pct >= 90) return 'crit';
    if (pct >= 75) return 'warn';
    return '';
  }

  function fmtGB(kb) {
    return (kb / 1024 / 1024).toFixed(1) + ' GB';
  }

  function fmtGBInt(kb) {
    return Math.round(kb / 1024 / 1024) + ' GB';
  }

  function renderNowPlaying(np) {
    var card = document.getElementById('now-playing');
    if (!np || !np.active) {
      card.hidden = true;
      return;
    }
    card.hidden = false;
    card.classList.toggle('paused', !!np.paused);

    var art = document.getElementById('np-art');
    if (np.image) {
      art.src = np.image;
      art.hidden = false;
    } else {
      art.hidden = true;
    }

    var titleEl = document.getElementById('np-title');
    titleEl.textContent = np.title || '';
    if (np.artist && np.title) {
      titleEl.href = 'https://www.last.fm/music/' + encodeURIComponent(np.artist) + '/_/' + encodeURIComponent(np.title);
    } else {
      titleEl.removeAttribute('href');
    }

    var sub = [np.artist, np.album].filter(Boolean).join(' — ');
    document.getElementById('np-sub').textContent = sub;

    var pct = np.duration_seconds ? Math.min(100, 100 * np.position_seconds / np.duration_seconds) : 0;
    document.getElementById('np-bar-fill').style.width = pct + '%';
  }

  function render(data) {
    renderNowPlaying(data.now_playing);
    document.getElementById('m-uptime').textContent = 'Uptime: ' + data.uptime_hours + ' hours';
    document.getElementById('m-cpu').textContent = data.cpu.percent + '%';
    var cpuBar = document.getElementById('m-cpu-bar');
    cpuBar.style.width = data.cpu.percent + '%';
    cpuBar.className = 'bar-fill ' + barClass(data.cpu.percent);

    document.getElementById('m-mem').textContent =
      fmtGB(data.mem.used_kb) + ' / ' + fmtGB(data.mem.total_kb) + ' (' + data.mem.percent + '%)';
    var memBar = document.getElementById('m-mem-bar');
    memBar.style.width = data.mem.percent + '%';
    memBar.className = 'bar-fill ' + barClass(data.mem.percent);

    document.getElementById('m-disk').textContent =
      fmtGBInt(data.disk.used_kb) + ' / ' + fmtGBInt(data.disk.total_kb) + ' (' + data.disk.percent + '%)';
    var diskBar = document.getElementById('m-disk-bar');
    diskBar.style.width = data.disk.percent + '%';
    diskBar.className = 'bar-fill ' + barClass(data.disk.percent);

    var list = document.getElementById('containers-list');
    list.innerHTML = '';
    if (data.containers_summary) {
      var running = data.containers_summary.running;
      var total = data.containers_summary.total;
      var chip = document.createElement('span');
      chip.className = 'container-chip';
      var dotColor = total === 0 ? '#e05a5a' : (running === total ? '#6bcf6b' : (running === 0 ? '#e05a5a' : '#e0a93e'));
      chip.innerHTML = '<span class="status-dot" style="background:' + dotColor + '"></span>' + running + ' / ' + total + ' services running';
      list.appendChild(chip);
    }

    if (data.cpu) {
      document.getElementById('cpu-current').textContent = data.cpu.percent + '%';
      var hist = data.cpu.history || [];
      var w = 100, h = 40;
      var step = hist.length > 1 ? w / (hist.length - 1) : 0;
      var points = hist.map(function (v, i) {
        var x = i * step;
        var y = h - (Math.min(v, 100) / 100) * h;
        return x.toFixed(1) + ',' + y.toFixed(1);
      }).join(' ');
      var line = document.getElementById('cpu-sparkline-line');
      line.setAttribute('points', points);
      var maxRecent = Math.max.apply(null, hist.concat([0]));
      line.setAttribute('stroke', maxRecent >= 90 ? '#e05a5a' : (maxRecent >= 75 ? '#e0a93e' : '#6ea8fe'));
    }

    var ageSec = (Date.now() - new Date(data.generated_at).getTime()) / 1000;
    dot.className = 'status-dot' + (ageSec > 120 ? ' stale' : '');
    title.textContent = ageSec > 120 ? 'Server status (stale)' : 'Server status';
    updated.textContent = 'Updated ' + new Date(data.generated_at).toLocaleTimeString();
  }

  function poll() {
    fetch('status.json', { cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(render)
      .catch(function () {
        dot.className = 'status-dot down';
        title.textContent = 'Server status (unavailable)';
      });
  }

  poll();
  setInterval(poll, 30000);
})();
