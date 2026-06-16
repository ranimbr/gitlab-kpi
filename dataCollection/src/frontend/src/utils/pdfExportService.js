/**
 * pdfExportService.js
 * Rapport de Direction — Style Grand Cabinet (McKinsey / Deloitte)
 * Philosophie : clarté > quantité. Chaque page respire.
 *
 * Page 1 — Couverture officielle
 * Page 2 — Tableau de bord exécutif (4 KPI + résumé)
 * Page 3 — Analyse comparative (classement + graphique)
 * Page 4 — DORA Metrics & Plan d'action
 *
 * NOTE: jsPDF Helvetica = ASCII uniquement. Pas de caractères Unicode/accents.
 */

import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';

// ─── Logo ─────────────────────────────────────────────────────────────────────
async function loadLogoBase64() {
  try {
    const r = await fetch('/assets/images/telnet.png');
    if (!r.ok) return null;
    const blob = await r.blob();
    return new Promise(res => {
      const reader = new FileReader();
      reader.onloadend = () => res(reader.result);
      reader.readAsDataURL(blob);
    });
  } catch { return null; }
}

// ─── ASCII Sanitizer ───────────────────────────────────────────────────────────
function s(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/œ/g, 'oe').replace(/Œ/g, 'OE')
    .replace(/æ/g, 'ae').replace(/Æ/g, 'AE')
    .replace(/[»«""]/g, '"')
    .replace(/['']/g, "'")
    .replace(/[–—]/g, '-')
    .replace(/…/g, '...')
    .replace(/[≥]/g, '>=')
    .replace(/[≤]/g, '<=')
    .replace(/[↑↗]/g, '+')
    .replace(/[↓↘]/g, '-')
    .replace(/[→]/g, '>')
    .replace(/[✓✔☑]/g, 'OK')
    .replace(/[⚠⚡]/g, '!');
}

// ─── Palette ───────────────────────────────────────────────────────────────────
const P = {
  navy:    [15,  23,  42],   // Slate-900 — titres, fonds sombres
  blue:    [10,  131, 176],  // TELNET Blue — accents
  green:   [16,  185, 129],  // Emerald — succès
  red:     [220, 38,  38],   // Red — danger
  amber:   [217, 119, 6],    // Amber — warning
  indigo:  [79,  70,  229],  // Indigo — info
  gray:    [100, 116, 139],  // Slate-500 — texte secondaire
  light:   [248, 250, 252],  // Slate-50 — fonds clairs
  border:  [226, 232, 240],  // Slate-200
  white:   [255, 255, 255],
};

// Backgrounds pâles (tints)
const TINT = {
  green:  [220, 252, 231],
  red:    [254, 226, 226],
  amber:  [254, 249, 195],
  indigo: [224, 231, 255],
  blue:   [219, 234, 254],
  gray:   [241, 245, 249],
};

// ─── Page dimensions ───────────────────────────────────────────────────────────
const W = 210;   // A4 width mm
const H = 297;   // A4 height mm
const L = 18;    // Left margin
const R = 18;    // Right margin
const CW = W - L - R; // Content width

// ─── Primitives ────────────────────────────────────────────────────────────────
const fill   = (d, c) => d.setFillColor(...c);
const stroke = (d, c) => d.setDrawColor(...c);
const text   = (d, c) => d.setTextColor(...c);
const font   = (d, sz, w = 'normal') => { d.setFontSize(sz); d.setFont('helvetica', w); };
const lw     = (d, v) => d.setLineWidth(v);

function hRule(doc, y, col = P.border, t = 0.2) {
  stroke(doc, col); lw(doc, t);
  doc.line(L, y, W - R, y);
}

// ─── Universal Header / Footer ─────────────────────────────────────────────────
function pageChrome(doc, page, total, project) {
  // Top accent bar (thin)
  fill(doc, P.blue);
  doc.rect(0, 0, W, 1.8, 'F');

  // Footer
  fill(doc, P.navy);
  doc.rect(0, H - 10, W, 10, 'F');
  text(doc, P.white); font(doc, 6.5, 'normal');
  doc.text(`TELNET Holding  |  Rapport KPI Strategique  |  ${s(project)}`, L, H - 3.5);
  font(doc, 6.5, 'bold');
  doc.text(`Page ${page} sur ${total}   —   CONFIDENTIEL`, W - R, H - 3.5, { align: 'right' });
}

