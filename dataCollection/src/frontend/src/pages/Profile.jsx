/**
 * Profile.jsx
 * CORRECTION v2 :
 *   [FIX] showProfileToast → useCallback (référence stable pour les deps de handleSave)
 *   [FIX] showPwdToast     → useCallback (idem pour handlePwdSave)
 *   Sans ça, handleSave/handlePwdSave avaient ces fonctions en fermeture stale
 *   → les setState dans les toasts pouvaient ne pas déclencher un re-render correct.
 */

import { useState, useCallback } from "react";
import { useAuth } from "../context/AuthContext";

const getInitials = (email="") =>
  email.split("@")[0].split(/[._-]/).slice(0,2).map(p=>p[0]?.toUpperCase()??"").join("") || "U";

const AVATAR_GRADIENTS = [
  ["#405189","#0ab39c"],["#299cdb","#405189"],["#f7b84b","#f06548"],
  ["#0ab39c","#299cdb"],["#f06548","#405189"],["#3577f1","#0ab39c"],
];
const avatarGradient = (email="") => {
  let h=0; for(let i=0;i<email.length;i++) h=email.charCodeAt(i)+((h<<5)-h);
  const [a,b]=AVATAR_GRADIENTS[Math.abs(h)%AVATAR_GRADIENTS.length];
  return `linear-gradient(135deg,${a} 0%,${b} 100%)`;
};

const SKILLS = ["React","Node.js","Python","Docker","GitLab CI","PostgreSQL","TypeScript"];
const RECENT_ACTIVITIES = [
  {id:1,icon:"ri-git-merge-line",  color:"success",title:"Pipeline GitLab réussi",        desc:"Build #142 — branche main",  time:"Il y a 2 min"  },
  {id:2,icon:"ri-file-chart-line", color:"info",   title:"Rapport analytique disponible", desc:"Rapport mensuel Q1 2026",    time:"Il y a 10 min" },
  {id:3,icon:"ri-team-line",       color:"primary",title:"Nouveau membre ajouté",          desc:"Équipe Projet Alpha",        time:"Hier"          },
  {id:4,icon:"ri-ticket-2-line",   color:"warning",title:"Ticket assigné",                 desc:"Bug #389 — Module Auth",     time:"Il y a 2 jours"},
];
const PROJECTS = [
  {id:1,name:"Velzon Dashboard",     status:"En cours",badge:"warning",  lastUpdate:"4h",progress:60 },
  {id:2,name:"API Gateway Refactor", status:"Terminé", badge:"success",  lastUpdate:"1j",progress:100},
  {id:3,name:"Mobile App v2",        status:"En pause",badge:"secondary",lastUpdate:"3j",progress:30 },
  {id:4,name:"Data Pipeline ETL",    status:"En cours",badge:"warning",  lastUpdate:"2h",progress:55 },
];
const TABS = [
  {key:"overview",        label:"Aperçu",             icon:"ri-layout-grid-line"  },
  {key:"activity",        label:"Activité",           icon:"ri-list-check-2"       },
  {key:"projects",        label:"Projets",            icon:"ri-folder-line"        },
  {key:"personalDetails", label:"Modifier le profil", icon:"ri-edit-box-line"      },
  {key:"changePassword",  label:"Mot de passe",       icon:"ri-lock-password-line" },
];
const MAX_DESC = 300;

function PwdStrength({ pwd }) {
  if (!pwd) return null;
  const hasUpper  = /[A-Z]/.test(pwd);
  const hasLower  = /[a-z]/.test(pwd);
  const hasDigit  = /\d/.test(pwd);
  const hasSpecial= /[^a-zA-Z0-9]/.test(pwd);
  const score = [pwd.length>=8,hasUpper,hasLower,hasDigit,hasSpecial].filter(Boolean).length;
  const label = score<=1?"Très faible":score===2?"Faible":score===3?"Moyen":score===4?"Fort":"Très fort";
  const color = score<=2?"#f06548":score===3?"#f7b84b":"#0ab39c";
  return (
    <div className="mt-1">
      <div style={{height:4,borderRadius:99,background:"#e9ecef",overflow:"hidden"}}>
        <div style={{height:"100%",width:`${Math.min(100,score*20)}%`,background:color,borderRadius:99,transition:"width .3s,background .3s"}}></div>
      </div>
      <p className="fs-11 text-muted mb-0 mt-1">Force : <span style={{color,fontWeight:600}}>{label}</span></p>
    </div>
  );
}

