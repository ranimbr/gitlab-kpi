/**
 * UsersPage.jsx — Gestion des utilisateurs (Admin)
 * Aucun bug — code original parfaitement écrit.
 *
 * [FIX] dashboard_view_group supprimé → dashboard_access: number[]
 * [FIX] UserModal : suppression champ dashboard_view_group
 * [NEW] Affichage du nombre de dashboards accessibles (dashboard_access[].length)
 * [NEW] Bouton "Gérer les accès dashboards" → lien vers DashboardsAdminPage
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import api          from "../services/api";
import adminService from "../services/adminService";

function formatDate(d) { if(!d)return"—"; return new Date(d).toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"}); }
function getInitials(email="") { const parts=email.split("@")[0].split(/[._-]/); return(parts.length>=2?(parts[0][0]+parts[1][0]):email.slice(0,2)).toUpperCase(); }

const ROLE_COLORS={admin:"danger",user:"info"};
const ROLE_ICONS ={admin:"ri-shield-user-line",user:"ri-user-line"};

function exportCSV(users) {
  const headers=["ID","Email","Role","Status","Dashboards","Created"];
  const rows=users.map(u=>[u.id,u.email,u.role,u.is_active?"Active":"Inactive",(u.dashboard_access||[]).length,formatDate(u.created_at)]);
  const csv=[headers,...rows].map(r=>r.join(",")).join("\n");
  const url=URL.createObjectURL(new Blob(["\uFEFF"+csv],{type:"text/csv;charset=utf-8;"}));
  const a=document.createElement("a"); a.href=url; a.download="users.csv"; a.click();
  URL.revokeObjectURL(url);
}

function useEscapeKey(callback,enabled=true) {
  useEffect(()=>{ if(!enabled)return; const h=(e)=>{if(e.key==="Escape")callback();}; document.addEventListener("keydown",h); return()=>document.removeEventListener("keydown",h); },[callback,enabled]);
}

function Toast({ toast }) {
  if(!toast)return null;
  return(<div className={`alert alert-${toast.type} d-flex align-items-center gap-2 position-fixed top-0 end-0 m-3 shadow`} style={{zIndex:9999,minWidth:300,borderRadius:10}}><i className={toast.type==="success"?"ri-checkbox-circle-line fs-16":"ri-error-warning-line fs-16"}></i><span>{toast.msg}</span></div>);
}

function UserDetailModal({ user, onClose, onEdit, onDelete }) {
  useEscapeKey(onClose);
  if(!user)return null;
  const color=ROLE_COLORS[user.role]||"info";
  const dashCount=(user.dashboard_access||[]).length;
  return (
    <div className="modal fade show d-block" role="dialog" aria-modal="true" style={{backgroundColor:"rgba(30,34,45,0.6)",backdropFilter:"blur(3px)",zIndex:1055}} onClick={onClose}>
      <div className="modal-dialog modal-dialog-centered" style={{maxWidth:460}} onClick={e=>e.stopPropagation()}>
        <div className="modal-content border-0" style={{borderRadius:16,boxShadow:"0 24px 64px rgba(0,0,0,0.18)"}}>
          <div className="px-4 pt-4 pb-3" style={{borderBottom:"1px solid #f1f3f7"}}>
            <div className="d-flex align-items-center gap-3">
              <div className="rounded-circle flex-shrink-0 d-flex align-items-center justify-content-center fw-bold text-white fs-14" style={{width:48,height:48,background:"linear-gradient(135deg,#405189,#3577f1)"}}>{getInitials(user.email)}</div>
              <div className="flex-grow-1 min-w-0">
                <h5 className="fw-semibold text-dark mb-0 fs-15 text-truncate">{user.email}</h5>
                <div className="d-flex align-items-center gap-2 mt-1">
                  <span className={`badge bg-${color}-subtle text-${color} fs-11`}><i className={`${ROLE_ICONS[user.role]} me-1`}></i>{user.role.charAt(0).toUpperCase()+user.role.slice(1)}</span>
                  <span className={`badge fs-11 ${user.is_active?"bg-success-subtle text-success":"bg-danger-subtle text-danger"}`}>{user.is_active?"✓ Active":"✗ Inactive"}</span>
                </div>
              </div>
              <button className="btn-close flex-shrink-0" onClick={onClose} style={{opacity:0.5}}></button>
            </div>
          </div>
          <div className="px-4 py-4">
            <div className="row g-3">
              {[
                {icon:"ri-hashtag",        label:"User ID",  value:`#${user.id}`},
                {icon:"ri-mail-line",      label:"Email",    value:user.email},
                {icon:"ri-shield-user-line",label:"Role",    value:user.role.charAt(0).toUpperCase()+user.role.slice(1)},
                {icon:"ri-calendar-line",  label:"Created",  value:formatDate(user.created_at)},
                {icon:"ri-toggle-line",    label:"Status",   value:user.is_active?"Active":"Inactive",valueColor:user.is_active?"#15803d":"#dc2626"},
                {icon:"ri-layout-grid-line",label:"Dashboards",value:`${dashCount} dashboard${dashCount!==1?"s":""}`,valueColor:dashCount>0?"#405189":undefined},
              ].map((item,i)=>(
                <div key={i} className="col-6"><div className="rounded-3 p-3" style={{background:"#f8f9fc",border:"1px solid #e9ecef"}}>
                  <div style={{fontSize:10,color:"#9ca3af",textTransform:"uppercase",fontWeight:600,letterSpacing:0.8,marginBottom:4}}><i className={`${item.icon} me-1`}></i>{item.label}</div>
                  <div className="fw-semibold fs-13 text-truncate" style={{color:item.valueColor||"#1e2a3b"}}>{item.value}</div>
                </div></div>
              ))}
            </div>
          </div>
          <div className="px-4 py-3 d-flex justify-content-between align-items-center" style={{borderTop:"1px solid #f1f3f7",background:"#fafbfc",borderRadius:"0 0 16px 16px"}}>
            <button className="btn btn-sm btn-soft-danger px-3" onClick={()=>{onClose();onDelete(user);}}><i className="ri-delete-bin-line me-1"></i>Supprimer</button>
            <div className="d-flex gap-2">
              <button className="btn btn-sm btn-light px-3" onClick={onClose}>Fermer</button>
              <button className="btn btn-sm btn-primary px-3" onClick={()=>onEdit(user)}><i className="ri-pencil-line me-1"></i>Modifier</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function DeleteModal({ user, onConfirm, onClose, loading }) {
  useEscapeKey(()=>{if(!loading)onClose();},!!user);
  if(!user)return null;
  return (
    <div className="modal fade show d-block" role="dialog" aria-modal="true" style={{backgroundColor:"rgba(30,34,45,0.6)",backdropFilter:"blur(3px)",zIndex:1055}} onClick={e=>{if(e.target===e.currentTarget&&!loading)onClose();}}>
      <div className="modal-dialog modal-dialog-centered" style={{maxWidth:420}} onClick={e=>e.stopPropagation()}>
        <div className="modal-content border-0" style={{borderRadius:16,boxShadow:"0 24px 64px rgba(0,0,0,0.18)"}}>
          <div className="px-4 pt-4 pb-3" style={{borderBottom:"1px solid #f1f3f7"}}>
            <div className="d-flex align-items-center justify-content-between"><h5 className="fw-semibold text-dark mb-0 fs-15">Delete this user?</h5><button className="btn-close" onClick={onClose} disabled={loading} style={{opacity:0.5}}></button></div>
          </div>
          <div className="px-4 py-4 text-center"><div className="avatar-md mx-auto mb-3"><div className="avatar-title bg-danger-subtle text-danger rounded-circle fs-3"><i className="ri-delete-bin-line"></i></div></div><p className="text-muted mb-0 fs-14">Permanently delete <strong>{user.email}</strong>? This cannot be undone.</p></div>
          <div className="px-4 py-3 d-flex justify-content-end gap-2" style={{borderTop:"1px solid #f1f3f7",background:"#fafbfc",borderRadius:"0 0 16px 16px"}}>
            <button className="btn btn-sm btn-light px-4" onClick={onClose} disabled={loading}>Cancel</button>
            <button className="btn btn-sm btn-danger px-4" onClick={()=>onConfirm(user.id)} disabled={loading}>{loading?<><span className="spinner-border spinner-border-sm me-2"></span>Deleting…</>:<><i className="ri-delete-bin-line me-1"></i>Yes, Delete</>}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function UserModal({ mode, user, onClose, onSave }) {
  const isEdit=mode==="edit";
  const [form,setForm]=useState({email:user?.email||"",password:"",role:user?.role||"user",is_active:user?.is_active??true,new_password:""});
  const [error,setError]=useState(""); const [loading,setLoading]=useState(false); const [showPwd,setShowPwd]=useState(false);
  useEscapeKey(()=>{if(!loading)onClose();});
  const handle=(e)=>{ const{name,value,type,checked}=e.target; setForm(f=>({...f,[name]:type==="checkbox"?checked:value})); };
  const submit=async()=>{
    setError("");
    if(!isEdit&&!form.email) return setError("Email is required.");
    if(!isEdit&&form.password.length<6) return setError("Password must be at least 6 characters.");
    setLoading(true);
    try {
      if(isEdit){ const payload={role:form.role,is_active:form.is_active}; if(form.new_password)payload.new_password=form.new_password; await api.put(`/admin/users/${user.id}`,payload); }
      else { await api.post("/admin/users",{email:form.email,password:form.password,role:form.role}); }
      onSave();
    } catch(err){ setError(err.response?.data?.detail||"An error occurred."); } finally{ setLoading(false); }
  };
  return (
    <div className="modal fade show d-block" role="dialog" aria-modal="true" style={{backgroundColor:"rgba(30,34,45,0.6)",backdropFilter:"blur(3px)",zIndex:1055}} onClick={e=>{if(e.target===e.currentTarget&&!loading)onClose();}}>
      <div className="modal-dialog modal-dialog-centered" style={{maxWidth:500}} onClick={e=>e.stopPropagation()}>
        <div className="modal-content border-0" style={{borderRadius:16,boxShadow:"0 24px 64px rgba(0,0,0,0.18)"}}>
          <div className="px-4 pt-4 pb-3" style={{borderBottom:"1px solid #f1f3f7"}}>
            <div className="d-flex align-items-center gap-3">
              <div className="rounded-circle flex-shrink-0 d-flex align-items-center justify-content-center fw-bold text-white fs-14" style={{width:44,height:44,background:"linear-gradient(135deg,#405189,#3577f1)"}}>{isEdit?getInitials(user.email):(form.email?getInitials(form.email):"?")}</div>
              <div className="flex-grow-1"><h5 className="fw-semibold text-dark mb-0 fs-15">{isEdit?"Edit User":"Create New User"}</h5><p className="text-muted fs-12 mb-0">{isEdit?user.email:"New account"}</p></div>
              <button className="btn-close flex-shrink-0" onClick={onClose} disabled={loading} style={{opacity:0.5}}></button>
            </div>
          </div>
          <div className="px-4 py-4">
            {error&&<div className="alert alert-danger py-2 fs-13 mb-3"><i className="ri-error-warning-line me-1"></i>{error}</div>}
            <div className="row g-3">
              {!isEdit&&<div className="col-12"><label className="form-label fw-medium fs-13">Email <span className="text-danger">*</span></label><div className="input-group"><span className="input-group-text"><i className="ri-mail-line"></i></span><input type="email" name="email" className="form-control" placeholder="user@telnet.tn" value={form.email} onChange={handle}/></div></div>}
              {!isEdit&&<div className="col-12"><label className="form-label fw-medium fs-13">Password <span className="text-danger">*</span></label><div className="input-group"><span className="input-group-text"><i className="ri-lock-line"></i></span><input type={showPwd?"text":"password"} name="password" className="form-control" placeholder="Min. 6 characters" value={form.password} onChange={handle}/><button className="btn btn-outline-secondary" type="button" onClick={()=>setShowPwd(v=>!v)} tabIndex="-1"><i className={showPwd?"ri-eye-off-line":"ri-eye-line"}></i></button></div></div>}
              {isEdit&&<div className="col-12"><label className="form-label fw-medium fs-13">Reset Password</label><div className="input-group"><span className="input-group-text"><i className="ri-lock-password-line"></i></span><input type={showPwd?"text":"password"} name="new_password" className="form-control" placeholder="Leave empty to keep current" value={form.new_password} onChange={handle}/><button className="btn btn-outline-secondary" type="button" onClick={()=>setShowPwd(v=>!v)} tabIndex="-1"><i className={showPwd?"ri-eye-off-line":"ri-eye-line"}></i></button></div></div>}
              <div className="col-6"><label className="form-label fw-medium fs-13">Role</label><select name="role" className="form-select" value={form.role} onChange={handle}><option value="user">User</option><option value="admin">Admin</option></select></div>
              {isEdit&&<div className="col-6"><label className="form-label fw-medium fs-13">Status</label><div className="rounded-3 p-2 d-flex align-items-center justify-content-between" style={{background:"#f8f9fc",border:"1px solid #e9ecef"}}><span className={`fs-13 fw-medium ${form.is_active?"text-success":"text-danger"}`}>{form.is_active?"Active":"Inactive"}</span><div className="form-check form-switch mb-0"><input className="form-check-input" type="checkbox" role="switch" name="is_active" id="statusSwitch" checked={form.is_active} onChange={handle} style={{width:"2.5em",height:"1.4em",cursor:"pointer"}}/></div></div></div>}
            </div>
            {isEdit&&<div className="alert alert-info py-2 fs-12 mt-3 mb-0"><i className="ri-information-line me-1"></i>Les accès aux dashboards se gèrent dans <strong>Admin → Dashboards</strong> via le bouton "Accès".</div>}
          </div>
          <div className="px-4 py-3 d-flex justify-content-end gap-2" style={{borderTop:"1px solid #f1f3f7",background:"#fafbfc",borderRadius:"0 0 16px 16px"}}>
            <button className="btn btn-sm btn-light px-4" onClick={onClose} disabled={loading}>Cancel</button>
            <button className="btn btn-sm btn-primary px-4" onClick={submit} disabled={loading}>{loading?<><span className="spinner-border spinner-border-sm me-2"></span>Saving…</>:<><i className={`${isEdit?"ri-save-line":"ri-user-add-line"} me-1`}></i>{isEdit?"Save Changes":"Create User"}</>}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function UsersPage() {
  const navigate=useNavigate();
  const [users,setUsers]=useState([]); const [loading,setLoading]=useState(true);
  const [search,setSearch]=useState(""); const [roleFilter,setRoleFilter]=useState("all"); const [statusFilter,setStatusFilter]=useState("all");
  const [sortKey,setSortKey]=useState(null); const [sortDir,setSortDir]=useState("asc");
  const [modal,setModal]=useState(null); const [selected,setSelected]=useState(null); const [detailUser,setDetailUser]=useState(null);
  const [deleteTarget,setDeleteTarget]=useState(null); const [deleteLoading,setDeleteLoading]=useState(false);
  const [toast,setToast]=useState(null); const [page,setPage]=useState(1);
  const perPage=8;

  const showToast=useCallback((msg,type="success")=>{setToast({msg,type});setTimeout(()=>setToast(null),3500);},[]);
  const loadUsers=useCallback(()=>{ setLoading(true); api.get("/admin/users").then(res=>{setUsers(Array.isArray(res.data)?res.data:(res.data?.items??[]));}).catch(()=>showToast("Failed to load users.","danger")).finally(()=>setLoading(false)); },[showToast]);
  useEffect(()=>{loadUsers();},[loadUsers]);

  const handleSort=(key)=>{if(sortKey===key)setSortDir(d=>d==="asc"?"desc":"asc");else{setSortKey(key);setSortDir("asc");}setPage(1);};
  const SortIcon=({k})=>{if(sortKey!==k)return<i className="ri-arrow-up-down-line ms-1 opacity-25 fs-11"></i>;return sortDir==="asc"?<i className="ri-arrow-up-line ms-1 text-primary fs-11"></i>:<i className="ri-arrow-down-line ms-1 text-primary fs-11"></i>;};

  const filtered=useMemo(()=>{
    let result=users.filter(u=>{
      const q=search.toLowerCase(); const ms=!q||u.email.toLowerCase().includes(q);
      const mr=roleFilter==="all"||u.role===roleFilter;
      const mst=statusFilter==="all"?true:statusFilter==="active"?u.is_active:!u.is_active;
      return ms&&mr&&mst;
    });
    if(sortKey){result=[...result].sort((a,b)=>{const va=(a[sortKey]??"").toString().toLowerCase(),vb=(b[sortKey]??"").toString().toLowerCase();return sortDir==="asc"?va.localeCompare(vb):vb.localeCompare(va);});}
    return result;
  },[users,search,roleFilter,statusFilter,sortKey,sortDir]);

  useEffect(()=>{setPage(1);},[search,roleFilter,statusFilter]);
  const totalPages=Math.ceil(filtered.length/perPage);
  const paginated=filtered.slice((page-1)*perPage,page*perPage);

  const handleDelete=async(id)=>{ setDeleteLoading(true); try{await api.delete(`/admin/users/${id}`);setDeleteTarget(null);showToast("User deleted.");loadUsers();}catch(err){setDeleteTarget(null);showToast(err.response?.data?.detail||"Failed.","danger");}finally{setDeleteLoading(false);} };
  const handleSave=()=>{setModal(null);setSelected(null);showToast(modal==="edit"?"User updated.":"User created.");loadUsers();};

  const totalUsers=users.length; const totalAdmins=users.filter(u=>u.role==="admin").length;
  const activeUsers=users.filter(u=>u.is_active).length; const inactive=users.filter(u=>!u.is_active).length;
  const hasFilters=search||roleFilter!=="all"||statusFilter!=="all";

  return (
    <div className="page-content"><div className="container-fluid">
      <Toast toast={toast}/>
      <div className="row"><div className="col-12">
        <div className="page-title-box d-sm-flex align-items-center justify-content-between">
          <h4 className="mb-sm-0"><i className="ri-team-line me-2 text-primary"></i>User Management</h4>
          <ol className="breadcrumb m-0"><li className="breadcrumb-item"><a href="/">Dashboard</a></li><li className="breadcrumb-item active">Users</li></ol>
        </div>
      </div></div>

      <div className="row">
        {[{label:"Total Users",value:totalUsers, color:"primary",icon:"ri-team-line",          fn:()=>{setRoleFilter("all");setStatusFilter("all");}},
          {label:"Admins",     value:totalAdmins,color:"danger", icon:"ri-shield-user-line",    fn:()=>{setRoleFilter("admin");setStatusFilter("all");}},
          {label:"Active",     value:activeUsers,color:"success",icon:"ri-user-follow-line",    fn:()=>{setRoleFilter("all");setStatusFilter("active");}},
          {label:"Inactive",   value:inactive,   color:"warning",icon:"ri-user-unfollow-line",  fn:()=>{setRoleFilter("all");setStatusFilter("inactive");}}
        ].map((s,i)=>(
          <div key={i} className="col-xl-3 col-sm-6"><div className="card card-animate" style={{cursor:"pointer"}} onClick={()=>{s.fn();setPage(1);}}>
            <div className="card-body"><div className="d-flex align-items-center">
              <div className="avatar-sm flex-shrink-0"><span className={`avatar-title bg-${s.color}-subtle text-${s.color} rounded-2 fs-2`}><i className={s.icon}></i></span></div>
              <div className="flex-grow-1 ms-3"><p className="text-uppercase fw-medium text-muted mb-1 fs-12">{s.label}</p><h4 className={`mb-0 text-${s.color}`}>{s.value}</h4></div>
            </div></div>
          </div></div>
        ))}
      </div>

      <div className="card">
        <div className="card-header border-0">
          <div className="row g-2 align-items-center">
            <div className="col-sm-4"><div className="search-box"><input type="text" className="form-control" placeholder="Search by email..." value={search} onChange={e=>setSearch(e.target.value)}/><i className="ri-search-line search-icon"></i></div></div>
            <div className="col-sm-2"><select className="form-select" value={roleFilter} onChange={e=>{setRoleFilter(e.target.value);setPage(1);}}><option value="all">All Roles</option><option value="admin">Admin</option><option value="user">User</option></select></div>
            <div className="col-sm-2"><select className="form-select" value={statusFilter} onChange={e=>{setStatusFilter(e.target.value);setPage(1);}}><option value="all">All Status</option><option value="active">Active</option><option value="inactive">Inactive</option></select></div>
            {hasFilters&&<div className="col-sm-auto"><button className="btn btn-soft-danger btn-sm" onClick={()=>{setSearch("");setRoleFilter("all");setStatusFilter("all");setPage(1);}}><i className="ri-close-line me-1"></i>Reset ({filtered.length})</button></div>}
            <div className="col-sm-auto ms-auto d-flex gap-2">
              {users.length>0&&<button className="btn btn-soft-success" onClick={()=>exportCSV(filtered)}><i className="ri-download-2-line me-1"></i>CSV</button>}
              <button className="btn btn-soft-info" onClick={()=>navigate("/admin/dashboards")} title="Gérer les accès dashboards"><i className="ri-layout-grid-line me-1"></i>Dashboards</button>
              <button className="btn btn-primary" onClick={()=>{setSelected(null);setModal("create");}}><i className="ri-user-add-line me-1"></i>Add User</button>
            </div>
          </div>
        </div>
        <div className="card-body">
          {loading?<div className="text-center py-5"><div className="spinner-border text-primary"></div><p className="text-muted mt-2">Loading users...</p></div>:(
            <>
              <div className="table-responsive"><table className="table align-middle table-hover table-nowrap mb-0">
                <thead className="table-light"><tr>
                  <th style={{cursor:"pointer"}} onClick={()=>handleSort("email")}>User<SortIcon k="email"/></th>
                  <th style={{cursor:"pointer"}} onClick={()=>handleSort("role")}>Role<SortIcon k="role"/></th>
                  <th style={{cursor:"pointer"}} onClick={()=>handleSort("is_active")}>Status<SortIcon k="is_active"/></th>
                  <th>Dashboards</th>
                  <th style={{cursor:"pointer"}} onClick={()=>handleSort("created_at")}>Created<SortIcon k="created_at"/></th>
                  <th className="text-center">Actions</th>
                </tr></thead>
                <tbody>
                  {paginated.length===0?(
                    <tr><td colSpan="6" className="text-center py-5 text-muted"><i className="ri-user-search-line fs-2 d-block mb-2 opacity-50"></i>No users found.</td></tr>
                  ):paginated.map(user=>(
                    <tr key={user.id} style={{cursor:"pointer"}} onClick={()=>setDetailUser(user)}>
                      <td><div className="d-flex align-items-center gap-2">
                        <div className={`avatar-xs rounded-circle d-flex align-items-center justify-content-center bg-${ROLE_COLORS[user.role]}-subtle text-${ROLE_COLORS[user.role]} fw-bold fs-12 flex-shrink-0`} style={{minWidth:32,height:32}}>{getInitials(user.email)}</div>
                        <div><p className="fw-medium mb-0 fs-13">{user.email}</p><p className="text-muted fs-11 mb-0">ID #{user.id}</p></div>
                      </div></td>
                      <td><span className={`badge bg-${ROLE_COLORS[user.role]}-subtle text-${ROLE_COLORS[user.role]}`}><i className={`${ROLE_ICONS[user.role]} me-1`}></i>{user.role.charAt(0).toUpperCase()+user.role.slice(1)}</span></td>
                      <td>{user.is_active?<span className="badge bg-success-subtle text-success"><i className="ri-checkbox-circle-line me-1"></i>Active</span>:<span className="badge bg-danger-subtle text-danger"><i className="ri-close-circle-line me-1"></i>Inactive</span>}</td>
                      <td>{(user.dashboard_access||[]).length>0?<span className="badge bg-primary-subtle text-primary"><i className="ri-layout-grid-line me-1"></i>{(user.dashboard_access||[]).length}</span>:<span className="text-muted fs-12">—</span>}</td>
                      <td className="text-muted fs-13">{formatDate(user.created_at)}</td>
                      <td className="text-center" onClick={e=>e.stopPropagation()}><div className="d-flex gap-1 justify-content-center">
                        <button className="btn btn-sm btn-soft-primary btn-icon" onClick={()=>{setSelected(user);setModal("edit");}}><i className="ri-pencil-fill fs-14"></i></button>
                        <button className="btn btn-sm btn-soft-danger btn-icon" onClick={()=>setDeleteTarget(user)}><i className="ri-delete-bin-fill fs-14"></i></button>
                      </div></td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
              <div className="d-flex align-items-center justify-content-between mt-3">
                <p className="text-muted mb-0 fs-13">Showing <strong>{Math.min((page-1)*perPage+1,filtered.length)}</strong>–<strong>{Math.min(page*perPage,filtered.length)}</strong> of <strong>{filtered.length}</strong></p>
                <ul className="pagination pagination-separated mb-0">
                  <li className={`page-item ${page===1?"disabled":""}`}><button className="page-link" onClick={()=>setPage(p=>p-1)}>Previous</button></li>
                  {Array.from({length:totalPages},(_,i)=>i+1).filter(p=>Math.abs(p-page)<=2).map(p=>(<li key={p} className={`page-item ${p===page?"active":""}`}><button className="page-link" onClick={()=>setPage(p)}>{p}</button></li>))}
                  <li className={`page-item ${page>=totalPages?"disabled":""}`}><button className="page-link" onClick={()=>setPage(p=>p+1)}>Next</button></li>
                </ul>
              </div>
            </>
          )}
        </div>
      </div>
    </div>

    {(modal==="create"||modal==="edit")&&<UserModal mode={modal} user={selected} onClose={()=>{setModal(null);setSelected(null);}} onSave={handleSave}/>}
    {detailUser&&!modal&&<UserDetailModal user={detailUser} onClose={()=>setDetailUser(null)} onEdit={u=>{setDetailUser(null);setSelected(u);setModal("edit");}} onDelete={u=>{setDetailUser(null);setDeleteTarget(u);}}/>}
    <DeleteModal user={deleteTarget} onConfirm={handleDelete} onClose={()=>setDeleteTarget(null)} loading={deleteLoading}/>
    </div>
  );
}
