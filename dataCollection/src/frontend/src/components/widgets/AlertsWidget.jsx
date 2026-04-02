import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { alertService } from "../../services";

export default function AlertsWidget({ projectId, dashboardId, maxItems = 3 }) {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    const loadAlerts = async () => {
      try {
        const data = await alertService.getAll({ projectId, dashboardId, isResolved: false, limit: maxItems });
        if (active) {
          const criticals = (data || []).filter(a => a.level === "CRITICAL");
          const warnings = (data || []).filter(a => a.level === "WARNING");
          setAlerts([...criticals, ...warnings].slice(0, maxItems));
        }
      } catch (err) { console.error("AlertsWidget Error:", err); }
      finally { if (active) setLoading(false); }
    };
    if (projectId || dashboardId) loadAlerts();
    else { setAlerts([]); setLoading(false); }
    return () => { active = false; };
  }, [projectId, dashboardId, maxItems]);

  if (loading) return (
    <div className="crystal-panel border-0 h-100 py-5 d-flex align-items-center justify-content-center">
      <div className="spinner-border spinner-border-sm text-primary opacity-50" />
    </div>
  );

  const StatusHeader = ({ icon, text, colorClass, barColor }) => (
    <div className="tactical-hud-header px-4 py-3 d-flex justify-content-between align-items-center">
      <div className="d-flex align-items-center gap-2">
        <div className={`status-led ${barColor}-led`} />
        <h6 className={`hud-title mb-0 ${colorClass}`}>
          <i className={`${icon} me-2`} /> {text}
        </h6>
      </div>
      {alerts.length > 0 && (
         <Link to="/alerts" className="hud-link fs-11 text-decoration-none">
           VIEW_ALL_LOGS <i className="ri-arrow-right-line" />
         </Link>
      )}
    </div>
  );

  return (
    <div className="crystal-panel h-100">
      <style>{CSS}</style>
      
      {alerts.length === 0 ? (
        <>
          <StatusHeader icon="ri-shield-check-line" text="SYSTEM_HEALTH: NOMINAL" colorClass="text-emerald" barColor="emerald" />
          <div className="card-body d-flex flex-column align-items-center justify-content-center text-center py-5">
            <div className="hud-icon-box bg-emerald-subtle text-emerald mb-3">
              <i className="ri-radar-line fs-2 animate-pulse" />
            </div>
            <p className="text-emerald fw-bold fs-13 mb-1">NO ANOMALIES DETECTED</p>
            <p className="text-muted fs-11 text-mono">SENSORS OPERATIONAL · ALL CLEAR</p>
          </div>
        </>
      ) : (
        <>
          <StatusHeader icon="ri-alarm-warning-line" text="SYSTEM_STATUS: ALERT" colorClass="text-danger" barColor="danger" />
          <div className="hud-alert-list">
            {alerts.map((alert, i) => (
              <div key={alert.id || i} className="hud-alert-item px-4 py-3">
                <div className="d-flex align-items-start gap-3">
                  <div className={`hud-alert-icon-bin ${alert.level === 'CRITICAL' ? 'bg-danger-subtle text-danger beacon-red' : 'bg-warning-subtle text-warning'}`}>
                    <i className={alert.level === 'CRITICAL' ? 'ri-error-warning-fill' : 'ri-alert-fill'} />
                  </div>
                  <div className="flex-grow-1 overflow-hidden">
                    <p className="mb-0 fw-bold fs-13 text-p-contrast">{alert.title}</p>
                    <p className="mb-0 text-muted fs-11 mt-1 text-truncate">{alert.message}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

const CSS = `
  .tactical-hud-header { border-bottom: 1px solid rgba(255,255,255,0.05); background: rgba(255,255,255,0.02); }
  .status-led { width: 8px; height: 8px; border-radius: 50%; box-shadow: 0 0 8px currentColor; }
  .emerald-led { background-color: #10B981; color: #10B981; }
  .danger-led { background-color: #EF4444; color: #EF4444; animation: flash 1s infinite; }
  @keyframes flash { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
  
  .hud-title { font-family: 'DM Mono', monospace; font-size: 11px; font-weight: 700; letter-spacing: 1px; }
  .text-emerald { color: #10B981 !important; }
  .text-danger { color: #EF4444 !important; }
  .hud-link { color: var(--lp-blue); font-family: 'DM Mono', monospace; opacity: 0.6; transition: 0.3s; }
  .hud-link:hover { opacity: 1; text-shadow: 0 0 10px var(--lp-blue); color: var(--lp-blue); }

  .hud-icon-box { 
    width: 60px; height: 60px; border-radius: 50%; display: flex; align-items: center; justify-content: center;
    border: 1px solid currentColor; box-shadow: 0 0 20px rgba(16,185,129,0.1);
  }
  .bg-emerald-subtle { background: rgba(16,185,129,0.1) !important; color: #10B981 !important; }
  .bg-danger-subtle { background: rgba(239,68,68,0.1) !important; color: #EF4444 !important; }
  .bg-warning-subtle { background: rgba(245,158,11,0.1) !important; color: #F59E0B !important; }

  .hud-alert-list { display: flex; flex-direction: column; }
  .hud-alert-item { border-bottom: 1px solid rgba(255,255,255,0.03); transition: 0.3s; }
  .hud-alert-item:hover { background: rgba(255,255,255,0.02); }
  .hud-alert-icon-bin {
    width: 34px; height: 34px; border-radius: 8px; display: flex; align-items: center; justify-content: center;
    font-size: 18px; flex-shrink: 0;
  }
  .text-p-contrast { color: var(--lp-text-p) !important; }
`;
