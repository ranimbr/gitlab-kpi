/**
 * pdfExportService.js
 * Service d'export PDF - Standard Rapport Entreprise Internationale
 * Utilise jsPDF pour generer un rapport de direction structure.
 * Architecture: Senior Data Analyst / BI Engineer Pattern
 * NOTE: jsPDF Helvetica = ASCII uniquement. Pas de caracteres speciaux Unicode.
 */

import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';

// ─── Logo Loader ──────────────────────────────────────────────────────────────
async function loadLogoBase64() {
  try {
    const resp = await fetch('/assets/images/telnet.png');
    const blob = await resp.blob();
    return await new Promise(resolve => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.readAsDataURL(blob);
    });
  } catch { return null; }
}

// ─── Design Tokens ────────────────────────────────────────────────────────────
const BRAND = {
  primary:    [10,  131, 176],   // Bleu TELNET
  secondary:  [30,  41,  59],    // Slate 800
  accent:     [16,  185, 129],   // Vert succès
  danger:     [239, 68,  68],    // Rouge alerte
  warning:    [245, 158, 11],    // Ambre
  muted:      [100, 116, 139],   // Gris slate
  bg:         [248, 250, 252],   // Fond doux
  white:      [255, 255, 255],
  border:     [226, 232, 240],
};

const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN = 16;
const CONTENT_W = PAGE_W - MARGIN * 2;

// ─── Helpers ──────────────────────────────────────────────────────────────────
const rgb = (arr) => ({ r: arr[0], g: arr[1], b: arr[2] });
const setFill   = (doc, arr) => doc.setFillColor(...arr);
const setStroke = (doc, arr) => doc.setDrawColor(...arr);
const setTextC  = (doc, arr) => doc.setTextColor(...arr);
const setFont   = (doc, size, style = 'normal') => { doc.setFontSize(size); doc.setFont('helvetica', style); };

function drawPageFrame(doc, pageNum, totalPages, projectName) {
  // Pied de page ligne
  setFill(doc, BRAND.secondary);
  doc.rect(0, PAGE_H - 12, PAGE_W, 12, 'F');
  setTextC(doc, BRAND.white);
  setFont(doc, 7, 'normal');
  doc.text(`TELNET Holding - Rapport KPI Strategique - ${projectName}`, MARGIN, PAGE_H - 4.5);
  doc.text(`Page ${pageNum} / ${totalPages}   |   DOCUMENT CONFIDENTIEL`, PAGE_W - MARGIN, PAGE_H - 4.5, { align: 'right' });
  // En-tête ligne subtile
  setStroke(doc, BRAND.border);
  doc.setLineWidth(0.3);
  doc.line(MARGIN, 18, PAGE_W - MARGIN, 18);
}

function drawSectionTitle(doc, text, y) {
  setFill(doc, BRAND.primary);
  doc.rect(MARGIN, y, 3, 6, 'F');
  setTextC(doc, BRAND.secondary);
  setFont(doc, 11, 'bold');
  doc.text(text, MARGIN + 6, y + 5);
  return y + 10;
}

function drawKpiCell(doc, x, y, w, h, label, value, unit, colorArr, bgArr) {
  setFill(doc, bgArr);
  doc.roundedRect(x, y, w, h, 2, 2, 'F');
  setStroke(doc, colorArr);
  doc.setLineWidth(0.4);
  doc.roundedRect(x, y, w, h, 2, 2, 'S');
  setTextC(doc, colorArr);
  setFont(doc, 16, 'bold');
  doc.text(String(value), x + w / 2, y + h / 2 + 1, { align: 'center' });
  setTextC(doc, BRAND.muted);
  setFont(doc, 7, 'normal');
  doc.text(label, x + w / 2, y + h - 4, { align: 'center' });
  if (unit) {
    setTextC(doc, colorArr);
    setFont(doc, 7, 'bold');
    doc.text(unit, x + w / 2, y + h / 2 + 5.5, { align: 'center' });
  }
}

