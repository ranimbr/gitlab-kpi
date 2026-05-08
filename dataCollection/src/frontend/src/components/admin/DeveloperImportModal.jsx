import React, { useState, useRef } from "react";
import developerService from "../../services/developerService";
import Swal from "sweetalert2";

export default function DeveloperImportModal({ onClose, onSuccess }) {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [options, setOptions] = useState({
    createMissingSites: false,
    createMissingProjects: false,
    createMissingGroups: true,
    fullSync: true, // [SENIOR] Default to true for Strict Mission logic
  });
  
  const fileInputRef = useRef(null);

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileSelect = (e) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const downloadTemplate = () => {
    // Le téléchargement est déjà géré par l'endpoint (GET /developers/import/template)
    // On dirige l'utilisateur vers ce endpoint.
    const baseUrl = import.meta.env.VITE_API_URL || "http://localhost:8000/api/v1";
    window.open(`${baseUrl}/developers/import/template`, '_blank');
  };

  const handleImport = async () => {
    if (!file) return;
    setLoading(true);
    try {
      const response = await developerService.importFile(file, {
        dryRun: false,
        ...options
      });
      
      Swal.fire({
        icon: 'success',
        title: 'Import terminé',
        text: `${response.success_count} développeurs ajoutés ou mis à jour.`,
        confirmButtonColor: '#4361ee'
      });
      
      if (onSuccess) onSuccess();
      onClose();
    } catch (error) {
      console.error(error);
      const msg = error.response?.data?.detail || "Une erreur est survenue lors de l'importation.";
      Swal.fire({
        icon: 'error',
        title: 'Échec de l\'import',
        text: msg,
        confirmButtonColor: '#ef4444'
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-backdrop-custom">
      <div className="card border-0 shadow-lg modal-content-custom">
        <div className="card-header bg-light p-4 d-flex align-items-center justify-content-between border-0">
          <div>
            <h4 className="mb-0 fw-bold text-dark d-flex align-items-center gap-2">
              <i className="ri-file-upload-line text-primary"></i> Import de Développeurs
            </h4>
            <p className="text-muted mb-0 fs-13 mt-1">Importez votre matrice RH (CSV ou Excel)</p>
          </div>
          <button className="btn btn-link text-muted p-0" onClick={onClose} disabled={loading}>
            <i className="ri-close-line fs-2"></i>
          </button>
        </div>

        <div className="card-body p-4">
          {/* Drag & Drop Area */}
          <div 
            className="drag-drop-area border-dashed rounded-3 mb-4 text-center p-5"
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            style={{ 
              border: '2px dashed #cbd5e1', 
              background: file ? 'rgba(67,97,238,0.05)' : '#f8fafc',
              cursor: 'pointer',
              transition: 'all 0.3s ease'
            }}
          >
            <input 
              type="file" 
              ref={fileInputRef} 
              style={{ display: 'none' }} 
              accept=".csv, .xlsx, .xls"
              onChange={handleFileSelect}
            />
            {file ? (
              <div>
                <i className="ri-file-excel-2-line text-success mb-2" style={{ fontSize: 40 }}></i>
                <h5 className="text-dark fw-bold">{file.name}</h5>
                <p className="text-muted fs-13">{(file.size / 1024).toFixed(1)} KB</p>
                <div className="text-primary fs-12 fw-medium">Cliquez pour modifier le fichier</div>
              </div>
            ) : (
              <div>
                <i className="ri-upload-cloud-2-line text-muted mb-2" style={{ fontSize: 40 }}></i>
                <h5 className="text-dark fw-bold">Glissez ou cliquez pour importer</h5>
                <p className="text-muted fs-13">Formats supportés : .csv, .xlsx</p>
              </div>
            )}
          </div>

          <div className="d-flex justify-content-between align-items-center mb-4">
            <span className="fs-13 text-muted">Besoin du format exact ?</span>
            <button className="btn btn-sm btn-soft-info" onClick={downloadTemplate} type="button">
              <i className="ri-download-line me-1"></i> Télécharger le template
            </button>
          </div>

          <hr className="border-light" />

          {/* Options Enterprise */}
          <h6 className="fw-bold fs-13 mb-3 text-dark text-uppercase">Options d'importation automatiques</h6>
          <div className="form-check form-switch form-switch-md mb-3" dir="ltr">
            <input 
              type="checkbox" 
              className="form-check-input" 
              id="createMissingGroups" 
              checked={options.createMissingGroups}
              onChange={(e) => setOptions({...options, createMissingGroups: e.target.checked})}
            />
            <label className="form-check-label fs-13 fw-medium" htmlFor="createMissingGroups">
              Créer les Équipes inconnues (Recommandé)
            </label>
          </div>
          <div className="form-check form-switch form-switch-md mb-3" dir="ltr">
            <input 
              type="checkbox" 
              className="form-check-input" 
              id="createMissingSites" 
              checked={options.createMissingSites}
              onChange={(e) => setOptions({...options, createMissingSites: e.target.checked})}
            />
            <label className="form-check-label fs-13 fw-medium" htmlFor="createMissingSites">
              Créer les Sites Inconnus
            </label>
          </div>
          <div className="form-check form-switch form-switch-md" dir="ltr">
            <input 
              type="checkbox" 
              className="form-check-input" 
              id="createMissingProjects" 
              checked={options.createMissingProjects}
              onChange={(e) => setOptions({...options, createMissingProjects: e.target.checked})}
            />
            <label className="form-check-label fs-13 fw-medium" htmlFor="createMissingProjects">
              Créer les Projets Inconnus
            </label>
          </div>

          <div className="alert alert-info mt-4 mb-0 border-0 shadow-none" style={{ background: 'rgba(67,97,238,0.08)' }}>
             <div className="form-check form-switch form-switch-md" dir="ltr">
                <input 
                  type="checkbox" 
                  className="form-check-input" 
                  id="fullSync" 
                  checked={options.fullSync}
                  onChange={(e) => setOptions({...options, fullSync: e.target.checked})}
                />
                <label className="form-check-label fs-13 fw-bold text-primary" htmlFor="fullSync">
                  Mode "Full Sync" (Réconciliation RH)
                </label>
             </div>
             <p className="mb-0 fs-11 text-muted mt-2">
                <i className="ri-information-line me-1"></i>
                <strong>Important :</strong> Si activé, tous les développeurs absents de ce fichier seront automatiquement marqués comme <strong>PARTIS</strong> (Inactifs).
             </p>
          </div>
        </div>

        <div className="card-footer bg-light border-0 p-4 d-flex justify-content-end gap-2">
          <button className="btn btn-light" onClick={onClose} disabled={loading}>
            Annuler
          </button>
          <button 
            className="btn btn-primary d-flex align-items-center gap-2" 
            onClick={handleImport}
            disabled={!file || loading}
          >
            {loading ? (
              <><span className="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Analyse en cours...</>
            ) : (
              <><i className="ri-database-line"></i> Lancer l'import</>
            )}
          </button>
        </div>
      </div>

      <style>{`
        .modal-backdrop-custom {
          position: fixed; top: 0; left: 0; right: 0; bottom: 0;
          background: rgba(15, 23, 42, 0.4); 
          backdrop-filter: blur(4px);
          z-index: 1050; 
          display: flex; align-items: center; justify-content: center;
          padding: 1rem;
        }
        .modal-content-custom {
          width: 100%; max-width: 550px; 
          overflow: hidden;
          border-radius: 16px;
        }
        .drag-drop-area:hover {
          border-color: #4361ee !important;
          background: rgba(67,97,238,0.02) !important;
        }
      `}</style>
    </div>
  );
}