// ─── Section heading ──────────────────────────────────────────────────────────
function heading(doc, label, y) {
  // Left accent dash
  fill(doc, P.blue);
  doc.rect(L, y + 0.5, 3.5, 6.5, 'F');
  text(doc, P.navy); font(doc, 10.5, 'bold');
  doc.text(s(label), L + 7, y + 6);
  return y + 14;
}

// ─── PAGE 1 ── Couverture ─────────────────────────────────────────────────────
function buildCover(doc, { project, period, date, logo, score, entities }) {
  // Dark hero panel (top 40% of page)
  fill(doc, P.navy);
  doc.rect(0, 0, W, 118, 'F');

  // Blue accent stripe at bottom of hero
  fill(doc, P.blue);
  doc.rect(0, 115, W, 3, 'F');

  // Logo zone
  if (logo) {
    try { doc.addImage(logo, 'PNG', L, 22, 50, 17); }
    catch {
      text(doc, P.white); font(doc, 20, 'bold');
      doc.text('TELNET', L, 38);
    }
  } else {
    text(doc, P.blue); font(doc, 8, 'bold');
    doc.text('TELNET HOLDING', L, 28);
    fill(doc, P.blue); doc.rect(L, 29.5, 35, 1, 'F');
  }

  // CONFIDENTIEL badge (top right)
  fill(doc, P.red);
  doc.roundedRect(W - R - 36, 22, 36, 8, 1.5, 1.5, 'F');
  text(doc, P.white); font(doc, 6.5, 'bold');
  doc.text('CONFIDENTIEL', W - R - 18, 27.3, { align: 'center' });

  // Report title
  text(doc, P.white);
  font(doc, 24, 'bold');
  doc.text('RAPPORT DE PERFORMANCE', L, 65);
  font(doc, 13, 'normal');
  doc.text('KPI STRATEGIQUE & DORA METRICS', L, 75);

  // Subtitle line
  fill(doc, P.blue);
  doc.rect(L, 80, 60, 1, 'F');

  text(doc, [148, 163, 184]);  // slate-400
  font(doc, 8.5, 'normal');
  doc.text(s(project), L, 89);
  doc.text(s(period), L, 96);

  // ── White area ─────────────────────────────────────────────────────────────
  // Metadata block (clean table)
  let y = 134;
  const meta = [
    ['Projet',           s(project)],
    ['Perimetre',        s(period)],
    ['Date de rapport',  s(date)],
    ['Entites evaluees', `${entities}`],
    ['Statut',           'Rapport automatise certifie conforme'],
  ];

  meta.forEach(([k, v], i) => {
    fill(doc, i % 2 === 0 ? P.light : P.white);
    doc.rect(L, y - 3, CW, 9, 'F');
    text(doc, P.gray); font(doc, 7.5, 'normal');
    doc.text(k, L + 4, y + 3);
    text(doc, P.navy); font(doc, 7.5, 'bold');
    doc.text(v, L + 58, y + 3);
    y += 9;
  });

  y += 8;
  hRule(doc, y, P.border);
  y += 10;

  // Health score — large, centered
  text(doc, P.navy); font(doc, 8.5, 'bold');
  doc.text('INDICE DE SANTE GLOBAL', W / 2, y, { align: 'center' });
  y += 8;

  const pct = Math.min(Math.max(score || 0, 0), 100);
  const bW = 130;
  const bX = (W - bW) / 2;
  const barColor = pct >= 70 ? P.green : pct >= 45 ? P.amber : P.red;
  const barTint  = pct >= 70 ? TINT.green : pct >= 45 ? TINT.amber : TINT.red;

  // Track
  fill(doc, P.border); doc.roundedRect(bX, y, bW, 9, 4, 4, 'F');
  // Fill
  const fw = Math.max((bW * pct) / 100, pct > 0 ? 9 : 0);
  fill(doc, barColor);
  if (fw > 0) doc.roundedRect(bX, y, fw, 9, 4, 4, 'F');
  // Label inside bar
  if (fw > 18) {
    text(doc, P.white); font(doc, 7, 'bold');
    doc.text(`${pct}%`, bX + fw / 2, y + 6.3, { align: 'center' });
  }

  y += 12;
  const statusLabel = pct >= 70 ? 'Sante : Bonne' : pct >= 45 ? 'Sante : Attention requise' : 'Sante : Critique';
  text(doc, barColor); font(doc, 7, 'bold');
  doc.text(statusLabel, W / 2, y, { align: 'center' });

  y += 10;
  hRule(doc, y, P.border);
  y += 8;

  // Legal note
  text(doc, P.gray); font(doc, 6, 'italic');
  doc.text(
    'Ce document est la propriete exclusive de TELNET Holding. Les donnees presentees sont issues d\'une analyse automatisee des flux GitLab.',
    L, y, { maxWidth: CW }
  );
  doc.text('Toute reproduction ou distribution non autorisee est strictement interdite.', L, y + 4);
}

