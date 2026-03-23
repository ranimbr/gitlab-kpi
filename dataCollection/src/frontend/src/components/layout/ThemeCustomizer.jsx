/**
 * components/layout/ThemeCustomizer.jsx
 *
 * CORRECTION :
 *   reset() ne mettait pas à jour le DOM immédiatement (seulement via useEffect).
 *   ✅ FIX : appel explicit applySettings(DEFAULTS) dans reset().
 *   Cela garantit que le thème change visuellement sans attendre le re-render.
 */
import { useState, useEffect, useCallback } from "react";

const DEFAULTS = { layout: "vertical", theme: "light", sidebarSize: "lg" };

const load  = () => { try { return JSON.parse(localStorage.getItem("vz-settings") || "{}"); } catch { return {}; } };
const save  = (s) => localStorage.setItem("vz-settings", JSON.stringify(s));
const merge = (saved) => ({ ...DEFAULTS, ...saved });

function applySettings(s) {
  const h = document.documentElement;
  const b = document.body;
  h.setAttribute("data-layout",       s.layout);
  h.setAttribute("data-sidebar-size", s.sidebarSize);
  h.setAttribute("data-bs-theme",     s.theme);
  b.setAttribute("data-layout-mode",  s.theme);
  h.setAttribute("data-topbar",       "dark");
  h.setAttribute("data-sidebar",      "dark");
  h.setAttribute("data-layout-style", "default");
  h.setAttribute("data-sidebar-image","none");
  h.setAttribute("data-preloader",    "disable");
}

function SettingSection({ title, subtitle }) {
  return (
    <>
      <h6 className="mt-4 mb-0 fw-semibold text-uppercase">{title}</h6>
      {subtitle && <p className="text-muted">{subtitle}</p>}
    </>
  );
}

