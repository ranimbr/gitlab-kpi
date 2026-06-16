/**
 * ExtractionPage.jsx — Lancement d'extractions GitLab
 *
 * Simplifié après suppression de l'onglet "Par Projet"
 * L'extraction par Business Unit (via ExtractionByTeamTab) couvre tous les cas d'usage
 */

import { useState, useEffect } from "react";
import api from "../services/api";
import ExtractionByTeamTab from "./ExtractionByTeamTab";
import ImportJsonTab from "./ImportJsonTab";

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function ExtractionPage() {
  const [activeTab, setActiveTab] = useState("team");

  const [gitlabConfigs, setGitlabConfigs] = useState([]);
  const [allProjects, setAllProjects] = useState([]);
  const [allPeriods, setAllPeriods] = useState([]);
  const [error, setError] = useState(null);

  // Chargement initial des données partagées
  useEffect(() => {
    const fetchInitial = async () => {
      try {
        const [configsRes, projectsRes, periodsRes] = await Promise.all([
          api.get("/gitlab-configs"),
          api.get("/projects", { params: { all_projects: true } }),
          api.get("/periods"),
        ]);
        setGitlabConfigs(Array.isArray(configsRes.data) ? configsRes.data : []);
        setAllProjects(Array.isArray(projectsRes.data) ? projectsRes.data : (projectsRes.data?.items ?? []));
        setAllPeriods(Array.isArray(periodsRes.data) ? periodsRes.data : []);
      } catch {
        setError("Impossible de charger les données initiales.");
      }
    };
    fetchInitial();
  }, []);

  return (
    <div className="page-content">
      <div className="container-fluid">
        {error && (
          <div className="alert alert-danger d-flex align-items-center gap-2 mb-3">
            <i className="ri-error-warning-line fs-18"></i>
            <span>{error}</span>
          </div>
        )}

        <div className="row">
          <div className="col-12">
            <div className="page-title-box d-sm-flex align-items-center justify-content-between">
              <h4 className="mb-sm-0">
                <i className="ri-download-cloud-2-line me-2 text-primary"></i>
                GitLab Extraction
              </h4>
              <ol className="breadcrumb m-0">
                <li className="breadcrumb-item">
                  <a href="/">Dashboard</a>
                </li>
                <li className="breadcrumb-item active">Extraction</li>
              </ol>
            </div>
          </div>
        </div>

        <div className="row mb-3">
          <div className="col-12">
            <ul className="nav nav-tabs nav-tabs-custom nav-success nav-justified" role="tablist">
              <li className="nav-item">
                <a
                  className={`nav-link ${activeTab === "team" ? "active" : ""}`}
                  onClick={() => setActiveTab("team")}
                  style={{ cursor: "pointer", fontWeight: 700 }}
                >
                  <i className="ri-download-cloud-2-line me-2"></i>
                  Extraction
                </a>
              </li>
              <li className="nav-item">
                <a
                  className={`nav-link ${activeTab === "import_json" ? "active" : ""}`}
                  onClick={() => setActiveTab("import_json")}
                  style={{ cursor: "pointer", fontWeight: 700 }}
                >
                  <i className="ri-file-upload-line me-2"></i>
                  Import JSON
                  <span className="badge bg-warning-subtle text-warning ms-2 fs-10">
                    Air-Gapped
                  </span>
                </a>
              </li>
            </ul>
          </div>
        </div>

        {activeTab === "team" ? (
          <ExtractionByTeamTab
            gitlabConfigs={gitlabConfigs}
            periods={allPeriods}
            projects={allProjects}
          />
        ) : (
          <ImportJsonTab allProjects={allProjects} allPeriods={allPeriods} />
        )}
      </div>
    </div>
  );
}