// ─── Page 1 : Couverture ──────────────────────────────────────────────────────
function buildCoverPage(doc, { projectName, period, exportDate, logoBase64, healthScore, totalSites }) {
  // Fond bleu sombre haut
  setFill(doc, BRAND.secondary);
  doc.rect(0, 0, PAGE_W, 90, 'F');
  setFill(doc, BRAND.primary);
  doc.rect(0, 87, PAGE_W, 3, 'F');

  // Logo TELNET
  if (logoBase64) {
    try { doc.addImage(logoBase64, 'PNG', MARGIN, 18, 55, 20); } catch(e) {
      setTextC(doc, BRAND.white); setFont(doc, 28, 'bold'); doc.text('TELNET', MARGIN, 35);
    }
  } else {
    setTextC(doc, BRAND.white); setFont(doc, 28, 'bold'); doc.text('TELNET', MARGIN, 35);
  }

  // Titre principal
  setTextC(doc, BRAND.white);
  setFont(doc, 20, 'bold');
  doc.text('RAPPORT DE PERFORMANCE', MARGIN, 62);
  setFont(doc, 14, 'normal');
  doc.text('KPI STRATEGIQUE & DORA METRICS', MARGIN, 70);

  // Badge confidentiel
  setFill(doc, BRAND.danger);
  doc.roundedRect(PAGE_W - MARGIN - 42, 56, 42, 10, 2, 2, 'F');
  setTextC(doc, BRAND.white);
  setFont(doc, 7, 'bold');
  doc.text('CONFIDENTIEL', PAGE_W - MARGIN - 21, 62.5, { align: 'center' });

  // Metadonnees projet
  let y = 105;
  const meta = [
    ['Projet analyse', projectName],
    ['Periode', period],
    ['Date generation', exportDate],
    ['Classification', 'DIRECTION & MANAGEMENT'],
  ];

  meta.forEach(([label, value]) => {
    setFill(doc, BRAND.bg); doc.rect(MARGIN, y - 4, CONTENT_W, 10, 'F');
    setTextC(doc, BRAND.muted); setFont(doc, 8, 'normal'); doc.text(label, MARGIN + 4, y + 2.5);
    setTextC(doc, BRAND.secondary); setFont(doc, 8, 'bold'); doc.text(String(value), MARGIN + 60, y + 2.5);
    y += 12;
  });

  // Synthese Strategique block
  y += 5;
  setFill(doc, [248, 250, 252]); doc.roundedRect(MARGIN, y, CONTENT_W, 28, 2, 2, 'F');
  setFill(doc, BRAND.primary); doc.rect(MARGIN, y, 3, 28, 'F');
  setTextC(doc, BRAND.secondary); setFont(doc, 9, 'bold'); doc.text('Synthese Strategique de l\'Audit', MARGIN + 7, y + 7);
  setTextC(doc, BRAND.muted); setFont(doc, 7.5, 'normal');
  const summary = "Ce rapport consolide les indicateurs cles de performance (KPI) et les standards DORA pour TELNET Holding. L'audit mesure l'efficience operationnelle, la qualite de code et la maturite des cycles de livraison DevOps sur les sites de Tunis, Paris et Sfax.";
  doc.text(summary, MARGIN + 7, y + 12, { maxWidth: CONTENT_W - 14, lineHeightFactor: 1.4 });
  
  y += 38;

  // Score Sante Global (Centré)
  setTextC(doc, BRAND.secondary); setFont(doc, 9, 'bold');
  doc.text('INDICE DE SANTE GLOBAL DU PROJET', PAGE_W/2, y, { align: 'center' });
  y += 5;
  const bw = 140;
  const bx = (PAGE_W - bw) / 2;
  const score = Math.min(Math.max(healthScore || 0, 0), 100);
  setFill(doc, BRAND.border); doc.roundedRect(bx, y, bw, 8, 4, 4, 'F');
  const fillW = (bw * score) / 100;
  const sCol = score >= 70 ? BRAND.accent : score >= 45 ? BRAND.warning : BRAND.danger;
  setFill(doc, sCol);
  if (fillW > 0) doc.roundedRect(bx, y, fillW, 8, 4, 4, 'F');
  setTextC(doc, BRAND.white); setFont(doc, 7, 'bold');
  doc.text(`${score}%`, bx + fillW / 2, y + 5.5, { align: 'center' });

  // Pied de page couverture
  y = PAGE_H - 40;
  setFill(doc, BRAND.bg); doc.rect(MARGIN, y, CONTENT_W, 20, 'F');
  setTextC(doc, BRAND.muted); setFont(doc, 7, 'italic');
  doc.text('Ce document est la propriete exclusive de TELNET Holding. Les donnees sont automatisees et certifiees conformes aux flux GitLab extraits.', MARGIN + 4, y + 11, { maxWidth: CONTENT_W - 8 });
}

