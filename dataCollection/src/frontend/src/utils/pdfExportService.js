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

// ─── Period Label Shortener ───────────────────────────────────────────────────
function shortPeriod(label) {
  if (!label) return '';
  const str = String(label);
  return str
    .replace(/Janvier/i, 'Janv.')
    .replace(/Fevrier/i, 'Fevr.')
    .replace(/Mars/i, 'Mars')
    .replace(/Avril/i, 'Avril')
    .replace(/Mai/i, 'Mai')
    .replace(/Juin/i, 'Juin')
    .replace(/Juillet/i, 'Juil.')
    .replace(/Aout/i, 'Aout')
    .replace(/Septembre/i, 'Sept.')
    .replace(/Octobre/i, 'Oct.')
    .replace(/Novembre/i, 'Nov.')
    .replace(/Decembre/i, 'Dec.');
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

async function captureElement(id) {
  const el = document.getElementById(id);
  if (!el) return null;
  try {
    const canvas = await html2canvas(el, { scale: 2.0, backgroundColor: '#ffffff', logging: false, useCORS: true });
    return canvas.toDataURL('image/png');
  } catch (err) {
    console.error(`Failed to capture ${id}:`, err);
    return null;
  }
}

function drawChartBox(doc, { title, img, x, y, w, h }) {
  // Card background
  fill(doc, P.white);
  stroke(doc, P.border);
  lw(doc, 0.2);
  doc.roundedRect(x, y, w, h, 2, 2, 'FD');

  // Title
  text(doc, P.navy);
  font(doc, 7.5, 'bold');
  doc.text(s(title), x + 5, y + 5);

  if (img) {
    doc.addImage(img, 'PNG', x + 2, y + 7, w - 4, h - 9);
  } else {
    fill(doc, P.light);
    doc.rect(x + 2, y + 7, w - 4, h - 9, 'F');
    text(doc, P.gray);
    font(doc, 7, 'italic');
    doc.text('[Graphique non disponible]', x + w / 2, y + h / 2 + 2, { align: 'center' });
  }
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
async function buildComparativePage(doc, { trends }) {
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

  // ── Charts ──────────────────────────────────────────────────────────────────
  y = heading(doc, 'Evolution Historique de la Productivite', y);

  const imgVelocity = await captureElement('pdf-chart-velocity');
  const imgMrRate = await captureElement('pdf-chart-mr_rate');

  const colW = (CW - 6) / 2;
  const h = 50;

  drawChartBox(doc, {
    title: 'Velocite (Commits / Dev)',
    img: imgVelocity,
    x: L,
    y,
    w: colW,
    h
  });

  drawChartBox(doc, {
    title: 'Livraison (MRs / Dev)',
    img: imgMrRate,
    x: L + colW + 6,
    y,
    w: colW,
    h
  });

  y += h + 12;

  // ── Performance note ────────────────────────────────────────────────────────
  if (y + 14 < H - 18) {
    fill(doc, TINT.indigo); doc.roundedRect(L, y, CW, 14, 2, 2, 'F');
    fill(doc, P.indigo); doc.rect(L, y, 3, 14, 'F');
    text(doc, P.indigo); font(doc, 7, 'bold');
    doc.text('Note de lecture', L + 8, y + 5);
    text(doc, P.navy); font(doc, 7, 'normal');
    doc.text('La velocite mesure l\'activite brute de developpement en nombre de commits. La livraison comptabilise les Merge Requests (MR) fusionnees, refletant les increments de valeur reels.', L + 8, y + 9.5, { maxWidth: CW - 12 });
  }
}

// ─── PAGE 4 ── Qualité & Processus de Revue ───────────────────────────────────
async function buildQualityPage(doc, { trends }) {
  const now = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });

  fill(doc, P.light); doc.rect(0, 0, W, 14, 'F');
  text(doc, P.navy); font(doc, 9, 'bold');
  doc.text('QUALITE & PROCESSUS DE REVUE DES FLUX', L, 9.5);
  text(doc, P.gray); font(doc, 7, 'normal');
  doc.text(s(now), W - R, 9.5, { align: 'right' });

  let y = 24;
  y = heading(doc, 'Indicateurs de Qualite et Delais de Revue', y);

  // Capture charts
  const imgQuality = await captureElement('pdf-chart-quality_score');
  const imgMerged = await captureElement('pdf-chart-merged_rate');
  const imgReview = await captureElement('pdf-chart-review_time');

  // Row 1 side-by-side
  const colW = (CW - 6) / 2;
  const h = 52;
  
  drawChartBox(doc, {
    title: 'Taux d\'Approbation (%)',
    img: imgQuality,
    x: L,
    y,
    w: colW,
    h
  });

  drawChartBox(doc, {
    title: 'Taux de Fusion (%)',
    img: imgMerged,
    x: L + colW + 6,
    y,
    w: colW,
    h
  });

  y += h + 8;

  // Row 2 side-by-side: Review time and IA card
  drawChartBox(doc, {
    title: 'Temps de Revue Moyen (h)',
    img: imgReview,
    x: L,
    y,
    w: colW,
    h
  });

  // IA Insight Card
  const rx = L + colW + 6;
  fill(doc, TINT.indigo); doc.roundedRect(rx, y, colW, h, 2, 2, 'F');
  fill(doc, P.indigo); doc.rect(rx, y, 3.5, h, 'F');
  
  text(doc, P.indigo); font(doc, 8, 'bold');
  doc.text('Analyse de Qualite & Processus', rx + 8, y + 6);
  
  text(doc, P.navy); font(doc, 7, 'normal');
  doc.text(
    'Le taux d\'approbation mesure la rigueur des revues (pourcentage de MRs approuvees avant fusion). Le taux de fusion montre l\'efficacite de l\'integration des developpements. Le temps de revue moyen indique le temps requis pour relire et valider le code avant sa livraison.',
    rx + 8, y + 13, { maxWidth: colW - 12, lineHeightFactor: 1.45 }
  );

  y += h + 12;

  // Companies targets box at the bottom of the page
  const boxY = y;
  fill(doc, P.light); doc.roundedRect(L, boxY, CW, 28, 2, 2, 'F');
  fill(doc, P.blue); doc.rect(L, boxY, 3, 28, 'F');
  
  text(doc, P.navy); font(doc, 8, 'bold');
  doc.text('Objectifs et Seuils de Reference Industriels', L + 8, boxY + 6);
  
  font(doc, 7, 'normal');
  const guidelines = [
    '- Taux d\'approbation cible : >= 80% pour garantir la securite intellectuelle et la relecture par les pairs.',
    '- Taux de fusion cible : >= 85% pour eviter l\'accumulation de branches mortes ou de developpements obsoletes.',
    '- Temps de revue cible : <= 24 heures afin de preserver la fluidite de la chaine CI/CD (limiter les blocages).'
  ];
  guidelines.forEach((line, idx) => {
    doc.text(s(line), L + 8, boxY + 12 + idx * 4.5);
  });
}

