"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import API from "@/lib/api";
import VirtualKeyboard from "@/components/VirtualKeyboard";
import { verifySignature } from "@/lib/pki";
// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────
type AppStatus = "APPLIED" | "REVIEWING" | "SHORTLISTED" | "ACCEPTED" | "REJECTED";

type Applicant = {
  id: string;
  status: AppStatus;
  createdAt: string;
  updatedAt: string;
  coverNote?: string; // NEW
  signature?: string;
  notes?: { id: string; note: string; createdAt: string }[]; // NEW
  user: { id: string; name: string | null; email: string };
  job: { id: string; title: string };
};

type Job = {
  id: string;
  title: string;
  description: string;
  createdAt: string;
  applications: Applicant[];
};

type Message = {
  id: string;
  senderId: string;
  encryptedText: string;  // plain text for now (company side can't decrypt PKI)
  createdAt: string;
};

// ─────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────
const STATUS_META: Record<AppStatus, { label: string; color: string; bg: string; dot: string; next?: AppStatus }> = {
  APPLIED: { label: "Applied", color: "#92400e", bg: "#fef3c7", dot: "#f59e0b", next: "REVIEWING" },
  REVIEWING: { label: "Reviewing", color: "#1e40af", bg: "#dbeafe", dot: "#3b82f6", next: "SHORTLISTED" },
  SHORTLISTED: { label: "Shortlisted", color: "#5b21b6", bg: "#ede9fe", dot: "#8b5cf6", next: "ACCEPTED" },
  ACCEPTED: { label: "Accepted", color: "#065f46", bg: "#d1fae5", dot: "#10b981" },
  REJECTED: { label: "Rejected", color: "#7f1d1d", bg: "#fee2e2", dot: "#ef4444" },
};

const ALL_STATUSES: AppStatus[] = ["APPLIED", "REVIEWING", "SHORTLISTED", "ACCEPTED", "REJECTED"];