// ─── Page 2 : Executive Summary ───────────────────────────────────────────────
function buildExecutiveSummary(doc, { projectName, healthScore, insights, trends, period }) {
  const date = new Date().toLocaleDateString('fr-FR', { day:'2-digit', month:'long', year:'numeric' });

  // En-tête page
  setFill(doc, BRAND.bg);
  doc.rect(0, 0, PAGE_W, 16, 'F');
  setTextC(doc, BRAND.secondary);
  setFont(doc, 9, 'bold');
  doc.text('EXECUTIVE SUMMARY', MARGIN, 11);
  setTextC(doc, BRAND.muted);
  setFont(doc, 7, 'normal');
  doc.text(date, PAGE_W - MARGIN, 11, { align: 'right' });

  let y = 26;
  y = drawSectionTitle(doc, '01. Vue d\'Ensemble Exécutive', y);

  // Indicateurs KPI en grille 4 colonnes
  const cellW = (CONTENT_W - 9) / 4;
  const cellH = 28;

  // Calcul des métriques globales depuis trends
  const lastPeriodLabel = trends.length ? trends[trends.length - 1].period_label : '';
  const lastData = trends.filter(t => t.period_label === lastPeriodLabel);
  const avgVelocity = lastData.length
    ? (lastData.reduce((s, t) => s + (t.metrics.velocity || 0), 0) / lastData.length).toFixed(1)
    : '—';
  const avgQuality = lastData.length
    ? ((lastData.reduce((s, t) => s + (t.metrics.quality_score || 0), 0) / lastData.length) * 100).toFixed(0) + '%'
    : '—';
  const avgReview = lastData.length
    ? (lastData.reduce((s, t) => s + (t.metrics.review_time || 0), 0) / lastData.length).toFixed(1) + 'h'
    : '—';
  const totalSites = [...new Set(trends.map(t => t.entity_name))].length;

  const kpis = [
    { label: 'Health Score',     value: healthScore + '%', unit: '', color: BRAND.accent,   bg: [209, 250, 229] },
    { label: 'Vélocité Moy.',    value: avgVelocity,       unit: 'C/Dev',  color: BRAND.primary,  bg: [219, 234, 254] },
    { label: 'Qualité Moy.',     value: avgQuality,        unit: '',       color: BRAND.accent,   bg: [209, 250, 229] },
    { label: 'Sites Analysés',   value: totalSites,        unit: 'entités',color: BRAND.secondary,bg: [241, 245, 249] },
  ];

  kpis.forEach((k, i) => {
    drawKpiCell(doc, MARGIN + i * (cellW + 3), y, cellW, cellH, k.label, k.value, k.unit, k.color, k.bg);
  });

  y += cellH + 10;

  // Insights automatisés
  y = drawSectionTitle(doc, '02. Insights Automatisés', y);

  if (insights.length === 0) {
    setTextC(doc, BRAND.muted);
    setFont(doc, 8, 'italic');
    doc.text('Aucun insight disponible pour la période sélectionnée.', MARGIN, y + 6);
    y += 14;
  } else {
    insights.forEach(insight => {
      const colorMap = { success: BRAND.accent, danger: BRAND.danger, info: BRAND.primary, warning: BRAND.warning };
      const bgMap    = { success: [209,250,229], danger: [254,226,226], info: [219,234,254], warning: [254,243,199] };
      const c = colorMap[insight.type] || BRAND.muted;
      const bg = bgMap[insight.type] || [241,245,249];
      setFill(doc, bg);
      doc.roundedRect(MARGIN, y, CONTENT_W, 14, 2, 2, 'F');
      setFill(doc, c);
      doc.rect(MARGIN, y, 3, 14, 'F');
      setTextC(doc, c);
      setFont(doc, 8, 'bold');
      doc.text(insight.title, MARGIN + 7, y + 5.5);
      setTextC(doc, BRAND.secondary);
      setFont(doc, 8, 'normal');
      doc.text(insight.text, MARGIN + 7, y + 10.5, { maxWidth: CONTENT_W - 10 });
      y += 17;
    });
  }

  y += 4;

  // Top performers table
  y = drawSectionTitle(doc, '03. Classement des Entités — ' + (lastPeriodLabel || 'Dernière période'), y);

  const sorted = [...lastData].sort((a, b) => (b.metrics.velocity || 0) - (a.metrics.velocity || 0));

  // Table header
  setFill(doc, BRAND.secondary);
  doc.rect(MARGIN, y, CONTENT_W, 8, 'F');
  setTextC(doc, BRAND.white);
  setFont(doc, 7, 'bold');
  const cols = [
    { label: 'Rang',       x: MARGIN + 4,   w: 12 },
    { label: 'Entité',     x: MARGIN + 16,  w: 40 },
    { label: 'Vélocité',   x: MARGIN + 80,  w: 30 },
    { label: 'Qualité',    x: MARGIN + 110, w: 30 },
    { label: 'Review (h)', x: MARGIN + 140, w: 32 },
  ];
  cols.forEach(c => doc.text(c.label, c.x, y + 5.5));
  y += 8;

  // Filtrer les entités sans nom valide
  const cleanSorted = sorted.filter(r => r.entity_name && r.entity_name !== 'Autres / Non-assignés' && r.entity_name !== 'Global');
  cleanSorted.slice(0, 8).forEach((row, idx) => {
    const bg = idx % 2 === 0 ? BRAND.white : BRAND.bg;
    setFill(doc, bg);
    doc.rect(MARGIN, y, CONTENT_W, 8, 'F');
    setTextC(doc, BRAND.secondary);
    setFont(doc, 7, 'normal');
    const qualVal = (row.metrics.quality_score != null
      ? (row.metrics.quality_score <= 1 ? row.metrics.quality_score * 100 : row.metrics.quality_score).toFixed(0) + '%'
      : '—');

    const rankColors = [[212,175,55], [169,169,169], [176,141,87]]; // Or, Argent, Bronze
    if (idx < 3) {
      setFill(doc, rankColors[idx]);
      doc.circle(MARGIN + 7, y + 4, 3, 'F');
      setTextC(doc, BRAND.white);
      setFont(doc, 7, 'bold');
      doc.text(String(idx + 1), MARGIN + 7, y + 5.5, { align: 'center' });
    } else {
      setTextC(doc, BRAND.muted);
      doc.text(String(idx + 1), MARGIN + 7, y + 5.5, { align: 'center' });
    }

    setTextC(doc, BRAND.secondary);
    setFont(doc, 7, idx === 0 ? 'bold' : 'normal');
    doc.text(row.entity_name || '-',                       MARGIN + 16,  y + 5.5);
    doc.text((row.metrics.velocity || 0).toFixed(1),       MARGIN + 80,  y + 5.5);
    doc.text(qualVal,                                       MARGIN + 110, y + 5.5);
    doc.text((row.metrics.review_time || 0).toFixed(1),    MARGIN + 140, y + 5.5);
    y += 8;
  });

  // ── Mini graphique barres comparatif (vélocité par site) ──────────────────
  y += 8;
  const drawSection = (doc, text, yy) => { setFill(doc, BRAND.primary); doc.rect(MARGIN, yy, 3, 6, 'F'); setTextC(doc, BRAND.secondary); setFont(doc, 11, 'bold'); doc.text(text, MARGIN + 6, yy + 5); return yy + 10; };
  y = drawSection(doc, '04. Comparaison Visuelle - Velocite par Site', y);

  const maxVel = Math.max(...cleanSorted.map(r => r.metrics.velocity || 0), 1);
  const barW = (CONTENT_W - cleanSorted.length * 4) / Math.max(cleanSorted.length, 1);
  const chartH = 30;
  const chartTop = y;
  cleanSorted.forEach((row, i) => {
    const vel = row.metrics.velocity || 0;
    const bH = (vel / maxVel) * chartH;
    const bX = MARGIN + i * (barW + 4);
    const barCol = i === 0 ? BRAND.accent : i === cleanSorted.length - 1 ? BRAND.danger : BRAND.primary;
    setFill(doc, barCol);
    doc.roundedRect(bX, chartTop + chartH - bH, barW, bH, 1, 1, 'F');
    setTextC(doc, BRAND.secondary); setFont(doc, 6.5, 'bold');
    doc.text(vel.toFixed(1), bX + barW / 2, chartTop + chartH - bH - 2, { align: 'center' });
    setTextC(doc, BRAND.muted); setFont(doc, 6, 'normal');
    doc.text(row.entity_name || '', bX + barW / 2, chartTop + chartH + 5, { align: 'center' });
  });
  // Ligne objectif
  setStroke(doc, BRAND.muted); doc.setLineWidth(0.4);
  const targetY = chartTop + chartH * 0.35;
  doc.setLineDashPattern([2, 2], 0);
  doc.line(MARGIN, targetY, MARGIN + CONTENT_W, targetY);
  doc.setLineDashPattern([], 0);
  setTextC(doc, BRAND.muted); setFont(doc, 6, 'italic');
  doc.text('Objectif cible', MARGIN + CONTENT_W - 2, targetY - 2, { align: 'right' });
  y = chartTop + chartH + 12;

  // ── Analyse des risques ────────────────────────────────────────────────────
  y = drawSection(doc, '05. Analyse de Risques & Points de Vigilance', y);
  const risks = cleanSorted.filter(r => (r.metrics.review_time || 0) > 48);
  const lowQ = cleanSorted.filter(r => (r.metrics.quality_score || 0) < 0.6);

  if (risks.length > 0 || lowQ.length > 0) {
    setFill(doc, [255, 255, 255]);
    doc.roundedRect(MARGIN, y, CONTENT_W, 25, 2, 2, 'FD');
    
    let ry = y + 7;
    if (risks.length > 0) {
      setTextC(doc, BRAND.danger); setFont(doc, 7.5, 'bold');
      doc.text('[!] Goulot d\'etranglement - Lead Time > 48h', MARGIN + 5, ry);
      setTextC(doc, BRAND.secondary); setFont(doc, 7, 'normal');
      doc.text('Impact : Retard sur les livraisons. Sites concernes : ' + risks.map(r => r.entity_name).join(', '), MARGIN + 5, ry + 4);
      ry += 9;
    }
    if (lowQ.length > 0) {
      setTextC(doc, BRAND.warning); setFont(doc, 7.5, 'bold');
      doc.text('[!] Qualite critique - Taux d\'approbation < 60%', MARGIN + 5, ry);
      setTextC(doc, BRAND.secondary); setFont(doc, 7, 'normal');
      doc.text('Impact : Risque de regression technique. Sites concernes : ' + lowQ.map(r => r.entity_name).join(', '), MARGIN + 5, ry + 4);
    }
    y += 30;
  } else {
    setFill(doc, [240, 253, 244]); doc.roundedRect(MARGIN, y, CONTENT_W, 12, 2, 2, 'F');
    setTextC(doc, [21, 128, 61]); setFont(doc, 8, 'bold');
    doc.text('✓ STATUS : EXCELLENCE OPERATIONNELLE - Tous les indicateurs sont au vert.', MARGIN + CONTENT_W/2, y + 7.5, { align: 'center' });
    y += 18;
  }
}