// ─── Metric Evolution Trend Mini-Table Helper ─────────────────────────────────
function renderMetricTrendTable(doc, { title, metricId, trends, periods, x, y, w, isPercentage = false, isTime = false }) {
  // Draw header of mini-table
  fill(doc, P.navy); doc.rect(x, y, w, 6, 'F');
  text(doc, P.white); font(doc, 6.5, 'bold');
  doc.text(s(title), x + 3, y + 4.2);
  
  // Period columns headers
  const colW = (w - 42) / 3;
  periods.slice(-3).forEach((p, i) => {
    doc.text(s(shortPeriod(p)), x + 42 + i * colW, y + 4.2, { align: 'right' });
  });
  doc.text('Evol.', x + w - 3, y + 4.2, { align: 'right' });
  
  y += 6;
  
  // Extract unique entities
  const entities = [...new Set(trends.filter(t => t.entity_name !== 'Global' && t.entity_name !== 'Autres / Non-assignes').map(t => t.entity_name))];
  
  entities.forEach((entity, idx) => {
    fill(doc, idx % 2 === 0 ? P.white : P.light);
    doc.rect(x, y, w, 5.5, 'F');
    
    text(doc, P.navy); font(doc, 6, 'bold');
    doc.text(s(entity), x + 3, y + 3.8);
    
    // Values for last 3 periods
    const last3Periods = periods.slice(-3);
    const pValues = [];
    
    last3Periods.forEach((p, i) => {
      const item = trends.find(t => t.entity_name === entity && t.period_label === p);
      let val = item && item.metrics ? item.metrics[metricId] : null;
      pValues.push(val);
      
      let valStr = '—';
      if (val != null) {
        if (isPercentage) valStr = (val <= 1 ? val * 100 : val).toFixed(0) + '%';
        else if (isTime) valStr = val.toFixed(1) + 'h';
        else valStr = val.toFixed(1);
      }
      text(doc, P.navy); font(doc, 6, 'normal');
      doc.text(valStr, x + 42 + i * colW, y + 3.8, { align: 'right' });
    });
    
    // Delta calculation
    let deltaStr = '—';
    let deltaColor = P.gray;
    const firstVal = pValues[0];
    const lastVal = pValues[pValues.length - 1];
    
    if (firstVal != null && lastVal != null && firstVal > 0) {
      const delta = ((lastVal - firstVal) / firstVal) * 100;
      deltaStr = (delta >= 0 ? '+' : '') + delta.toFixed(0) + '%';
      
      if (metricId === 'review_time') {
        // For review time, decrease is good
        deltaColor = delta <= 0 ? P.green : P.red;
      } else {
        deltaColor = delta >= 0 ? P.green : P.red;
      }
    }
    
    text(doc, deltaColor); font(doc, 6, 'bold');
    doc.text(deltaStr, x + w - 3, y + 3.8, { align: 'right' });
    
    y += 5.5;
  });
}