// ─── PAGE 2 ── Tableau de Bord Exécutif ──────────────────────────────────────
function buildExecutivePage(doc, { score, insights, trends, execSummary }) {
  const now = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });

  // Page label
  fill(doc, P.light); doc.rect(0, 0, W, 14, 'F');
  text(doc, P.navy); font(doc, 9, 'bold');
  doc.text('TABLEAU DE BORD EXECUTIF', L, 9.5);
  text(doc, P.gray); font(doc, 7, 'normal');
  doc.text(s(now), W - R, 9.5, { align: 'right' });

  let y = 24;

  // ── KPI Cards (2×2 grid, generous spacing) ─────────────────────────────────
  const lastLabel = trends.length ? trends[trends.length - 1].period_label : '';
  const pool = trends.filter(t =>
    t.period_label === lastLabel &&
    t.entity_name  !== 'Global' &&
    t.entity_name  !== 'Autres / Non-assignes'
  );

  const avgVel  = pool.length ? (pool.reduce((a, t) => a + (t.metrics.velocity || 0), 0) / pool.length) : null;
  const avgQ    = pool.length ? (pool.reduce((a, t) => {
    const q = t.metrics.quality_score || 0;
    return a + (q <= 1 ? q * 100 : q);
  }, 0) / pool.length) : null;
  const avgRev  = pool.length ? (pool.reduce((a, t) => a + (t.metrics.review_time || 0), 0) / pool.length) : null;
  const totalEnt = [...new Set(trends.map(t => t.entity_name))].length;

  const kpis = [
    {
      value: `${score}%`,
      label: 'Health Score Global',
      sub:   score >= 70 ? 'Indicateur positif' : score >= 45 ? 'Vigilance requise' : 'Action immediate',
      color: score >= 70 ? P.green : score >= 45 ? P.amber : P.red,
      tint:  score >= 70 ? TINT.green : score >= 45 ? TINT.amber : TINT.red,
    },
    {
      value: avgVel  != null ? `${avgVel.toFixed(1)}` : '—',
      label: 'Velocite Moyenne',
      sub:   'Commits / developpeur',
      color: P.indigo,
      tint:  TINT.indigo,
    },
    {
      value: avgQ    != null ? `${avgQ.toFixed(0)}%`  : '—',
      label: 'Qualite de Code',
      sub:   'Taux d\'approbation MR',
      color: avgQ != null && avgQ >= 70 ? P.green : P.amber,
      tint:  avgQ != null && avgQ >= 70 ? TINT.green : TINT.amber,
    },
    {
      value: avgRev  != null ? `${avgRev.toFixed(1)}h` : '—',
      label: 'Temps de Revue Moyen',
      sub:   avgRev != null && avgRev > 48 ? 'Seuil critique depasse (>48h)' : 'Dans la norme (<48h)',
      color: avgRev != null && avgRev > 48 ? P.red : P.green,
      tint:  avgRev != null && avgRev > 48 ? TINT.red : TINT.green,
    },
  ];

  const cW = (CW - 6) / 2;
  const cH = 38;

  kpis.forEach((k, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const cx = L + col * (cW + 6);
    const cy = y + row * (cH + 6);

    // Card background
    fill(doc, k.tint);
    doc.roundedRect(cx, cy, cW, cH, 3, 3, 'F');
    // Left accent border
    fill(doc, k.color);
    doc.rect(cx, cy, 4, cH, 'F');
    // Clip corner
    fill(doc, k.tint);
    doc.rect(cx, cy, 2, 2, 'F');
    doc.rect(cx, cy + cH - 2, 2, 2, 'F');

    // Big value
    text(doc, k.color); font(doc, 22, 'bold');
    doc.text(s(k.value), cx + cW / 2 + 2, cy + 18, { align: 'center' });
    // Label
    text(doc, P.navy); font(doc, 8, 'bold');
    doc.text(s(k.label), cx + cW / 2 + 2, cy + 26, { align: 'center' });
    // Sub-label
    text(doc, k.color); font(doc, 6.5, 'normal');
    doc.text(s(k.sub), cx + cW / 2 + 2, cy + 32, { align: 'center' });
  });

  y += 2 * (cH + 6) + 12;

  // ── Executive Summary ───────────────────────────────────────────────────────
  if (execSummary?.text) {
    y = heading(doc, 'Resume Executif', y);
    fill(doc, P.light);
    doc.roundedRect(L, y, CW, 26, 2, 2, 'F');
    fill(doc, P.blue); doc.rect(L, y, 3, 26, 'F');
    text(doc, P.navy); font(doc, 8, 'normal');
    doc.text(s(execSummary.text), L + 8, y + 7, { maxWidth: CW - 14, lineHeightFactor: 1.55 });
    y += 33;
  }

  // ── Top Insights (max 4, one per row, clean) ────────────────────────────────
  if (insights && insights.length > 0) {
    y = heading(doc, 'Points Cles de l\'Analyse', y);

    const display = insights.slice(0, 4);
    display.forEach(ins => {
      if (y + 16 > H - 20) return;
      const type = ins.type || 'info';
      const tint  = { success: TINT.green, danger: TINT.red, warning: TINT.amber, info: TINT.indigo }[type] || TINT.gray;
      const color = { success: P.green,    danger: P.red,    warning: P.amber,    info: P.indigo }[type]    || P.gray;

      fill(doc, tint);
      doc.roundedRect(L, y, CW, 15, 2, 2, 'F');
      fill(doc, color); doc.rect(L, y, 3, 15, 'F');
      text(doc, color); font(doc, 7.5, 'bold');
      doc.text(s(ins.title), L + 8, y + 6);
      text(doc, P.navy); font(doc, 7, 'normal');
      doc.text(s(ins.text), L + 8, y + 11.5, { maxWidth: CW - 12 });
      y += 19;
    });
  }
}