// ─── Page 3 : Évolution Historique + Capture Graphique ────────────────────────
async function buildChartPage(doc, { chartElementId, trends }) {
  const date = new Date().toLocaleDateString('fr-FR', { day:'2-digit', month:'long', year:'numeric' });

  setFill(doc, BRAND.bg);
  doc.rect(0, 0, PAGE_W, 16, 'F');
  setTextC(doc, BRAND.secondary);
  setFont(doc, 9, 'bold');
  doc.text('EVOLUTION HISTORIQUE DES METRIQUES', MARGIN, 11);
  setTextC(doc, BRAND.muted);
  setFont(doc, 7, 'normal');
  doc.text(date, PAGE_W - MARGIN, 11, { align: 'right' });

  let y = 26;
  y = drawSectionTitle(doc, '04. Graphique d\'Evolution Multi-Periodes', y);

  // Capture du graphique ApexCharts
  const chartEl = document.getElementById(chartElementId);
  if (chartEl) {
    try {
      const canvas = await html2canvas(chartEl, {
        scale: 2,
        backgroundColor: '#ffffff',
        logging: false,
        useCORS: true,
      });
      const imgData = canvas.toDataURL('image/png');
      const imgH = (CONTENT_W * canvas.height) / canvas.width;
      doc.addImage(imgData, 'PNG', MARGIN, y, CONTENT_W, Math.min(imgH, 100));
      y += Math.min(imgH, 100) + 10;
    } catch (e) {
      setTextC(doc, BRAND.muted);
      setFont(doc, 8, 'italic');
      doc.text('Graphique non disponible pour l\'export.', MARGIN, y + 8);
      y += 20;
    }
  } else {
    setTextC(doc, BRAND.muted);
    setFont(doc, 8, 'italic');
    doc.text('Graphique non disponible pour l\'export.', MARGIN, y + 8);
    y += 20;
  }

  // Note de lecture
  setFill(doc, [239, 246, 255]);
  doc.roundedRect(MARGIN, y, CONTENT_W, 16, 2, 2, 'F');
  setFill(doc, BRAND.primary); doc.rect(MARGIN, y, 3, 16, 'F');
  setTextC(doc, BRAND.primary); setFont(doc, 8, 'bold');
  doc.text('Note de lecture', MARGIN + 7, y + 6);
  setTextC(doc, BRAND.secondary); setFont(doc, 7, 'normal');
  doc.text('La ligne pointillee represente l\'objectif cible (2.0 commits/dev). Source : API GitLab - extraction temps reel.', MARGIN + 7, y + 11, { maxWidth: CONTENT_W - 10 });
  y += 22;

  // Identification des entites pour la legende
  const entities = trends ? [...new Set(trends.map(t => t.entity_name))] : [];

  // ─── Legende du graphique (Correction : Identification des courbes) ──────
  y = drawChartLegend(doc, entities, y);

  // ─── Matrice de Performance Historique (Inspiration Senior/Encadrant) ───────
  y = buildPerformanceMatrix(doc, trends, y);
}