// ─── PAGE 4 ── Historique Global des KPIs ──────────────────────────────────────
function buildTrendsDashboardPage(doc, { trends }) {
  const now = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });

  fill(doc, P.light); doc.rect(0, 0, W, 14, 'F');
  text(doc, P.navy); font(doc, 9, 'bold');
  doc.text('TABLEAU DE BORD D\'EVOLUTION DES KPIS', L, 9.5);
  text(doc, P.gray); font(doc, 7, 'normal');
  doc.text(s(now), W - R, 9.5, { align: 'right' });

  let y = 24;

  const periods = [...new Set((trends || []).map(t => t.period_label))];
  const colW = (CW - 8) / 2;

  // Row 1
  renderMetricTrendTable(doc, {
    title: 'Velocite (Commits / Dev)',
    metricId: 'velocity',
    trends,
    periods,
    x: L,
    y,
    w: colW
  });

  renderMetricTrendTable(doc, {
    title: 'Livraison (MRs / Dev)',
    metricId: 'mr_rate',
    trends,
    periods,
    x: L + colW + 8,
    y,
    w: colW
  });

  y += 38; // space out rows

  // Row 2
  renderMetricTrendTable(doc, {
    title: 'Taux d\'Approbation (%)',
    metricId: 'quality_score',
    trends,
    periods,
    x: L,
    y,
    w: colW,
    isPercentage: true
  });

  renderMetricTrendTable(doc, {
    title: 'Taux de Fusion (%)',
    metricId: 'merged_rate',
    trends,
    periods,
    x: L + colW + 8,
    y,
    w: colW,
    isPercentage: true
  });

  y += 38;

  // Row 3
  renderMetricTrendTable(doc, {
    title: 'Temps de Revue Moyen (h)',
    metricId: 'review_time',
    trends,
    periods,
    x: L,
    y,
    w: colW,
    isTime: true
  });

  // IA Insight Card next to it
  const rx = L + colW + 8;
  fill(doc, TINT.indigo); doc.roundedRect(rx, y, colW, 23, 2, 2, 'F');
  fill(doc, P.indigo); doc.rect(rx, y, 3, 23, 'F');
  text(doc, P.indigo); font(doc, 7.5, 'bold');
  doc.text('Note d\'Analyse Executive', rx + 7, y + 6);
  text(doc, P.navy); font(doc, 6.5, 'normal');
  doc.text(
    'Ce tableau de bord d\'evolution montre la dynamique historique de livraison, de qualite et de relecture sur les 3 dernieres periodes. Utile pour suivre la stabilite operationnelle.',
    rx + 7, y + 11.5, { maxWidth: colW - 12, lineHeightFactor: 1.35 }
  );
}

