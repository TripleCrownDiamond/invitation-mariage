const express = require('express');
const cors = require('cors');
const Database = require('better-sqlite3');
const PDFDocument = require('pdfkit');

const app = express();
const dbPath = require('path').resolve(__dirname, '../rsvp.db');
const db = new Database(dbPath);
const path = require('path');

// Log basique des requêtes
app.use((req, _res, next) => {
  console.log(`[API] ${req.method} ${req.url}`);
  next();
});

// Crée les tables si elles n'existent pas
db.prepare(`
  CREATE TABLE IF NOT EXISTS rsvp (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nom TEXT NOT NULL,
    prenom TEXT NOT NULL,
    contact TEXT NOT NULL,
    invitePar TEXT NOT NULL,
    presence TEXT NOT NULL,
    createdAt TEXT NOT NULL
  )
`).run();

app.use(cors());
app.use(express.json());
// Servir le frontend statique depuis la racine du projet
const staticRoot = path.resolve(__dirname, '..');
app.use(express.static(staticRoot));

// Table des visites pour suivi de trafic
db.prepare(`
  CREATE TABLE IF NOT EXISTS visits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    path TEXT NOT NULL,
    ua TEXT NOT NULL,
    ts TEXT NOT NULL
  )
`).run();

// Enregistrer une visite
app.post('/api/visit', (req, res) => {
  try {
    const p = (req.body && req.body.path) || req.headers['referer'] || '/';
    const ua = (req.body && req.body.ua) || req.headers['user-agent'] || 'unknown';
    db.prepare('INSERT INTO visits (path, ua, ts) VALUES (?, ?, ?)')
      .run(String(p), String(ua), new Date().toISOString());
    res.json({ ok: true });
  } catch (err) {
    console.error('Erreur SQLite (visit):', err);
    res.status(500).json({ ok: false, error: 'Erreur serveur' });
  }
});

app.post('/api/rsvp', (req, res) => {
  const { nom, prenom, contact, invitePar, presence } = req.body || {};
  console.log('[API] Corps reçu:', { nom, prenom, contact, invitePar, presence });

  if (!nom || !prenom || !contact || !invitePar || !presence) {
    return res.status(400).json({ ok: false, error: 'Champs manquants' });
  }

  try {
    const stmt = db.prepare(`
      INSERT INTO rsvp (nom, prenom, contact, invitePar, presence, createdAt)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(nom.trim(), prenom.trim(), contact.trim(), invitePar, presence, new Date().toISOString());
    console.log('[API] Insertion SQLite OK, rowid:', result.lastInsertRowid);
    return res.json({ ok: true });
  } catch (err) {
    console.error('Erreur SQLite:', err);
    return res.status(500).json({ ok: false, error: 'Erreur serveur' });
  }
});

// Liste des RSVP (publique)
app.get('/api/rsvp', (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT id, nom, prenom, contact, invitePar, presence, createdAt
      FROM rsvp
      ORDER BY datetime(createdAt) DESC
      LIMIT 200
    `).all();
    res.json({ ok: true, data: rows });
  } catch (err) {
    console.error('Erreur SQLite (GET):', err);
    res.status(500).json({ ok: false, error: 'Erreur serveur' });
  }
});

app.get('/api/health', (req, res) => res.json({ ok: true }));

// Suppression d'une entrée RSVP par id
app.delete('/api/rsvp/:id', (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id || !Number.isFinite(id)) return res.status(400).json({ ok: false, error: 'ID invalide' });
    const info = db.prepare('DELETE FROM rsvp WHERE id = ?').run(id);
    return res.json({ ok: true, deleted: info.changes });
  } catch (err) {
    console.error('Erreur SQLite (DELETE):', err);
    return res.status(500).json({ ok: false, error: 'Erreur serveur' });
  }
});

// Export PDF des RSVP filtrés par présence (par défaut: Oui)
app.get('/api/rsvp/export-pdf', (req, res) => {
  try {
    const presence = (req.query.presence || 'Oui');
    const rows = db.prepare(`
      SELECT id, nom, prenom, contact, invitePar, presence, createdAt
      FROM rsvp
      WHERE presence = ?
      ORDER BY datetime(createdAt) DESC
    `).all(presence);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="rsvp-presence-${presence.toLowerCase()}.pdf"`);
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    doc.pipe(res);
    doc.fontSize(18).text(`RSVP — Présence: ${presence}`, { align: 'center' });
    doc.moveDown();
    doc.fontSize(12);
    rows.forEach((r, idx) => {
      doc.text(`${idx+1}. ${r.prenom} ${r.nom} — ${r.contact} — Invité par: ${r.invitePar} — ${new Date(r.createdAt).toLocaleString()}`);
    });
    doc.end();
  } catch (err) {
    console.error('Erreur export PDF:', err);
    res.status(500).json({ ok: false, error: 'Erreur serveur' });
  }
});

const PORT = 3002; // Port forcé pour éviter les collisions avec un serveur existant
app.listen(PORT, () => {
  console.log(`API RSVP en écoute sur http://localhost:${PORT}`);
  console.log('[API] Utilise base de données:', dbPath);
});