// Bouton + modale pour invitation personnalisée, génération canvas (sans preview)
(function(){
  const modal = document.getElementById('inviteModal');
  const openBtn = document.getElementById('openInviteModal');
  const closeEls = Array.from(document.querySelectorAll('[data-close-modal]'));
  const form = document.getElementById('inviteForm');
  const prenomEl = document.getElementById('invPrenom');
  const nomEl = document.getElementById('invNom');
  const statusEl = document.getElementById('inviteStatus');
  const downloadArea = document.getElementById('downloadArea');
  const downloadBtn = document.getElementById('downloadInviteBtn');
  const previewArea = document.getElementById('invitePreview');
  const previewImg = document.getElementById('invitePreviewImg');
  let lastPreview = null; // { url, filename }

  function openModal(){
    if (!modal) return;
    modal.classList.add('is-open');
    modal.setAttribute('aria-hidden','false');
    resetPreview();
  }
  function closeModal(){
    if (!modal) return;
    modal.classList.remove('is-open');
    modal.setAttribute('aria-hidden','true');
    resetPreview();
  }

  function setStatus(type, text){
    if (!statusEl) return;
    statusEl.textContent = text || '';
    statusEl.classList.remove('form__status--success','form__status--error');
    if (type) statusEl.classList.add(type === 'success' ? 'form__status--success' : 'form__status--error');
  }

  function readLocal(){
    try {
      const raw = localStorage.getItem('inviteeData');
      if (!raw) return;
      const obj = JSON.parse(raw);
      if (obj && typeof obj === 'object'){
        prenomEl && (prenomEl.value = obj.prenom || '');
        nomEl && (nomEl.value = obj.nom || '');
      }
    } catch(_e) {}
  }
  function saveLocal(prenom, nom){
    try { localStorage.setItem('inviteeData', JSON.stringify({ prenom, nom })); } catch(_e) {}
  }

  function checkInputs(){
    const prenom = String(prenomEl && prenomEl.value || '').trim();
    const nom = String(nomEl && nomEl.value || '').trim();
    const filled = !!prenom && !!nom;
    // Laisse le formulaire visible; active/désactive le bouton de téléchargement
    if (downloadArea){ downloadArea.style.display = 'block'; }
    if (downloadBtn){ downloadBtn.disabled = !filled; }
    setStatus('', '');
  }

  function resetPreview(){
    // Cache l’aperçu et réinitialise le bouton
    if (previewArea) previewArea.style.display = 'none';
    if (previewImg) previewImg.src = '';
    if (lastPreview && lastPreview.url) { try { URL.revokeObjectURL(lastPreview.url); } catch(e) {} }
    lastPreview = null;
    if (downloadBtn){
      downloadBtn.textContent = 'Télécharger mon invitation';
      downloadBtn.disabled = false;
      downloadBtn.replaceWith(downloadBtn.cloneNode(true));
      // Rebind après replaceWith
      const freshBtn = document.getElementById('downloadInviteBtn');
      if (freshBtn) freshBtn.addEventListener('click', handleDownload);
    }
    setStatus('', '');
  }

  // Normalisation du nom: première lettre en majuscule, reste en minuscule
  function capitalizeSegment(s){
    if (!s) return s;
    return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
  }
  function normalizeName(name){
    const trimmed = String(name || '').trim().toLowerCase();
    if (!trimmed) return '';
    // Gère espaces, tirets et apostrophes sans perdre les séparateurs
    return trimmed
      .split(/\s+/)
      .map(word => word
        .split(/([-'])/)
        .map(seg => (seg === '-' || seg === "'") ? seg : capitalizeSegment(seg))
        .join('')
      )
      .join(' ');
  }

  // Retire les accents/diacritiques pour compatibilité avec Animal Chariot
  function stripAccents(text){
    if (!text) return text;
    try {
      return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    } catch(_e) {
      // Fallback au cas où normalize n'est pas dispo
      return text;
    }
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
  function fitFontSize({ text, fontFamily, weight, maxSize, minSize, maxWidth }){
    const canvas = document.createElement('canvas'); const ctx = canvas.getContext('2d');
    for (let size = maxSize; size >= minSize; size -= 2) {
      ctx.font = `${weight} ${size}px ${fontFamily}`;
      const m = ctx.measureText(text);
      if (m.width <= maxWidth) return size;
    }
    return minSize;
  }

  // Chargement robuste de la police Animal Chariot
  function ensureAnimalChariot(){
    try {
      if (!('fonts' in document)) return Promise.resolve();
      const fontName = 'Animal Chariot';
      const fontUrl = 'Animal Chariot.ttf';
      if ('FontFace' in window) {
        const version = Date.now();
        const face = new FontFace(fontName, `url("${fontUrl}?v=${version}") format("truetype")`);
        return face.load()
          .then(loaded => {
            try { document.fonts.add(loaded); } catch(_e) {}
            return document.fonts.load(`1em "${fontName}"`);
          })
          .catch(err => {
            console.warn('FontFace.load échoué (peut-être CORS/chemin):', err);
            return document.fonts.load(`1em "${fontName}"`);
          })
          .then(() => document.fonts.ready)
          .catch(() => document.fonts.ready);
      }
      return document.fonts.load(`1em "${fontName}"`).then(() => document.fonts.ready).catch(() => document.fonts.ready);
    } catch(e){
      console.warn('ensureAnimalChariot error:', e);
      return Promise.resolve();
    }
  }

  async function generateInvitationImage({ nom, prenom }){
    // Attend que la police soit prête AVANT tout dessin
    await ensureAnimalChariot();
    if (document.fonts) {
      try { await document.fonts.load('1em "Animal Chariot"'); } catch(_e) {}
      try { await document.fonts.ready; } catch(_e) {}
    }
    const width = 1080, height = 1920; // Portrait
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext('2d');
    function drawRingIcon(ctx, cx, cy, size){
      const s = size; const r = s * 0.25;
      ctx.save(); ctx.beginPath();
      ctx.arc(cx, cy + s*0.10, r, 0, Math.PI*2);
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = s * 0.09;
      ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#ffffff'; ctx.fillRect(cx - (s*0.03), cy - (s*0.02), s*0.06, s*0.12);
      ctx.beginPath();
      ctx.moveTo(cx, cy - s*0.40);
      ctx.lineTo(cx - s*0.11, cy - s*0.28);
      ctx.lineTo(cx, cy - s*0.16);
      ctx.lineTo(cx + s*0.11, cy - s*0.28);
      ctx.closePath(); ctx.fillStyle = '#ffffff'; ctx.fill();
      ctx.restore();
    }
    function fitCanvasFontSize({ text, fontFamily, weight, maxSize, minSize, maxWidth }){
      for (let size = maxSize; size >= minSize; size -= 2) {
        ctx.font = `${weight} ${size}px ${fontFamily}`;
        const m = ctx.measureText(text);
        if (m.width <= maxWidth) return size;
      }
      return minSize;
    }
    return new Promise((resolve, reject) => {
      const img = new Image(); img.crossOrigin = 'anonymous';
      img.onload = async () => {
        const ratio = Math.max(width / img.width, height / img.height);
        const nw = img.width * ratio, nh = img.height * ratio;
        const nx = (width - nw) / 2, ny = (height - nh) / 2;
        ctx.drawImage(img, nx, ny, nw, nh);
        const grad = ctx.createLinearGradient(0, 0, 0, height);
        grad.addColorStop(0, 'rgba(43,36,48,0.55)'); grad.addColorStop(1, 'rgba(43,36,48,0.45)');
        ctx.fillStyle = grad; ctx.fillRect(0,0,width,height);
        ctx.textAlign = 'center'; ctx.fillStyle = '#ffffff';
        // Forcer une dernière attente des fontes pour garantir leur disponibilité côté canvas
        if (document.fonts) {
          try { await document.fonts.load('1em "Animal Chariot"'); } catch(_e) {}
          try { await document.fonts.ready; } catch(_e) {}
        }
        const cleanPrenom = normalizeName(prenom);
        const cleanNom = normalizeName(nom);
        const nameTextRaw = `${cleanPrenom} ${cleanNom}`.trim();
        const nameText = stripAccents(nameTextRaw);
        // En-tête: uniquement le nom (Animal Chariot, sans accents), sans préfixe
        const phraseText = 'Vous êtes chaleureusement invitées à notre mariage traditionnel...';
        const detailsTextUpper = '20 décembre 2025 · 15:00 · Maison Rodriguez, Cococodji'.toLocaleUpperCase('fr-FR');
        const maxTextWidth = width - 160;
        // Icône bague en haut, centrée et plus visible
        const ringSize = 44; const ringCy = 80; drawRingIcon(ctx, width/2, ringCy, ringSize);
        // Avant le dessin du texte, s'assurer encore que les fontes sont prêtes
        if (document.fonts && document.fonts.ready) {
          try { await document.fonts.ready; } catch(_e) {}
        }
        // En-tête: ajuster la taille du NOM seul pour respecter maxTextWidth
        const nameFont = (size) => `400 ${size}px "Animal Chariot", "Playfair Display", serif`;
        let cherSize = 44; // taille du NOM (Animal Chariot)
        const minCher = 20;
        for (let size = cherSize; size >= minCher; size -= 2){
          ctx.font = nameFont(size);
          const wName = ctx.measureText(nameText).width;
          if (wName <= maxTextWidth){ cherSize = size; break; }
          cherSize = size; // continue à réduire
        }
        // Augmenter légèrement (+20%) puis réduire si dépassement
        cherSize = Math.max(Math.floor(cherSize * 1.2), 18);
        while (cherSize >= minCher){
          ctx.font = nameFont(cherSize);
          const wName2 = ctx.measureText(nameText).width;
          if (wName2 <= maxTextWidth) break;
          cherSize -= 1;
        }
        ctx.textBaseline = 'alphabetic';
        // Phrase d’invitation en casse normale, sur deux lignes équilibrées
        function splitIntoTwoLines(text){
          const t = String(text || '').replace(/\s+/g,' ').trim();
          // Préférence: couper après "invitées à notre" si présent
          const prefer = 'invitées à notre';
          const ix = t.toLowerCase().indexOf(prefer);
          if (ix > -1) {
            const splitIdx = ix + prefer.length;
            return [t.slice(0, splitIdx).trim(), t.slice(splitIdx).trim()];
          }
          const mid = Math.floor(t.length / 2);
          let splitIdx = t.lastIndexOf(' ', mid);
          if (splitIdx < 0) splitIdx = t.indexOf(' ', mid);
          if (splitIdx < 0) splitIdx = mid;
          const l1 = t.slice(0, splitIdx).trim();
          const l2 = t.slice(splitIdx).trim();
          return [l1, l2];
        }
        const [line1, line2] = splitIntoTwoLines(phraseText);
        const phraseSize1 = fitCanvasFontSize({ text: line1, fontFamily: '"Playfair Display", serif', weight: '700', maxSize: 48, minSize: 24, maxWidth: maxTextWidth });
        const phraseSize2 = fitCanvasFontSize({ text: line2, fontFamily: '"Playfair Display", serif', weight: '700', maxSize: 48, minSize: 24, maxWidth: maxTextWidth });
        const phraseSizeRaw = Math.min(phraseSize1, phraseSize2);
        // Réduction demandée: 50% de la taille de la phrase
        const phraseSize = Math.max(Math.floor(phraseSizeRaw * 0.5), 18);
        // Calcul des positions pour centrer verticalement le bloc (Cher -> détails)
        const spacingAfterCher = 12; // px (hero: bloc dense)
        const spacingBetweenPhraseLines = 10; // px
        const spacingBeforeDetails = 14; // px
        const detailsSize = 14; // Taille fixe demandée pour la ligne des détails

        const blockHeight = cherSize + spacingAfterCher + phraseSize + spacingBetweenPhraseLines + phraseSize + spacingBeforeDetails + detailsSize;
        const startY = Math.floor(height / 2 - blockHeight / 2);

        const cherY = startY + cherSize;
        // Ombre identique au hero pour lisibilité
        ctx.save();
        ctx.shadowColor = 'rgba(43,36,48,0.35)';
        ctx.shadowBlur = 10;
        ctx.shadowOffsetY = 2;
        // Dessin centré uniquement avec le NOM
        ctx.font = nameFont(cherSize); const wName = ctx.measureText(nameText).width;
        const totalHeaderW = wName;
        let hdrX = (width/2) - (totalHeaderW/2);
        // Dessin du nom centré via ancrage gauche
        const previousAlign = ctx.textAlign;
        ctx.textAlign = 'left';
        ctx.font = nameFont(cherSize);
        ctx.fillText(nameText, hdrX, cherY);
        ctx.textAlign = previousAlign || 'center';

        ctx.font = `700 ${phraseSize}px "Playfair Display", serif`;
        const phraseY1 = cherY + spacingAfterCher + phraseSize; ctx.fillText(line1, width/2, phraseY1);
        const phraseY2 = phraseY1 + spacingBetweenPhraseLines + phraseSize; ctx.fillText(line2, width/2, phraseY2);

        // Détails façon "eyebrow" du hero: uppercase + letter-spacing
        ctx.font = `600 ${detailsSize}px Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif`;
        const detailsY = phraseY2 + spacingBeforeDetails + detailsSize;
        const tracking = 1.2; // ~0.12em équivalent
        drawTextWithTracking(ctx, detailsTextUpper, width/2, detailsY, tracking);
        ctx.restore();
        // Signature en bas (Animal Chariot pour noms, Playfair pour &)
        ctx.save(); ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ctx.fillStyle = '#ffffff';
        const signatureSize = Math.round(36 * 1.3);
        const normalFont = `400 ${signatureSize}px "Animal Chariot", "Playfair Display", serif`;
        const ampFont = `400 ${signatureSize}px "Playfair Display", serif`;
        const parts = ['Murielle ', '&', ' Ricardo'];
        ctx.font = normalFont; const w0 = ctx.measureText(parts[0]).width;
        ctx.font = ampFont;   const w1 = ctx.measureText(parts[1]).width;
        ctx.font = normalFont; const w2 = ctx.measureText(parts[2]).width;
        const totalW = w0 + w1 + w2; let x = (width / 2) - (totalW / 2);
        const y = height - 120;
        ctx.font = normalFont; ctx.fillText(parts[0], x, y); x += w0;
        ctx.font = ampFont;   ctx.fillText(parts[1], x, y); x += w1;
        ctx.font = normalFont; ctx.fillText(parts[2], x, y);
        ctx.restore();
        canvas.toBlob((blob) => {
          if (!blob) return reject(new Error('toBlob failed'));
          const url = URL.createObjectURL(blob);
          const filename = `invitation-${(prenom||'').toLowerCase()}-${(nom||'').toLowerCase()}.png`.replace(/[^a-z0-9\-_.]/g,'');
          resolve({ url, filename });
        }, 'image/png');
        };
      img.onerror = reject; img.src = 'hero-bg.png';
    });
  }

  function handleDownload(){
    const prenom = String(prenomEl && prenomEl.value || '').trim();
    const nom = String(nomEl && nomEl.value || '').trim();
    if (!prenom || !nom){ setStatus('error','Veuillez renseigner votre prénom et votre nom.'); return; }
    saveLocal(prenom, nom);
    setStatus('success','Aperçu en cours de génération…');
    generateInvitationImage({ nom, prenom }).then(({ url, filename }) => {
      // Affiche l’aperçu dans la modale
      lastPreview = { url, filename };
      if (previewImg) previewImg.src = url;
      if (previewArea) previewArea.style.display = 'block';
      setStatus('success','Aperçu prêt. Cliquez pour télécharger.');
      // Change le bouton pour déclencher le téléchargement réel
      const freshBtn = document.getElementById('downloadInviteBtn');
      if (freshBtn){
        freshBtn.textContent = 'Télécharger maintenant';
        // Remplace le listener existant par downloadNow
        const newBtn = freshBtn.cloneNode(true);
        freshBtn.replaceWith(newBtn);
        newBtn.addEventListener('click', downloadNow);
      }
    }).catch((err)=>{
      console.error('Erreur génération invitation:', err);
      setStatus('error','Échec de la génération de l’aperçu');
    });
  }

  function downloadNow(){
    if (!lastPreview || !lastPreview.url || !lastPreview.filename){ setStatus('error','Aucun aperçu disponible.'); return; }
    const a = document.createElement('a'); a.href = lastPreview.url; a.download = lastPreview.filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    try { URL.revokeObjectURL(lastPreview.url); } catch(e) {}
    lastPreview = null;
    closeModal();
  }

  // Wiring
  openBtn && openBtn.addEventListener('click', openModal);
  closeEls.forEach(el => el.addEventListener('click', closeModal));
  prenomEl && prenomEl.addEventListener('input', checkInputs);
  nomEl && nomEl.addEventListener('input', checkInputs);
  downloadBtn && downloadBtn.addEventListener('click', handleDownload);
  readLocal();
  checkInputs();
})();