// ─── PAGE 3 ── Analyse Comparative ────────────────────────────────────────────
async function buildComparativePage(doc, { chartId, trends }) {
  const now = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });

  fill(doc, P.light); doc.rect(0, 0, W, 14, 'F');
  text(doc, P.navy); font(doc, 9, 'bold');
  doc.text('ANALYSE COMPARATIVE DES ENTITES', L, 9.5);
  text(doc, P.gray); font(doc, 7, 'normal');
  doc.text(s(now), W - R, 9.5, { align: 'right' });

  let y = 24;

  // ── Ranking table ───────────────────────────────────────────────────────────
  y = heading(doc, 'Classement des Entites — Periode en Cours', y);

  const lastLabel = trends.length ? trends[trends.length - 1].period_label : '';
  const ranked = [...trends.filter(t =>
    t.period_label === lastLabel &&
    t.entity_name  !== 'Autres / Non-assignes' &&
    t.entity_name  !== 'Global'
  )].sort((a, b) => (b.metrics.velocity || 0) - (a.metrics.velocity || 0));

  // Header row
  fill(doc, P.navy); doc.rect(L, y, CW, 9, 'F');
  text(doc, P.white); font(doc, 7, 'bold');
  const cols = [
    { t: '#',            x: L + 4         },
    { t: 'Entite',       x: L + 16        },
    { t: 'Velocite',     x: L + 90        },
    { t: 'Qualite',      x: L + 120       },
    { t: 'Revue (h)',    x: L + 150       },
  ];
  cols.forEach(c => doc.text(c.t, c.x, y + 6));
  y += 9;

  const rankColor  = [[202,138,4], [107,114,128], [154,103,47]]; // gold, silver, bronze

  ranked.slice(0, 6).forEach((row, i) => {
    const rowH = 11;
    fill(doc, i % 2 === 0 ? P.white : P.light);
    doc.rect(L, y, CW, rowH, 'F');

    // Rank badge
    const bColor = i < 3 ? rankColor[i] : P.border;
    fill(doc, bColor);
    doc.circle(L + 7, y + rowH / 2, 4, 'F');
    text(doc, i < 3 ? P.white : P.gray); font(doc, 7, 'bold');
    doc.text(String(i + 1), L + 7, y + rowH / 2 + 2.2, { align: 'center' });

    // Quality & review values
    const qRaw = row.metrics.quality_score ?? null;
    const qPct  = qRaw != null ? (qRaw <= 1 ? qRaw * 100 : qRaw).toFixed(0) + '%' : '—';
    const rev   = row.metrics.review_time  ?? null;
    const revTxt = rev != null ? rev.toFixed(1) : '—';
    const revColor = rev != null && rev > 48 ? P.red : rev != null && rev > 24 ? P.amber : P.green;

    text(doc, P.navy); font(doc, 8, i === 0 ? 'bold' : 'normal');
    doc.text(s(row.entity_name), L + 16, y + 7.5);
    doc.text((row.metrics.velocity || 0).toFixed(1), L + 90, y + 7.5);
    doc.text(qPct, L + 120, y + 7.5);
    text(doc, revColor); font(doc, 8, 'bold');
    doc.text(revTxt, L + 150, y + 7.5);
    y += rowH;
  });

  if (ranked.length > 6) {
    text(doc, P.gray); font(doc, 6.5, 'italic');
    doc.text(`... et ${ranked.length - 6} entite(s) non affichee(s)`, L, y + 4);
    y += 8;
  }

  y += 12;

  // ── Chart ───────────────────────────────────────────────────────────────────
  y = heading(doc, 'Evolution Historique des KPIs', y);

  const el = document.getElementById(chartId);
  if (el) {
    try {
      const canvas = await html2canvas(el, { scale: 2.5, backgroundColor: '#ffffff', logging: false, useCORS: true });
      const raw = (CW * canvas.height) / canvas.width;
      const imgH = Math.min(raw, 72);
      doc.addImage(canvas.toDataURL('image/png'), 'PNG', L, y, CW, imgH);
      y += imgH + 6;
    } catch {
      fill(doc, P.light); doc.roundedRect(L, y, CW, 16, 2, 2, 'F');
      text(doc, P.gray); font(doc, 7.5, 'italic');
      doc.text('[Graphique non disponible pour l\'export]', L + 6, y + 9.5);
      y += 22;
    }
  } else {
    fill(doc, P.light); doc.roundedRect(L, y, CW, 16, 2, 2, 'F');
    text(doc, P.gray); font(doc, 7.5, 'italic');
    doc.text('[Graphique non disponible — element DOM introuvable]', L + 6, y + 9.5);
    y += 22;
  }

  y += 4;

  // ── Performance note ────────────────────────────────────────────────────────
  if (y + 14 < H - 18) {
    fill(doc, TINT.indigo); doc.roundedRect(L, y, CW, 12, 2, 2, 'F');
    fill(doc, P.indigo); doc.rect(L, y, 3, 12, 'F');
    text(doc, P.indigo); font(doc, 7, 'bold');
    doc.text('Note de lecture', L + 8, y + 5);
    text(doc, P.navy); font(doc, 7, 'normal');
    doc.text('La velocite est exprimee en commits par developpeur. La qualite correspond au taux d\'approbation des Merge Requests.', L + 8, y + 9.5, { maxWidth: CW - 12 });
  }
}

