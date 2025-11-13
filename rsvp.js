// Gestion du modal et persistance RSVP (IndexedDB avec fallback localStorage)
(function(){
  const modal = document.getElementById('rsvpModal');
  const openBtn = document.getElementById('openRsvpModal');
  const statusEl = document.getElementById('rsvpStatus');
  const form = document.getElementById('rsvpForm');
  const closeEls = Array.from(document.querySelectorAll('[data-close-modal]'));
  const loadListBtn = document.getElementById('loadRsvpList');
  const listContainer = document.getElementById('rsvpListContainer');

  // Détection dynamique du port API (priorité au 3002 puis 3001 -> 3000)
  const SERVER_PORTS = [String(window.__RSVP_PORT || '3002'), '3001', '3000'];
  let resolvedPort = null;
  function resolveServerPort(){
    if (resolvedPort) return Promise.resolve(resolvedPort);
    // Essaie directement /api/rsvp pour éviter les serveurs non compatibles
    let idx = 0;
    function tryNext(){
      if (idx >= SERVER_PORTS.length) return Promise.reject(new Error('API introuvable'));
      const port = SERVER_PORTS[idx++];
      console.log('[RSVP] Test /api/rsvp sur port', port);
      return fetch(`http://localhost:${port}/api/rsvp`).then(async (res) => {
        if (!res.ok) return tryNext();
        const json = await res.json().catch(() => null);
        if (json && typeof json.ok === 'boolean') { resolvedPort = port; return port; }
        return tryNext();
      }).catch(() => tryNext());
    }
    return tryNext();
  }
  function apiUrl(path){
    return resolveServerPort().then(port => {
      const url = `http://localhost:${port}${path}`;
      console.log('[RSVP] API résolue:', url);
      return url;
    });
  }

  function openModal(){
    modal.classList.add('is-open');
    modal.setAttribute('aria-hidden', 'false');
    // Réinitialise l'UI du formulaire (au cas où il était masqué après une soumission)
    if (form) {
      Array.from(form.querySelectorAll('.form__row, .form__actions')).forEach(el => { el.style.display = ''; });
    }
    // Nettoie le message de statut et tout bouton ajouté
    if (statusEl) {
      statusEl.textContent = '';
      statusEl.classList.remove('form__status--success','form__status--error');
      // Retire les enfants résiduels (boutons ajoutés)
      while (statusEl.firstChild) statusEl.removeChild(statusEl.firstChild);
    }
  }
  function closeModal(){
    modal.classList.remove('is-open');
    modal.setAttribute('aria-hidden', 'true');
  }

  openBtn && openBtn.addEventListener('click', openModal);
  closeEls.forEach(el => el.addEventListener('click', closeModal));

  // Persistance
  const DB_NAME = 'mariageDB';
  const STORE = 'rsvp';

  function openDB(){
    return new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) return reject(new Error('IndexedDB non supporté'));
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  function saveToIndexedDB(data){
    return openDB().then(db => new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      const addReq = store.add({
        ...data,
        createdAt: new Date().toISOString()
      });
      addReq.onsuccess = () => resolve(addReq.result);
      addReq.onerror = () => reject(addReq.error);
      tx.oncomplete = () => db.close();
    }));
  }

  function saveToLocalStorage(data){
    const key = 'rsvp_entries';
    const arr = JSON.parse(localStorage.getItem(key) || '[]');
    arr.push({ ...data, id: arr.length + 1, createdAt: new Date().toISOString() });
    localStorage.setItem(key, JSON.stringify(arr));
    return Promise.resolve(arr.length);
  }

  function saveRSVP(data){
    // Priorité au backend; fallback local si indisponible
    return saveToServer(data)
      .catch(() => saveToIndexedDB(data))
      .catch(() => saveToLocalStorage(data));
  }

  form && form.addEventListener('submit', (e) => {
    e.preventDefault();
    const data = {
      nom: form.nom.value.trim(),
      prenom: form.prenom.value.trim(),
      contact: form.contact.value.trim(),
      invitePar: form.invitePar.value,
      presence: form.presence.value
    };
    if (!data.nom || !data.prenom || !data.contact || !data.invitePar || !data.presence) {
      setStatus('error', 'Veuillez remplir tous les champs.');
      return;
    }
    console.log('[RSVP] Soumission formulaire avec données:', data);
    disableSubmit(true);
    saveToServer(data).then((ok) => {
      if (ok) {
        console.log('[RSVP] Enregistrement serveur réussi');
        setStatus('success', 'Enregistré côté serveur avec succès. Merci !');
      } else {
        console.warn('[RSVP] Serveur indisponible, fallback local');
        throw new Error('Serveur indisponible');
      }
    }).catch(() => {
      // Fallback local
      console.log('[RSVP] Fallback local enclenché');
      return saveRSVP(data).then(() => {
        setStatus('success', 'Enregistré localement. Merci !');
      });
    }).then(() => {
      form.reset();
      // Recharge la liste pour que l’utilisateur voie sa réponse
      fetchAndRenderList();
      // Masque les champs et actions du formulaire pour n’afficher que le message et le bouton de téléchargement
      Array.from(form.querySelectorAll('.form__row, .form__actions')).forEach(el => { el.style.display = 'none'; });
      // Propose le téléchargement d’une invitation personnalisée (si présence "Oui")
      try { showInvitationDownloadButton(data); } catch (e) { console.warn('Invitation génération ignorée:', e); }
      // Ne ferme pas automatiquement la modale; laisse l’utilisateur cliquer Télécharger ou fermer manuellement
    }).catch((err) => {
      console.error('Erreur RSVP:', err);
      setStatus('error', 'Une erreur est survenue. Réessayez.');
    }).finally(() => {
      disableSubmit(false);
    });
  });

  // --- Backend ---
  function saveToServer(data){
    return apiUrl('/api/rsvp').then(url => {
      console.log('[RSVP] POST vers', url, 'payload:', data);
      return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    }).then(async (res) => {
      console.log('[RSVP] Réponse serveur statut:', res.status);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const json = await res.json();
      console.log('[RSVP] Réponse JSON:', json);
      return !!json.ok;
    });
  }

  // --- UI Status helpers ---
  function setStatus(type, text){
    if (!statusEl) return;
    statusEl.textContent = text;
    statusEl.classList.remove('form__status--success','form__status--error');
    statusEl.classList.add(type === 'success' ? 'form__status--success' : 'form__status--error');
  }
  function clearStatus(){
    if (!statusEl) return;
    statusEl.textContent = '';
    statusEl.classList.remove('form__status--success','form__status--error');
  }

  function disableSubmit(disable){
    if (!form) return;
    const btn = form.querySelector('button[type="submit"]');
    if (btn) { btn.disabled = !!disable; }
  }

  // --- Listing RSVP ---
  function fetchAndRenderList(){
    if (!listContainer) return;
    apiUrl('/api/rsvp').then(url => {
      console.log('[RSVP] GET liste depuis', url);
      return fetch(url);
    }).then(async (res) => {
      console.log('[RSVP] Statut GET:', res.status);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const json = await res.json();
      if (!json.ok) throw new Error('API error');
      console.log('[RSVP] Liste reçue:', Array.isArray(json.data) ? json.data.length : 0, 'éléments');
      renderList(json.data || []);
    }).catch((err) => {
      console.error('Erreur chargement liste:', err);
      listContainer.innerHTML = '<li class="muted">Impossible de charger la liste.</li>';
    });
  }

  function renderList(rows){
    if (!listContainer) return;
    if (!rows.length) {
      listContainer.innerHTML = '<li class="muted">Aucune réponse pour le moment.</li>';
      return;
    }
    listContainer.innerHTML = rows.map(r => {
      const date = new Date(r.createdAt);
      const d = isNaN(date) ? r.createdAt : date.toLocaleString();
      return `<li><strong>${escapeHtml(r.nom)} ${escapeHtml(r.prenom)}</strong> — ${escapeHtml(r.invitePar)} — Présence: <em>${escapeHtml(r.presence)}</em> — Contact: ${escapeHtml(r.contact)} — <span class="muted">${d}</span></li>`;
    }).join('');
  }

  function escapeHtml(str){
    return String(str).replace(/[&<>"]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  }

  loadListBtn && loadListBtn.addEventListener('click', fetchAndRenderList);

  // --- Invitation personnalisée ---
  function showInvitationDownloadButton(data){
    if (!statusEl) return;
    if (data && data.presence !== 'Oui') return; // Affiche le bouton seulement si présence confirmée
    // Retire un éventuel bloc existant pour éviter les doublons
    const prev = document.querySelector('.invite-download');
    if (prev && prev.parentNode) prev.parentNode.removeChild(prev);
    const wrapper = document.createElement('div');
    wrapper.className = 'invite-download';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn--download btn--xl';
    btn.setAttribute('aria-label', 'Télécharger votre invitation personnalisée');
    btn.innerHTML = '<span class="icon icon--download" aria-hidden="true"></span> Télécharger votre invitation';
    btn.addEventListener('click', () => {
      generateInvitationImage(data).then(({ url, filename }) => {
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        // Après téléchargement, on peut fermer la modale
        closeModal();
      }).catch((err) => {
        console.error('Erreur génération invitation:', err);
        setStatus('error', "Échec de la génération de l'invitation.");
      });
    });
    wrapper.appendChild(btn);
    // Insère le bloc juste après le message de statut pour bien le centrer
    const parent = statusEl.parentNode;
    if (parent) {
      if (statusEl.nextSibling) parent.insertBefore(wrapper, statusEl.nextSibling);
      else parent.appendChild(wrapper);
    } else {
      statusEl.appendChild(wrapper);
    }
  }

  function generateInvitationImage(data){
    const { nom, prenom } = data;
    const width = 1080, height = 1920; // Portrait
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext('2d');
    // Icône bague en canvas (comme sur la landing)
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
    // Ajuste dynamiquement la taille du texte pour éviter le débordement horizontal
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
        // Couvrir le canvas avec l'image
        const ratio = Math.max(width / img.width, height / img.height);
        const nw = img.width * ratio, nh = img.height * ratio;
        const nx = (width - nw) / 2, ny = (height - nh) / 2;
        ctx.drawImage(img, nx, ny, nw, nh);
        // Overlay sombre
        const grad = ctx.createLinearGradient(0, 0, 0, height);
        grad.addColorStop(0, 'rgba(43,36,48,0.55)');
        grad.addColorStop(1, 'rgba(43,36,48,0.45)');
        ctx.fillStyle = grad; ctx.fillRect(0,0,width,height);
        // Texte
        ctx.textAlign = 'center'; ctx.fillStyle = '#ffffff';
        const titleText = `${prenom} ${nom}`;
        const confirmText = 'présence confirmée';
        const maxTextWidth = width - 160; // marge latérale pour éviter le débordement
        const titleSize = fitFontSize({
          text: titleText,
          fontFamily: '"Playfair Display", serif',
          weight: '700',
          maxSize: 72,
          minSize: 40,
          maxWidth: maxTextWidth
        });
        ctx.font = `700 ${titleSize}px "Playfair Display", serif`;
        const titleY = Math.floor(height * 0.42);
        ctx.fillText(titleText, width/2, titleY);
        // Ligne "Merci de célébrer..." fixée à 18px
        // Présence confirmée sous le nom avec 20px d'espacement
        const confirmSize = fitFontSize({
          text: confirmText,
          fontFamily: '"Playfair Display", serif',
          weight: '700',
          maxSize: Math.max(48, Math.round(titleSize * 0.66)),
          minSize: 28,
          maxWidth: maxTextWidth
        });
        ctx.font = `700 ${confirmSize}px "Playfair Display", serif`;
        const confirmY = titleY + confirmSize + 20;
        ctx.fillText(confirmText, width/2, confirmY);
        // "Merci de célébrer avec nous" tout en bas en 30px, juste au-dessus du ring
        ctx.font = `400 30px Inter, sans-serif`;
        const merciY = height - 130; // proche du bas, au-dessus de l’icône bague
        ctx.fillText('Merci de célébrer avec nous', width/2, merciY);
        // Icône bague en bas centré
        drawRingIcon(ctx, width/2, height - 90, 72);
        // Export immédiat
        canvas.toBlob((blob) => {
          if (!blob) return reject(new Error('toBlob failed'));
          const url = URL.createObjectURL(blob);
          const filename = `invitation-${(prenom||'').toLowerCase()}-${(nom||'').toLowerCase()}.png`.replace(/[^a-z0-9\-_.]/g,'');
          resolve({ url, filename });
        }, 'image/png');
      };
      img.onerror = reject;
      img.src = 'hero-bg.png';
    });
  }
})();