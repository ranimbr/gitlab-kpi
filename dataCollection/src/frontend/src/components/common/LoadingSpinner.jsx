/**
 * components/common/LoadingSpinner.jsx
 *
 * AMÉLIORATIONS PRO :
 *   1. ✅ Variante `skeleton` — skeleton loader pour les cartes KPI
 *      (évite le flash de contenu vide, UX bien meilleure en entreprise)
 *   2. ✅ Variante `dots` — 3 points animés (plus discret dans les tableaux)
 *   3. ✅ Variante `pulse` — cercle pulsant (adapté aux petits espaces)
 *   4. ✅ overlay — spinner centré sur un container relatif (sans fullPage)
 *   5. ✅ text optionnel avec animation de points clignotants
 *
 * Usage :
 *   <LoadingSpinner />                          — spinner standard
 *   <LoadingSpinner variant="skeleton" />       — skeleton pour listes/cartes
 *   <LoadingSpinner variant="dots" size="sm" /> — points dans un tableau
 *   <LoadingSpinner fullPage />                 — page entière bloquée
 *   <LoadingSpinner overlay />                  — sur un container position-relative
 */

// ── Skeleton Card ──────────────────────────────────────────────────────────────
function SkeletonCard() {
  return (
    <div
      className="card border-0 shadow-sm"
      style={{ borderRadius: 12, overflow: "hidden" }}
    >
      <div className="card-body p-4">
        <div className="d-flex align-items-center gap-3 mb-3">
          <div className="skeleton-box rounded-circle" style={{ width: 40, height: 40 }} />
          <div className="flex-grow-1">
            <div className="skeleton-box rounded mb-2" style={{ height: 12, width: "60%" }} />
            <div className="skeleton-box rounded" style={{ height: 10, width: "40%" }} />
          </div>
        </div>
        <div className="skeleton-box rounded mb-2" style={{ height: 10, width: "100%" }} />
        <div className="skeleton-box rounded mb-2" style={{ height: 10, width: "85%" }} />
        <div className="skeleton-box rounded"       style={{ height: 10, width: "70%" }} />
      </div>
    </div>
  );
}

// ── Skeleton Row (tableau) ─────────────────────────────────────────────────────
function SkeletonRow({ cols = 5 }) {
  return (
    <tr>
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="py-3">
          <div className="skeleton-box rounded" style={{ height: 12, width: i === 0 ? "80%" : "60%" }} />
        </td>
      ))}
    </tr>
  );
}

// ── Dots ──────────────────────────────────────────────────────────────────────
function DotsLoader({ color = "primary" }) {
  return (
    <>
      <style>{`
        .dots-loader span {
          display: inline-block;
          width: 7px; height: 7px;
          border-radius: 50%;
          background: var(--vz-${color}, #405189);
          animation: dotBounce 1.2s infinite ease-in-out;
        }
        .dots-loader span:nth-child(1) { animation-delay: 0s;   }
        .dots-loader span:nth-child(2) { animation-delay: 0.2s; }
        .dots-loader span:nth-child(3) { animation-delay: 0.4s; }
        @keyframes dotBounce {
          0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
          40%            { transform: scale(1);   opacity: 1;   }
        }
      `}</style>
      <span className="dots-loader d-inline-flex gap-1 align-items-center">
        <span /><span /><span />
      </span>
    </>
  );
}

// ── Pulse ─────────────────────────────────────────────────────────────────────
function PulseLoader({ color = "primary", size = 32 }) {
  return (
    <>
      <style>{`
        .pulse-loader {
          width: ${size}px; height: ${size}px;
          border-radius: 50%;
          background: var(--vz-${color}-subtle, rgba(64,81,137,0.15));
          animation: pulseAnim 1.4s infinite ease-in-out;
        }
        @keyframes pulseAnim {
          0%, 100% { transform: scale(1);    opacity: 1;   }
          50%       { transform: scale(1.25); opacity: 0.5; }
        }
      `}</style>
      <div className="pulse-loader" />
    </>
  );
}