// ─── PAGE 5 ── Intelligence & Recommandations ─────────────────────────────────
function buildIntelligencePage(doc, { intelligenceData, teamIntelligenceData }) {
  const now = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });

  fill(doc, P.light); doc.rect(0, 0, W, 14, 'F');
  text(doc, P.navy); font(doc, 9, 'bold');
  doc.text('INTELLIGENCE DECISIONNELLE & RECOMMANDATIONS IA', L, 9.5);
  text(doc, P.gray); font(doc, 7, 'normal');
  doc.text(s(now), W - R, 9.5, { align: 'right' });

  let y = 24;

  // ── 1. KPI HUD SUMMARY ───────────────────────────────────────────────────────
  const siteAnomalies = (intelligenceData?.anomalies?.length ?? 0) + (intelligenceData?.trend_analysis?.alerts?.filter(a => a.severity !== 'info')?.length ?? 0);
  const teamAnomalies = (teamIntelligenceData?.anomalies?.length ?? 0) + (teamIntelligenceData?.trend_analysis?.alerts?.filter(a => a.severity !== 'info')?.length ?? 0);
  const totalAnomalies = siteAnomalies + teamAnomalies;

  const siteRecs = intelligenceData?.recommendations?.length ?? 0;
  const teamRecs = teamIntelligenceData?.recommendations?.length ?? 0;
  const totalRecs = siteRecs + teamRecs;

  const summaryStats = [
    { label: 'Anomalies Detectees', value: String(totalAnomalies), color: totalAnomalies > 0 ? P.red : P.green, tint: totalAnomalies > 0 ? TINT.red : TINT.green },
    { label: 'Recommandations Gen.', value: String(totalRecs), color: P.blue, tint: TINT.blue }
  ];

  const cardW = (CW - 3) / 2;
  summaryStats.forEach((stat, i) => {
    const cx = L + i * (cardW + 3);
    fill(doc, stat.tint); doc.roundedRect(cx, y, cardW, 16, 2, 2, 'F');
    fill(doc, stat.color); doc.rect(cx, y, 3.5, 16, 'F');

    text(doc, stat.color); font(doc, 11, 'bold');
    doc.text(stat.value, cx + 8, y + 6.5);
    text(doc, P.navy); font(doc, 6.5, 'bold');
    doc.text(s(stat.label), cx + 8, y + 12);
  });

  y += 24;

  // ── 2. TWO-COLUMN LAYOUT (50% / 50% split) ──────────────────────────────────
  const midW = (CW - 8) / 2;
  const leftX = L;
  const rightX = L + midW + 8;
  const startY = y;

  // ── LEFT COLUMN: ALERTS & KEY ANOMALIES ────────────────────────────────────
  let ly = startY;
  
  // Header left
  fill(doc, P.blue); doc.rect(leftX, ly + 0.5, 2.5, 5, 'F');
  text(doc, P.navy); font(doc, 9, 'bold');
  doc.text('Alerte & Derive Opérationnelle', leftX + 5, ly + 4.5);
  ly += 9;

  // Gather alerts
  const alertsList = [];
  if (intelligenceData?.trend_analysis?.alerts) {
    intelligenceData.trend_analysis.alerts.forEach(a => alertsList.push({ text: a.detail || a.message, severity: a.severity || 'medium', scope: 'Site' }));
  }
  if (teamIntelligenceData?.trend_analysis?.alerts) {
    teamIntelligenceData.trend_analysis.alerts.forEach(a => alertsList.push({ text: a.detail || a.message, severity: a.severity || 'medium', scope: 'Equipe' }));
  }

  if (alertsList.length === 0) {
    fill(doc, TINT.green); doc.roundedRect(leftX, ly, midW, 20, 2, 2, 'F');
    fill(doc, P.green); doc.rect(leftX, ly, 3, 20, 'F');
    text(doc, P.green); font(doc, 7.5, 'bold');
    doc.text('NOMINAL — Aucun Signal Critique', leftX + 6, ly + 6);
    text(doc, P.navy); font(doc, 6.5, 'normal');
    doc.text('Les flux de livraison et de relecture sont stables', leftX + 6, ly + 11.5);
    doc.text('sur l\'ensemble du périmètre évalué.', leftX + 6, ly + 15.5);
    ly += 25;
  } else {
    // Show top 3 alerts
    alertsList.slice(0, 3).forEach(alert => {
      const isCrit = alert.severity === 'high' || alert.severity === 'danger';
      const aColor = isCrit ? P.red : P.amber;
      const aTint = isCrit ? TINT.red : TINT.amber;

      fill(doc, aTint); doc.roundedRect(leftX, ly, midW, 22, 2, 2, 'F');
      fill(doc, aColor); doc.rect(leftX, ly, 3, 22, 'F');

      text(doc, aColor); font(doc, 7, 'bold');
      doc.text(s(`[ANOMALIE ${alert.scope.toUpperCase()}]`), leftX + 6, ly + 5.5);

      text(doc, P.navy); font(doc, 6.8, 'normal');
      doc.text(s(alert.text), leftX + 6, ly + 11.5, { maxWidth: midW - 12, lineHeightFactor: 1.35 });
      ly += 26;
    });
  }

  // Best practice sharing / Site comparisons
  if (ly + 28 < H - 24) {
    fill(doc, P.blue); doc.rect(leftX, ly + 0.5, 2.5, 5, 'F');
    text(doc, P.navy); font(doc, 9, 'bold');
    doc.text('Diagnostic de Performance', leftX + 5, ly + 4.5);
    ly += 9;

    let diagText = "L'analyse statistique montre des flux stables. ";
    if (intelligenceData?.summary) {
      diagText = s(intelligenceData.summary);
    } else if (teamIntelligenceData?.summary) {
      diagText = s(teamIntelligenceData.summary);
    }

    fill(doc, P.light); doc.roundedRect(leftX, ly, midW, 30, 2, 2, 'F');
    fill(doc, P.navy); doc.rect(leftX, ly, 3, 30, 'F');
    text(doc, P.navy); font(doc, 6.8, 'normal');
    doc.text(diagText, leftX + 7, ly + 6.5, { maxWidth: midW - 14, lineHeightFactor: 1.45 });
  }

  // ── RIGHT COLUMN: STRATEGIC RECOMMENDATIONS ────────────────────────────────
  let ry = startY;

  // Header right
  fill(doc, P.blue); doc.rect(rightX, ry + 0.5, 2.5, 5, 'F');
  text(doc, P.navy); font(doc, 9, 'bold');
  doc.text('Recommandations & Actions RH', rightX + 5, ry + 4.5);
  ry += 9;

  // Gather Recommendations (RH and AI)
  const recommendationsList = [];
  
  if (intelligenceData?.trend_analysis?.rh_recommendations) {
    intelligenceData.trend_analysis.rh_recommendations.forEach(r => {
      recommendationsList.push({
        category: r.category || 'RH',
        priority: r.priority || 'moyenne',
        message: r.message,
        color: r.color === '#ef4444' ? P.red : r.color === '#f59e0b' ? P.amber : P.green
      });
    });
  }
  if (teamIntelligenceData?.trend_analysis?.rh_recommendations) {
    teamIntelligenceData.trend_analysis.rh_recommendations.forEach(r => {
      recommendationsList.push({
        category: r.category || 'RH',
        priority: r.priority || 'moyenne',
        message: r.message,
        color: r.color === '#ef4444' ? P.red : r.color === '#f59e0b' ? P.amber : P.green
      });
    });
  }

  // Add AI recommendations strings
  if (intelligenceData?.recommendations) {
    intelligenceData.recommendations.filter(r => !r.startsWith('[')).forEach(r => {
      recommendationsList.push({
        category: 'Synthese IA',
        priority: 'basse',
        message: r,
        color: P.indigo
      });
    });
  }

  if (recommendationsList.length === 0) {
    fill(doc, P.light); doc.roundedRect(rightX, ry, midW, 20, 2, 2, 'F');
    text(doc, P.gray); font(doc, 7, 'italic');
    doc.text('Aucune action requise identifiee.', rightX + 6, ry + 11);
    ry += 25;
  } else {
    // Show top 4 recommendations
    recommendationsList.slice(0, 4).forEach(rec => {
      const isHigh = rec.priority === 'haute';
      const tint = isHigh ? TINT.red : rec.priority === 'moyenne' ? TINT.amber : TINT.indigo;
      const color = isHigh ? P.red : rec.priority === 'moyenne' ? P.amber : P.indigo;

      fill(doc, P.white); doc.roundedRect(rightX, ry, midW, 22, 2, 2, 'F');
      stroke(doc, P.border); lw(doc, 0.25); doc.roundedRect(rightX, ry, midW, 22, 2, 2, 'S');
      fill(doc, color); doc.rect(rightX, ry, 3.5, 22, 'F');

      text(doc, color); font(doc, 6.8, 'bold');
      doc.text(s(`[${rec.category.toUpperCase()}]`), rightX + 7, ry + 5.5);

      text(doc, P.navy); font(doc, 6.5, 'normal');
      doc.text(s(rec.message), rightX + 7, ry + 11.5, { maxWidth: midW - 14, lineHeightFactor: 1.4 });
      ry += 26;
    });
  }

  // ── 3. BOTTOM CERTIFICATION SEAL ───────────────────────────────────────────
  y = H - 36;
  hRule(doc, y, P.border); y += 6;
  fill(doc, P.light); doc.roundedRect(L, y, CW, 14, 2, 2, 'F');
  fill(doc, P.blue); doc.rect(L, y, 3, 14, 'F');
  text(doc, P.blue); font(doc, 7.5, 'bold');
  doc.text('MOTEUR D\'INTELLIGENCE DECISIONNELLE TELNET v3.0', L + 8, y + 5.5);
  text(doc, P.gray); font(doc, 6.5, 'normal');
  doc.text(
    'Rapport certifie conforme genere de maniere autonome par l\'IA de pilotage. Classification : Usage Interne — Management Strategique.',
    L + 8, y + 10.5, { maxWidth: CW - 14 }
  );
}

