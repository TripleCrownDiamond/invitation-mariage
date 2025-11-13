// Chargement et affichage des RSVP dans le mini dashboard
(function(){

  const tableBody = document.getElementById('dashboardTable');
  const statusEl = document.getElementById('dashboardStatus');
  const refreshBtn = document.getElementById('refreshBtn');
  const exportBtn = document.getElementById('exportCsvBtn');
  const exportPdfOuiBtn = document.getElementById('exportPdfOuiBtn');
  // Modale de confirmation
  const confirmModal = document.getElementById('confirmModal');
  const confirmDeleteBtn = document.getElementById('confirmDeleteBtn');
  const cancelDeleteBtn = document.getElementById('cancelDeleteBtn');
  const confirmText = document.getElementById('confirmText');
  let pendingDeleteId = null;
  const downloadSaveDateBtn = document.getElementById('downloadSaveDateBtn');
  const filterPresence = document.getElementById('filterPresence');
  const filterInvitePar = document.getElementById('filterInvitePar');
  const countTotal = document.getElementById('countTotal');
  const countOui = document.getElementById('countOui');
  const countNon = document.getElementById('countNon');
  let currentRows = [];

  // Production: utilise chemins relatifs `/api/...` ; Local: détecte le port.
  const IS_LOCAL = ['localhost','127.0.0.1'].includes(location.hostname);
  const SERVER_PORTS = [String(window.__RSVP_PORT || '3002'), '3001', '3000'];
  let resolvedPort = null;
  function resolveServerPort(){
    if (!IS_LOCAL) return Promise.resolve(null);
    if (resolvedPort) return Promise.resolve(resolvedPort);
    let idx = 0;
    function tryNext(){
      if (idx >= SERVER_PORTS.length) return Promise.reject(new Error('API introuvable'));
      const port = SERVER_PORTS[idx++];
      // On vérifie directement l’endpoint de données pour éviter un serveur qui répondrait 401
      return fetch(`http://localhost:${port}/api/rsvp`).then(async (res) => {
        if (!res.ok) return tryNext();
        const json = await res.json().catch(() => null);
        if (json && json.ok === true) { resolvedPort = port; return port; }
        return tryNext();
      }).catch(() => tryNext());
    }
    return tryNext();
  }
  function apiUrl(path){
    if (!IS_LOCAL) return Promise.resolve(path);
    return resolveServerPort().then(port => `http://localhost:${port}${path}`);
  }

  function setStatus(type, text){
    statusEl.textContent = text;
    statusEl.classList.remove('form__status--success','form__status--error');
    statusEl.classList.add(type === 'success' ? 'form__status--success' : 'form__status--error');
  }
  function clearStatus(){ statusEl.textContent = ''; statusEl.classList.remove('form__status--success','form__status--error'); }

  function renderTable(rows){
    if (!rows.length) { tableBody.innerHTML = '<tr><td colspan="6" class="muted">Aucune réponse pour le moment.</td></tr>'; return; }
    tableBody.innerHTML = rows.map(r => {
      const date = new Date(r.createdAt);
      const d = isNaN(date) ? r.createdAt : date.toLocaleString();
      return `<tr>
        <td>${escapeHtml(r.nom)}</td>
        <td>${escapeHtml(r.prenom)}</td>
        <td>${escapeHtml(r.contact)}</td>
        <td>${escapeHtml(r.invitePar)}</td>
        <td>${escapeHtml(r.presence)}</td>
        <td><span class="muted">${d}</span></td>
        <td>
          <button class="btn btn--ghost btn--icon" title="Télécharger l’invitation" aria-label="Télécharger l’invitation" data-download-nom="${escapeHtml(r.nom)}" data-download-prenom="${escapeHtml(r.prenom)}" data-download-presence="${escapeHtml(r.presence)}">
            <span class="icon icon--download" aria-hidden="true"></span>
          </button>
          <button class="btn btn--ghost btn--icon" title="Supprimer" aria-label="Supprimer" data-delete-id="${r.id}" data-delete-nom="${escapeHtml(r.nom)}" data-delete-prenom="${escapeHtml(r.prenom)}">
            <span class="icon icon--trash" aria-hidden="true"></span>
          </button>
        </td>
      </tr>`;
    }).join('');
    // Bind delete buttons
    Array.from(document.querySelectorAll('[data-delete-id]')).forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-delete-id');
        if (!id) return;
        const nom = btn.getAttribute('data-delete-nom') || '';
        const prenom = btn.getAttribute('data-delete-prenom') || '';
        pendingDeleteId = id;
        if (confirmText) confirmText.textContent = `Supprimer ${prenom} ${nom} ? Cette action est irréversible.`;
        if (confirmModal) { confirmModal.classList.add('is-open'); confirmModal.setAttribute('aria-hidden','false'); }
      });
    });
    // Bind download invitation buttons
    Array.from(document.querySelectorAll('[data-download-nom]')).forEach(btn => {
      btn.addEventListener('click', () => {
        const nom = btn.getAttribute('data-download-nom') || '';
        const prenom = btn.getAttribute('data-download-prenom') || '';
        const presence = btn.getAttribute('data-download-presence') || '';
        if (presence !== 'Oui') { return alert('Invitation perso dispo seulement pour présence confirmée.'); }
        generateInvitationImage({ nom, prenom }).then(({ url, filename }) => {
          const a = document.createElement('a');
          a.href = url; a.download = filename;
          document.body.appendChild(a); a.click(); document.body.removeChild(a);
          URL.revokeObjectURL(url);
        }).catch((err) => {
          console.error('Erreur génération invit:', err);
          alert('Échec génération invitation');
        });
      });
    });
  }
  function escapeHtml(str){ return String(str).replace(/[&<>\"]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

  function applyFilters(rows){
    const p = filterPresence ? filterPresence.value : '';
    const i = filterInvitePar ? filterInvitePar.value : '';
    return rows.filter(r => {
      const okP = !p || r.presence === p;
      const okI = !i || r.invitePar === i;
      return okP && okI;
    });
  }

  function updateCounts(rows){
    const total = rows.length;
    const oui = rows.filter(r => r.presence === 'Oui').length;
    const non = rows.filter(r => r.presence === 'Non').length;
    if (countTotal) countTotal.textContent = String(total);
    if (countOui) countOui.textContent = String(oui);
    if (countNon) countNon.textContent = String(non);
  }

  function load(){
    setStatus('success', 'Chargement...');
    apiUrl('/api/rsvp').then(url => fetch(url)).then(async (res) => {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const json = await res.json();
      if (!json.ok) throw new Error('API error');
      currentRows = Array.isArray(json.data) ? json.data : [];
      updateCounts(currentRows);
      renderTable(applyFilters(currentRows));
      clearStatus();
    }).catch((err) => {
      console.error('Erreur chargement:', err);
      setStatus('error', 'Impossible de charger les réponses.');
    });
  }

  function toCsv(rows){
    const header = ['id','nom','prenom','contact','invitePar','presence','createdAt'];
    const lines = [header.join(',')].concat(rows.map(r => header.map(k => {
      const v = r[k] == null ? '' : String(r[k]).replace(/"/g,'""');
      return '"' + v + '"';
    }).join(',')));
    return lines.join('\n');
  }

  function downloadCsv(){
    const filtered = applyFilters(currentRows);
    const blob = new Blob([toCsv(filtered)], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'rsvp.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function generateSaveTheDate(){
    const width = 1080, height = 1920; // Portrait
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext('2d');
    // Dessin bague (icône de section) comme sur la landing
    function drawRingIcon(ctx, cx, cy, size){
      const s = size;
      const r = s * 0.25; // rayon anneau
      ctx.save();
      // Anneau
      ctx.beginPath();
      ctx.arc(cx, cy + s*0.10, r, 0, Math.PI*2);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = s * 0.09; // ~6px pour s=72
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fill();
      ctx.stroke();
      // Monture (petit rectangle)
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(cx - (s*0.03), cy - (s*0.02), s*0.06, s*0.12);
      // Diamant (losange)
      ctx.beginPath();
      ctx.moveTo(cx, cy - s*0.40);
      ctx.lineTo(cx - s*0.11, cy - s*0.28);
      ctx.lineTo(cx, cy - s*0.16);
      ctx.lineTo(cx + s*0.11, cy - s*0.28);
      ctx.closePath();
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.restore();
    }
    function textWidthWithTracking(ctx, text, spacing){
      const chars = Array.from(text);
      const widths = chars.map(ch => ctx.measureText(ch).width);
      const total = widths.reduce((a,b)=>a+b,0) + spacing * Math.max(0, chars.length - 1);
      return { widths, total };
    }
    function drawTextWithTracking(ctx, text, x, y, spacing){
      const up = text.toUpperCase();
      const { widths, total } = textWidthWithTracking(ctx, up, spacing);
      let cx = x - total/2;
      Array.from(up).forEach((ch, i) => { ctx.fillText(ch, cx, y); cx += widths[i] + spacing; });
    }
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const ratio = Math.max(width / img.width, height / img.height);
        const nw = img.width * ratio, nh = img.height * ratio;
        const nx = (width - nw) / 2, ny = (height - nh) / 2;
        ctx.drawImage(img, nx, ny, nw, nh);
        const grad = ctx.createLinearGradient(0, 0, 0, height);
        grad.addColorStop(0, 'rgba(43,36,48,0.55)');
        grad.addColorStop(1, 'rgba(43,36,48,0.45)');
        ctx.fillStyle = grad; ctx.fillRect(0,0,width,height);
        ctx.textAlign = 'center'; ctx.fillStyle = '#ffffff';
        // Réglage typographique: titre 24px, espacement 20px exact avant la date
        const titleText = 'SAVE THE DATE';
        const dateText = '20/12/2025';
        const titleFont = 'normal 24px Inter, sans-serif';
        const dateFont = '700 96px "Playfair Display", serif';
        const tracking = 6;
        // On positionne d'abord la date autour du centre
        const dateY = Math.floor(height * 0.46);
        // Calcule la hauteur ascendante de la date pour obtenir son "top"
        ctx.font = dateFont;
        const dm = ctx.measureText(dateText);
        const dateTop = dateY - (dm.actualBoundingBoxAscent || 0);
        // Calcule la descente du titre et place le bas du titre à 20px du haut de la date
        ctx.font = titleFont;
        const tm = ctx.measureText(titleText);
        const titleY = dateTop - 20 - (tm.actualBoundingBoxDescent || 0);
        // Dessine le titre avec tracking
        drawTextWithTracking(ctx, titleText, width/2, titleY, tracking);
        // Dessine la date
        ctx.font = dateFont;
        ctx.fillText(dateText, width/2, dateY);
        // Icône bague en bas centré
        drawRingIcon(ctx, width/2, height - 90, 72);
        canvas.toBlob((blob) => {
          if (!blob) return reject(new Error('toBlob failed'));
          const url = URL.createObjectURL(blob);
          resolve({ url, filename: 'save-the-date.png' });
        }, 'image/png');
      };
      img.onerror = reject;
      img.src = '../hero-bg.png';
    });
  }

  // Génère l’invitation personnalisée (mêmes styles que côté site) avec ajustement auto des tailles
  function generateInvitationImage(data){
    const { nom, prenom } = data;
    const width = 1080, height = 1920;
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext('2d');
    function drawRingIcon(ctx, cx, cy, size){
      const s = size;
      const r = s * 0.25;
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy + s*0.10, r, 0, Math.PI*2);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = s * 0.09;
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(cx - (s*0.03), cy - (s*0.02), s*0.06, s*0.12);
      ctx.beginPath();
      ctx.moveTo(cx, cy - s*0.40);
      ctx.lineTo(cx - s*0.11, cy - s*0.28);
      ctx.lineTo(cx, cy - s*0.16);
      ctx.lineTo(cx + s*0.11, cy - s*0.28);
      ctx.closePath();
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.restore();
    }
    function fitFontSize({ text, fontFamily, weight, maxSize, minSize, maxWidth }){
      for (let size = maxSize; size >= minSize; size -= 2) {
        ctx.font = `${weight} ${size}px ${fontFamily}`;
        const m = ctx.measureText(text);
        if (m.width <= maxWidth) return size;
      }
      return minSize;
    }
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const ratio = Math.max(width / img.width, height / img.height);
        const nw = img.width * ratio, nh = img.height * ratio;
        const nx = (width - nw) / 2, ny = (height - nh) / 2;
        ctx.drawImage(img, nx, ny, nw, nh);
        const grad = ctx.createLinearGradient(0, 0, 0, height);
        grad.addColorStop(0, 'rgba(43,36,48,0.55)');
        grad.addColorStop(1, 'rgba(43,36,48,0.45)');
        ctx.fillStyle = grad; ctx.fillRect(0,0,width,height);
        ctx.textAlign = 'center'; ctx.fillStyle = '#ffffff';
        const titleText = `${prenom} ${nom}`;
        const confirmText = 'présence confirmée';
        const maxTextWidth = width - 160;
        const titleSize = fitFontSize({ text: titleText, fontFamily: '"Playfair Display", serif', weight: '700', maxSize: 72, minSize: 40, maxWidth: maxTextWidth });
        ctx.font = `700 ${titleSize}px "Playfair Display", serif`;
        const titleY = Math.floor(height * 0.42);
        ctx.fillText(titleText, width/2, titleY);
        // Présence confirmée sous le nom, espacement 20px
        const confirmSize = fitFontSize({ text: confirmText, fontFamily: '"Playfair Display", serif', weight: '700', maxSize: Math.max(48, Math.round(titleSize * 0.66)), minSize: 28, maxWidth: maxTextWidth });
        ctx.font = `700 ${confirmSize}px "Playfair Display", serif`;
        const confirmY = titleY + confirmSize + 20;
        ctx.fillText(confirmText, width/2, confirmY);
        // Texte "Merci..." en 30px tout en bas, juste au-dessus du ring
        ctx.font = `400 30px Inter, sans-serif`;
        const merciY = height - 130;
        ctx.fillText('Merci de célébrer avec nous', width/2, merciY);
        drawRingIcon(ctx, width/2, height - 90, 72);
        canvas.toBlob((blob) => {
          if (!blob) return reject(new Error('toBlob failed'));
          const url = URL.createObjectURL(blob);
          const filename = `invitation-${(prenom||'').toLowerCase()}-${(nom||'').toLowerCase()}.png`.replace(/[^a-z0-9\-_.]/g,'');
          resolve({ url, filename });
        }, 'image/png');
      };
      img.onerror = reject;
      img.src = '../hero-bg.png';
    });
  }

  refreshBtn && refreshBtn.addEventListener('click', load);
  exportBtn && exportBtn.addEventListener('click', downloadCsv);
  exportPdfOuiBtn && exportPdfOuiBtn.addEventListener('click', () => {
    apiUrl('/api/rsvp/export-pdf?presence=Oui').then(url => {
      const a = document.createElement('a');
      a.href = url;
      a.download = 'rsvp-presence-oui.pdf';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }).catch((err) => {
      console.error('Erreur export PDF:', err);
      alert('Échec export PDF');
    });
  });
  downloadSaveDateBtn && downloadSaveDateBtn.addEventListener('click', () => {
    generateSaveTheDate().then(({ url, filename }) => {
      const a = document.createElement('a');
      a.href = url; a.download = filename;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }).catch((err) => {
      console.error('Erreur “Save The Date”:', err);
      alert('Échec génération image');
    });
  });
  filterPresence && filterPresence.addEventListener('change', () => renderTable(applyFilters(currentRows)));
  filterInvitePar && filterInvitePar.addEventListener('change', () => renderTable(applyFilters(currentRows)));
  // Charge automatiquement au démarrage
  load();
  // Actions modale de confirmation
  function closeConfirm(){
    if (confirmModal){
      confirmModal.classList.remove('is-open');
      confirmModal.setAttribute('aria-hidden','true');
    }
    pendingDeleteId = null;
  }
  cancelDeleteBtn && cancelDeleteBtn.addEventListener('click', closeConfirm);
  confirmModal && Array.from(confirmModal.querySelectorAll('[data-close-modal]')).forEach(el => el.addEventListener('click', closeConfirm));
  confirmDeleteBtn && confirmDeleteBtn.addEventListener('click', () => {
    if (!pendingDeleteId) return closeConfirm();
    apiUrl(`/api/rsvp/${pendingDeleteId}`).then(url => fetch(url, { method: 'DELETE' }))
      .then(async (res) => {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const json = await res.json();
        if (!json.ok) throw new Error('API');
        closeConfirm();
        load();
      }).catch((err) => {
        console.error('Suppression échouée:', err);
        alert('Échec suppression');
        closeConfirm();
      });
  });
})();