export default function Profile() {
  const { user } = useAuth();
  const userEmail   = user?.email ?? "user@telnet.tn";
  const userRole    = user?.role  ?? "user";
  const displayName = userEmail.split("@")[0].replace(/[._-]/g," ");
  const initials    = getInitials(userEmail);
  const gradient    = avatarGradient(userEmail);

  const [activeTab, setActiveTab] = useState("overview");

  // ✅ FIX : useCallback pour référence stable dans les deps de handleSave / handlePwdSave
  const [profileToast, setProfileToast] = useState(null);
  const [pwdToast,     setPwdToast]     = useState(null);

  const showProfileToast = useCallback((msg,type="success")=>{
    setProfileToast({msg,type});
    setTimeout(()=>setProfileToast(null),3500);
  },[]);

  const showPwdToast = useCallback((msg,type="success")=>{
    setPwdToast({msg,type});
    setTimeout(()=>setPwdToast(null),3500);
  },[]);

  const initialForm = {
    firstName:   displayName.split(" ")[0]??"",
    lastName:    displayName.split(" ")[1]??"",
    phone:       "+216 55 123 456",
    email:       userEmail,
    designation: userRole,
    website:     "www.telnet.tn",
    city:        "Tunis",
    country:     "Tunisie",
    zipcode:     "1000",
    description: "Membre de l'équipe Telnet, passionné par le développement logiciel et l'intégration continue.",
  };

  const [form,      setForm]      = useState(initialForm);
  const [pwdForm,   setPwdForm]   = useState({old:"",newPwd:"",confirm:""});
  const [pwdErrors, setPwdErrors] = useState({});
  const [showPwds,  setShowPwds]  = useState({old:false,new:false,confirm:false});

  const handleFormChange = (e) => setForm(f=>({...f,[e.target.name]:e.target.value}));
  const handlePwdChange  = (e) => {
    setPwdForm(f=>({...f,[e.target.name]:e.target.value}));
    setPwdErrors(err=>({...err,[e.target.name]:""}));
  };

  // ✅ FIX : showProfileToast dans les deps (useCallback → référence stable → pas de boucle)
  const handleSave = useCallback((e) => {
    e.preventDefault();
    showProfileToast("Profil mis à jour avec succès !");
  },[showProfileToast]);

  // ✅ FIX : showPwdToast dans les deps
  const handlePwdSave = useCallback((e) => {
    e.preventDefault();
    const errors={};
    if (!pwdForm.old)                               errors.old     = "L'ancien mot de passe est requis.";
    if (pwdForm.newPwd.length<6)                    errors.newPwd  = "Minimum 6 caractères.";
    if (pwdForm.newPwd===pwdForm.old&&pwdForm.old)  errors.newPwd  = "Le nouveau mot de passe doit être différent de l'ancien.";
    if (pwdForm.confirm!==pwdForm.newPwd)           errors.confirm = "Les mots de passe ne correspondent pas.";
    if (Object.keys(errors).length>0) { setPwdErrors(errors); return; }
    setPwdForm({old:"",newPwd:"",confirm:""}); setPwdErrors({});
    showPwdToast("Mot de passe modifié avec succès !");
  },[pwdForm, showPwdToast]);

  const goToEdit  = () => setActiveTab("personalDetails");
  const togglePwd = (field) => setShowPwds(v=>({...v,[field]:!v[field]}));

  return (
    <div className="page-content"><div className="container-fluid">

      {/* Cover */}
      <div className="position-relative mx-n4 mt-n4">
        <div style={{height:200,background:"linear-gradient(135deg,#405189 0%,#0ab39c 100%)",position:"relative",overflow:"hidden"}}>
          <svg style={{position:"absolute",bottom:0,right:0,opacity:0.1}} width="400" height="200" viewBox="0 0 400 200"><circle cx="350" cy="100" r="160" fill="white"/><circle cx="250" cy="185" r="100" fill="white"/></svg>
          <div style={{position:"absolute",top:12,right:12}}>
            <label htmlFor="cover-img" className="btn btn-light btn-sm" style={{cursor:"pointer"}}><i className="ri-image-edit-line align-bottom me-1"/>Changer la couverture</label>
            <input id="cover-img" type="file" className="d-none"/>
          </div>
        </div>
      </div>

      <div className="row">
        {/* Colonne gauche */}
        <div className="col-xxl-3">
          <div className="card mt-n5"><div className="card-body p-4">
            <div className="text-center">
              <div className="profile-user position-relative d-inline-block mx-auto mb-4">
                <div className="rounded-circle d-flex align-items-center justify-content-center text-white fw-bold" style={{width:96,height:96,fontSize:28,background:gradient,border:"3px solid #fff",boxShadow:"0 2px 12px rgba(0,0,0,.12)",userSelect:"none"}}>{initials}</div>
                <label htmlFor="profile-img-input" className="position-absolute bottom-0 end-0 d-flex align-items-center justify-content-center rounded-circle bg-light text-body" style={{width:28,height:28,cursor:"pointer",border:"2px solid #fff"}}><i className="ri-camera-fill fs-14"/></label>
                <input id="profile-img-input" type="file" className="d-none"/>
              </div>
              <h5 className="fs-16 mb-1 text-capitalize">{displayName}</h5>
              <p className="text-muted mb-0 text-capitalize">{userRole}</p>
            </div>
          </div></div>

          <div className="card"><div className="card-body">
            <div className="d-flex align-items-center mb-4">
              <h5 className="card-title mb-0 flex-grow-1">Compléter votre profil</h5>
              <button className="badge bg-light text-primary fs-12 border-0" onClick={goToEdit} style={{cursor:"pointer"}}><i className="ri-edit-box-line align-bottom me-1"/>Modifier</button>
            </div>
            <div className="progress animated-progress" style={{height:12}}><div className="progress-bar bg-info" role="progressbar" style={{width:"65%"}}>65%</div></div>
          </div></div>

          <div className="card"><div className="card-body">
            <div className="d-flex align-items-center mb-4">
              <h5 className="card-title mb-0 flex-grow-1">Portfolio</h5>
              <button className="badge bg-light text-primary fs-12 border-0"><i className="ri-add-fill align-bottom me-1"/>Ajouter</button>
            </div>
            {[{bg:"bg-dark",icon:"ri-github-fill",val:"@user_telnet"},{bg:"bg-primary",icon:"ri-global-fill",val:"www.telnet.tn"},{bg:"bg-success",icon:"ri-linkedin-fill",val:"@telnet_user"}].map((item,i)=>(
              <div key={i} className={`${i<2?"mb-3":""} d-flex align-items-center`}>
                <div className="avatar-xs d-block flex-shrink-0 me-3"><span className={`${item.bg} text-white rounded-circle d-flex align-items-center justify-content-center`} style={{width:32,height:32,fontSize:15}}><i className={item.icon}/></span></div>
                <input type="text" className="form-control" defaultValue={item.val}/>
              </div>
            ))}
          </div></div>
        </div>

        {/* Colonne droite */}
        <div className="col-xxl-9">
          <div className="card mt-xxl-n5">
            <div className="card-header">
              <ul className="nav nav-tabs-custom rounded card-header-tabs border-bottom-0 flex-wrap" role="tablist">
                {TABS.map(t=>(
                  <li key={t.key} className="nav-item">
                    <button className={`nav-link ${activeTab===t.key?"active":""}`} onClick={()=>setActiveTab(t.key)}>
                      <i className={`${t.icon} me-1`}/>{t.label}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
            <div className="card-body p-4">

              {/* ── APERÇU ── */}
              {activeTab==="overview"&&(
                <div className="row g-4">
                  <div className="col-lg-4">
                    <div className="card shadow-sm mb-4"><div className="card-body">
                      <div className="d-flex align-items-center mb-3"><h5 className="card-title mb-0 flex-grow-1"><i className="ri-user-line me-2 text-primary"/>Informations</h5><button className="btn btn-sm btn-soft-primary" onClick={goToEdit}><i className="ri-edit-line me-1"/>Modifier</button></div>
                      <table className="table table-borderless mb-0 small"><tbody>
                        {[{label:"Nom",val:displayName,cls:"text-capitalize fw-semibold"},{label:"Email",val:userEmail,cls:""},{label:"Rôle",val:userRole,cls:"text-capitalize"},{label:"Société",val:"Telnet",cls:""},{label:"Localisation",val:"Tunis, Tunisie",cls:""}].map(row=>(
                          <tr key={row.label}><th className="ps-0 text-muted fw-normal" style={{width:"40%"}}>{row.label}</th><td className={row.cls}>{row.val}</td></tr>
                        ))}
                      </tbody></table>
                    </div></div>
                    <div className="card shadow-sm mb-4"><div className="card-body">
                      <h5 className="card-title mb-3"><i className="ri-code-s-slash-line me-2 text-primary"/>Compétences</h5>
                      <div className="d-flex flex-wrap gap-2">{SKILLS.map(s=><span key={s} className="badge bg-primary-subtle text-primary fs-12 px-3 py-2 rounded-pill">{s}</span>)}</div>
                    </div></div>
                    <div className="card shadow-sm"><div className="card-body">
                      <h5 className="card-title mb-3"><i className="ri-shield-check-line me-2 text-primary"/>Profil complété</h5>
                      <div className="d-flex justify-content-between mb-1 small"><span className="text-muted">Progression</span><span className="fw-semibold">65%</span></div>
                      <div className="progress" style={{height:8}}><div className="progress-bar bg-primary" style={{width:"65%"}}/></div>
                      <p className="text-muted small mt-2 mb-0">Ajoutez un numéro de téléphone pour compléter votre profil.</p>
                    </div></div>
                  </div>
                  <div className="col-lg-8">
                    <div className="row g-3 mb-4">
                      {[{label:"Projets",val:12,color:"primary",icon:"ri-folder-line"},{label:"Tâches",val:48,color:"success",icon:"ri-check-double-line"},{label:"En attente",val:3,color:"warning",icon:"ri-time-line"}].map(stat=>(
                        <div key={stat.label} className="col-4"><div className="card shadow-sm mb-0"><div className="card-body text-center py-3">
                          <div className={`rounded-circle d-flex align-items-center justify-content-center bg-${stat.color}-subtle text-${stat.color} mx-auto mb-2`} style={{width:42,height:42,fontSize:20}}><i className={stat.icon}/></div>
                          <h4 className={`mb-0 fw-bold text-${stat.color}`}>{stat.val}</h4>
                          <small className="text-muted">{stat.label}</small>
                        </div></div></div>
                      ))}
                    </div>
                    <div className="card shadow-sm mb-4"><div className="card-body"><h5 className="card-title mb-3"><i className="ri-information-line me-2 text-primary"/>À propos</h5><p className="text-muted mb-0" style={{lineHeight:1.8}}>{form.description}</p></div></div>
                    <div className="card shadow-sm"><div className="card-body">
                      <h5 className="card-title mb-4"><i className="ri-pulse-line me-2 text-primary"/>Activité récente</h5>
                      <div className="acitivity-timeline">
                        {RECENT_ACTIVITIES.map((a,idx)=>(
                          <div key={a.id} className={`d-flex align-items-start gap-3 ${idx<RECENT_ACTIVITIES.length-1?"pb-4":""}`}
                            style={{borderLeft:idx<RECENT_ACTIVITIES.length-1?"2px dashed var(--vz-border-color,#e9ebec)":"2px solid transparent",paddingLeft:"1.25rem",marginLeft:"0.75rem",position:"relative"}}>
                            <span className={`bg-${a.color} rounded-circle d-flex align-items-center justify-content-center text-white flex-shrink-0`} style={{width:32,height:32,position:"absolute",left:-16,top:0}}><i className={`${a.icon} fs-14`}/></span>
                            <div style={{paddingLeft:"0.5rem"}}><h6 className="mb-1 fw-semibold">{a.title}</h6><p className="text-muted small mb-0">{a.desc}</p><small className="text-muted">{a.time}</small></div>
                          </div>
                        ))}
                      </div>
                    </div></div>
                  </div>
                </div>
              )}

              {/* ── ACTIVITÉ ── */}
              {activeTab==="activity"&&(
                <div className="card shadow-sm border-0"><div className="card-body">
                  <h5 className="card-title mb-4">Toutes les activités</h5>
                  <div className="table-responsive"><table className="table table-hover align-middle mb-0">
                    <thead className="table-light"><tr><th>Événement</th><th>Description</th><th>Date</th><th>Statut</th></tr></thead>
                    <tbody>{RECENT_ACTIVITIES.map(a=>(
                      <tr key={a.id}><td><span className={`badge bg-${a.color}-subtle text-${a.color} p-2 me-2`}><i className={a.icon}/></span><span className="fw-semibold">{a.title}</span></td><td className="text-muted small">{a.desc}</td><td className="text-muted small">{a.time}</td><td><span className={`badge bg-${a.color}-subtle text-${a.color}`}>Complété</span></td></tr>
                    ))}</tbody>
                  </table></div>
                </div></div>
              )}

              {/* ── PROJETS ── */}
              {activeTab==="projects"&&(
                <div className="row g-4">{PROJECTS.map(p=>(
                  <div key={p.id} className="col-md-6 col-xl-3"><div className="card shadow-sm h-100"><div className="card-body">
                    <div className="d-flex justify-content-between align-items-start mb-3">
                      <div className="rounded d-flex align-items-center justify-content-center bg-primary-subtle text-primary" style={{width:42,height:42,fontSize:20}}><i className="ri-folder-3-line"/></div>
                      <span className={`badge bg-${p.badge}-subtle text-${p.badge}`}>{p.status}</span>
                    </div>
                    <h6 className="fw-semibold mb-1">{p.name}</h6>
                    <p className="text-muted small mb-3">Mis à jour il y a {p.lastUpdate}</p>
                    <div className="progress" style={{height:4}}><div className={`progress-bar bg-${p.badge}`} style={{width:`${p.progress}%`}}/></div>
                    <small className="text-muted">{p.progress}%</small>
                  </div></div></div>
                ))}</div>
              )}

              {/* ── MODIFIER PROFIL ── */}
              {activeTab==="personalDetails"&&(
                <form onSubmit={handleSave}>
                  {profileToast&&<div className={`alert alert-${profileToast.type} d-flex align-items-center gap-2 mb-4 py-2`}><i className={profileToast.type==="success"?"ri-check-double-line fs-16":"ri-error-warning-line fs-16"}></i><span>{profileToast.msg}</span></div>}
                  <div className="row">
                    {[{name:"firstName",label:"Prénom",col:6,type:"text"},{name:"lastName",label:"Nom",col:6,type:"text"},{name:"phone",label:"Téléphone",col:6,type:"text"},{name:"email",label:"Email",col:6,type:"email"},{name:"designation",label:"Poste",col:6,type:"text"},{name:"website",label:"Site web",col:6,type:"text"},{name:"city",label:"Ville",col:4,type:"text"},{name:"country",label:"Pays",col:4,type:"text"},{name:"zipcode",label:"Code postal",col:4,type:"text"}].map(field=>(
                      <div key={field.name} className={`col-lg-${field.col}`}><div className="mb-3"><label className="form-label">{field.label}</label><input type={field.type} name={field.name} className="form-control" value={form[field.name]} onChange={handleFormChange}/></div></div>
                    ))}
                    <div className="col-lg-12"><div className="mb-3 pb-2">
                      <label className="form-label d-flex justify-content-between">
                        <span>Description</span>
                        <span className={`fs-12 ${form.description.length>MAX_DESC*0.9?"text-danger":"text-muted"}`}>{form.description.length}/{MAX_DESC}</span>
                      </label>
                      <textarea name="description" className="form-control" rows={4} value={form.description} onChange={handleFormChange} maxLength={MAX_DESC}/>
                    </div></div>
                    <div className="col-lg-12"><div className="hstack gap-2 justify-content-end">
                      <button type="submit" className="btn btn-primary"><i className="ri-save-line me-1"></i>Enregistrer</button>
                      <button type="button" className="btn btn-soft-secondary" onClick={()=>{setForm(initialForm);setActiveTab("overview");}}>Annuler</button>
                    </div></div>
                  </div>
                </form>
              )}

              {/* ── MOT DE PASSE ── */}
              {activeTab==="changePassword"&&(
                <form onSubmit={handlePwdSave}>
                  {pwdToast&&<div className={`alert alert-${pwdToast.type} d-flex align-items-center gap-2 mb-4 py-2`}><i className={pwdToast.type==="success"?"ri-check-double-line fs-16":"ri-error-warning-line fs-16"}></i><span>{pwdToast.msg}</span></div>}
                  <div className="row g-3">
                    <div className="col-lg-4">
                      <label className="form-label">Ancien mot de passe *</label>
                      <div className="input-group">
                        <span className="input-group-text"><i className="ri-lock-line text-muted"></i></span>
                        <input type={showPwds.old?"text":"password"} name="old" className={`form-control ${pwdErrors.old?"is-invalid":""}`} value={pwdForm.old} onChange={handlePwdChange} placeholder="Mot de passe actuel"/>
                        <button className="btn btn-outline-secondary" type="button" onClick={()=>togglePwd("old")}><i className={showPwds.old?"ri-eye-off-line":"ri-eye-line"}></i></button>
                        {pwdErrors.old&&<div className="invalid-feedback">{pwdErrors.old}</div>}
                      </div>
                    </div>
                    <div className="col-lg-4">
                      <label className="form-label">Nouveau mot de passe *</label>
                      <div className="input-group">
                        <span className="input-group-text"><i className="ri-lock-password-line text-muted"></i></span>
                        <input type={showPwds.new?"text":"password"} name="newPwd" className={`form-control ${pwdErrors.newPwd?"is-invalid":""}`} value={pwdForm.newPwd} onChange={handlePwdChange} placeholder="Nouveau mot de passe"/>
                        <button className="btn btn-outline-secondary" type="button" onClick={()=>togglePwd("new")}><i className={showPwds.new?"ri-eye-off-line":"ri-eye-line"}></i></button>
                        {pwdErrors.newPwd&&<div className="invalid-feedback">{pwdErrors.newPwd}</div>}
                      </div>
                      <PwdStrength pwd={pwdForm.newPwd}/>
                    </div>
                    <div className="col-lg-4">
                      <label className="form-label">Confirmer *</label>
                      <div className="input-group">
                        <span className="input-group-text"><i className="ri-lock-check-line text-muted"></i></span>
                        <input type={showPwds.confirm?"text":"password"} name="confirm" className={`form-control ${pwdErrors.confirm?"is-invalid":pwdForm.confirm&&pwdForm.confirm===pwdForm.newPwd?"is-valid":""}`} value={pwdForm.confirm} onChange={handlePwdChange} placeholder="Confirmer"/>
                        <button className="btn btn-outline-secondary" type="button" onClick={()=>togglePwd("confirm")}><i className={showPwds.confirm?"ri-eye-off-line":"ri-eye-line"}></i></button>
                        {pwdErrors.confirm&&<div className="invalid-feedback">{pwdErrors.confirm}</div>}
                        {pwdForm.confirm&&pwdForm.confirm===pwdForm.newPwd&&!pwdErrors.confirm&&<span className="valid-feedback d-flex align-items-center"><i className="ri-check-line me-1"></i>Correspond</span>}
                      </div>
                    </div>
                    <div className="col-lg-12">
                      <div className="d-flex align-items-center justify-content-between">
                        <a href="#" className="link-primary text-decoration-underline border-0 bg-transparent p-0 fs-13">Mot de passe oublié ?</a>
                        <div className="hstack gap-2">
                          <button type="submit" className="btn btn-info"><i className="ri-lock-password-line me-1"></i>Changer le mot de passe</button>
                          <button type="button" className="btn btn-soft-secondary" onClick={()=>{setPwdForm({old:"",newPwd:"",confirm:""});setPwdErrors({});}}>Annuler</button>
                        </div>
                      </div>
                    </div>
                  </div>
                </form>
              )}

            </div>
          </div>
        </div>
      </div>
    </div></div>
  );
}