// ─── Main Export ──────────────────────────────────────────────────────────────
export async function exportDashboardPDF({
  projectName,
  period,
  healthScore,
  insights,
  trends,
  chartElementId = 'kpi-evolution-chart',
  executiveSummary,
  intelligenceData,
  teamIntelligenceData,
}) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const logo    = await loadLogoBase64();
  const entities = [...new Set((trends || []).map(t => t.entity_name))].length;
  const date     = new Date().toLocaleDateString('fr-FR', {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
  });
  const TOTAL = 6;

  // Page 1 — Cover
  buildCover(doc, { project: projectName, period, date, logo, score: healthScore, entities });
  pageChrome(doc, 1, TOTAL, projectName);

  // Page 2 — Executive Dashboard
  doc.addPage();
  buildExecutivePage(doc, { score: healthScore, insights, trends, execSummary: executiveSummary });
  pageChrome(doc, 2, TOTAL, projectName);

  // Page 3 — Comparative Analysis (Velocity & Delivery)
  doc.addPage();
  await buildComparativePage(doc, { trends });
  pageChrome(doc, 3, TOTAL, projectName);

  // Page 4 — Quality & Review Process
  doc.addPage();
  await buildQualityPage(doc, { trends });
  pageChrome(doc, 4, TOTAL, projectName);

  // Page 5 — Trends Dashboard (Mini-tables)
  doc.addPage();
  buildTrendsDashboardPage(doc, { trends });
  pageChrome(doc, 5, TOTAL, projectName);

  // Page 6 — Intelligence & Recommendations
  doc.addPage();
  buildIntelligencePage(doc, { intelligenceData, teamIntelligenceData });
  pageChrome(doc, 6, TOTAL, projectName);

  // Download
  const safe = s(projectName).replace(/[^a-zA-Z0-9]/g, '_');
  const d    = new Date().toISOString().slice(0, 10);
  doc.save(`TELNET_KPI_Report_${safe}_${d}.pdf`);
}

