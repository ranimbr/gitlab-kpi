import { useState } from "react";
import { useAuth } from "../context/AuthContext";

// ── Helpers ───────────────────────────────────────────────────────────────────
const getInitials = (email = "") =>
  email
    .split("@")[0]
    .split(/[._-]/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("") || "U";

const AVATAR_GRADIENTS = [
  ["#405189", "#0ab39c"],
  ["#299cdb", "#405189"],
  ["#f7b84b", "#f06548"],
  ["#0ab39c", "#299cdb"],
  ["#f06548", "#405189"],
  ["#3577f1", "#0ab39c"],
];
const avatarGradient = (email = "") => {
  let h = 0;
  for (let i = 0; i < email.length; i++) h = email.charCodeAt(i) + ((h << 5) - h);
  const [a, b] = AVATAR_GRADIENTS[Math.abs(h) % AVATAR_GRADIENTS.length];
  return `linear-gradient(135deg, ${a} 0%, ${b} 100%)`;
};

// ── Données statiques ─────────────────────────────────────────────────────────
const SKILLS = ["React", "Node.js", "Python", "Docker", "GitLab CI", "PostgreSQL", "TypeScript"];

const RECENT_ACTIVITIES = [
  { id: 1, icon: "ri-git-merge-line",  color: "success", title: "Pipeline GitLab réussi",        desc: "Build #142 — branche main",  time: "Il y a 2 min"   },
  { id: 2, icon: "ri-file-chart-line", color: "info",    title: "Rapport analytique disponible", desc: "Rapport mensuel Q1 2026",    time: "Il y a 10 min"  },
  { id: 3, icon: "ri-team-line",       color: "primary", title: "Nouveau membre ajouté",          desc: "Équipe Projet Alpha",        time: "Hier"           },
  { id: 4, icon: "ri-ticket-2-line",   color: "warning", title: "Ticket assigné",                 desc: "Bug #389 — Module Auth",     time: "Il y a 2 jours" },
];

const PROJECTS = [
  { id: 1, name: "Velzon Dashboard",     status: "En cours", badge: "warning",   lastUpdate: "4h", progress: 60  },
  { id: 2, name: "API Gateway Refactor", status: "Terminé",  badge: "success",   lastUpdate: "1j", progress: 100 },
  { id: 3, name: "Mobile App v2",        status: "En pause", badge: "secondary", lastUpdate: "3j", progress: 30  },
  { id: 4, name: "Data Pipeline ETL",    status: "En cours", badge: "warning",   lastUpdate: "2h", progress: 55  },
];

// ── Onglets (confidentialité + historique supprimés) ──────────────────────────
const TABS = [
  { key: "overview",        label: "Aperçu",             icon: "ri-layout-grid-line"   },
  { key: "activity",        label: "Activité",           icon: "ri-list-check-2"        },
  { key: "projects",        label: "Projets",            icon: "ri-folder-line"         },
  { key: "personalDetails", label: "Modifier le profil", icon: "ri-edit-box-line"       },
  { key: "changePassword",  label: "Mot de passe",       icon: "ri-lock-password-line"  },
];

// ─────────────────────────────────────────────────────────────────────────────
export default function Profile() {
  const { user } = useAuth();

  const userEmail   = user?.email ?? "user@telnet.tn";
  const userRole    = user?.role  ?? "user";
  const displayName = userEmail.split("@")[0].replace(/[._-]/g, " ");
  const initials    = getInitials(userEmail);
  const gradient    = avatarGradient(userEmail);

  const [activeTab, setActiveTab] = useState("overview");
  const [saved,     setSaved]     = useState(false);
  const [form, setForm] = useState({
    firstName:   displayName.split(" ")[0] ?? "",
    lastName:    displayName.split(" ")[1] ?? "",
    phone:       "+216 55 123 456",
    email:       userEmail,
    designation: userRole,
    website:     "www.telnet.tn",
    city:        "Tunis",
    country:     "Tunisie",
    zipcode:     "1000",
    description: "Membre de l'équipe Telnet, passionné par le développement logiciel et l'intégration continue.",
  });
  const [pwdForm, setPwdForm] = useState({ old: "", newPwd: "", confirm: "" });

  const handleFormChange = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
  const handlePwdChange  = (e) => setPwdForm((f) => ({ ...f, [e.target.name]: e.target.value }));
  const handleSave = (e) => {
    e.preventDefault();
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const goToEdit = () => setActiveTab("personalDetails");

  return (
    <div className="page-content">
      <div className="container-fluid">

        {/* ── Bandeau cover ── */}
        <div className="position-relative mx-n4 mt-n4">
          <div style={{
            height: 200,
            background: "linear-gradient(135deg, #405189 0%, #0ab39c 100%)",
            position: "relative",
            overflow: "hidden",
          }}>
            <svg style={{ position: "absolute", bottom: 0, right: 0, opacity: 0.1 }}
              width="400" height="200" viewBox="0 0 400 200">
              <circle cx="350" cy="100" r="160" fill="white" />
              <circle cx="250" cy="185" r="100" fill="white" />
            </svg>
            <div style={{ position: "absolute", top: 12, right: 12 }}>
              <label htmlFor="cover-img" className="btn btn-light btn-sm" style={{ cursor: "pointer" }}>
                <i className="ri-image-edit-line align-bottom me-1" />
                Changer la couverture
              </label>
              <input id="cover-img" type="file" className="d-none" />
            </div>
          </div>
        </div>

        <div className="row">

          {/* ══ COLONNE GAUCHE ══ */}
          <div className="col-xxl-3">

            {/* Avatar */}
            <div className="card mt-n5">
              <div className="card-body p-4">
                <div className="text-center">
                  <div className="profile-user position-relative d-inline-block mx-auto mb-4">
                    <div
                      className="rounded-circle d-flex align-items-center justify-content-center text-white fw-bold"
                      style={{
                        width: 96, height: 96, fontSize: 28,
                        background: gradient,
                        border: "3px solid #fff",
                        boxShadow: "0 2px 12px rgba(0,0,0,.12)",
                        userSelect: "none",
                      }}
                    >
                      {initials}
                    </div>
                    <label
                      htmlFor="profile-img-input"
                      className="position-absolute bottom-0 end-0 d-flex align-items-center
                                 justify-content-center rounded-circle bg-light text-body"
                      style={{ width: 28, height: 28, cursor: "pointer", border: "2px solid #fff" }}
                    >
                      <i className="ri-camera-fill fs-14" />
                    </label>
                    <input id="profile-img-input" type="file" className="d-none" />
                  </div>
                  <h5 className="fs-16 mb-1 text-capitalize">{displayName}</h5>
                  <p className="text-muted mb-0 text-capitalize">{userRole}</p>
                </div>
              </div>
            </div>

            {/* Complétion */}
            <div className="card">
              <div className="card-body">
                <div className="d-flex align-items-center mb-4">
                  <div className="flex-grow-1">
                    <h5 className="card-title mb-0">Compléter votre profil</h5>
                  </div>
                  <div className="flex-shrink-0">
                    <button className="badge bg-light text-primary fs-12 border-0" onClick={goToEdit} style={{ cursor: "pointer" }}>
                      <i className="ri-edit-box-line align-bottom me-1" />
                      Modifier
                    </button>
                  </div>
                </div>
                <div className="progress animated-progress" style={{ height: 12 }}>
                  <div className="progress-bar bg-info" role="progressbar" style={{ width: "65%" }}>65%</div>
                </div>
              </div>
            </div>

            {/* Portfolio */}
            <div className="card">
              <div className="card-body">
                <div className="d-flex align-items-center mb-4">
                  <div className="flex-grow-1">
                    <h5 className="card-title mb-0">Portfolio</h5>
                  </div>
                  <div className="flex-shrink-0">
                    <button className="badge bg-light text-primary fs-12 border-0">
                      <i className="ri-add-fill align-bottom me-1" />Ajouter
                    </button>
                  </div>
                </div>
                {[
                  { bg: "bg-dark",    icon: "ri-github-fill",   val: "@user_telnet"  },
                  { bg: "bg-primary", icon: "ri-global-fill",   val: "www.telnet.tn" },
                  { bg: "bg-success", icon: "ri-linkedin-fill", val: "@telnet_user"  },
                ].map((item, i) => (
                  <div key={i} className={`${i < 2 ? "mb-3" : ""} d-flex align-items-center`}>
                    <div className="avatar-xs d-block flex-shrink-0 me-3">
                      <span className={`${item.bg} text-white rounded-circle d-flex align-items-center justify-content-center`}
                        style={{ width: 32, height: 32, fontSize: 15 }}>
                        <i className={item.icon} />
                      </span>
                    </div>
                    <input type="text" className="form-control" defaultValue={item.val} />
                  </div>
                ))}
              </div>
            </div>

          </div>
          {/* ── fin col gauche ── */}

          {/* ══ COLONNE DROITE ══ */}
          <div className="col-xxl-9">
            <div className="card mt-xxl-n5">

              {/* Onglets */}
              <div className="card-header">
                <ul className="nav nav-tabs-custom rounded card-header-tabs border-bottom-0 flex-wrap" role="tablist">
                  {TABS.map((t) => (
                    <li key={t.key} className="nav-item">
                      <button
                        className={`nav-link ${activeTab === t.key ? "active" : ""}`}
                        onClick={() => setActiveTab(t.key)}
                      >
                        <i className={`${t.icon} me-1`} />
                        {t.label}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="card-body p-4">

                {/* ══ APERÇU ══ */}
                {activeTab === "overview" && (
                  <div className="row g-4">
                    <div className="col-lg-4">

                      {/* Informations */}
                      <div className="card shadow-sm mb-4">
                        <div className="card-body">
                          <div className="d-flex align-items-center mb-3">
                            <h5 className="card-title mb-0 flex-grow-1">
                              <i className="ri-user-line me-2 text-primary" />Informations
                            </h5>
                            <button className="btn btn-sm btn-soft-primary" onClick={goToEdit}>
                              <i className="ri-edit-line me-1" />Modifier
                            </button>
                          </div>
                          <table className="table table-borderless mb-0 small">
                            <tbody>
                              {[
                                { label: "Nom",         val: displayName, cls: "text-capitalize fw-semibold" },
                                { label: "Email",       val: userEmail,   cls: "" },
                                { label: "Rôle",        val: userRole,    cls: "text-capitalize" },
                                { label: "Société",     val: "Telnet",    cls: "" },
                                { label: "Localisation",val: "Tunis, Tunisie", cls: "" },
                              ].map((row) => (
                                <tr key={row.label}>
                                  <th className="ps-0 text-muted fw-normal" style={{ width: "40%" }}>{row.label}</th>
                                  <td className={row.cls}>{row.val}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>

                      {/* Compétences */}
                      <div className="card shadow-sm mb-4">
                        <div className="card-body">
                          <h5 className="card-title mb-3">
                            <i className="ri-code-s-slash-line me-2 text-primary" />Compétences
                          </h5>
                          <div className="d-flex flex-wrap gap-2">
                            {SKILLS.map((s) => (
                              <span key={s} className="badge bg-primary-subtle text-primary fs-12 px-3 py-2 rounded-pill">
                                {s}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* Profil complété */}
                      <div className="card shadow-sm">
                        <div className="card-body">
                          <h5 className="card-title mb-3">
                            <i className="ri-shield-check-line me-2 text-primary" />Profil complété
                          </h5>
                          <div className="d-flex justify-content-between mb-1 small">
                            <span className="text-muted">Progression</span>
                            <span className="fw-semibold">65%</span>
                          </div>
                          <div className="progress" style={{ height: 8 }}>
                            <div className="progress-bar bg-primary" role="progressbar" style={{ width: "65%" }} />
                          </div>
                          <p className="text-muted small mt-2 mb-0">
                            Ajoutez un numéro de téléphone pour compléter votre profil.
                          </p>
                        </div>
                      </div>

                    </div>

                    <div className="col-lg-8">

                      {/* Stats */}
                      <div className="row g-3 mb-4">
                        {[
                          { label: "Projets",    val: 12, color: "primary", icon: "ri-folder-line"       },
                          { label: "Tâches",     val: 48, color: "success", icon: "ri-check-double-line"  },
                          { label: "En attente", val: 3,  color: "warning", icon: "ri-time-line"          },
                        ].map((stat) => (
                          <div key={stat.label} className="col-4">
                            <div className="card shadow-sm mb-0">
                              <div className="card-body text-center py-3">
                                <div
                                  className={`rounded-circle d-flex align-items-center justify-content-center
                                              bg-${stat.color}-subtle text-${stat.color} mx-auto mb-2`}
                                  style={{ width: 42, height: 42, fontSize: 20 }}
                                >
                                  <i className={stat.icon} />
                                </div>
                                <h4 className={`mb-0 fw-bold text-${stat.color}`}>{stat.val}</h4>
                                <small className="text-muted">{stat.label}</small>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* À propos */}
                      <div className="card shadow-sm mb-4">
                        <div className="card-body">
                          <h5 className="card-title mb-3">
                            <i className="ri-information-line me-2 text-primary" />À propos
                          </h5>
                          <p className="text-muted mb-0" style={{ lineHeight: 1.8 }}>{form.description}</p>
                        </div>
                      </div>

                      {/* Activité récente */}
                      <div className="card shadow-sm">
                        <div className="card-body">
                          <h5 className="card-title mb-4">
                            <i className="ri-pulse-line me-2 text-primary" />Activité récente
                          </h5>
                          <div className="acitivity-timeline">
                            {RECENT_ACTIVITIES.map((a, idx) => (
                              <div
                                key={a.id}
                                className={`d-flex align-items-start gap-3 ${idx < RECENT_ACTIVITIES.length - 1 ? "pb-4" : ""}`}
                                style={{
                                  borderLeft: idx < RECENT_ACTIVITIES.length - 1
                                    ? "2px dashed var(--vz-border-color, #e9ebec)"
                                    : "2px solid transparent",
                                  paddingLeft: "1.25rem",
                                  marginLeft: "0.75rem",
                                  position: "relative",
                                }}
                              >
                                <span
                                  className={`bg-${a.color} rounded-circle d-flex align-items-center
                                              justify-content-center text-white flex-shrink-0`}
                                  style={{ width: 32, height: 32, position: "absolute", left: -16, top: 0 }}
                                >
                                  <i className={`${a.icon} fs-14`} />
                                </span>
                                <div style={{ paddingLeft: "0.5rem" }}>
                                  <h6 className="mb-1 fw-semibold">{a.title}</h6>
                                  <p className="text-muted small mb-0">{a.desc}</p>
                                  <small className="text-muted">{a.time}</small>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>

                    </div>
                  </div>
                )}

                {/* ══ ACTIVITÉ ══ */}
                {activeTab === "activity" && (
                  <div className="card shadow-sm border-0">
                    <div className="card-body">
                      <h5 className="card-title mb-4">Toutes les activités</h5>
                      <div className="table-responsive">
                        <table className="table table-hover align-middle mb-0">
                          <thead className="table-light">
                            <tr>
                              <th>Événement</th>
                              <th>Description</th>
                              <th>Date</th>
                              <th>Statut</th>
                            </tr>
                          </thead>
                          <tbody>
                            {RECENT_ACTIVITIES.map((a) => (
                              <tr key={a.id}>
                                <td>
                                  <span className={`badge bg-${a.color}-subtle text-${a.color} p-2 me-2`}>
                                    <i className={a.icon} />
                                  </span>
                                  <span className="fw-semibold">{a.title}</span>
                                </td>
                                <td className="text-muted small">{a.desc}</td>
                                <td className="text-muted small">{a.time}</td>
                                <td><span className={`badge bg-${a.color}-subtle text-${a.color}`}>Complété</span></td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}

                {/* ══ PROJETS ══ */}
                {activeTab === "projects" && (
                  <div className="row g-4">
                    {PROJECTS.map((p) => (
                      <div key={p.id} className="col-md-6 col-xl-3">
                        <div className="card shadow-sm h-100">
                          <div className="card-body">
                            <div className="d-flex justify-content-between align-items-start mb-3">
                              <div
                                className="rounded d-flex align-items-center justify-content-center bg-primary-subtle text-primary"
                                style={{ width: 42, height: 42, fontSize: 20 }}
                              >
                                <i className="ri-folder-3-line" />
                              </div>
                              <span className={`badge bg-${p.badge}-subtle text-${p.badge}`}>{p.status}</span>
                            </div>
                            <h6 className="fw-semibold mb-1">{p.name}</h6>
                            <p className="text-muted small mb-3">Mis à jour il y a {p.lastUpdate}</p>
                            <div className="progress" style={{ height: 4 }}>
                              <div className={`progress-bar bg-${p.badge}`} style={{ width: `${p.progress}%` }} />
                            </div>
                            <small className="text-muted">{p.progress}%</small>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* ══ MODIFIER LE PROFIL ══ */}
                {activeTab === "personalDetails" && (
                  <form onSubmit={handleSave}>
                    {saved && (
                      <div className="alert alert-success mb-4">
                        <i className="ri-check-double-line me-2" />
                        Profil mis à jour avec succès !
                      </div>
                    )}
                    <div className="row">
                      {[
                        { name: "firstName",   label: "Prénom",      col: 6, type: "text"  },
                        { name: "lastName",    label: "Nom",         col: 6, type: "text"  },
                        { name: "phone",       label: "Téléphone",   col: 6, type: "text"  },
                        { name: "email",       label: "Email",       col: 6, type: "email" },
                        { name: "designation", label: "Poste",       col: 6, type: "text"  },
                        { name: "website",     label: "Site web",    col: 6, type: "text"  },
                        { name: "city",        label: "Ville",       col: 4, type: "text"  },
                        { name: "country",     label: "Pays",        col: 4, type: "text"  },
                        { name: "zipcode",     label: "Code postal", col: 4, type: "text"  },
                      ].map((field) => (
                        <div key={field.name} className={`col-lg-${field.col}`}>
                          <div className="mb-3">
                            <label className="form-label">{field.label}</label>
                            <input
                              type={field.type} name={field.name} className="form-control"
                              value={form[field.name]} onChange={handleFormChange}
                            />
                          </div>
                        </div>
                      ))}
                      <div className="col-lg-12">
                        <div className="mb-3 pb-2">
                          <label className="form-label">Description</label>
                          <textarea
                            name="description" className="form-control" rows={4}
                            value={form.description} onChange={handleFormChange}
                            placeholder="Parlez-nous de vous..."
                          />
                        </div>
                      </div>
                      <div className="col-lg-12">
                        <div className="hstack gap-2 justify-content-end">
                          <button type="submit" className="btn btn-primary">Enregistrer</button>
                          <button type="button" className="btn btn-soft-info" onClick={() => setActiveTab("overview")}>
                            Annuler
                          </button>
                        </div>
                      </div>
                    </div>
                  </form>
                )}

                {/* ══ MOT DE PASSE ══ */}
                {activeTab === "changePassword" && (
                  <form onSubmit={(e) => e.preventDefault()}>
                    <div className="row g-2">
                      <div className="col-lg-4">
                        <label className="form-label">Ancien mot de passe *</label>
                        <input
                          type="password" name="old" className="form-control"
                          value={pwdForm.old} onChange={handlePwdChange}
                          placeholder="Mot de passe actuel"
                        />
                      </div>
                      <div className="col-lg-4">
                        <label className="form-label">Nouveau mot de passe *</label>
                        <input
                          type="password" name="newPwd" className="form-control"
                          value={pwdForm.newPwd} onChange={handlePwdChange}
                          placeholder="Nouveau mot de passe"
                        />
                      </div>
                      <div className="col-lg-4">
                        <label className="form-label">Confirmer *</label>
                        <input
                          type="password" name="confirm" className="form-control"
                          value={pwdForm.confirm} onChange={handlePwdChange}
                          placeholder="Confirmer"
                        />
                      </div>
                      <div className="col-lg-12">
                        <button type="button" className="link-primary text-decoration-underline border-0 bg-transparent p-0 fs-13">
                          Mot de passe oublié ?
                        </button>
                      </div>
                      <div className="col-lg-12">
                        <div className="text-end">
                          <button type="submit" className="btn btn-info">
                            Changer le mot de passe
                          </button>
                        </div>
                      </div>
                    </div>
                  </form>
                )}

              </div>
            </div>
          </div>
          {/* ── fin col droite ── */}

        </div>
      </div>
    </div>
  );
}
