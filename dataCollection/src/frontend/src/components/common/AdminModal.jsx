import React from 'react';

/**
 * components/common/AdminModal.jsx
 * Reusable enterprise-grade modal shell for administration pages.
 * Enforces consistency across all modals (header with circular badge, consistent spacing, blurred backdrop).
 */
export default function AdminModal({ 
  show = true, 
  onClose, 
  title, 
  subtitle, 
  icon, 
  iconBg = "bg-primary-subtle", 
  iconColor = "text-primary",
  iconStyle = {},
  footer, 
  children, 
  maxWidth = 480,
  loading = false,
  zIndex = 1055,
  modalClass = ""
}) {
  if (!show) return null;

  return (
    <div className={`modal fade show d-block ${modalClass}`} 
         style={{backgroundColor:"rgba(30,34,45,0.6)", backdropFilter:"blur(4px)", zIndex}} 
         onClick={(e)=>{if(e.target===e.currentTarget)onClose();}}>
      <div className="modal-dialog modal-dialog-centered" style={{maxWidth}}>
        <div className="modal-content border-0 shadow-lg" style={{borderRadius: 16}}>
          {/* Header standardisé Enterprise */}
          <div className="px-4 pt-4 pb-3" style={{borderBottom: "1px solid #f1f3f7"}}>
            <div className="d-flex align-items-center gap-3">
              <div className={`rounded-circle flex-shrink-0 d-flex align-items-center justify-content-center ${iconBg} ${iconColor} fs-20`} 
                   style={{width: 44, height: 44, ...iconStyle}}>
                <i className={icon}></i>
              </div>
              <div className="flex-grow-1">
                <h5 className="fw-semibold text-dark mb-0 fs-15">{title}</h5>
                {subtitle && <p className="text-muted fs-12 mb-0">{subtitle}</p>}
              </div>
              <button className="btn-close" onClick={onClose} disabled={loading} style={{opacity: 0.5}}></button>
            </div>
          </div>

          {/* Body */}
          <div className="px-4 py-4">
            {children}
          </div>

          {/* Footer standardisé */}
          {footer && (
            <div className="px-4 py-3 d-flex justify-content-end gap-2" 
                 style={{borderTop: "1px solid #f1f3f7", background: "#fafbfc", borderRadius: "0 0 16px 16px"}}>
              {footer}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
