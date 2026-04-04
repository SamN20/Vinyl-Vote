document.addEventListener('DOMContentLoaded', async () => {
  try {
    const res = await fetch('/admin/users/stats.json', { credentials: 'same-origin' });
    if (!res.ok) return;
    const data = await res.json();

    // Summary
    const s = data.summary || {};
    const setText = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    setText('stat-total-users', s.total_users ?? '—');
    setText('stat-active-30d', s.active_last_30d ?? '—');
    setText('stat-admins', s.admins ?? '—');
    setText('stat-banned', s.banned ?? '—');
    setText('stat-with-email', s.with_email ?? '—');

    // Charts options
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

    // Registrations
    if (data.registrations) {
      const ctx = document.getElementById('chart-registrations');
      if (ctx) new Chart(ctx, {
        type: 'bar',
        data: {
          labels: data.registrations.labels,
          datasets: [{
            label: 'New users',
            data: data.registrations.data,
            backgroundColor: accent.trim() || '#1DB954'
          }]
        },
        options: baseOptions
      });
    }

    // Votes over time
    if (data.votes_over_time) {
      const ctx = document.getElementById('chart-votes-over-time');
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

    // Votes per user distribution
    if (data.votes_per_user_distribution) {
      const ctx = document.getElementById('chart-votes-per-user');
      if (ctx) new Chart(ctx, {
        type: 'bar',
        data: {
          labels: data.votes_per_user_distribution.labels,
          datasets: [{
            label: '# Users',
            data: data.votes_per_user_distribution.data,
            backgroundColor: accent.trim() || '#1DB954'
          }]
        },
        options: baseOptions
      });
    }

    // Top voters list
    const tv = document.getElementById('top-voters');
    if (tv && Array.isArray(data.top_voters)) {
      tv.innerHTML = '';
      data.top_voters.forEach((row, idx) => {
        const a = document.createElement('a');
        a.href = `/admin/users/${row.user_id}`;
        a.textContent = `${idx + 1}. ${row.username}`;
        a.className = 'name';
        const c = document.createElement('div');
        c.className = 'count';
        const badge = document.createElement('span');
        badge.className = 'badge';
        badge.textContent = row.count;
        c.appendChild(badge);
        tv.appendChild(a);
        tv.appendChild(c);
      });
    }

  } catch (e) {
    // Silent fail for admin convenience
    console.error('Failed to load admin user stats', e);
  }
});
