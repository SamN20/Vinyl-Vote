// Document Picture-in-Picture helper for the vote pages.
// Builds a compact, always-on-top window with just the song list.

(function(){
  function supportsDocumentPiP(){
    return typeof window.documentPictureInPicture === 'object' &&
           typeof window.documentPictureInPicture.requestWindow === 'function';
  }

  function buildStyles(doc){
    const style = doc.createElement('style');
    style.textContent = `
      :root{ color-scheme: dark light; }
      *{ box-sizing: border-box; }
      html, body{ height:100%; }
      body{ margin:0; font: 14px system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, Noto Sans, Arial, sans-serif; background: var(--card-bg, #121212); color: var(--text, #eaeaea); overflow:auto; }
  .topbar{ display:flex; align-items:center; justify-content:space-between; gap:8px; padding:10px 12px; background: var(--card-bg, #121212); border-bottom: 1px solid rgba(255,255,255,0.10); position: sticky; top:0; z-index:5; box-shadow: 0 2px 10px rgba(0,0,0,0.35); }
      .title{ font-weight:600; font-size: 13px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .right-controls{ display:flex; align-items:center; gap:8px; }
      .toggle{ display:inline-flex; align-items:center; gap:6px; font-size:12px; }
      .toggle input{ accent-color: var(--accent, #1DB954); }
      .close-btn{ background:transparent; color:inherit; border:0; font-size:18px; line-height:1; cursor:pointer; padding:4px; }
      .content{ display:flex; flex-direction:column; }
      .list{ padding:8px 10px 72px; display:flex; flex-direction:column; gap:6px; }
      .row{ display:grid; grid-template-columns: 1fr auto; align-items:center; gap:8px; padding:6px 8px; border-radius:6px; background: rgba(255,255,255,0.03); }
      .row .label{ font-size: 13px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .row input[type=number]{ width:68px; padding:6px 8px; border-radius:6px; border:1px solid rgba(255,255,255,0.12); background: var(--input-bg, #1e1e1e); color: inherit; }
      .row .stars{ display:none; align-items:center; gap:4px; }
      .star{ cursor:pointer; user-select:none; font-size:16px; line-height:1; }
  .half{ margin-left:6px; font-size:12px; padding:2px 8px; border:1px solid rgba(255,255,255,0.22); border-radius:999px; cursor:pointer; background: transparent; color: inherit; }
  .half.active{ background: var(--accent, #1DB954); color:#000; border-color: var(--accent, #1DB954); }
      .footer{ display:flex; gap:8px; padding:8px 10px; border-top: 1px solid rgba(255,255,255,0.08); background: rgba(255,255,255,0.03); position: fixed; left:0; right:0; bottom:0; }
      .btn{ padding:8px 10px; border-radius:6px; border:1px solid rgba(255,255,255,0.15); background: var(--accent, #1DB954); color:#000; font-weight:600; cursor:pointer; }
      .btn.secondary{ background: transparent; color: inherit; }
      .muted{ opacity:.75; font-size:12px; }
    `;
    doc.head.appendChild(style);
  }

  function syncTheme(mainDoc, pipDoc){
    const apply = () => {
      const theme = mainDoc.documentElement.getAttribute('data-theme') || 'dark';
      pipDoc.documentElement.setAttribute('data-theme', theme);
    };
    apply();
    const mo = new MutationObserver(apply);
    mo.observe(mainDoc.documentElement, { attributes:true, attributeFilter:['data-theme'] });
    return mo;
  }

  function getAlbumTitle(){
    const h3 = document.querySelector('.hero-content h3');
    return h3 ? h3.textContent.trim() : 'Voting';
  }

  function collectSongInputs(){
    // Returns array of {id, labelEl, inputEl}
    const rows = Array.from(document.querySelectorAll('.song-entry'));
    return rows.map(row => {
      const labelEl = row.querySelector('.song-label');
      const inputEl = row.querySelector('input[type="number"]');
      return inputEl ? { id: inputEl.id, labelEl, inputEl } : null;
    }).filter(Boolean);
  }

  function createStars(doc, getHalfActive){
    const wrap = doc.createElement('div');
    wrap.className = 'stars';
    const stars = [];
    for (let i=1;i<=5;i++){
      const s = doc.createElement('span');
      s.className = 'star';
      s.textContent = '☆';
      s.dataset.value = String(i);
      stars.push(s);
      wrap.appendChild(s);
    }
    const half = doc.createElement('button');
    half.type = 'button';
    half.className = 'half';
    half.textContent = '1/2';
    wrap.appendChild(half);
    return { wrap, stars, half };
  }

  function starsController(starsEl, halfBtn, input){
    const updateUI = () => {
      const v = parseFloat(input.value || '0') || 0;
      const base = Math.floor(v);
      const half = Math.abs(v - base - 0.5) < 0.1;
      starsEl.forEach(st => {
        const sv = parseInt(st.dataset.value, 10);
        st.textContent = (sv <= base) ? '★' : '☆';
      });
      halfBtn.classList.toggle('active', half);
      halfBtn.setAttribute('aria-pressed', half ? 'true' : 'false');
      halfBtn.textContent = half ? '1/2' : '1/2';
      if (base >= 5) {
        halfBtn.disabled = true; halfBtn.style.opacity = '0.5';
      } else { halfBtn.disabled = false; halfBtn.style.opacity = '1'; }
    };

    starsEl.forEach(st => {
      st.addEventListener('click', () => {
        const sv = parseInt(st.dataset.value, 10);
        const currentVal = parseFloat(input.value || '0') || 0;
        const currentBase = Math.floor(currentVal);
        const addHalf = halfBtn.classList.contains('active');
        if (sv === currentBase && !addHalf) {
          input.value = addHalf ? '0.5' : '0';
        } else {
          input.value = String((sv + (addHalf ? 0.5 : 0)).toFixed(1));
        }
        input.dispatchEvent(new Event('input', { bubbles:true }));
        updateUI();
      });
    });

    halfBtn.addEventListener('click', () => {
      const v = parseFloat(input.value || '0') || 0;
      const base = Math.floor(v);
      if (base >= 5) return;
      halfBtn.classList.toggle('active');
      const next = base + (halfBtn.classList.contains('active') ? 0.5 : 0);
      input.value = String(next.toFixed(1));
      input.dispatchEvent(new Event('input', { bubbles:true }));
      updateUI();
    });

    input.addEventListener('input', updateUI);
    updateUI();
    return { updateUI };
  }

  function twoWayBind(mainInput, pipInput){
    const onPip = () => {
      mainInput.value = pipInput.value;
      mainInput.dispatchEvent(new Event('input', { bubbles: true }));
    };
    const onMain = () => {
      if (pipInput.value !== mainInput.value){
        pipInput.value = mainInput.value;
      }
    };
    pipInput.addEventListener('input', onPip);
    mainInput.addEventListener('input', onMain);
    // Initialize
    pipInput.value = mainInput.value;
    return () => {
      pipInput.removeEventListener('input', onPip);
      mainInput.removeEventListener('input', onMain);
    };
  }

  async function openVotePiP(options={}){
    const width = options.width || 320;
    const height = options.height || 520;
    const initialLazy = (function(){ try { return localStorage.getItem('lazy_mode') === 'true'; } catch(_) { return false; } })();

    if (supportsDocumentPiP()){
      try {
        const pipWin = await window.documentPictureInPicture.requestWindow({ width, height });
        const { document: pipDoc } = pipWin;

        pipDoc.title = 'Vinyl Vote — Pop-out';
        buildStyles(pipDoc);
        const themeObserver = syncTheme(document, pipDoc);

        // Layout
  const top = pipDoc.createElement('div');
        top.className = 'topbar';
        const title = pipDoc.createElement('div');
        title.className = 'title';
        title.textContent = getAlbumTitle();
  const right = pipDoc.createElement('div');
  right.className = 'right-controls';
  const lazyWrap = pipDoc.createElement('label');
  lazyWrap.className = 'toggle';
  const lazyCb = pipDoc.createElement('input');
  lazyCb.type = 'checkbox';
  lazyCb.checked = initialLazy;
  const lazyText = pipDoc.createElement('span');
  lazyText.textContent = 'Lazy';
  lazyWrap.append(lazyCb, lazyText);
  const closeBtn = pipDoc.createElement('button');
        closeBtn.className = 'close-btn';
        closeBtn.textContent = '×';
        closeBtn.title = 'Close';
        closeBtn.addEventListener('click', () => pipWin.close());
  right.append(lazyWrap, closeBtn);
  top.append(title, right);

        const content = pipDoc.createElement('div');
        content.className = 'content';
        const list = pipDoc.createElement('div');
        list.className = 'list';

        const footer = pipDoc.createElement('div');
        footer.className = 'footer';
        const submitBtn = pipDoc.createElement('button');
        submitBtn.className = 'btn';
        submitBtn.textContent = 'Submit';
        const note = pipDoc.createElement('div');
        note.className = 'muted';
        note.textContent = 'Stays on top while you browse';
        footer.append(submitBtn, note);

        content.append(list);
        pipDoc.body.append(top, content, footer);

        // Build rows for each song
        const songs = collectSongInputs();
        const cleanups = [];
        songs.forEach(({ id, labelEl, inputEl }) => {
          const row = pipDoc.createElement('div');
          row.className = 'row';
          const lab = pipDoc.createElement('div');
          lab.className = 'label';
          lab.textContent = labelEl ? labelEl.textContent.trim() : id;
          const inp = pipDoc.createElement('input');
          inp.type = 'number'; inp.step = '0.1'; inp.min = '0'; inp.max = '5'; inp.inputMode = 'decimal';
          const { wrap, stars, half } = createStars(pipDoc);
          const starsCtl = starsController(stars, half, inp);
          // Two-way bind with main input
          const dispose = twoWayBind(inputEl, inp);
          cleanups.push(dispose);
          const rightCell = pipDoc.createElement('div');
          rightCell.style.display = 'flex'; rightCell.style.alignItems = 'center'; rightCell.style.gap = '8px';
          rightCell.append(inp, wrap);
          row.append(lab, rightCell);
          list.appendChild(row);
          // Ensure initial star highlight reflects current value
          starsCtl.updateUI();
        });

        // Add overall album score row (if present on main page)
        const mainOverall = document.getElementById('personal_score');
        if (mainOverall){
          const row = pipDoc.createElement('div');
          row.className = 'row';
          const lab = pipDoc.createElement('div');
          lab.className = 'label';
          lab.textContent = 'Overall album score';
          const inp = pipDoc.createElement('input');
          inp.type = 'number'; inp.step = '0.1'; inp.min = '0'; inp.max = '5'; inp.inputMode = 'decimal';
          const { wrap, stars, half } = createStars(pipDoc);
          const starsCtl = starsController(stars, half, inp);
          const dispose = twoWayBind(mainOverall, inp);
          const rightCell = pipDoc.createElement('div');
          rightCell.style.display = 'flex'; rightCell.style.alignItems = 'center'; rightCell.style.gap = '8px';
          rightCell.append(inp, wrap);
          row.append(lab, rightCell);
          list.appendChild(row);

          // Show stars when lazy
          const applyLazy = () => {
            const lazy = lazyCb.checked;
            wrap.style.display = lazy ? 'flex' : 'none';
            inp.style.display = lazy ? 'none' : '';
          };
          applyLazy();
          lazyCb.addEventListener('change', () => { try { localStorage.setItem('lazy_mode', lazyCb.checked ? 'true' : 'false'); } catch(_){}; applyLazy(); });
          // Ensure initial star highlight reflects current value
          starsCtl.updateUI();
        }

        // Submit triggers the main form submit
        submitBtn.addEventListener('click', () => {
          const form = document.querySelector('.vote-form');
          if (form) {
            // Mark that submit came from PiP (optional for analytics/debug)
            let h = form.querySelector('input[name="pip_submit"]');
            if (!h) { h = document.createElement('input'); h.type='hidden'; h.name='pip_submit'; h.value='1'; form.appendChild(h); }
            try { form.requestSubmit(); }
            catch(_) { form.submit(); }
            // Bring focus back to main tab and close the PiP quickly
            setTimeout(() => { try { window.focus(); } catch(_){}; try { pipWin.close(); } catch(_){}; }, 50);
          }
        });

        // Apply initial lazy mode to all rows
        const applyLazyAll = () => {
          const lazy = lazyCb.checked;
          list.querySelectorAll('.row').forEach(row => {
            const inp = row.querySelector('input[type="number"]');
            const stars = row.querySelector('.stars');
            if (inp && stars) {
              stars.style.display = lazy ? 'flex' : 'none';
              inp.style.display = lazy ? 'none' : '';
            }
          });
        };
        applyLazyAll();
        lazyCb.addEventListener('change', () => { try { localStorage.setItem('lazy_mode', lazyCb.checked ? 'true' : 'false'); } catch(_){}; applyLazyAll(); });

        // Clean up and auto-close behavior
        const onMainUnload = () => { try { pipWin.close(); } catch(_){} };
        window.addEventListener('beforeunload', onMainUnload, { once:true });
        pipWin.addEventListener('unload', () => {
          themeObserver.disconnect();
          cleanups.forEach(fn => { try { fn(); } catch(_){} });
          window.removeEventListener('beforeunload', onMainUnload);
        });

        return { window: pipWin };
      } catch (err) {
        // Fall through to popup fallback
      }
    }

    // Fallback: small regular popup
    const features = `width=${width},height=${height},resizable=yes,scrollbars=yes`;
    const pu = new URL(window.location.href);
    pu.searchParams.set('pip', '1');
    pu.searchParams.set('popup', '1');
    window.open(pu.toString(), 'vv_vote_popout', features);
    return null;
  }

  // Expose to page
  window.VotePiP = { open: openVotePiP };
})();
