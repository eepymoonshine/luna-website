document.querySelectorAll('a.card[href]').forEach(function (a) {
  a.href = a.href.replace('perseus.local', location.hostname);
});

(function () {
  var LAN_IP = '192.168.1.116';
  var TAILSCALE_IP = '100.118.161.27';
  var host = location.hostname;
  var ip = /^\d+\.\d+\.\d+\.\d+$/.test(host)
    ? host
    : (host === 'perseus' || host.endsWith('.ts.net')) ? TAILSCALE_IP : LAN_IP;
  document.getElementById('host-ip').textContent = ip;
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

  function render(data) {
    document.getElementById('m-uptime').textContent = data.uptime_hours + ' hours';
    document.getElementById('m-load').textContent =
      data.load['1m'].toFixed(2) + ' / ' + data.load['5m'].toFixed(2) + ' / ' + data.load['15m'].toFixed(2) +
      ' (' + data.load.cores + ' cores)';

    document.getElementById('m-mem').textContent =
      fmtGB(data.mem.used_kb) + ' / ' + fmtGB(data.mem.total_kb) + ' (' + data.mem.percent + '%)';
    var memBar = document.getElementById('m-mem-bar');
    memBar.style.width = data.mem.percent + '%';
    memBar.className = 'bar-fill ' + barClass(data.mem.percent);

    document.getElementById('m-disk').textContent =
      fmtGB(data.disk.used_kb) + ' / ' + fmtGB(data.disk.total_kb) + ' (' + data.disk.percent + '%)';
    var diskBar = document.getElementById('m-disk-bar');
    diskBar.style.width = data.disk.percent + '%';
    diskBar.className = 'bar-fill ' + barClass(data.disk.percent);

    var list = document.getElementById('containers-list');
    list.innerHTML = '';
    (data.containers || []).forEach(function (c) {
      var chip = document.createElement('span');
      chip.className = 'container-chip';
      chip.title = c.status;
      var running = c.state === 'running';
      var dotColor = running ? '#6bcf6b' : '#e05a5a';
      chip.innerHTML = '<span class="status-dot" style="background:' + dotColor + '"></span>' + c.name;
      list.appendChild(chip);
    });

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