export default function ThemeCustomizer() {
  const [open,     setOpen]     = useState(false);
  const [settings, setSettings] = useState(() => merge(load()));

  useEffect(() => { applySettings(settings); save(settings); }, [settings]);

  const set = useCallback((key) => (val) => setSettings(prev => ({ ...prev, [key]: val })), []);

  const reset = useCallback(() => {
    // ✅ FIX : appliquer immédiatement au DOM, pas seulement via useEffect
    applySettings(DEFAULTS);
    localStorage.removeItem("vz-settings");
    setSettings(DEFAULTS);
  }, []);

  const { layout, theme, sidebarSize } = settings;

  return (
    <>
      <div className="customizer-setting d-none d-md-block">
        <button className="btn btn-info btn-icon btn-lg rounded-pill shadow-lg p-2"
          onClick={() => setOpen(true)} title="Personnaliser le thème">
          <i className="mdi mdi-spin mdi-cog-outline fs-22" />
        </button>
      </div>

      {open && <div className="offcanvas-backdrop fade show" onClick={() => setOpen(false)} style={{ zIndex: 1044 }} />}

      <div className={`offcanvas offcanvas-end border-0${open ? " show" : ""}`} tabIndex="-1"
        style={{ zIndex: 1045, visibility: open ? "visible" : "hidden" }}>

        <div className="d-flex align-items-center bg-primary bg-gradient p-3 offcanvas-header">
          <h5 className="m-0 me-2 text-white"><i className="mdi mdi-cog-outline me-2" />Personnalisation</h5>
          <button type="button" className="btn-close btn-close-white ms-auto" onClick={() => setOpen(false)} />
        </div>

        <div className="offcanvas-body p-0">
          <div style={{ overflowY: "auto", height: "100%" }}>
            <div className="p-4">

              {/* Layout */}
              <SettingSection title="Layout" subtitle="Choisissez la disposition de l'interface." />
              <div className="row gy-3">
                {[
                  { value: "vertical", label: "Vertical", preview: (
                    <span className="d-flex gap-1 h-100">
                      <span className="flex-shrink-0"><span className="bg-light d-flex h-100 flex-column gap-1 p-1">
                        <span className="d-block p-1 px-2 bg-primary-subtle rounded mb-2" /><span className="d-block p-1 px-2 pb-0 bg-primary-subtle" /><span className="d-block p-1 px-2 pb-0 bg-primary-subtle" /><span className="d-block p-1 px-2 pb-0 bg-primary-subtle" />
                      </span></span>
                      <span className="flex-grow-1"><span className="d-flex h-100 flex-column"><span className="bg-light d-block p-1" /><span className="bg-light d-block p-1 mt-auto" /></span></span>
                    </span>
                  )},
                  { value: "horizontal", label: "Horizontal", preview: (
                    <span className="d-flex h-100 flex-column gap-1">
                      <span className="bg-light d-flex p-1 gap-1 align-items-center">
                        <span className="d-block p-1 bg-primary-subtle rounded me-1" /><span className="d-block p-1 pb-0 px-2 bg-primary-subtle ms-auto" /><span className="d-block p-1 pb-0 px-2 bg-primary-subtle" />
                      </span>
                      <span className="bg-light d-block p-1" /><span className="bg-light d-block p-1 mt-auto" />
                    </span>
                  )},
                ].map(({ value, label, preview }) => (
                  <div className="col-6" key={value}>
                    <div className="form-check card-radio">
                      <input className="form-check-input" type="radio" name="data-layout" id={`layout-${value}`}
                        value={value} checked={layout === value} onChange={() => set("layout")(value)} />
                      <label className="form-check-label p-0 avatar-md w-100" htmlFor={`layout-${value}`}>{preview}</label>
                    </div>
                    <h5 className="fs-13 text-center mt-2">{label}</h5>
                  </div>
                ))}
              </div>

              {/* Color Scheme */}
              <SettingSection title="Thème" subtitle="Choisissez le mode clair ou sombre." />
              <div className="row">
                {[
                  { value: "light", label: "Clair",  bg: "bg-light", dot: "bg-primary-subtle" },
                  { value: "dark",  label: "Sombre", bg: "bg-dark",  dot: "bg-white bg-opacity-10" },
                ].map(({ value, label, bg, dot }) => (
                  <div className="col-4" key={value}>
                    <div className={`form-check card-radio${value === "dark" ? " dark" : ""}`}>
                      <input className="form-check-input" type="radio" name="data-bs-theme" id={`theme-${value}`}
                        value={value} checked={theme === value} onChange={() => set("theme")(value)} />
                      <label className={`form-check-label p-0 avatar-md w-100${value === "dark" ? " bg-dark" : ""}`} htmlFor={`theme-${value}`}>
                        <span className="d-flex gap-1 h-100">
                          <span className="flex-shrink-0"><span className={`${bg} d-flex h-100 flex-column gap-1 p-1`}>
                            <span className={`d-block p-1 px-2 ${dot} rounded mb-2`} /><span className={`d-block p-1 px-2 pb-0 ${dot}`} /><span className={`d-block p-1 px-2 pb-0 ${dot}`} />
                          </span></span>
                          <span className="flex-grow-1"><span className="d-flex h-100 flex-column"><span className={`${bg} d-block p-1`} /><span className={`${bg} d-block p-1 mt-auto`} /></span></span>
                        </span>
                      </label>
                    </div>
                    <h5 className="fs-13 text-center mt-2">{label}</h5>
                  </div>
                ))}
              </div>

              {/* Sidebar Size (vertical only) */}
              {layout === "vertical" && (
                <>
                  <SettingSection title="Taille de la sidebar" subtitle="Ajustez la largeur de la sidebar." />
                  <div className="row">
                    {[
                      { value: "lg",       label: "Normale"         },
                      { value: "md",       label: "Compacte"        },
                      { value: "sm",       label: "Icônes seules"   },
                      { value: "sm-hover", label: "Icônes + survol" },
                    ].map(({ value, label }) => (
                      <div className="col-6 mb-3" key={value}>
                        <div className="form-check sidebar-setting card-radio">
                          <input className="form-check-input" type="radio" name="data-sidebar-size" id={`sidebarsize-${value}`}
                            value={value} checked={sidebarSize === value} onChange={() => set("sidebarSize")(value)} />
                          <label className="form-check-label p-0 avatar-md w-100" htmlFor={`sidebarsize-${value}`}>
                            <span className="d-flex gap-1 h-100">
                              <span className="flex-shrink-0"><span className="bg-light d-flex h-100 flex-column gap-1 p-1">
                                <span className="d-block p-1 px-2 bg-primary-subtle rounded mb-2" /><span className="d-block p-1 px-2 pb-0 bg-primary-subtle" /><span className="d-block p-1 px-2 pb-0 bg-primary-subtle" />
                              </span></span>
                              <span className="flex-grow-1"><span className="d-flex h-100 flex-column"><span className="bg-light d-block p-1" /><span className="bg-light d-block p-1 mt-auto" /></span></span>
                            </span>
                          </label>
                        </div>
                        <h5 className="fs-13 text-center mt-2">{label}</h5>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="offcanvas-footer border-top p-3">
          <div className="row g-2">
            <div className="col-6">
              <button type="button" className="btn btn-light w-100" onClick={reset}>
                <i className="ri-refresh-line me-1" />Réinitialiser
              </button>
            </div>
            <div className="col-6">
              <button type="button" className="btn btn-primary w-100" onClick={() => setOpen(false)}>
                <i className="ri-check-line me-1" />Fermer
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