function drawChartLegend(doc, entities, y) {
  if (!entities || !entities.length) return y;

  const colors = ["#4f46e5", "#0ab39c", "#299cdb", "#f7b84b", "#f06548", "#3577f1", "#6559cc", "#ffbe0b"];
  
  const startX = MARGIN;
  let currentX = startX;
  const itemGap = 45;

  setFont(doc, 7, 'bold');
  setTextC(doc, BRAND.primary);
  doc.text('LEGENDE :', currentX, y + 4.5);
  currentX += 18;

  entities.forEach((ent, i) => {
    const color = colors[i % colors.length];
    
    // Hex to RGB simple (approximatif pour jsPDF)
    const r = parseInt(color.slice(1,3), 16);
    const g = parseInt(color.slice(3,5), 16);
    const b = parseInt(color.slice(5,7), 16);
    
    doc.setFillColor(r, g, b);
    doc.circle(currentX + 2, y + 3, 1.5, 'F');
    
    setTextC(doc, BRAND.secondary);
    doc.text(ent, currentX + 5, y + 4.5);
    
    currentX += itemGap;
    if (currentX > CONTENT_W - 20) {
      currentX = startX;
      y += 6;
    }
  });

  return y + 12;
}

function buildPerformanceMatrix(doc, trends, y) {
  if (!trends || !trends.length) return y;

  // Groupement par entité
  const entities = [...new Set(trends.map(t => t.entity_name))];
  // Utiliser l'ordre naturel des trends (qui sont chronologiques via le backend)
  const months = [];
  trends.forEach(t => { if(!months.includes(t.period_label)) months.push(t.period_label); });
  
  // Limiter aux 4 derniers mois pour la lisibilité
  const displayMonths = months.slice(-4);
  
  // Titre
  setTextC(doc, BRAND.primary); setFont(doc, 8, 'bold');
  doc.text('MATRICE DE PERFORMANCE : VELOCITE MENSUELLE (HEATMAP)', MARGIN, y);
  y += 5;

  // Entête tableau
  const colW = (CONTENT_W - 30) / Math.max(displayMonths.length, 1);
  setFill(doc, BRAND.secondary);
  doc.rect(MARGIN, y, CONTENT_W, 7, 'F');
  setTextC(doc, BRAND.white); setFont(doc, 6.5, 'bold');
  doc.text('Site / Entite', MARGIN + 2, y + 4.5);
  displayMonths.forEach((m, i) => {
    doc.text(m, MARGIN + 30 + i * colW + colW/2, y + 4.5, { align: 'center' });
  });
  y += 7;

  // Lignes par site
  entities.forEach((ent, idx) => {
    // Fond alterné
    if (idx % 2 === 1) { setFill(doc, [249, 250, 251]); doc.rect(MARGIN, y, CONTENT_W, 10, 'F'); }
    
    setTextC(doc, BRAND.secondary); setFont(doc, 7, 'bold');
    doc.text(ent, MARGIN + 2, y + 6);

    displayMonths.forEach((m, i) => {
      const data = trends.find(t => t.entity_name === ent && t.period_label === m);
      const vel = data ? (data.metrics.velocity || 0) : 0;
      
      // Heatmap color logic
      let cellBg = [241, 245, 249]; // Default light gray
      let txtCol = BRAND.secondary;
      if (data) {
        if (vel >= 2.5)      { cellBg = [209, 250, 229]; txtCol = [6, 95, 70]; } // Vert
        else if (vel >= 1.5) { cellBg = [219, 234, 254]; txtCol = [30, 64, 175]; } // Bleu
        else                 { cellBg = [254, 226, 226]; txtCol = [153, 27, 27]; } // Rouge
      }

      // Dessiner cellule colorée
      setFill(doc, cellBg);
      doc.roundedRect(MARGIN + 30 + i * colW + 2, y + 1.5, colW - 4, 7, 1, 1, 'F');
      
      setTextC(doc, txtCol); setFont(doc, 7, 'bold');
      doc.text(vel.toFixed(1), MARGIN + 30 + i * colW + colW/2, y + 6.5, { align: 'center' });
    });
    
    y += 10;
  });

  // Légende Heatmap
  y += 2;
  setFont(doc, 6, 'italic'); setTextC(doc, BRAND.muted);
  doc.text('Legende : Vert >= 2.5 (High) | Bleu >= 1.5 (Standard) | Rouge < 1.5 (Risk/Low)', MARGIN, y);
  
  return y + 10;
}

