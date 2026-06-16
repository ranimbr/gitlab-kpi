/**
 * IntelligenceCard.jsx - Component for displaying intelligence data in a card-based layout
 * 
 * Features:
 * - Compact card view with key metrics
 * - Expandable details via modal/drawer
 * - Circular progress indicator for health score
 * - Directional arrows for trends with color coding
 * - Professional styling with micro-interactions
 */
import { useState } from "react";

const IntelligenceCard = ({ 
  entityName, 
  entityType, // 'site' or 'team'
  healthScore, 
  nPeriods, 
  metrics, 
  alerts, 
  recommendations,
  isExpanded,
  onToggle 
}) => {
  const [isHovered, setIsHovered] = useState(false);

  // Determine score color based on health score
  const getScoreColor = (score) => {
    if (score >= 70) return { color: "#10b981", bg: "rgba(16,185,129,0.15)", text: "Excellent" };
    if (score >= 40) return { color: "#f59e0b", bg: "rgba(245,158,11,0.15)", text: "Surveillance" };
    return { color: "#ef4444", bg: "rgba(239,68,68,0.15)", text: "Critique" };
  };

  const scoreInfo = getScoreColor(healthScore);

  // Get trend direction and color
  const getTrendInfo = (trend, metricType) => {
    if (!trend) return { icon: 'ri-arrow-right-line', color: '#94a3b8', text: 'stable' };
    const isGood = metricType === 'review_time' ? trend.direction === 'declining' : trend.direction === 'improving';
    const isBad = metricType === 'review_time' ? trend.direction === 'improving' : trend.direction === 'declining';
    
    if (isGood) {
      return { 
        icon: trend.direction === 'improving' ? 'ri-arrow-right-up-line' : 'ri-arrow-right-down-line',
        color: '#10b981',
        text: trend.delta_pct > 0 ? `+${trend.delta_pct}%` : `${trend.delta_pct}%`
      };
    } else if (isBad) {
      return { 
        icon: trend.direction === 'improving' ? 'ri-arrow-right-up-line' : 'ri-arrow-right-down-line',
        color: '#ef4444',
        text: trend.delta_pct > 0 ? `+${trend.delta_pct}%` : `${trend.delta_pct}%`
      };
    }
    return { icon: 'ri-arrow-right-line', color: '#94a3b8', text: 'stable' };
  };

  // Format metric value
  const formatValue = (value, suffix = "", multiplier = 1) => {
    if (value == null) return "—";
    const displayVal = multiplier ? (value * multiplier) : value;
    return `${Math.round(displayVal)}${suffix}`;
  };

  return (
    <div 
      className="intelligence-card"
      style={{
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.06)",
        borderRadius: 12,
        padding: "16px",
        transition: "all 0.3s ease",
        cursor: "pointer",
        boxShadow: isHovered ? "0 4px 20px rgba(0,0,0,0.15)" : "none",
        transform: isHovered ? "translateY(-2px)" : "translateY(0)"
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={onToggle}
    >
      {/* Card Header - Compact View */}
      <div className="d-flex align-items-center justify-content-between mb-3">
        <div className="d-flex align-items-center gap-3">
          {/* Circular Progress Indicator */}
          <div style={{
            position: 'relative',
            width: 48,
            height: 48,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <svg width="48" height="48" viewBox="0 0 36 36">
              <circle
                cx="18"
                cy="18"
                r="15.9155"
                fill="none"
                stroke="rgba(255,255,255,0.1)"
                strokeWidth="3"
              />
              <circle
                cx="18"
                cy="18"
                r="15.9155"
                fill="none"
                stroke={scoreInfo.color}
                strokeWidth="3"
                strokeDasharray={`${healthScore}, 100`}
                strokeLinecap="round"
              />
            </svg>
            <div
              style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                fontWeight: 700,
                fontSize: 12,
                color: scoreInfo.color
              }}
            >
              {healthScore}
            </div>
          </div>

          {/* Entity Name and Periods */}
          <div>
            <div className="text-white fw-bold" style={{ fontSize: 14 }}>{entityName}</div>
            <div className="opacity-50" style={{ fontSize: 11, color: "#94a3b8" }}>
              {nPeriods} mois analysés
            </div>
          </div>
        </div>

        {/* Score Badge */}
        <div className="d-flex align-items-center gap-2">
          <span
            className="fw-semibold px-2 py-0.5 rounded"
            style={{
              fontSize: 10,
              background: scoreInfo.bg,
              color: scoreInfo.color
            }}
          >
            {scoreInfo.text}
          </span>
          <div
            className="fw-bold px-2 py-0.5 rounded"
            style={{
              fontSize: 12,
              background: scoreInfo.color,
              color: "#0f172a"
            }}
          >
            {healthScore}/100
          </div>
        </div>
      </div>

      {/* Progress Bar */}
      <div 
        className="progress mb-3"
        style={{ 
          height: 4, 
          background: "rgba(255,255,255,0.08)", 
          borderRadius: 2 
        }}
      >
        <div
          className="progress-bar"
          style={{
            width: `${healthScore}%`,
            background: scoreInfo.color,
            borderRadius: 2,
            transition: "width 0.5s ease"
          }}
        />
      </div>

      {/* Key Metrics - Compact View */}
      <div className="d-flex flex-column gap-2">
        {[
          { label: "Vélocité", trend: metrics.velocity_trend, metricType: "velocity", suffix: "" },
          { label: "Temps de revue", trend: metrics.review_trend, metricType: "review_time", suffix: "h" },
          { label: "Qualité", trend: metrics.quality_trend, metricType: "quality", suffix: "%", multiplier: 100 }
        ].map((metric, idx) => {
          const trendInfo = getTrendInfo(metric.trend, metric.metricType);
          const vals = metric.trend?.values || [];
          const latestVal = vals.length > 0 ? vals[vals.length - 1] : 0;
          const displayVal = metric.multiplier ? (latestVal * metric.multiplier) : latestVal;

          return (
            <div 
              key={idx} 
              className="d-flex align-items-center justify-content-between py-1"
              style={{ 
                fontSize: 12,
                borderBottom: "1px solid rgba(255,255,255,0.06)",
                paddingBottom: "4px"
              }}
            >
              <span className="opacity-60 text-white">{metric.label}</span>
              <div className="d-flex align-items-center gap-2">
                <span className="text-white fw-bold font-monospace">
                  {formatValue(displayVal, metric.suffix, metric.multiplier)}
                </span>
                <i 
                  className={trendInfo.icon}
                  style={{ 
                    color: trendInfo.color, 
                    fontSize: 14 
                  }}
                ></i>
              </div>
            </div>
          );
        })}
      </div>

      {/* Expand Button */}
      <div className="text-center mt-3">
        <button
          className="btn btn-sm w-100"
          style={{
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.1)",
            color: "#94a3b8",
            fontSize: 11,
            padding: "6px 12px",
            borderRadius: 6,
            transition: "all 0.2s ease"
          }}
        >
          <i className="ri-expand-down-line me-1"></i>
          {isExpanded ? 'Masquer détails' : 'Voir détails'}
        </button>
      </div>

      {/* Expanded Details - Only shown when isExpanded is true */}
      {isExpanded && (
        <div 
          className="mt-3 pt-3"
          style={{ 
            borderTop: "1px solid rgba(255,255,255,0.1)" 
          }}
        >
          {/* Alerts Section */}
          {alerts && alerts.length > 0 && (
            <div className="mb-3">
              <h6 className="fw-bold mb-2" style={{ fontSize: 12, color: "#cbd5e1" }}>
                <i className="ri-alert-line me-1" style={{ color: "#f59e0b" }}></i>
                Alertes
              </h6>
              <div className="d-flex flex-column gap-2">
                {alerts.map((alert, idx) => (
                  <div 
                    key={idx}
                    className="d-flex align-items-start gap-2 p-2 rounded-2"
                    style={{
                      background: alert.severity === 'high' ? "rgba(239,68,68,0.1)" : "rgba(245,158,11,0.1)",
                      border: alert.severity === 'high' ? "1px solid rgba(239,68,68,0.2)" : "1px solid rgba(245,158,11,0.2)",
                      fontSize: 11
                    }}
                  >
                    <span 
                      className="badge px-1 py-0.5 rounded-pill flex-shrink-0"
                      style={{
                        background: alert.severity === 'high' ? "rgba(239,68,68,0.2)" : "rgba(245,158,11,0.2)",
                        color: alert.severity === 'high' ? "#ef4444" : "#f59e0b",
                        fontSize: 8
                      }}
                    >
                      {alert.severity === 'high' ? 'critique' : 'alerte'}
                    </span>
                    <span className="text-white opacity-80">
                      {alert.detail}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recommendations Section */}
          {recommendations && recommendations.length > 0 && (
            <div>
              <h6 className="fw-bold mb-2" style={{ fontSize: 12, color: "#10b981" }}>
                <i className="ri-lightbulb-line me-1"></i>
                Recommandations
              </h6>
              <div className="d-flex flex-column gap-2">
                {recommendations.slice(0, 3).map((rec, idx) => (
                  <div 
                    key={idx}
                    className="p-2 rounded-2"
                    style={{
                      background: "rgba(16,185,129,0.06)",
                      border: "1px solid rgba(16,185,129,0.15)",
                      fontSize: 11
                    }}
                  >
                    <span className="text-white opacity-80">
                      {rec}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default IntelligenceCard;