// ─── PAGE 4 ── DORA Metrics & Plan d'Action ───────────────────────────────────
function buildDoraPage(doc, { doraData }) {
  const now = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });

  fill(doc, P.light); doc.rect(0, 0, W, 14, 'F');
  text(doc, P.navy); font(doc, 9, 'bold');
  doc.text('DORA METRICS — PERFORMANCE DEVOPS', L, 9.5);
  text(doc, P.gray); font(doc, 7, 'normal');
  doc.text(s(now), W - R, 9.5, { align: 'right' });

  let y = 24;

  // ── What is DORA ─────────────────────────────────────────────────────────────
  fill(doc, TINT.blue); doc.roundedRect(L, y, CW, 18, 2, 2, 'F');
  fill(doc, P.blue); doc.rect(L, y, 3, 18, 'F');
  text(doc, P.navy); font(doc, 8, 'bold');
  doc.text('Qu\'est-ce que DORA ?', L + 8, y + 6.5);
  text(doc, P.gray); font(doc, 7.5, 'normal');
  doc.text(
    'Les metriques DORA (DevOps Research & Assessment) sont les 4 indicateurs valides par Google pour mesurer la performance DevOps. ' +
    'Elles constituent le standard mondial pour les equipes d\'ingenierie logicielle.',
    L + 8, y + 12, { maxWidth: CW - 14, lineHeightFactor: 1.4 }
  );
  y += 25;

  // Level legend — clear chips
  y = heading(doc, 'Echelle de Maturite DORA', y);

  const levels = [
    { label: 'ELITE',   color: P.green,  tint: TINT.green,  desc: 'Meilleures pratiques mondiales' },
    { label: 'HIGH',    color: P.indigo, tint: TINT.indigo, desc: 'Niveau avance'                   },
    { label: 'MEDIUM',  color: P.amber,  tint: TINT.amber,  desc: 'En cours de progression'         },
    { label: 'LOW',     color: P.red,    tint: TINT.red,    desc: 'Necessite une intervention'       },
  ];

  const chipW = (CW - 9) / 4;
  levels.forEach((lv, i) => {
    const cx = L + i * (chipW + 3);
    fill(doc, lv.tint); doc.roundedRect(cx, y, chipW, 16, 2, 2, 'F');
    fill(doc, lv.color); doc.rect(cx, y, chipW, 5, 'F');
    fill(doc, lv.tint); doc.rect(cx, y + 3, chipW, 2, 'F'); // soften bottom of header
    text(doc, P.white); font(doc, 7, 'bold');
    doc.text(lv.label, cx + chipW / 2, y + 3.8, { align: 'center' });
    text(doc, lv.color); font(doc, 6.5, 'normal');
    doc.text(s(lv.desc), cx + chipW / 2, y + 12, { align: 'center', maxWidth: chipW - 4 });
  });
  y += 22;

  // ── DORA Table ─────────────────────────────────────────────────────────────
  y = heading(doc, 'Resultats par Site / Entite', y);

  if (!doraData || doraData.length === 0) {
    fill(doc, P.light); doc.roundedRect(L, y, CW, 14, 2, 2, 'F');
    text(doc, P.gray); font(doc, 7.5, 'italic');
    doc.text('Donnees DORA non disponibles pour la periode selectionnee.', L + 6, y + 9);
    y += 20;
  } else {
    fill(doc, P.navy); doc.rect(L, y, CW, 9, 'F');
    text(doc, P.white); font(doc, 7, 'bold');
    const dCols = [
      { t: 'Site / Entite',        x: L + 4   },
      { t: 'Deploiements / Mois', x: L + 60  },
      { t: 'Niveau DF',           x: L + 105 },
      { t: 'Lead Time (h)',       x: L + 138 },
      { t: 'Niveau LT',          x: L + 168 },
    ];
    dCols.forEach(c => doc.text(c.t, c.x, y + 6));
    y += 9;

    const lvlColor = { Elite: P.green, High: P.indigo, Medium: P.amber, Low: P.red, 'N/A': P.gray };
    const lvlTint  = { Elite: TINT.green, High: TINT.indigo, Medium: TINT.amber, Low: TINT.red, 'N/A': TINT.gray };

    const clean = doraData.filter(d => d.site_name && d.site_name !== 'Autres / Non-assignes' && d.site_name !== 'Global');
    clean.forEach((site, i) => {
      const rH = 12;
      fill(doc, i % 2 === 0 ? P.white : P.light);
      doc.rect(L, y, CW, rH, 'F');

      text(doc, P.navy); font(doc, 8, 'bold');
      doc.text(s(site.site_name), L + 4, y + 8);
      font(doc, 8, 'normal');
      doc.text(String(site.deployment_count ?? '—'), L + 60, y + 8);

      // DF badge
      const dfL = site.dora_df_level || 'N/A';
      fill(doc, lvlTint[dfL] || TINT.gray);
      doc.roundedRect(L + 103, y + 1.5, 26, 8, 1.5, 1.5, 'F');
      text(doc, lvlColor[dfL] || P.gray); font(doc, 6.5, 'bold');
      doc.text(dfL, L + 116, y + 7.3, { align: 'center' });

      text(doc, P.navy); font(doc, 8, 'normal');
      doc.text(site.lead_time_hours > 0 ? site.lead_time_hours.toFixed(1) : '—', L + 138, y + 8);

      // LT badge
      const ltL = site.dora_lt_level || 'N/A';
      fill(doc, lvlTint[ltL] || TINT.gray);
      doc.roundedRect(L + 166, y + 1.5, 26, 8, 1.5, 1.5, 'F');
      text(doc, lvlColor[ltL] || P.gray); font(doc, 6.5, 'bold');
      doc.text(ltL, L + 179, y + 7.3, { align: 'center' });

      y += rH;
    });
  }

  y += 12;

  // ── Action Plan ─────────────────────────────────────────────────────────────
  y = heading(doc, 'Plan d\'Action — Feuille de Route', y);

  const actions = [
    {
      horizon: 'Court terme  |  J+30',
      color:   P.indigo,
      tint:    TINT.indigo,
      title:   'Automatisation CI/CD',
      detail:  'Activer les pipelines CI/CD automatises et configurer les webhooks GitLab sur chaque site pour declencher tests et analyses de qualite a chaque push.',
    },
    {
      horizon: 'Moyen terme  |  J+60',
      color:   P.amber,
      tint:    TINT.amber,
      title:   'Reduction du Lead Time',
      detail:  'Instaurer des regles de revue avec validation obligatoire sous 24h et des criteres de qualite definis. Objectif : lead time < 1 jour (standard High).',
    },
    {
      horizon: 'Long terme   |  J+90',
      color:   P.green,
      tint:    TINT.green,
      title:   'Viser le Niveau DORA Elite',
      detail:  'Augmenter la frequence de deploiement a > 1 par jour via feature flags et deploiement progressif. Objectif : classement DORA Elite sur tous les sites.',
    },
  ];

  actions.forEach(a => {
    if (y + 24 > H - 18) return;
    fill(doc, a.tint); doc.roundedRect(L, y, CW, 22, 2, 2, 'F');
    fill(doc, a.color); doc.rect(L, y, 3, 22, 'F');

    text(doc, a.color); font(doc, 6.5, 'bold');
    doc.text(s(a.horizon), L + 8, y + 6.5);
    text(doc, P.navy); font(doc, 8.5, 'bold');
    doc.text(s(a.title), L + 8, y + 12.5);
    text(doc, P.navy); font(doc, 7, 'normal');
    doc.text(s(a.detail), L + 8, y + 18, { maxWidth: CW - 14, lineHeightFactor: 1.35 });
    y += 26;
  });

  // ── Certification seal ──────────────────────────────────────────────────────
  if (y + 28 < H - 18) {
    y += 4;
    hRule(doc, y, P.border); y += 6;
    fill(doc, P.light); doc.roundedRect(L, y, CW, 20, 2, 2, 'F');
    fill(doc, P.blue); doc.rect(L, y, 3, 20, 'F');
    text(doc, P.blue); font(doc, 7.5, 'bold');
    doc.text('TELNET BI ENGINE v3.0 — Rapport Automatique Certifie Conforme', L + 8, y + 7.5);
    text(doc, P.gray); font(doc, 6.5, 'normal');
    doc.text(
      'Les donnees presentees sont issues d\'une analyse automatisee certifiee des flux GitLab. Ce rapport est genere le ' +
      new Date().toLocaleDateString('fr-FR') + '. Classification : Usage Interne — Direction Executive.',
      L + 8, y + 13.5, { maxWidth: CW - 14 }
    );
  }
}

