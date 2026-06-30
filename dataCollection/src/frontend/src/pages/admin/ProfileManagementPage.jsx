/**
 * pages/admin/ProfileManagementPage.jsx
 * 
 * Interface admin pour la gestion des profils et des menus.
 * Layout : liste des profils à gauche, menus avec checkboxes à droite.
 */
import { useState, useEffect, useCallback } from "react";
import profileService from "../../services/profileService";
import LoadingSpinner from "../../components/common/LoadingSpinner";
import EmptyState from "../../components/common/EmptyState";
import ConfirmModal from "../../components/common/ConfirmModal";
import AdminModal from "../../components/common/AdminModal";

// ── Toast simple inline ───────────────────────────────────────────────────────
function Toast({ toast }) {
  if (!toast) return null;
  return (
    <div
      className={`alert alert-${toast.type} d-flex align-items-center gap-2 position-fixed top-0 end-0 m-3 shadow`}
      style={{ zIndex: 9999, minWidth: 300, borderRadius: 10 }}
    >
      <i className={toast.type === "success" ? "ri-checkbox-circle-line fs-16" : "ri-error-warning-line fs-16"} />
      <span>{toast.msg}</span>
    </div>
  );
}

// ── ProfileModal ─────────────────────────────────────────────────────────────
function ProfileModal({ profile, onClose, onSave }) {
  const isEdit = !!profile?.id;
  const [form, setForm] = useState({
    name: profile?.name || "",
    description: profile?.description || "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));
  };

  const handleSubmit = async () => {
    setError("");
    if (!form.name.trim()) return setError("Nom requis.");
    setLoading(true);
    try {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim() || null,
      };
      if (isEdit) {
        await profileService.updateProfile(profile.id, payload);
      } else {
        await profileService.createProfile(payload);
      }
      onSave();
    } catch (err) {
      setError(err.response?.data?.detail || "Erreur de sauvegarde.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AdminModal
      show={true}
      onClose={onClose}
      title={isEdit ? "Édition du Profil" : "Nouveau Profil"}
      icon="ri-user-settings-line"
      loading={loading}
      maxWidth={500}
      footer={
        <div className="d-flex gap-2 w-100 justify-content-end">
          <button className="btn btn-white border px-4" onClick={onClose}>
            Annuler
          </button>
          <button
            className="btn btn-primary px-4 fw-bold shadow-sm"
            onClick={handleSubmit}
            disabled={loading}
          >
            <i className="ri-save-line me-1"></i> Sauvegarder
          </button>
        </div>
      }
    >
      <div className="vstack gap-4">
        {error && (
          <div className="alert alert-danger-soft py-2 fs-13 mb-0 d-flex align-items-center gap-2">
            <i className="ri-error-warning-fill"></i> {error}
          </div>
        )}

        <div>
          <label className="fs-11 fw-bold text-uppercase text-muted ls-1 mb-2">
            Nom du profil
          </label>
          <input
            type="text"
            name="name"
            className="form-control py-2 border-0 bg-light-subtle fs-14"
            placeholder="ex: Site Manager Paris"
            value={form.name}
            onChange={handleChange}
            autoFocus
          />
        </div>

        <div>
          <label className="fs-11 fw-bold text-uppercase text-muted ls-1 mb-2">
            Description
          </label>
          <textarea
            name="description"
            className="form-control py-2 border-0 bg-light-subtle fs-14"
            placeholder="Description du profil..."
            rows={3}
            value={form.description}
            onChange={handleChange}
          />
        </div>
      </div>
    </AdminModal>
  );
}

// ── MenuItemTree Component ───────────────────────────────────────────────────────
function MenuItemTree({ menuItems, profileMenuAccess, onToggle, isSuperAdmin, togglingId }) {
  const renderMenuItem = (item, level = 0) => {
    const hasAccess = profileMenuAccess[item.id] || false;
    const paddingLeft = level * 24;
    const isToggling = togglingId === item.id;

    return (
      <div key={item.id}>
        <div
          className="d-flex align-items-center gap-2 py-2 px-3"
          style={{ paddingLeft: `${paddingLeft + 12}px` }}
        >
          {isToggling ? (
            <span className="spinner-border spinner-border-sm text-primary" style={{ width: 14, height: 14, flexShrink: 0 }} />
          ) : (
            <input
              type="checkbox"
              className="form-check-input"
              checked={hasAccess}
              onChange={() => onToggle(item.id, !hasAccess)}
              id={`menu-${item.id}`}
              disabled={isSuperAdmin || isToggling}
            />
          )}
          <label
            htmlFor={`menu-${item.id}`}
            className={`fs-14 user-select-none ${isSuperAdmin || isToggling ? "" : "cursor-pointer"}`}
            style={{ opacity: isSuperAdmin ? 0.7 : 1 }}
          >
            {item.label}
          </label>
        </div>
        {item.children && item.children.length > 0 && (
          <div>
            {item.children.map((child) => renderMenuItem(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="vstack gap-2">
      {menuItems.map((item) => renderMenuItem(item))}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function ProfileManagementPage() {
  // Profile state
  const [profiles, setProfiles] = useState([]);
  const [selectedProfile, setSelectedProfile] = useState(null);
  const [menuItems, setMenuItems] = useState([]);
  const [profileMenuAccess, setProfileMenuAccess] = useState({});
  
  // Common state
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [editingProfile, setEditingProfile] = useState(null);
  const [deleteProfile, setDeleteProfile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [togglingId, setTogglingId] = useState(null); // ID du menu en cours de toggle
  const [toast, setToast] = useState(null);

  const showToast = useCallback((msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }, []);

  // Charger les profils au montage
  useEffect(() => {
    loadProfiles();
  }, []);

  // Charger les menus quand un profil est sélectionné
  useEffect(() => {
    if (selectedProfile) {
      loadMenuItems();
      loadProfileMenuAccess();
    }
  }, [selectedProfile]);

  const loadProfiles = async () => {
    try {
      const data = await profileService.getAllProfiles();
      setProfiles(data);
      console.log("Profils chargés:", data);
    } catch (err) {
      console.error("Erreur chargement profils:", err);
      console.error("Détails erreur:", err.response?.data);
      setError(err.response?.data?.detail || "Erreur lors du chargement des profils");
    } finally {
      setLoading(false);
    }
  };

  const loadMenuItems = async () => {
    try {
      const data = await profileService.getMenuTree();
      setMenuItems(data);
    } catch (err) {
      console.error("Erreur chargement menus:", err);
    }
  };

  const loadProfileMenuAccess = async () => {
    try {
      const data = await profileService.getProfileMenuItems(selectedProfile.id);
      const accessMap = {};
      data.forEach((item) => {
        accessMap[item.menu_item.id] = item.has_access;
      });
      setProfileMenuAccess(accessMap);
    } catch (err) {
      console.error("Erreur chargement accès menus:", err);
    }
  };

  const handleCreateProfile = () => {
    setEditingProfile(null);
    setShowProfileModal(true);
  };

  const handleEditProfile = (profile) => {
    setEditingProfile(profile);
    setShowProfileModal(true);
  };

  const handleDeleteProfile = (profile) => {
    setDeleteProfile(profile);
  };

  const confirmDeleteProfile = async () => {
    try {
      await profileService.deleteProfile(deleteProfile.id);
      setDeleteProfile(null);
      loadProfiles();
      if (selectedProfile?.id === deleteProfile.id) {
        setSelectedProfile(null);
      }
    } catch (err) {
      console.error("Erreur suppression profil:", err);
    }
  };

  const handleToggleMenuAccess = async (menuItemId, hasAccess) => {
    // 1. Mise à jour optimiste de l'UI
    setProfileMenuAccess(prev => ({ ...prev, [menuItemId]: hasAccess }));
    setTogglingId(menuItemId);
    try {
      // 2. Persistance immédiate en base via API
      await profileService.updateProfileMenuItems(selectedProfile.id, {
        menu_items: [{ menu_item_id: menuItemId, has_access: hasAccess }],
      });
      showToast(
        hasAccess ? "Accès accordé ✓" : "Accès retiré ✓",
        hasAccess ? "success" : "warning"
      );
    } catch (err) {
      console.error("Erreur toggle menu access:", err);
      // Rollback en cas d'erreur
      setProfileMenuAccess(prev => ({ ...prev, [menuItemId]: !hasAccess }));
      showToast("Erreur lors de la mise à jour de l'accès", "danger");
    } finally {
      setTogglingId(null);
    }
  };

  const handleSaveMenuAccess = async () => {
    setSaving(true);
    try {
      const menuAccessList = Object.entries(profileMenuAccess).map(([menuItemId, hasAccess]) => ({
        menu_item_id: parseInt(menuItemId),
        has_access: hasAccess,
      }));
      await profileService.updateProfileMenuItems(selectedProfile.id, {
        menu_items: menuAccessList,
      });
      showToast("Tous les accès sauvegardés avec succès ✓", "success");
    } catch (err) {
      console.error("Erreur sauvegarde accès:", err);
      showToast("Erreur lors de la sauvegarde", "danger");
    } finally {
      setSaving(false);
    }
  };

  const handleProfileSaved = () => {
    setShowProfileModal(false);
    setEditingProfile(null);
    loadProfiles();
  };

  return (
    <div className="page-content">
      {/* Toast notifications */}
      <Toast toast={toast} />
      <div className="container-fluid">
        {/* Header */}
        <div className="row mt-3">
          <div className="col-12">
            <div className="page-title-box d-sm-flex align-items-center justify-content-between">
              <h4 className="mb-sm-0">
                <i className="ri-user-settings-line me-2 text-primary"></i>Gestion des Profils & Menu
              </h4>
              <button className="btn btn-primary shadow-sm fs-13 fw-bold px-4" onClick={handleCreateProfile}>
                <i className="ri-add-line me-2"></i> Nouveau Profil
              </button>
            </div>
            <ol className="breadcrumb m-0 mb-4">
              <li className="breadcrumb-item fs-11 fw-bold text-uppercase ls-1 text-muted">Administration</li>
              <li className="breadcrumb-item active fs-11 fw-bold text-uppercase ls-1" aria-current="page">Profils & Menu</li>
            </ol>
          </div>
        </div>

        {/* Profiles */}
        {error ? (
          <div className="alert alert-danger d-flex align-items-center gap-3">
            <i className="ri-error-warning-fill fs-24"></i>
            <div>
              <strong className="d-block mb-1">Erreur de chargement</strong>
              <div className="fs-14">{error}</div>
              <div className="fs-12 text-muted mt-1">
                Vérifiez que vous avez le rôle super_admin pour accéder à cette page.
              </div>
            </div>
          </div>
        ) : loading ? (
          <LoadingSpinner />
        ) : profiles.length === 0 ? (
          <EmptyState
            icon="ri-user-settings-line"
            message="Aucun profil créé"
            action="Créer un profil pour commencer"
            onAction={handleCreateProfile}
          />
        ) : (
          <div className="row g-4">
            {/* Liste des profils à gauche */}
            <div className="col-md-4">
              <div className="card border-0 shadow-sm">
                <div className="card-header bg-light-subtle py-3">
                  <h6 className="card-title mb-0 fs-11 fw-bold text-muted ls-1">
                    Liste des profils
                  </h6>
                </div>
                <div className="list-group list-group-flush">
                  {profiles.map((profile) => (
                    <button
                      key={profile.id}
                      className={`list-group-item list-group-item-action d-flex justify-content-between align-items-center ${
                        selectedProfile?.id === profile.id ? "active" : ""
                      }`}
                      onClick={() => setSelectedProfile(profile)}
                    >
                      <span className="fw-medium">{profile.name}</span>
                      <div className="d-flex gap-1">
                        <button
                          className={`btn btn-icon btn-sm ${profile.name === "Super Admin" ? "btn-ghost-secondary opacity-50" : "btn-ghost-primary"} rounded-circle`}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleEditProfile(profile);
                          }}
                          disabled={profile.name === "Super Admin"}
                          title={profile.name === "Super Admin" ? "Non modifiable" : "Modifier"}
                        >
                          <i className="ri-pencil-fill"></i>
                        </button>
                        <button
                          className={`btn btn-icon btn-sm ${profile.name === "Super Admin" ? "btn-ghost-secondary opacity-50" : "btn-ghost-danger"} rounded-circle`}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteProfile(profile);
                          }}
                          disabled={profile.name === "Super Admin"}
                          title={profile.name === "Super Admin" ? "Non supprimable" : "Supprimer"}
                        >
                          <i className="ri-delete-bin-fill"></i>
                        </button>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Arbre des menus à droite */}
            <div className="col-md-8">
              {selectedProfile ? (
                <div className="card border-0 shadow-sm">
                  <div className="card-header bg-light-subtle py-3 d-flex justify-content-between align-items-center">
                    <h6 className="card-title mb-0 fs-11 fw-bold text-muted ls-1">
                      Profil : {selectedProfile.name}
                    </h6>
                    {selectedProfile.name !== "Super Admin" && (
                      <button
                        className="btn btn-sm btn-primary"
                        onClick={handleSaveMenuAccess}
                        disabled={saving}
                      >
                        <i className="ri-save-line me-1"></i>
                        {saving ? "Sauvegarde..." : "Sauvegarder"}
                      </button>
                    )}
                  </div>
                  <div className="card-body">
                    {selectedProfile.name === "Super Admin" && (
                      <div className="alert alert-warning-soft border-0 d-flex align-items-start gap-3 mb-4 p-3 rounded-4">
                        <i className="ri-shield-check-line fs-24 text-warning flex-shrink-0"></i>
                        <div className="fs-13 text-warning-emphasis">
                          <strong className="d-block mb-1">Profil Système Super Admin</strong>
                          Ce profil a accès à tous les menus automatiquement. Les modifications ne sont pas autorisées pour garantir l'intégrité du système.
                        </div>
                      </div>
                    )}
                    {menuItems.length === 0 ? (
                      <EmptyState
                        icon="ri-menu-line"
                        message="Aucun menu disponible"
                      />
                    ) : (
                      <MenuItemTree
                        menuItems={menuItems}
                        profileMenuAccess={profileMenuAccess}
                        onToggle={handleToggleMenuAccess}
                        isSuperAdmin={selectedProfile.name === "Super Admin"}
                        togglingId={togglingId}
                      />
                    )}
                  </div>
                </div>
              ) : (
                <div className="card border-0 shadow-sm">
                  <div className="card-body text-center py-5">
                    <EmptyState
                      icon="ri-user-settings-line"
                      message="Sélectionnez un profil pour voir et modifier ses droits d'accès"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

      {/* Modal création/édition profil */}
      {showProfileModal && (
        <ProfileModal
          profile={editingProfile}
          onClose={() => {
            setShowProfileModal(false);
            setEditingProfile(null);
          }}
          onSave={handleProfileSaved}
        />
      )}

      {/* Modal confirmation suppression profil */}
      {deleteProfile && (
        <ConfirmModal
          show={true}
          title="Supprimer le profil"
          message={`Êtes-vous sûr de vouloir supprimer le profil "${deleteProfile.name}" ?`}
          onConfirm={confirmDeleteProfile}
          onClose={() => setDeleteProfile(null)}
        />
      )}

      </div>
    </div>
  );
}
