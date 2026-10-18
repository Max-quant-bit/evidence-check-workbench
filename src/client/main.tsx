import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

interface Project {
  id: number;
  name: string;
  createdAt: string;
}

interface DocumentItem {
  id: number;
  filename: string;
  createdAt: string;
  chunkCount: number;
}

interface Chunk {
  id: number;
  content: string;
  page: number | null;
  paragraph: number;
}

interface Claim {
  id: number;
  side: "affirmative" | "negative" | "neutral";
  originalText: string;
  claim: string;
  entities: string[];
  numbers: string[];
  dates: string[];
  allegedSource: string | null;
  documentName: string;
  page: number | null;
  paragraph: number;
  status: "unverified" | "human_verified";
}

async function api<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options);
  if (!response.ok) {
    const result = (await response.json().catch(() => ({}))) as {
      error?: string;
    };
    throw new Error(result.error ?? "The request could not be completed.");
  }
  return response.json() as Promise<T>;
}

function App() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState<number | null>(null);
  const [projectName, setProjectName] = useState("");
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [documentId, setDocumentId] = useState<number | null>(null);
  const [chunks, setChunks] = useState<Chunk[]>([]);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  const loadProjects = async () => {
    const result = await api<Project[]>("/api/projects");
    setProjects(result);
    if (projectId === null && result.length > 0) setProjectId(result[0].id);
  };

  const loadDocuments = async (id: number) => {
    const result = await api<DocumentItem[]>(`/api/projects/${id}/documents`);
    setDocuments(result);
    if (!result.some((document) => document.id === documentId)) {
      setDocumentId(null);
      setChunks([]);
      setClaims([]);
    }
  };

  useEffect(() => {
    loadProjects().catch((error: Error) => setNotice(error.message));
  }, []);

  useEffect(() => {
    if (projectId !== null) {
      loadDocuments(projectId).catch((error: Error) => setNotice(error.message));
    } else {
      setDocuments([]);
    }
  }, [projectId]);

  const createProject = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!projectName.trim()) return;
    setBusy(true);
    setNotice("");
    try {
      const project = await api<Project>("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: projectName }),
      });
      setProjects((current) => [...current, project]);
      setProjectId(project.id);
      setProjectName("");
    } catch (error) {
      setNotice((error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const uploadDocument = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (projectId === null) return;
    const form = event.currentTarget;
    const fileInput = form.elements.namedItem("file");
    if (!(fileInput instanceof HTMLInputElement) || !fileInput.files?.[0]) {
      setNotice("Choose a document to upload.");
      return;
    }
    const formData = new FormData();
    formData.append("file", fileInput.files[0]);
    setBusy(true);
    setNotice("");
    try {
      const document = await api<DocumentItem>(
        `/api/projects/${projectId}/documents`,
        { method: "POST", body: formData },
      );
      setDocuments((current) => [...current, document]);
      setDocumentId(document.id);
      setChunks(
        await api<Chunk[]>(`/api/documents/${document.id}/chunks`),
      );
      setClaims([]);
      form.reset();
      setNotice("Document uploaded and parsed. Extracted claims need human review.");
    } catch (error) {
      setNotice((error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const selectDocument = async (id: number) => {
    setDocumentId(id);
    setClaims([]);
    setNotice("");
    try {
      setChunks(await api<Chunk[]>(`/api/documents/${id}/chunks`));
    } catch (error) {
      setNotice((error as Error).message);
    }
  };

  const extractClaims = async () => {
    if (documentId === null) return;
    setBusy(true);
    setNotice("");
    try {
      setClaims(
        await api<Claim[]>(`/api/documents/${documentId}/extract`, {
          method: "POST",
        }),
      );
      setNotice("Mock results are suggestions only—not verified evidence.");
    } catch (error) {
      setNotice((error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const verifyClaim = async (id: number) => {
    try {
      const updated = await api<Claim>(`/api/claims/${id}/verify`, {
        method: "PATCH",
      });
      setClaims((current) =>
        current.map((claim) => (claim.id === id ? updated : claim)),
      );
    } catch (error) {
      setNotice((error as Error).message);
    }
  };

  const selectedDocument = documents.find(
    (document) => document.id === documentId,
  );

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="Evidence Check home">
          <span className="brand-mark">E</span>
          <span>Evidence Check</span>
        </a>
        <span className="topbar-note">A careful first pass, not a verdict.</span>
      </header>

      <section className="intro">
        <p className="eyebrow">DOCUMENT WORKSPACE</p>
        <h1>Make every claim traceable.</h1>
        <p className="intro-copy">
          Parse your source documents into reviewable paragraphs. Extraction is
          a starting point; only a person can verify a claim.
        </p>
      </section>

      {notice && (
        <div className="notice" role="status">
          <span>{notice}</span>
          <button
            className="notice-close"
            aria-label="Dismiss message"
            onClick={() => setNotice("")}
          >
            ×
          </button>
        </div>
      )}

      <section className="workspace">
        <aside className="sidebar">
          <div className="section-heading">
            <div>
              <p className="eyebrow">YOUR WORK</p>
              <h2>Projects</h2>
            </div>
            <span className="count">{projects.length}</span>
          </div>
          <label className="field-label" htmlFor="project-select">
            Current project
          </label>
          <select
            id="project-select"
            value={projectId ?? ""}
            onChange={(event) =>
              setProjectId(event.target.value ? Number(event.target.value) : null)
            }
          >
            <option value="">Select a project</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
          <form className="create-project" onSubmit={createProject}>
            <label className="field-label" htmlFor="project-name">
              Start a project
            </label>
            <div className="inline-form">
              <input
                id="project-name"
                value={projectName}
                onChange={(event) => setProjectName(event.target.value)}
                placeholder="e.g. Housing policy"
                maxLength={100}
              />
              <button
                className="icon-button"
                type="submit"
                disabled={busy || !projectName.trim()}
                aria-label="Create project"
              >
                +
              </button>
            </div>
          </form>

          <div className="document-list-heading">
            <p className="eyebrow">SOURCE FILES</p>
            {projectId !== null && (
              <span className="count">{documents.length}</span>
            )}
          </div>
          {documents.length === 0 ? (
            <p className="empty-small">
              {projectId === null
                ? "Create or select a project to begin."
                : "No documents yet."}
            </p>
          ) : (
            <ul className="document-list">
              {documents.map((document) => (
                <li key={document.id}>
                  <button
                    className={`document-link${document.id === documentId ? " selected" : ""}`}
                    onClick={() => selectDocument(document.id)}
                  >
                    <span className="file-icon">▤</span>
                    <span className="document-link-text">
                      <span className="document-name">{document.filename}</span>
                      <span className="document-meta">
                        {document.chunkCount} paragraphs
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="privacy-note">
            <span aria-hidden="true">◈</span>
            <p>Files stay local to this workspace and are not shared publicly.</p>
          </div>
        </aside>

        <section className="main-panel">
          <div className="panel-title-row">
            <div>
              <p className="eyebrow">EVIDENCE CHECK</p>
              <h2>{selectedDocument?.filename ?? "Source documents"}</h2>
            </div>
            {selectedDocument && (
              <span className="status-chip">
                {chunks.length} paragraphs parsed
              </span>
            )}
          </div>

          {!selectedDocument ? (
            <div className="welcome-card">
              <div className="welcome-illustration" aria-hidden="true">
                <span className="paper paper-back" />
                <span className="paper paper-front">
                  <i />
                  <i />
                  <i />
                </span>
                <span className="search-mark">⌕</span>
              </div>
              <h3>Bring your source material into focus.</h3>
              <p>
                Upload a document to see its paragraphs with page references,
                then try a mock claim extraction.
              </p>
              {projectId !== null && (
                <form className="upload-form" onSubmit={uploadDocument}>
                  <label className="upload-button">
                    <input
                      type="file"
                      name="file"
                      accept=".docx,.pdf,.txt"
                      required
                    />
                    <span>Choose a document</span>
                  </label>
                  <button className="button button-primary" disabled={busy}>
                    {busy ? "Uploading…" : "Upload"}
                  </button>
                  <span className="file-hint">DOCX, PDF, or TXT · up to 10 MB</span>
                </form>
              )}
            </div>
          ) : (
            <>
              <div className="document-toolbar">
                <p>
                  Parsed paragraphs preserve the original document order and
                  page where available.
                </p>
                <div className="toolbar-actions">
                  <form className="toolbar-upload" onSubmit={uploadDocument}>
                    <label className="upload-button compact-upload">
                      <input
                        type="file"
                        name="file"
                        accept=".docx,.pdf,.txt"
                        required
                      />
                      <span>Add document</span>
                    </label>
                    <button
                      className="button button-secondary"
                      type="submit"
                      disabled={busy}
                    >
                      Upload
                    </button>
                  </form>
                  <button
                    className="button button-primary"
                    onClick={extractClaims}
                    disabled={busy || chunks.length === 0}
                  >
                    {busy ? "Working…" : "Run mock extraction"}
                  </button>
                </div>
              </div>

              {claims.length > 0 && (
                <section className="claims-section">
                  <div className="section-heading">
                    <div>
                      <p className="eyebrow">MOCK OUTPUT</p>
                      <h3>Claims for human review</h3>
                    </div>
                    <span className="status-chip warning-chip">Unverified by default</span>
                  </div>
                  <div className="claim-list">
                    {claims.map((claim) => (
                      <article className="claim-card" key={claim.id}>
                        <div className="claim-heading">
                          <span className="claim-side">{claim.side}</span>
                          <span className={`verification ${claim.status}`}>
                            {claim.status === "human_verified"
                              ? "Human verified"
                              : "Needs review"}
                          </span>
                        </div>
                        <h4>{claim.claim}</h4>
                        <blockquote>{claim.originalText}</blockquote>
                        <p className="claim-location">
                          Paragraph {claim.paragraph}
                          {claim.page !== null ? ` · page ${claim.page}` : ""}
                        </p>
                        {claim.status === "unverified" && (
                          <button
                            className="text-button"
                            onClick={() => verifyClaim(claim.id)}
                          >
                            Mark as human verified →
                          </button>
                        )}
                      </article>
                    ))}
                  </div>
                </section>
              )}

              <div className="paragraph-list">
                {chunks.map((chunk) => (
                  <article className="paragraph-card" key={chunk.id}>
                    <div className="paragraph-location">
                      <span>¶ {chunk.paragraph}</span>
                      {chunk.page !== null && <span>Page {chunk.page}</span>}
                    </div>
                    <p>{chunk.content}</p>
                  </article>
                ))}
              </div>
            </>
          )}
        </section>
      </section>
      <footer>
        <span>Evidence Check Workbench</span>
        <span>Extraction is not verification.</span>
      </footer>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