// ─── Main Export ──────────────────────────────────────────────────────────────
export async function exportDashboardPDF({
  projectName,
  period,
  healthScore,
  insights,
  trends,
  doraData,
  chartElementId = 'kpi-evolution-chart',
  executiveSummary,
  intelligenceData,
}) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const logo    = await loadLogoBase64();
  const entities = [...new Set((trends || []).map(t => t.entity_name))].length;
  const date     = new Date().toLocaleDateString('fr-FR', {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
  });
  const TOTAL = 4;

  // Page 1 — Cover
  buildCover(doc, { project: projectName, period, date, logo, score: healthScore, entities });
  pageChrome(doc, 1, TOTAL, projectName);

  // Page 2 — Executive Dashboard
  doc.addPage();
  buildExecutivePage(doc, { score: healthScore, insights, trends, execSummary: executiveSummary });
  pageChrome(doc, 2, TOTAL, projectName);

  // Page 3 — Comparative Analysis
  doc.addPage();
  await buildComparativePage(doc, { chartId: chartElementId, trends });
  pageChrome(doc, 3, TOTAL, projectName);

  // Page 4 — DORA + Action Plan
  doc.addPage();
  buildDoraPage(doc, { doraData });
  pageChrome(doc, 4, TOTAL, projectName);

  // Download
  const safe = s(projectName).replace(/[^a-zA-Z0-9]/g, '_');
  const d    = new Date().toISOString().slice(0, 10);
  doc.save(`TELNET_KPI_Report_${safe}_${d}.pdf`);
}
