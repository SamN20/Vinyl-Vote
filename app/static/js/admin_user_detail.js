document.addEventListener('DOMContentLoaded', async () => {
  const userId = window.__USER_ID__;
  if (!userId) return;

  try {
    const res = await fetch(`/admin/users/${userId}/stats.json`, { credentials: 'same-origin' });
    if (!res.ok) return;
    const data = await res.json();

    // Totals
    const setText = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    setText('total-votes', data.totals?.votes ?? '—');
    setText('total-album-scores', data.totals?.album_scores ?? '—');
    setText('total-requests', data.totals?.requests ?? '—');

    const gridColor = getComputedStyle(document.documentElement).getPropertyValue('--border-color') || '#333';
    const textColor = getComputedStyle(document.documentElement).getPropertyValue('--text') || '#fff';
    const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent') || '#1DB954';

    const baseOptions = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: textColor } },
        tooltip: { mode: 'index', intersect: false }
      },
      scales: {
        x: { ticks: { color: textColor }, grid: { color: gridColor } },
        y: { ticks: { color: textColor }, grid: { color: gridColor }, beginAtZero: true }
      }
    };

    // Votes over time
    if (data.votes_over_time) {
      const ctx = document.getElementById('chart-user-votes');
      if (ctx) new Chart(ctx, {
        type: 'line',
        data: {
          labels: data.votes_over_time.labels,
          datasets: [{
            label: 'Votes',
            data: data.votes_over_time.data,
            borderColor: accent.trim() || '#1DB954',
            backgroundColor: (accent.trim() || '#1DB954') + '44',
            tension: 0.2,
            fill: true
          }]
        },
        options: baseOptions
      });
    }

    // Score distribution
    if (data.score_distribution) {
      const ctx = document.getElementById('chart-score-distribution');
      if (ctx) new Chart(ctx, {
        type: 'bar',
        data: {
          labels: data.score_distribution.labels,
          datasets: [{
            label: 'Votes',
            data: data.score_distribution.data,
            backgroundColor: accent.trim() || '#1DB954'
          }]
        },
        options: baseOptions
      });
    }

    // Top albums (table)
    const taBody = document.getElementById('top-albums-body');
    if (taBody && Array.isArray(data.top_albums)) {
      taBody.innerHTML = '';
      data.top_albums.forEach(row => {
        const tr = document.createElement('tr');
        const tdTitle = document.createElement('td');
        tdTitle.textContent = `${row.title} — ${row.artist}`;
        const tdScore = document.createElement('td');
        tdScore.className = 'right';
        tdScore.textContent = `${Number(row.score).toFixed(2)}`;
        tr.appendChild(tdTitle);
        tr.appendChild(tdScore);
        taBody.appendChild(tr);
      });
    }

    // Recent votes
    const rvBody = document.getElementById('recent-votes-body');
    if (rvBody && Array.isArray(data.recent_votes)) {
      rvBody.innerHTML = '';
      data.recent_votes.forEach(row => {
        const tr = document.createElement('tr');
        const tdTitle = document.createElement('td');
        tdTitle.textContent = `${row.song} — ${row.album} (${row.artist})`;
        const tdScore = document.createElement('td');
        tdScore.className = 'right';
        tdScore.textContent = `${Number(row.score).toFixed ? Number(row.score).toFixed(1) : row.score}`;
        const tdWhen = document.createElement('td');
        tdWhen.className = 'right';
        const d = row.when ? new Date(row.when) : null;
        tdWhen.textContent = d ? d.toLocaleString() : '—';
        tr.appendChild(tdTitle);
        tr.appendChild(tdScore);
        tr.appendChild(tdWhen);
        rvBody.appendChild(tr);
      });
    }

  } catch (e) {
    console.error('Failed to load user detail', e);
  }
});