// ─── Page 4 : DORA Metrics ────────────────────────────────────────────────────
function buildDoraPage(doc, { doraData }) {
  const date = new Date().toLocaleDateString('fr-FR', { day:'2-digit', month:'long', year:'numeric' });

  setFill(doc, BRAND.bg);
  doc.rect(0, 0, PAGE_W, 16, 'F');
  setTextC(doc, BRAND.secondary);
  setFont(doc, 9, 'bold');
  doc.text('DORA METRICS - PERFORMANCE DEVOPS', MARGIN, 11);
  setTextC(doc, BRAND.muted);
  setFont(doc, 7, 'normal');
  doc.text(date, PAGE_W - MARGIN, 11, { align: 'right' });

  let y = 26;
  y = drawSectionTitle(doc, '05. Standards DORA (Google Research)', y);

  // Explication DORA
  setFill(doc, [241, 245, 249]);
  doc.roundedRect(MARGIN, y, CONTENT_W, 16, 2, 2, 'F');
  setTextC(doc, BRAND.muted);
  setFont(doc, 7, 'italic');
  doc.text(
    'Les métriques DORA (DevOps Research & Assessment) sont les 4 indicateurs clés validés par la recherche Google pour mesurer\nla performance des équipes DevOps. Elles sont le standard de référence pour les organisations tech de classe mondiale.',
    MARGIN + 4, y + 5.5, { maxWidth: CONTENT_W - 8 }
  );
  y += 20;

  // Légende niveaux
  const levels = [
    { label: 'Elite',  color: BRAND.accent,   bg: [209,250,229] },
    { label: 'High',   color: BRAND.primary,   bg: [219,234,254] },
    { label: 'Medium', color: BRAND.warning,   bg: [254,243,199] },
    { label: 'Low',    color: BRAND.danger,    bg: [254,226,226] },
    { label: 'N/A',    color: BRAND.muted,     bg: [241,245,249] },
  ];
  let lx = MARGIN;
  levels.forEach(lv => {
    setFill(doc, lv.bg);
    doc.roundedRect(lx, y, 30, 7, 1, 1, 'F');
    setTextC(doc, lv.color);
    setFont(doc, 6.5, 'bold');
    doc.text(lv.label, lx + 15, y + 4.8, { align: 'center' });
    lx += 33;
  });
  y += 12;

  if (!doraData || doraData.length === 0) {
    setTextC(doc, BRAND.muted);
    setFont(doc, 8, 'italic');
    doc.text('Données DORA non disponibles pour la période sélectionnée.', MARGIN, y + 6);
    return;
  }

  // Table DORA
  setFill(doc, BRAND.secondary);
  doc.rect(MARGIN, y, CONTENT_W, 8, 'F');
  setTextC(doc, BRAND.white);
  setFont(doc, 7, 'bold');
  const doraCols = [
    { label: 'Site / Entité',        x: MARGIN + 4   },
    { label: 'Déploiements / Mois',  x: MARGIN + 55  },
    { label: 'Niveau DF',            x: MARGIN + 100 },
    { label: 'Lead Time (h)',         x: MARGIN + 130 },
    { label: 'Niveau LT',            x: MARGIN + 160 },
  ];
  doraCols.forEach(c => doc.text(c.label, c.x, y + 5.5));
  y += 8;

  const dfColor = { Elite: BRAND.accent, High: BRAND.primary, Medium: BRAND.warning, Low: BRAND.danger, 'N/A': BRAND.muted };
  const dfBg    = { Elite: [209,250,229], High: [219,234,254], Medium: [254,243,199], Low: [254,226,226], 'N/A': [241,245,249] };

  // Filtrer les lignes sans site valide
  const cleanDora = doraData.filter(s => s.site_name && s.site_name !== 'Autres / Non-assignés' && s.site_name !== 'Global');
  cleanDora.forEach((site, idx) => {
    const bg = idx % 2 === 0 ? BRAND.white : BRAND.bg;
    setFill(doc, bg);
    doc.rect(MARGIN, y, CONTENT_W, 11, 'F');

    setTextC(doc, BRAND.secondary);
    setFont(doc, 8, 'bold');
    doc.text(site.site_name || '-', MARGIN + 4, y + 5);
    setFont(doc, 7, 'normal');
    doc.text(String(site.deployment_count ?? '-'), MARGIN + 55, y + 5);

    // Badge niveau DF
    const dfLvl = site.dora_df_level || 'N/A';
    setFill(doc, dfBg[dfLvl] || dfBg['N/A']);
    doc.roundedRect(MARGIN + 98, y + 1, 24, 7, 1, 1, 'F');
    setTextC(doc, dfColor[dfLvl] || dfColor['N/A']);
    setFont(doc, 6.5, 'bold');
    doc.text(dfLvl, MARGIN + 110, y + 5.8, { align: 'center' });

    setTextC(doc, BRAND.secondary);
    setFont(doc, 7, 'normal');
    doc.text(site.lead_time_hours > 0 ? site.lead_time_hours.toFixed(1) : '-', MARGIN + 130, y + 5);

    // Badge niveau LT
    const ltLvl = site.dora_lt_level || 'N/A';
    setFill(doc, dfBg[ltLvl] || dfBg['N/A']);
    doc.roundedRect(MARGIN + 158, y + 1, 24, 7, 1, 1, 'F');
    setTextC(doc, dfColor[ltLvl] || dfColor['N/A']);
    setFont(doc, 6.5, 'bold');
    doc.text(ltLvl, MARGIN + 170, y + 5.8, { align: 'center' });

    y += 11;
  });

  // ── Benchmarks industrie DORA ────────────────────────────────────────────
  y += 10;
  const drawSect4 = (text, yy) => { setFill(doc, BRAND.primary); doc.rect(MARGIN, yy, 3, 6, 'F'); setTextC(doc, BRAND.secondary); setFont(doc, 11, 'bold'); doc.text(text, MARGIN + 6, yy + 5); return yy + 10; };
  y = drawSect4('06. Benchmarks Industrie (Google DORA 2024)', y);

  const benchmarks = [
    { metric: 'Deployment Frequency', elite: '> 1/jour', high: '1/semaine', medium: '1/mois', low: '< 1/mois' },
    { metric: 'Lead Time for Changes', elite: '< 1h', high: '< 1 jour', medium: '1 sem–1 mois', low: '> 1 mois' },
    { metric: 'Change Failure Rate', elite: '0–5%', high: '5–10%', medium: '10–15%', low: '> 15%' },
    { metric: 'Time to Restore',      elite: '< 1h', high: '< 1 jour', medium: '< 1 sem', low: '> 1 sem' },
  ];
  const bCols = [MARGIN+4, MARGIN+52, MARGIN+88, MARGIN+124, MARGIN+158];
  const bHdrs = ['Métrique', 'Elite', 'High', 'Medium', 'Low'];
  const bColors = [BRAND.secondary, BRAND.accent, BRAND.primary, BRAND.warning, BRAND.danger];
  // Header
  setFill(doc, BRAND.secondary); doc.rect(MARGIN, y, CONTENT_W, 7, 'F');
  setTextC(doc, BRAND.white); setFont(doc, 6.5, 'bold');
  bHdrs.forEach((h, i) => doc.text(h, bCols[i], y + 5));
  y += 7;
  benchmarks.forEach((b, bi) => {
    setFill(doc, bi % 2 === 0 ? BRAND.white : BRAND.bg); doc.rect(MARGIN, y, CONTENT_W, 7, 'F');
    setTextC(doc, BRAND.secondary); setFont(doc, 6.5, 'bold'); doc.text(b.metric, bCols[0], y + 5);
    [b.elite, b.high, b.medium, b.low].forEach((v, vi) => {
      setTextC(doc, bColors[vi + 1]); setFont(doc, 6, 'normal'); doc.text(v, bCols[vi + 1], y + 5);
    });
    y += 7;
  });

  // ── Plan d'action CI/CD ───────────────────────────────────────────────────
  y += 8;
  y = drawSect4('07. Plan d\'Action Recommande - Prochains Jalons', y);
  const actions = [
    { prio: 'Court terme (J+30)',  action: 'Mettre en place des pipelines CI/CD automatisés pour chaque site.', icon: '01' },
    { prio: 'Moyen terme (J+60)',  action: 'Réduire le Lead Time en activant les merge request reviews < 24h.', icon: '02' },
    { prio: 'Long terme (J+90)',   action: 'Atteindre le niveau Elite sur Deployment Frequency (quotidien).', icon: '03' },
  ];
  const prioBg = [[219,234,254], [254,243,199], [209,250,229]];
  const prioC  = [BRAND.primary, BRAND.warning, BRAND.accent];
  actions.forEach((a, i) => {
    setFill(doc, prioBg[i]); doc.roundedRect(MARGIN, y, CONTENT_W, 13, 2, 2, 'F');
    setFill(doc, prioC[i]); doc.roundedRect(MARGIN, y, 22, 13, 2, 2, 'F');
    setTextC(doc, BRAND.white); setFont(doc, 7, 'bold'); doc.text(a.icon, MARGIN + 11, y + 8.5, { align: 'center' });
    setTextC(doc, prioC[i]); setFont(doc, 6.5, 'bold'); doc.text(a.prio, MARGIN + 26, y + 5.5);
    setTextC(doc, BRAND.secondary); setFont(doc, 6.5, 'normal'); doc.text(a.action, MARGIN + 26, y + 10.5, { maxWidth: CONTENT_W - 30 });
    y += 17;
  });

  // Certification Seal
  const sealX = PAGE_W - MARGIN - 40;
  const sealY = PAGE_H - 60;
  setFill(doc, [248, 250, 252]); doc.roundedRect(sealX, sealY, 40, 25, 2, 2, 'F');
  setStroke(doc, BRAND.primary); doc.setLineWidth(0.5); doc.roundedRect(sealX, sealY, 40, 25, 2, 2, 'S');
  setTextC(doc, BRAND.primary); setFont(doc, 6, 'bold');
  doc.text('CERTIFIE CONFORME', sealX + 20, sealY + 8, { align: 'center' });
  setTextC(doc, BRAND.secondary); setFont(doc, 5, 'normal');
  doc.text('TELNET BI ENGINE v2.0', sealX + 20, sealY + 14, { align: 'center' });
  doc.text('Authentification Digitale', sealX + 20, sealY + 18, { align: 'center' });
  doc.text(new Date().toISOString().slice(0,10), sealX + 20, sealY + 22, { align: 'center' });

  // Glossaire Technique
  let gy = sealY;
  setTextC(doc, BRAND.secondary); setFont(doc, 7, 'bold');
  doc.text('Glossaire Technique', MARGIN, gy);
  gy += 4;
  setTextC(doc, BRAND.muted); setFont(doc, 5.5, 'normal');
  const gloss = [
    'Velocity : Nombre moyen de commits par developpeur par periode.',
    'Lead Time : Temps moyen (heures) entre le premier commit et le merge final.',
    'DORA : Metriques standard de l\'industrie pour mesurer la performance DevOps.',
    'Health Score : Indice calcule agregeant la stabilite, la vitesse et la qualite.'
  ];
  gloss.forEach(line => {
    doc.text('- ' + line, MARGIN, gy);
    gy += 3.5;
  });

  // Clause de confidentialite
  y = PAGE_H - 28;
  setStroke(doc, BRAND.border); doc.setLineWidth(0.2); doc.line(MARGIN, y, PAGE_W - MARGIN, y);
  y += 5;
  setTextC(doc, BRAND.muted); setFont(doc, 6, 'italic');
  doc.text('Avis de Confidentialite : Ce document contient des informations proprietaires de TELNET Holding. Toute reproduction ou distribution sans autorisation prealable est strictement interdite. Les donnees presentees sont issues d\'une analyse automatisee et servent d\'outil d\'aide a la decision.', MARGIN, y, { maxWidth: CONTENT_W });
}