// =============================================================================
// LoadingSpinner — composant principal
// =============================================================================
export default function LoadingSpinner({
  // Variante
  variant  = "spinner",   // spinner | skeleton | dots | pulse
  // Style
  size     = "md",        // sm | md | lg
  color    = "primary",
  text     = null,        // null = pas de texte
  // Layout
  fullPage = false,
  overlay  = false,       // spinner centré sur un parent position-relative
  // Skeleton spécifique
  cards    = 3,           // nombre de cartes skeleton
  rows     = 5,           // nombre de lignes skeleton tableau
  tableCols = 5,          // nombre de colonnes skeleton tableau
  tableMode = false,      // true = skeleton lignes de tableau
}) {
  const dim = { sm: "1.5rem", md: "3rem", lg: "4rem" }[size] || "3rem";

  // ── Skeleton ────────────────────────────────────────────────────────────────
  if (variant === "skeleton") {
    if (tableMode) {
      return (
        <>
          <style>{`
            .skeleton-box {
              background: linear-gradient(90deg, #f0f2f5 25%, #e8eaed 50%, #f0f2f5 75%);
              background-size: 200% 100%;
              animation: shimmer 1.5s infinite;
            }
            @keyframes shimmer {
              0%   { background-position: 200% 0; }
              100% { background-position: -200% 0; }
            }
          `}</style>
          {Array.from({ length: rows }).map((_, i) => (
            <SkeletonRow key={i} cols={tableCols} />
          ))}
        </>
      );
    }
    return (
      <>
        <style>{`
          .skeleton-box {
            background: linear-gradient(90deg, #f0f2f5 25%, #e8eaed 50%, #f0f2f5 75%);
            background-size: 200% 100%;
            animation: shimmer 1.5s infinite;
          }
          @keyframes shimmer {
            0%   { background-position: 200% 0; }
            100% { background-position: -200% 0; }
          }
        `}</style>
        <div className="row g-3">
          {Array.from({ length: cards }).map((_, i) => (
            <div key={i} className="col-md-4">
              <SkeletonCard />
            </div>
          ))}
        </div>
      </>
    );
  }

  // ── Dots ────────────────────────────────────────────────────────────────────
  if (variant === "dots") {
    return (
      <div className="d-flex align-items-center justify-content-center gap-2 py-2">
        <DotsLoader color={color} />
        {text && <span className="text-muted fs-13">{text}</span>}
      </div>
    );
  }

  // ── Pulse ───────────────────────────────────────────────────────────────────
  if (variant === "pulse") {
    const pSize = { sm: 20, md: 32, lg: 48 }[size] || 32;
    return (
      <div className="d-flex align-items-center justify-content-center gap-2">
        <PulseLoader color={color} size={pSize} />
        {text && <span className="text-muted fs-13">{text}</span>}
      </div>
    );
  }

  // ── Spinner standard ────────────────────────────────────────────────────────
  const spinner = (
    <div className="d-flex flex-column align-items-center justify-content-center gap-3">
      <div
        className={`spinner-border text-${color}`}
        style={{ width: dim, height: dim }}
        role="status"
      >
        <span className="visually-hidden">Chargement...</span>
      </div>
      {text && <p className="text-muted mb-0 fs-13">{text}</p>}
    </div>
  );

  if (overlay) {
    return (
      <div
        style={{
          position: "absolute", inset: 0, zIndex: 10,
          background: "rgba(255,255,255,0.75)",
          display: "flex", alignItems: "center", justifyContent: "center",
          backdropFilter: "blur(2px)",
          borderRadius: "inherit",
        }}
      >
        {spinner}
      </div>
    );
  }

  if (fullPage) {
    return (
      <div
        className="d-flex align-items-center justify-content-center"
        style={{ minHeight: "60vh" }}
      >
        {spinner}
      </div>
    );
  }

  return <div className="text-center py-5">{spinner}</div>;
}