// ─────────────────────────────────────────────
export default function CompanyDashboard() {
  const router = useRouter();
  const [company, setCompany] = useState<any>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [activeTab, setActiveTab] = useState<"overview" | "applicants" | "jobs">("overview");
  const [filterJob, setFilterJob] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<AppStatus | "all">("all");
  const [search, setSearch] = useState("");
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: "ok" | "err" } | null>(null);

  // Messaging
  const [chatOpen, setChatOpen] = useState(false);
  const [chatApplicant, setChatApplicant] = useState<Applicant | null>(null);
  const [convoId, setConvoId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [msgText, setMsgText] = useState("");
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // New job modal
  const [jobModal, setJobModal] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [postingJob, setPostingJob] = useState(false);

  // Notes Modal
  const [noteModalOpen, setNoteModalOpen] = useState(false);
  const [activeApplicant, setActiveApplicant] = useState<Applicant | null>(null);
  const [newNote, setNewNote] = useState("");
  const [addingNote, setAddingNote] = useState(false);

  // OTP Modal
  const [otpModalOpen, setOtpModalOpen] = useState(false);
  const [pendingResumeAppId, setPendingResumeAppId] = useState<string | null>(null);
  const [pendingResumeName, setPendingResumeName] = useState<string>("");


  const [verificationStatus, setVerificationStatus] = useState<"idle" | "verifying" | "valid" | "invalid">("idle");

  const verifyApplicationAuthenticity = async () => {
    if (!activeApplicant) return;
    
    console.log("-----------------------------------------");
    console.log("[COMPANY FRONTEND] Starting PKI Verification");

    if (!activeApplicant.signature) {
      console.error("[COMPANY FRONTEND] activeApplicant.signature is NULL or missing!");
      showToast("No digital signature found for this application.", "err");
      setVerificationStatus("invalid");
      return;
    }

    setVerificationStatus("verifying");
    try {
      // 1. Fetch public key
      console.log(`[COMPANY FRONTEND] Fetching key for user ${activeApplicant.user.id}`);
      const { data } = await API.get(`/pki/key/${activeApplicant.user.id}`);
      
      if (!data.publicKey) {
        console.error("[COMPANY FRONTEND] Failed to fetch public key from backend.");
        throw new Error("No public key");
      }

      // 2. Reconstruct data string
      const safeCoverNote = activeApplicant.coverNote || "";
      const dataToVerify = `${activeApplicant.job.id}:${safeCoverNote}`;
      
      console.log(`[COMPANY FRONTEND] EXACT Data being verified: "${dataToVerify}"`);
      console.log(`[COMPANY FRONTEND] Verifying against signature length: ${activeApplicant.signature.length}`);

      // 3. Verify
      const isValid = await verifySignature(data.publicKey, activeApplicant.signature, dataToVerify);
      
      console.log(`[COMPANY FRONTEND] Verification Result: ${isValid ? "SUCCESS" : "FAILED"}`);
      console.log("-----------------------------------------");

      setVerificationStatus(isValid ? "valid" : "invalid");
      if (isValid) showToast("Cryptographic signature is valid!", "ok");
      else showToast("Signature verification failed. Data may be tampered.", "err");

    } catch (err) {
      console.error("[COMPANY FRONTEND] Error during verification process:", err);
      showToast("Failed to verify signature.", "err");
      setVerificationStatus("invalid");
    }
  };
  // ── Auth ──────────────────────────────────
  // ── Auth ──────────────────────────────────
  useEffect(() => {
    const stored = localStorage.getItem("company");
    if (!stored || stored === "undefined") { router.push("/company-login"); return; }
    setCompany(JSON.parse(stored));
  }, [router]);

  // ── Fetch company data ────────────────────
  const fetchData = async () => {
    try {
      const { data } = await API.get("/company/me");
      console.log("[company/me] raw response:", JSON.stringify(data, null, 2));
      // Normalize: each job's applications must have a nested `user` object.
      // If your backend isn't including it yet, applications will be empty here.
      const normalizedJobs: Job[] = (data.jobs ?? []).map((j: any) => ({
        ...j,
        applications: (j.applications ?? []).filter((a: any) => !!a.user),
      }));
      setJobs(normalizedJobs);
      if (normalizedJobs.some((j) => j.applications.length === 0) && (data.jobs ?? []).some((j: any) => (j.applications ?? []).length > 0)) {
        console.warn("[company/me] Some applications are missing the `user` field — check your backend include query.");
      }
    } catch (err) {
      console.error("[company/me] error:", err);
      showToast("Failed to load data", "err");
    }
  };

  useEffect(() => { if (company) fetchData(); }, [company]);

  // ── Helpers ───────────────────────────────
  const showToast = (msg: string, type: "ok" | "err") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const handleLogout = () => {
    localStorage.removeItem("company");
    localStorage.removeItem("token");       // clear whichever key your API interceptor uses
    localStorage.removeItem("company_token");
    router.push("/company-login");
  };

  // Flatten all applicants across jobs
  const allApplicants: Applicant[] = useMemo(() =>
    jobs.flatMap((j) =>
      (j.applications ?? []).map((a) => ({ ...a, job: { id: j.id, title: j.title } }))
    ), [jobs]);

  const filteredApplicants = useMemo(() => {
    return allApplicants.filter((a) => {
      const matchJob = filterJob === "all" || a.job.id === filterJob;
      const matchStatus = filterStatus === "all" || a.status === filterStatus;
      const matchSearch = !search ||
        a.user.name?.toLowerCase().includes(search.toLowerCase()) ||
        a.user.email.toLowerCase().includes(search.toLowerCase()) ||
        a.job.title.toLowerCase().includes(search.toLowerCase());
      return matchJob && matchStatus && matchSearch;
    });
  }, [allApplicants, filterJob, filterStatus, search]);

  // ── Update application status ─────────────
  const updateStatus = async (applicationId: string, status: AppStatus) => {
    setUpdatingId(applicationId);
    try {
      await API.put("/application/status", { applicationId, status });
      setJobs((prev) => prev.map((j) => ({
        ...j,
        applications: j.applications.map((a) =>
          a.id === applicationId ? { ...a, status } : a
        )
      })));
      showToast("Status updated", "ok");
    } catch { showToast("Failed to update status", "err"); }
    finally { setUpdatingId(null); }
  };

  // ── Messaging ─────────────────────────────
  const openChat = async (applicant: Applicant) => {
    setChatApplicant(applicant);
    setChatOpen(true);
    setMessages([]);
    setConvoId(null);
    // Create or fetch conversation
    try {
      const { data } = await API.post("/conversation", { userIds: [applicant.user.id] });
      setConvoId(data.id);
      const msgs = await API.get(`/messages/${data.id}`);
      setMessages(msgs.data);
    } catch { showToast("Could not open conversation", "err"); }
  };

  const sendMessage = async () => {
    if (!msgText.trim() || !convoId) return;
    setSending(true);
    try {
      // NOTE: Messages are E2E encrypted in your system (encryptedText/iv/encryptedKey).
      // Here we send plain text as encryptedText since company side doesn't have PKI keys.
      // Integrate your encryption util here when ready.
      const { data } = await API.post("/message", {
        conversationId: convoId,
        encryptedText: msgText,
        iv: "plain",
        encryptedKey: "plain",
      });
      setMessages((prev) => [...prev, data]);
      setMsgText("");
    } catch { showToast("Failed to send message", "err"); }
    finally { setSending(false); }
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ── Post new job ──────────────────────────
  const postJob = async () => {
    if (!newTitle.trim() || !newDesc.trim()) return;
    setPostingJob(true);
    try {
      await API.post("/job", { title: newTitle, description: newDesc });
      setNewTitle(""); setNewDesc("");
      setJobModal(false);
      showToast("Job posted!", "ok");
      await fetchData();
    } catch { showToast("Failed to post job", "err"); }
    finally { setPostingJob(false); }
  };

  // ── Add Recruiter Note ────────────────────
  const addNote = async () => {
    if (!newNote.trim() || !activeApplicant) return;
    setAddingNote(true);
    try {
      const { data } = await API.post(`/application/${activeApplicant.id}/notes`, { note: newNote });

      // Update local state so it shows up immediately without refreshing
      setJobs((prev) => prev.map(j => ({
        ...j,
        applications: j.applications.map(a =>
          a.id === activeApplicant.id
            ? { ...a, notes: [...(a.notes || []), data] }
            : a
        )
      })));

      // Update active applicant so modal refreshes
      setActiveApplicant(prev => prev ? { ...prev, notes: [...(prev.notes || []), data] } : null);
      setNewNote("");
      showToast("Note added", "ok");
    } catch {
      showToast("Failed to add note", "err");
    } finally {
      setAddingNote(false);
    }
  };

  const openNotes = (applicant: Applicant) => {
    setActiveApplicant(applicant);
    setVerificationStatus("idle"); // <--- ADD THIS LINE to reset the button
    setNoteModalOpen(true);
  };

  // ── Download Resume ───────────────────────
  // ── Secure Resume Download (OTP Trigger) ───────────────────────
  const triggerResumeDownload = (applicationId: string, applicantName: string) => {
    setPendingResumeAppId(applicationId);
    setPendingResumeName(applicantName);
    setOtpModalOpen(true); // Open the virtual keyboard modal
  };

  const executeDownload = async (pin: string) => {
    if (!pendingResumeAppId) return;
    try {
      showToast("Verifying and decrypting...", "ok");

      const response = await API.post(`/application/${pendingResumeAppId}/resume`,
        { otpToken: pin },
        { responseType: 'blob' }
      );

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${pendingResumeName.replace(/\s+/g, '_')}_Resume.pdf`);
      document.body.appendChild(link);
      link.click();
      link.parentNode?.removeChild(link);

      setOtpModalOpen(false);
    } catch (err: any) {
      if (err.response?.status === 401) {
        showToast("Invalid authenticator code", "err");
      } else {
        showToast("Failed to retrieve resume", "err");
      }
    }
  };

  // ── Stats ──────────────────────────────────
  const stats = useMemo(() => ({
    jobs: jobs.length,
    total: allApplicants.length,
    shortlisted: allApplicants.filter((a) => a.status === "SHORTLISTED").length,
    accepted: allApplicants.filter((a) => a.status === "ACCEPTED").length,
  }), [jobs, allApplicants]);

  if (!company) return null;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Sans:ital,wght@0,300;0,400;0,500;0,600;1,400&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        .co-root {
          min-height: 100vh;
          font-family: 'DM Sans', sans-serif;
          background: #0f0f0f;
          color: #f0ede8;
        }

        /* ── Navbar ── */
        .co-nav {
          position: sticky; top: 0; z-index: 50;
          display: flex; align-items: center; justify-content: space-between;
          padding: 0 2rem; height: 60px;
          background: #161616;
          border-bottom: 1px solid #2a2a2a;
        }
        .co-brand {
          font-family: 'Syne', sans-serif;
          font-size: 1.1rem; font-weight: 800;
          letter-spacing: -.03em; color: #f0ede8;
        }
        .co-brand em { color: #e85d26; font-style: normal; }
        .co-nav-right { display: flex; align-items: center; gap: 1rem; }
        .co-company-name {
          font-size: .82rem; color: #6b7280; font-weight: 500;
        }
        .co-avatar {
          width: 34px; height: 34px; border-radius: 9px;
          background: linear-gradient(135deg, #e85d26, #f59e0b);
          display: flex; align-items: center; justify-content: center;
          font-family: 'Syne', sans-serif; font-weight: 800; font-size: .85rem;
          color: #fff; cursor: pointer;
        }
        .co-post-btn {
          padding: .45rem 1rem;
          font-family: 'DM Sans', sans-serif; font-size: .82rem; font-weight: 600;
          background: #e85d26; color: #fff;
          border: none; border-radius: 8px; cursor: pointer;
          transition: background .15s;
          display: flex; align-items: center; gap: .4rem;
        }
        .co-post-btn:hover { background: #cf4d1d; }

        /* ── Logout ── */
        .co-logout-btn {
          padding: .42rem .9rem;
          font-family: 'DM Sans', sans-serif; font-size: .82rem; font-weight: 600;
          background: transparent; color: #6b7280;
          border: 1px solid #2a2a2a; border-radius: 8px; cursor: pointer;
          transition: background .15s, color .15s, border-color .15s;
          display: flex; align-items: center; gap: .35rem;
        }
        .co-logout-btn:hover {
          background: #2d1f1f; color: #fca5a5; border-color: #7f1d1d;
        }

        /* ── Layout ── */
        .co-body { max-width: 1160px; margin: 0 auto; padding: 2rem 1.5rem 5rem; }

        /* ── Stats ── */
        .co-stats {
          display: grid; grid-template-columns: repeat(4, 1fr);
          gap: 1rem; margin-bottom: 2rem;
        }
        @media(max-width:680px){ .co-stats { grid-template-columns: repeat(2,1fr); } }
        .co-stat {
          background: #1a1a1a; border: 1px solid #2a2a2a;
          border-radius: 14px; padding: 1.1rem 1.3rem;
        }
        .co-stat.hl { background: #e85d26; border-color: #e85d26; }
        .co-stat-label {
          font-size: .68rem; font-weight: 600;
          letter-spacing: .08em; text-transform: uppercase;
          color: #6b7280; margin-bottom: .4rem;
        }
        .co-stat.hl .co-stat-label { color: rgba(255,255,255,.7); }
        .co-stat-val {
          font-family: 'Syne', 'Segoe UI', system-ui, sans-serif;
          font-size: 2rem; font-weight: 800; line-height: 1;
          font-variant-numeric: tabular-nums;
          color: #f0ede8;
        }
        .co-stat.hl .co-stat-val { color: #fff; }

        /* ── Tabs ── */
        .co-tabs {
          display: flex; gap: 0;
          margin-bottom: 1.5rem;
          border-bottom: 1px solid #2a2a2a;
        }
        .co-tab {
          padding: .6rem 1.3rem;
          font-family: 'DM Sans', sans-serif; font-size: .875rem; font-weight: 500;
          border: none; background: none; cursor: pointer; color: #6b7280;
          border-bottom: 2px solid transparent; margin-bottom: -1px;
          transition: color .15s, border-color .15s;
          display: flex; align-items: center; gap: .4rem;
        }
        .co-tab.active { color: #e85d26; border-bottom-color: #e85d26; font-weight: 600; }
        .co-tab-badge {
          background: #2a2a2a; color: #6b7280;
          font-size: .68rem; font-weight: 700;
          padding: 1px 7px; border-radius: 99px;
        }
        .co-tab.active .co-tab-badge { background: rgba(232,93,38,.2); color: #e85d26; }

        /* ── Filters ── */
        .co-filters {
          display: flex; gap: .75rem; margin-bottom: 1.25rem; flex-wrap: wrap;
        }
        .co-filter-select, .co-search-input {
          font-family: 'DM Sans', sans-serif; font-size: .85rem;
          background: #1a1a1a; border: 1px solid #2a2a2a;
          color: #f0ede8; border-radius: 9px;
          padding: .55rem .9rem;
          outline: none;
          transition: border-color .15s;
        }
        .co-filter-select:focus, .co-search-input:focus {
          border-color: #e85d26;
        }
        .co-search-input { flex: 1; min-width: 180px; }
        .co-search-input::placeholder { color: #4b5563; }

        /* ── Applicant table ── */
        .co-table-wrap {
          background: #1a1a1a; border: 1px solid #2a2a2a;
          border-radius: 16px; overflow: hidden;
        }
        .co-table {
          width: 100%; border-collapse: collapse;
        }
        .co-table th {
          font-size: .68rem; font-weight: 600;
          letter-spacing: .08em; text-transform: uppercase;
          color: #6b7280; padding: .85rem 1.2rem;
          text-align: left;
          border-bottom: 1px solid #2a2a2a;
          background: #161616;
        }
        .co-table td {
          padding: .9rem 1.2rem;
          border-bottom: 1px solid #1f1f1f;
          vertical-align: middle;
          font-size: .875rem;
        }
        .co-table tr:last-child td { border-bottom: none; }
        .co-table tr:hover td { background: #1f1f1f; }

        .applicant-name { font-weight: 600; color: #f0ede8; }
        .applicant-email { font-size: .78rem; color: #6b7280; margin-top: 2px; }
        .job-pill {
          font-size: .75rem; background: #252525; color: #9ca3af;
          padding: 3px 10px; border-radius: 6px; display: inline-block;
        }
        .co-date { font-size: .78rem; color: #4b5563; }

        /* Status select */
        .status-select {
          font-family: 'DM Sans', sans-serif; font-size: .75rem; font-weight: 600;
          border: none; border-radius: 99px; cursor: pointer;
          padding: 4px 10px; outline: none;
          appearance: none;
          -webkit-appearance: none;
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%236b7280'/%3E%3C/svg%3E");
          background-repeat: no-repeat;
          background-position: right 8px center;
          padding-right: 22px;
        }

        /* Action buttons */
        .btn-msg {
          padding: .38rem .85rem;
          font-family: 'DM Sans', sans-serif; font-size: .78rem; font-weight: 600;
          background: #252525; color: #9ca3af;
          border: 1px solid #333; border-radius: 8px; cursor: pointer;
          transition: background .15s, color .15s, border-color .15s;
          display: flex; align-items: center; gap: .3rem;
          white-space: nowrap;
        }
        .btn-msg:hover { background: #1a1a1a; color: #e85d26; border-color: #e85d26; }

        /* ── Jobs tab ── */
        .co-jobs-grid {
          display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
          gap: 1rem;
        }
        .co-job-card {
          background: #1a1a1a; border: 1px solid #2a2a2a;
          border-radius: 16px; padding: 1.4rem;
          transition: border-color .2s, box-shadow .2s;
        }
        .co-job-card:hover {
          border-color: #3a3a3a;
          box-shadow: 0 6px 24px rgba(0,0,0,.4);
        }
        .co-job-title {
          font-family: 'Syne', sans-serif; font-size: 1rem; font-weight: 700;
          color: #f0ede8; margin-bottom: .4rem;
        }
        .co-job-desc {
          font-size: .82rem; color: #6b7280; line-height: 1.55;
          display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
          overflow: hidden; margin-bottom: .8rem;
        }
        .co-job-meta {
          display: flex; align-items: center; justify-content: space-between;
          font-size: .75rem; color: #4b5563;
        }
        .co-apps-count {
          background: #252525; color: #9ca3af;
          padding: 3px 10px; border-radius: 6px;
          font-weight: 600; font-size: .75rem;
        }

        /* ── Overview funnel ── */
        .co-funnel {
          display: flex; gap: 0;
          background: #1a1a1a; border: 1px solid #2a2a2a;
          border-radius: 14px; overflow: hidden;
          margin-bottom: 2rem;
        }
        .co-funnel-step {
          flex: 1; padding: 1rem .75rem; text-align: center;
          border-right: 1px solid #2a2a2a;
        }
        .co-funnel-step:last-child { border-right: none; }
        .co-funnel-label {
          font-size: .66rem; font-weight: 600; letter-spacing: .07em;
          text-transform: uppercase; color: #4b5563; margin-bottom: .3rem;
        }
        .co-funnel-count {
          font-family: 'Syne', 'Segoe UI', system-ui, sans-serif;
          font-size: 1.5rem; font-weight: 800; line-height: 1;
          font-variant-numeric: tabular-nums;
        }

        /* ── Overview recent ── */
        .co-section-title {
          font-family: 'Syne', sans-serif; font-size: 1rem; font-weight: 700;
          color: #f0ede8; margin-bottom: .85rem; margin-top: 1.5rem;
          letter-spacing: -.02em;
        }
        .co-recent-list { display: flex; flex-direction: column; gap: .5rem; }
        .co-recent-row {
          display: flex; align-items: center; gap: 1rem;
          background: #1a1a1a; border: 1px solid #222;
          border-radius: 10px; padding: .75rem 1rem;
        }
        .co-recent-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
        .co-recent-name { font-weight: 500; font-size: .875rem; color: #f0ede8; }
        .co-recent-job { font-size: .78rem; color: #6b7280; }
        .co-recent-right { margin-left: auto; display: flex; align-items: center; gap: .75rem; }

        /* ── Chat drawer ── */
        .chat-overlay {
          position: fixed; inset: 0; z-index: 100;
          background: rgba(0,0,0,.6);
          display: flex; align-items: flex-end; justify-content: flex-end;
        }
        .chat-drawer {
          width: 380px; height: 520px;
          background: #1a1a1a; border: 1px solid #2a2a2a;
          border-radius: 16px 16px 0 0;
          margin: 0 1.5rem;
          display: flex; flex-direction: column;
          overflow: hidden;
          box-shadow: 0 -8px 40px rgba(0,0,0,.5);
        }
        .chat-header {
          display: flex; align-items: center; justify-content: space-between;
          padding: 1rem 1.2rem;
          background: #161616; border-bottom: 1px solid #2a2a2a;
          flex-shrink: 0;
        }
        .chat-header-info {}
        .chat-name {
          font-family: 'Syne', sans-serif; font-weight: 700; font-size: .95rem;
          color: #f0ede8;
        }
        .chat-sub { font-size: .75rem; color: #6b7280; margin-top: 2px; }
        .chat-close {
          width: 28px; height: 28px; border-radius: 7px;
          background: #252525; border: none; cursor: pointer;
          display: flex; align-items: center; justify-content: center;
          color: #6b7280; font-size: 1rem;
          transition: background .15s, color .15s;
        }
        .chat-close:hover { background: #333; color: #f0ede8; }
        .chat-messages {
          flex: 1; overflow-y: auto; padding: 1rem;
          display: flex; flex-direction: column; gap: .6rem;
        }
        .chat-messages::-webkit-scrollbar { width: 4px; }
        .chat-messages::-webkit-scrollbar-track { background: transparent; }
        .chat-messages::-webkit-scrollbar-thumb { background: #333; border-radius: 4px; }
        .msg-bubble {
          max-width: 80%; padding: .55rem .85rem;
          border-radius: 12px; font-size: .85rem; line-height: 1.5;
        }
        .msg-bubble.sent {
          align-self: flex-end;
          background: #e85d26; color: #fff;
          border-bottom-right-radius: 4px;
        }
        .msg-bubble.received {
          align-self: flex-start;
          background: #252525; color: #d1d5db;
          border-bottom-left-radius: 4px;
        }
        .msg-time { font-size: .65rem; opacity: .6; margin-top: 3px; display: block; text-align: right; }
        .chat-empty {
          flex: 1; display: flex; flex-direction: column;
          align-items: center; justify-content: center;
          color: #4b5563; font-size: .85rem; gap: .4rem;
        }
        .chat-input-row {
          display: flex; gap: .6rem; padding: .85rem 1rem;
          border-top: 1px solid #2a2a2a; flex-shrink: 0;
        }
        .chat-input {
          flex: 1; background: #252525; border: 1px solid #333;
          color: #f0ede8; border-radius: 9px;
          font-family: 'DM Sans', sans-serif; font-size: .875rem;
          padding: .55rem .9rem; outline: none;
          transition: border-color .15s;
        }
        .chat-input:focus { border-color: #e85d26; }
        .chat-input::placeholder { color: #4b5563; }
        .chat-send {
          width: 38px; height: 38px; border-radius: 9px;
          background: #e85d26; border: none; cursor: pointer;
          display: flex; align-items: center; justify-content: center;
          color: #fff; transition: background .15s;
          flex-shrink: 0;
        }
        .chat-send:hover:not(:disabled) { background: #cf4d1d; }
        .chat-send:disabled { opacity: .5; cursor: not-allowed; }

        /* ── New job modal ── */
        .modal-overlay {
          position: fixed; inset: 0; z-index: 200;
          background: rgba(0,0,0,.7);
          display: flex; align-items: center; justify-content: center;
          padding: 1.5rem;
        }
        .modal {
          background: #1a1a1a; border: 1px solid #2a2a2a;
          border-radius: 18px; padding: 1.8rem;
          width: 100%; max-width: 480px;
          box-shadow: 0 20px 60px rgba(0,0,0,.6);
        }
        .modal-title {
          font-family: 'Syne', sans-serif; font-size: 1.2rem; font-weight: 800;
          color: #f0ede8; margin-bottom: 1.4rem;
        }
        .modal-label {
          font-size: .78rem; font-weight: 600; color: #6b7280;
          text-transform: uppercase; letter-spacing: .06em;
          display: block; margin-bottom: .4rem;
        }
        .modal-input, .modal-textarea {
          width: 100%; background: #252525; border: 1px solid #333;
          color: #f0ede8; border-radius: 9px;
          font-family: 'DM Sans', sans-serif; font-size: .9rem;
          padding: .65rem .9rem; outline: none;
          transition: border-color .15s; margin-bottom: 1rem;
        }
        .modal-textarea { resize: vertical; min-height: 90px; }
        .modal-input:focus, .modal-textarea:focus { border-color: #e85d26; }
        .modal-actions { display: flex; gap: .75rem; justify-content: flex-end; }
        .btn-cancel {
          padding: .55rem 1.1rem;
          font-family: 'DM Sans', sans-serif; font-size: .875rem; font-weight: 600;
          background: #252525; color: #9ca3af;
          border: 1px solid #333; border-radius: 9px; cursor: pointer;
          transition: background .15s;
        }
        .btn-cancel:hover { background: #2f2f2f; }
        .btn-submit {
          padding: .55rem 1.3rem;
          font-family: 'DM Sans', sans-serif; font-size: .875rem; font-weight: 600;
          background: #e85d26; color: #fff;
          border: none; border-radius: 9px; cursor: pointer;
          transition: background .15s;
        }
        .btn-submit:hover:not(:disabled) { background: #cf4d1d; }
        .btn-submit:disabled { opacity: .5; cursor: not-allowed; }

        /* ── Empty ── */
        .co-empty {
          text-align: center; padding: 4rem 2rem; color: #4b5563;
        }
        .co-empty-icon { font-size: 2.5rem; margin-bottom: .75rem; }
        .co-empty-title {
          font-family: 'Syne', sans-serif; font-size: 1.05rem;
          font-weight: 700; color: #6b7280;
        }

        /* ── Toast ── */
        .co-toast {
          position: fixed; bottom: 1.5rem; right: 1.5rem; z-index: 999;
          padding: .7rem 1.1rem; border-radius: 10px;
          font-size: .875rem; font-weight: 500;
          box-shadow: 0 8px 24px rgba(0,0,0,.4);
          animation: slideUp .25s ease;
          display: flex; align-items: center; gap: .5rem;
        }
        .co-toast.ok { background: #1f2d1f; color: #86efac; border: 1px solid #166534; }
        .co-toast.err { background: #2d1f1f; color: #fca5a5; border: 1px solid #991b1b; }
        @keyframes slideUp {
          from { opacity:0; transform:translateY(10px); }
          to   { opacity:1; transform:translateY(0); }
        }

        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>

      <div className="co-root">

        {/* ── Navbar ── */}
        <nav className="co-nav">
          <span className="co-brand">work<em>.</em>flow <span style={{ color: "#4b5563", fontWeight: 400 }}>/ company</span></span>
          <div className="co-nav-right">
            <span className="co-company-name">{company.name}</span>
            <button className="co-post-btn" onClick={() => setJobModal(true)}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
              Post Job
            </button>
            <button className="co-logout-btn" onClick={handleLogout} title="Log out">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
              Logout
            </button>
            <div className="co-avatar">{company.name?.[0]?.toUpperCase()}</div>
          </div>
        </nav>

        <div className="co-body">

          {/* ── Stats ── */}
          <div className="co-stats">
            <div className="co-stat hl">
              <div className="co-stat-label">Total Applicants</div>
              <div className="co-stat-val">{stats.total}</div>
            </div>
            <div className="co-stat">
              <div className="co-stat-label">Active Jobs</div>
              <div className="co-stat-val">{stats.jobs}</div>
            </div>
            <div className="co-stat">
              <div className="co-stat-label">Shortlisted</div>
              <div className="co-stat-val">{stats.shortlisted}</div>
            </div>
            <div className="co-stat">
              <div className="co-stat-label">Accepted</div>
              <div className="co-stat-val">{stats.accepted}</div>
            </div>
          </div>

          {/* ── Tabs ── */}
          <div className="co-tabs">
            {(["overview", "applicants", "jobs"] as const).map((t) => (
              <button
                key={t}
                className={`co-tab ${activeTab === t ? "active" : ""}`}
                onClick={() => setActiveTab(t)}
              >
                {t === "overview" ? "📊" : t === "applicants" ? "👥" : "💼"}{" "}
                {t.charAt(0).toUpperCase() + t.slice(1)}
                <span className="co-tab-badge">
                  {t === "applicants" ? allApplicants.length : t === "jobs" ? jobs.length : ""}
                </span>
              </button>
            ))}
          </div>

          {/* ══════════════════════════════════
              OVERVIEW TAB
          ══════════════════════════════════ */}
          {activeTab === "overview" && (
            <>
              {/* Funnel */}
              <div className="co-funnel">
                {ALL_STATUSES.map((s) => {
                  const m = STATUS_META[s];
                  const count = allApplicants.filter((a) => a.status === s).length;
                  return (
                    <div className="co-funnel-step" key={s}>
                      <div className="co-funnel-label">{m.label}</div>
                      <div className="co-funnel-count" style={{ color: m.dot }}>{count}</div>
                    </div>
                  );
                })}
              </div>

              {/* Recent applications */}
              <div className="co-section-title">Recent Applications</div>
              {allApplicants.length === 0 ? (
                <div className="co-empty">
                  <div className="co-empty-icon">📭</div>
                  <div className="co-empty-title">No applications yet</div>
                </div>
              ) : (
                <div className="co-recent-list">
                  {[...allApplicants]
                    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                    .slice(0, 8)
                    .map((a) => {
                      const m = STATUS_META[a.status];
                      return (
                        <div className="co-recent-row" key={a.id}>
                          <div className="co-recent-dot" style={{ background: m.dot }} />
                          <div>
                            <div className="co-recent-name">{a.user.name ?? a.user.email}</div>
                            <div className="co-recent-job">{a.job.title}</div>
                          </div>
                          <div className="co-recent-right">
                            <span style={{
                              fontSize: ".72rem", fontWeight: 700,
                              padding: "3px 10px", borderRadius: 99,
                              background: m.bg, color: m.color
                            }}>{m.label}</span>
                            <button className="btn-msg" onClick={() => openNotes(a)}>
                              📝 Notes
                            </button>
                            <button className="btn-msg" onClick={() => openChat(a)}>
                              💬 Message
                            </button>
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}
            </>
          )}

          {/* ══════════════════════════════════
              APPLICANTS TAB
          ══════════════════════════════════ */}
          {activeTab === "applicants" && (
            <>
              {/* Filters */}
              <div className="co-filters">
                <input
                  className="co-search-input"
                  placeholder="Search name or email…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <select
                  className="co-filter-select"
                  value={filterJob}
                  onChange={(e) => setFilterJob(e.target.value)}
                >
                  <option value="all">All Jobs</option>
                  {jobs.map((j) => (
                    <option key={j.id} value={j.id}>{j.title}</option>
                  ))}
                </select>
                <select
                  className="co-filter-select"
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value as any)}
                >
                  <option value="all">All Statuses</option>
                  {ALL_STATUSES.map((s) => (
                    <option key={s} value={s}>{STATUS_META[s].label}</option>
                  ))}
                </select>
              </div>

              {/* ── Backend data warning ── */}
              {allApplicants.length === 0 && jobs.some(j => (j.applications ?? []).length > 0) && (
                <div style={{
                  background: "#2d2010", border: "1px solid #92400e", borderRadius: 10,
                  padding: ".75rem 1rem", marginBottom: "1rem",
                  fontSize: ".82rem", color: "#fbbf24", lineHeight: 1.6
                }}>
                  ⚠️ <strong>Backend fix needed:</strong> Jobs have applications but they're missing the <code>user</code> field.
                  Update your <code>/company/me</code> Prisma query to <code>include: {"{ jobs: { include: { applications: { include: { user: true } } } } }"}</code>
                </div>
              )}

              {filteredApplicants.length === 0 ? (
                <div className="co-empty">
                  <div className="co-empty-icon">🔍</div>
                  <div className="co-empty-title">No applicants found</div>
                </div>
              ) : (
                <div className="co-table-wrap">
                  <table className="co-table">
                    <thead>
                      <tr>
                        <th>Applicant</th>
                        <th>Role</th>
                        <th>Applied</th>
                        <th>Status</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredApplicants.map((a) => {
                        const m = STATUS_META[a.status];
                        const date = new Date(a.createdAt).toLocaleDateString("en-US", {
                          month: "short", day: "numeric", year: "numeric"
                        });
                        return (
                          <tr key={a.id}>
                            <td>
                              <div className="applicant-name">{a.user.name ?? "—"}</div>
                              <div className="applicant-email">{a.user.email}</div>
                            </td>
                            <td><span className="job-pill">{a.job.title}</span></td>
                            <td><span className="co-date">{date}</span></td>
                            <td>
                              <select
                                className="status-select"
                                value={a.status}
                                disabled={updatingId === a.id}
                                style={{ background: m.bg, color: m.color }}
                                onChange={(e) => updateStatus(a.id, e.target.value as AppStatus)}
                              >
                                {ALL_STATUSES.map((s) => (
                                  <option key={s} value={s} style={{ background: "#1a1a1a", color: "#f0ede8" }}>
                                    {STATUS_META[s].label}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td style={{ display: "flex", gap: "0.5rem" }}>
                              <button className="btn-msg" onClick={() => triggerResumeDownload(a.id, a.user.name ?? a.user.email)}>
                                📄 Resume
                              </button>
                              <button className="btn-msg" onClick={() => openNotes(a)}>
                                📝 Notes
                              </button>
                              <button className="btn-msg" onClick={() => openChat(a)}>
                                {updatingId === a.id ? (
                                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ animation: "spin 1s linear infinite" }}>
                                    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                                  </svg>
                                ) : "💬"} Message
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}

          {/* ══════════════════════════════════
              JOBS TAB
          ══════════════════════════════════ */}
          {activeTab === "jobs" && (
            <>
              {jobs.length === 0 ? (
                <div className="co-empty">
                  <div className="co-empty-icon">📋</div>
                  <div className="co-empty-title">No jobs posted yet</div>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                  {jobs.map((j) => {
                    const appCount = j.applications?.length ?? 0;
                    return (
                      <div className="co-job-card" key={j.id} style={{ gap: "1rem" }}>
                        {/* Job header */}
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                          <div style={{ flex: 1 }}>
                            <div className="co-job-title">{j.title}</div>
                            <div className="co-job-desc" style={{ marginTop: ".25rem" }}>{j.description}</div>
                          </div>
                          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: ".3rem", flexShrink: 0, marginLeft: "1rem" }}>
                            <span className="co-apps-count">{appCount} applicant{appCount !== 1 ? "s" : ""}</span>
                            <span className="co-date">
                              {new Date(j.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                            </span>
                          </div>
                        </div>

                        {/* Applicants for this job */}
                        {appCount === 0 ? (
                          <div style={{ fontSize: ".78rem", color: "#4b5563", fontStyle: "italic", paddingTop: ".25rem", borderTop: "1px solid #252525" }}>
                            No applications yet
                          </div>
                        ) : (
                          <div style={{ borderTop: "1px solid #252525", paddingTop: ".85rem", display: "flex", flexDirection: "column", gap: ".5rem" }}>
                            {j.applications.map((a) => {
                              const m = STATUS_META[a.status];
                              return (
                                <div key={a.id} style={{
                                  display: "flex", alignItems: "center", gap: ".75rem",
                                  background: "#252525", borderRadius: "9px", padding: ".6rem .85rem"
                                }}>
                                  {/* Avatar */}
                                  <div style={{
                                    width: 30, height: 30, borderRadius: "50%",
                                    background: "linear-gradient(135deg, #e85d26, #f59e0b)",
                                    display: "flex", alignItems: "center", justifyContent: "center",
                                    fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: ".75rem",
                                    color: "#fff", flexShrink: 0
                                  }}>
                                    {(a.user.name ?? a.user.email)?.[0]?.toUpperCase()}
                                  </div>
                                  {/* Info */}
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontWeight: 600, fontSize: ".85rem", color: "#f0ede8", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                      {a.user.name ?? "—"}
                                    </div>
                                    <div style={{ fontSize: ".72rem", color: "#6b7280" }}>{a.user.email}</div>
                                  </div>
                                  {/* Status badge */}
                                  <span style={{
                                    fontSize: ".7rem", fontWeight: 700,
                                    padding: "3px 10px", borderRadius: 99,
                                    background: m.bg, color: m.color,
                                    whiteSpace: "nowrap", flexShrink: 0
                                  }}>{m.label}</span>
                                  {/* Message button */}
                                  <button className="btn-msg" onClick={() => openChat({ ...a, job: { id: j.id, title: j.title } })} style={{ flexShrink: 0 }}>
                                    💬
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}

        </div>
      </div>

      {/* ══════════════════════════════════
          CHAT DRAWER
      ══════════════════════════════════ */}
      {chatOpen && chatApplicant && (
        <div className="chat-overlay" onClick={(e) => { if (e.target === e.currentTarget) setChatOpen(false); }}>
          <div className="chat-drawer">
            <div className="chat-header">
              <div className="chat-header-info">
                <div className="chat-name">{chatApplicant.user.name ?? chatApplicant.user.email}</div>
                <div className="chat-sub">{chatApplicant.job.title} · {STATUS_META[chatApplicant.status].label}</div>
              </div>
              <button className="chat-close" onClick={() => setChatOpen(false)}>✕</button>
            </div>

            <div className="chat-messages">
              {messages.length === 0 ? (
                <div className="chat-empty">
                  <span style={{ fontSize: "1.5rem" }}>💬</span>
                  <span>Start the conversation</span>
                </div>
              ) : (
                messages.map((msg) => {
                  const isSent = msg.senderId !== chatApplicant.user.id;
                  const time = new Date(msg.createdAt).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
                  return (
                    <div key={msg.id} className={`msg-bubble ${isSent ? "sent" : "received"}`}>
                      {msg.encryptedText}
                      <span className="msg-time">{time}</span>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            <div className="chat-input-row">
              <input
                className="chat-input"
                placeholder="Type a message…"
                value={msgText}
                onChange={(e) => setMsgText(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
              />
              <button className="chat-send" onClick={sendMessage} disabled={sending || !msgText.trim()}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════
          NEW JOB MODAL
      ══════════════════════════════════ */}
      {jobModal && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setJobModal(false); }}>
          <div className="modal">
            <div className="modal-title">Post a New Job</div>
            <label className="modal-label">Job Title</label>
            <input
              className="modal-input"
              placeholder="e.g. Frontend Engineer"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
            />
            <label className="modal-label">Description</label>
            <textarea
              className="modal-textarea modal-input"
              placeholder="Describe the role, responsibilities, requirements…"
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
            />
            <div className="modal-actions">
              <button className="btn-cancel" onClick={() => setJobModal(false)}>Cancel</button>
              <button className="btn-submit" onClick={postJob} disabled={postingJob || !newTitle.trim() || !newDesc.trim()}>
                {postingJob ? "Posting…" : "Post Job"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════
          NOTES & DETAILS MODAL to save the notes 
      ══════════════════════════════════ */}
      {noteModalOpen && activeApplicant && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setNoteModalOpen(false); }}>
          <div className="modal" style={{ maxWidth: "550px", maxHeight: "85vh", display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1.5rem" }}>
              <div>
                <div className="modal-title" style={{ marginBottom: ".25rem" }}>
                  {activeApplicant.user.name ?? activeApplicant.user.email}
                </div>
                <div style={{ fontSize: ".85rem", color: "#6b7280" }}>
                  Applying for: <strong style={{ color: "#f0ede8" }}>{activeApplicant.job.title}</strong>
                </div>
              </div>

              <div style={{ display: "flex", gap: ".5rem", alignItems: "center" }}>
                {/* NEW: Download Resume Button */}
                <button
                  className="btn-msg"
                  onClick={() => triggerResumeDownload(activeApplicant.id, activeApplicant.user.name ?? activeApplicant.user.email)}
                  style={{ padding: ".45rem .85rem" }}
                >
                  📄 Resume
                </button>

                {/* NEW: Quick Status Updater Dropdown */}
                <select
                  className="status-select"
                  value={activeApplicant.status}
                  disabled={updatingId === activeApplicant.id}
                  style={{
                    background: STATUS_META[activeApplicant.status].bg,
                    color: STATUS_META[activeApplicant.status].color,
                    padding: ".5rem 2rem .5rem 1rem",
                    fontSize: ".8rem"
                  }}
                  onChange={(e) => {
                    const newStatus = e.target.value as AppStatus;
                    updateStatus(activeApplicant.id, newStatus);
                    // Also update local modal state so UI doesn't lag
                    setActiveApplicant(prev => prev ? { ...prev, status: newStatus } : null);
                  }}
                >
                  {ALL_STATUSES.map((s) => (
                    <option key={s} value={s} style={{ background: "#1a1a1a", color: "#f0ede8" }}>
                      {STATUS_META[s].label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div style={{ overflowY: "auto", flex: 1, paddingRight: ".5rem", marginBottom: "1rem" }}>
              {/* Cover Note Section */}
              <label className="modal-label">Applicant Cover Note</label>
              <div style={{
                background: "#252525", padding: "1rem", borderRadius: "9px",
                fontSize: ".875rem", color: "#d1d5db", marginBottom: "1.5rem", fontStyle: activeApplicant.coverNote ? "normal" : "italic"
              }}>
                {activeApplicant.coverNote ? activeApplicant.coverNote : "No cover note provided."}
              </div>

              {/* ──────────────────────────────────────────────── */}
              {/* NEW: PKI Verification UI                         */}
              {/* ──────────────────────────────────────────────── */}
              <div style={{ marginBottom: "1.5rem", padding: "1rem", background: "#111", border: "1px solid #333", borderRadius: "8px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontSize: ".85rem", fontWeight: "bold", color: "#f0ede8" }}>Digital Signature (PKI)</div>
                    <div style={{ fontSize: ".75rem", color: "#6b7280" }}>Verify the cryptographic authenticity of this application.</div>
                  </div>

                  <button
                    onClick={verifyApplicationAuthenticity}
                    disabled={verificationStatus === "verifying"}
                    style={{
                      padding: ".4rem .8rem", borderRadius: "6px", fontSize: ".75rem", fontWeight: "bold", cursor: "pointer",
                      background: verificationStatus === "valid" ? "#166534" : verificationStatus === "invalid" ? "#991b1b" : "#252525",
                      color: "white", border: "1px solid #444"
                    }}
                  >
                    {verificationStatus === "idle" ? "Verify Signature" :
                      verificationStatus === "verifying" ? "Verifying..." :
                        verificationStatus === "valid" ? "✓ Verified Authentic" : "✕ Verification Failed"}
                  </button>
                </div>
              </div>

              {/* Recruiter Notes Section */}
              <label className="modal-label">Recruiter Private Notes</label>
              <div style={{ display: "flex", flexDirection: "column", gap: ".75rem", marginBottom: "1rem" }}>
                {(!activeApplicant.notes || activeApplicant.notes.length === 0) ? (
                  <div style={{ fontSize: ".85rem", color: "#6b7280", fontStyle: "italic" }}>No internal notes yet.</div>
                ) : (
                  activeApplicant.notes.map(note => (
                    <div key={note.id} style={{ background: "#1a1a1a", border: "1px solid #333", padding: ".85rem", borderRadius: "9px" }}>
                      <div style={{ fontSize: ".85rem", color: "#f0ede8", lineHeight: 1.5 }}>{note.note}</div>
                      <div style={{ fontSize: ".65rem", color: "#6b7280", marginTop: "6px", textAlign: "right" }}>
                        {new Date(note.createdAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Add New Note Input */}
            <div style={{ borderTop: "1px solid #2a2a2a", paddingTop: "1rem", flexShrink: 0 }}>
              <textarea
                className="modal-textarea modal-input"
                style={{ minHeight: "70px", marginBottom: ".75rem" }}
                placeholder="Type a private note about this candidate..."
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
              />
              <div className="modal-actions">
                <button className="btn-cancel" onClick={() => setNoteModalOpen(false)}>Close</button>
                <button className="btn-submit" onClick={addNote} disabled={addingNote || !newNote.trim()}>
                  {addingNote ? "Saving…" : "Save Note"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {otpModalOpen && (
        <div className="modal-overlay" style={{ zIndex: 300 }} onClick={() => setOtpModalOpen(false)}>
          <div onClick={(e) => e.stopPropagation()}>
            <VirtualKeyboard
              onComplete={executeDownload}
              onCancel={() => setOtpModalOpen(false)}
            />
          </div>
        </div>
      )}

      {/* ── Toast ── */}
      {toast && (
        <div className={`co-toast ${toast.type}`}>
          {toast.type === "ok" ? "✓" : "⚠"} {toast.msg}
        </div>
      )}
    </>
  );
}