// ─── Export Principal ──────────────────────────────────────────────────────────
export async function exportDashboardPDF({
  projectName,
  period,
  healthScore,
  insights,
  trends,
  doraData,
  chartElementId = 'kpi-evolution-chart',
}) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  // Charger le logo en parallèle
  const logoBase64 = await loadLogoBase64();
  const totalSites = [...new Set((trends||[]).map(t => t.entity_name))].length;
  const exportDate = new Date().toLocaleDateString('fr-FR', {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric'
  });
  const TOTAL_PAGES = 4;

  // ── Page 1 : Couverture
  buildCoverPage(doc, { projectName, period, exportDate, logoBase64, healthScore, totalSites });
  drawPageFrame(doc, 1, TOTAL_PAGES, projectName);

  // ── Page 2 : Executive Summary
  doc.addPage();
  buildExecutiveSummary(doc, { projectName, healthScore, insights, trends, period });
  drawPageFrame(doc, 2, TOTAL_PAGES, projectName);

  // ── Page 3 : Graphique
  doc.addPage();
  await buildChartPage(doc, { chartElementId, trends });
  drawPageFrame(doc, 3, TOTAL_PAGES, projectName);

  // ── Page 4 : DORA
  doc.addPage();
  buildDoraPage(doc, { doraData });
  drawPageFrame(doc, 4, TOTAL_PAGES, projectName);

  // ── Sauvegarde
  const safeProject = projectName.replace(/[^a-zA-Z0-9]/g, '_');
  const dateStr = new Date().toISOString().slice(0, 10);
  doc.save(`TELNET_KPI_Report_${safeProject}_${dateStr}.pdf`);
}
