"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import API from "@/lib/api";
import { generateKeyPair, signData } from "@/lib/pki";

type Job = {
  id: string;
  title: string;
  description?: string;
  companyId?: string;
  company?: { id: string; name: string; email?: string };
  createdAt?: string;
};

type Application = {
  id: string;
  jobId: string;
  status: "APPLIED" | "REVIEWING" | "SHORTLISTED" | "ACCEPTED" | "REJECTED";
  createdAt?: string;
  job?: Job;
};

type Message = {
  id: string;
  senderId?: string | null;
  companyId?: string | null;
  encryptedText: string;
  createdAt: string;
};

const STATUS_META: Record<Application["status"], { label: string; color: string; bg: string; dot: string }> = {
  APPLIED:     { label: "Applied",     color: "#92400e", bg: "#fef3c7", dot: "#f59e0b" },
  REVIEWING:   { label: "Reviewing",   color: "#1e40af", bg: "#dbeafe", dot: "#3b82f6" },
  SHORTLISTED: { label: "Shortlisted", color: "#5b21b6", bg: "#ede9fe", dot: "#8b5cf6" },
  ACCEPTED:    { label: "Accepted",    color: "#065f46", bg: "#d1fae5", dot: "#10b981" },
  REJECTED:    { label: "Rejected",    color: "#7f1d1d", bg: "#fee2e2", dot: "#ef4444" },
};

export default function Dashboard() {
  const [user, setUser]               = useState<any>(null);
  const [jobs, setJobs]               = useState<Job[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [search, setSearch]           = useState("");
  const [activeTab, setActiveTab]     = useState<"jobs" | "applications">("jobs");
  
  // Application Form State
  const [applyModalOpen, setApplyModalOpen] = useState(false);
  const [selectedJob, setSelectedJob]       = useState<Job | null>(null);
  const [coverNote, setCoverNote]           = useState("");
  const [resumeFile, setResumeFile]         = useState<File | null>(null);
  const [applying, setApplying]             = useState(false);
  
  const [unapplying, setUnapplying]   = useState<string | null>(null);
  const [loadingJobs, setLoadingJobs] = useState(true);
  const [toast, setToast]             = useState<{ msg: string; type: "ok" | "err" } | null>(null);
  const router = useRouter();

  // Chat State
  const [chatOpen, setChatOpen]       = useState(false);
  const [chatApp, setChatApp]         = useState<Application | null>(null);
  const [convoId, setConvoId]         = useState<string | null>(null);
  const [messages, setMessages]       = useState<Message[]>([]);
  const [msgText, setMsgText]         = useState("");
  const [sending, setSending]         = useState(false);
  const messagesEndRef                = useRef<HTMLDivElement>(null);

  // ── auth ──────────────────────────────────────────────────────────
  useEffect(() => {
    const stored = localStorage.getItem("user");
    if (!stored || stored === "undefined") { router.push("/login"); return; }
    setUser(JSON.parse(stored));
  }, [router]);

  // ── fetch jobs ────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const { data } = await API.get("/jobs");
        setJobs(data);
      } catch { showToast("Failed to load jobs", "err"); }
      finally { setLoadingJobs(false); }
    })();
  }, []);

  // PKI Key Generation
  useEffect(() => {
    const setupPKI = async () => {
      // Check if we already generated keys for this session
      if (!localStorage.getItem("pki_private_key")) {
        const { publicKeyJwk, privateKeyJwk } = await generateKeyPair();
        
        // Save private key locally (NEVER send to server)
        localStorage.setItem("pki_private_key", JSON.stringify(privateKeyJwk));
        
        // Send public key to the server
        await API.post("/pki/register", { publicKey: publicKeyJwk });
      }
    };
    if (user) setupPKI();
  }, [user]);

  // ── fetch applications ────────────────────────────────────────────
  const fetchApplications = async () => {
    try {
      const { data } = await API.get("/applications");
      setApplications(data);
    } catch { showToast("Failed to load applications", "err"); }
  };

  useEffect(() => { fetchApplications(); }, []);

  // ── helpers ───────────────────────────────────────────────────────
  const showToast = (msg: string, type: "ok" | "err") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const appliedJobIds = useMemo(() => new Set(applications.map((a) => a.jobId)), [applications]);

  const filteredJobs = useMemo(() =>
    jobs.filter((j) =>
      j.title.toLowerCase().includes(search.toLowerCase()) ||
      j.company?.name?.toLowerCase().includes(search.toLowerCase()) ||
      j.description?.toLowerCase().includes(search.toLowerCase())
    ), [jobs, search]);

  // ── Apply Form Logic ──────────────────────────────────────────────
  const openApplyModal = (job: Job) => {
    setSelectedJob(job);
    setCoverNote("");
    setResumeFile(null);
    setApplyModalOpen(true);
  };

  const closeApplyModal = () => {
    setApplyModalOpen(false);
    setSelectedJob(null);
    setCoverNote("");
    setResumeFile(null);
  };

  const submitApplication = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedJob) return;

    setApplying(true);

    try {
      const formData = new FormData();
      formData.append("jobId", selectedJob.id);
      
      // Force it to be a string even if empty
      const safeCoverNote = coverNote || "";
      formData.append("coverNote", safeCoverNote);
      
      if (resumeFile) formData.append("resume", resumeFile);

      // --- PKI SIGNING LOGIC ---
      const privateKeyStr = localStorage.getItem("pki_private_key");
      if (privateKeyStr) {
        const privateKey = JSON.parse(privateKeyStr);
        
        // Exact string construction
        const dataToSign = `${selectedJob.id}:${safeCoverNote}`;
        console.log("-----------------------------------------");
        console.log("[USER FRONTEND] Constructing signature...");
        console.log(`[USER FRONTEND] EXACT Data being signed: "${dataToSign}"`);
        
        const signature = await signData(privateKey, dataToSign);
        formData.append("signature", signature);
        console.log(`[USER FRONTEND] Signature generated (Length: ${signature.length})`);
        console.log("-----------------------------------------");
      } else {
        console.warn("[USER FRONTEND] WARNING: No private key found in localStorage. Applying without signature.");
      }
      // ------------------------------

      await API.post("/apply", formData, { headers: { "Content-Type": "multipart/form-data" } });
      
      showToast("Signed application submitted successfully!", "ok");
      await fetchApplications();
      closeApplyModal();
    } catch (err: any) {
      showToast(err.response?.data?.error || "Failed to submit", "err");
    } finally {
      setApplying(false);
    }
  };

  const handleUnapply = async (applicationId: string) => {
    setUnapplying(applicationId);
    try {
      await API.delete(`/application/${applicationId}`);
      setApplications((prev) => prev.filter((a) => a.id !== applicationId));
      showToast("Application withdrawn", "ok");
    } catch {
      showToast("Failed to withdraw application", "err");
    } finally { setUnapplying(null); }
  };

  // ── Chat Functions ─────────────────────────────────────────────────
  const openChat = async (app: Application) => {
    const targetCompanyId = app.job?.companyId || app.job?.company?.id;
    if (!targetCompanyId) {
      showToast("Company ID not found", "err");
      return;
    }
    setChatApp(app);
    setChatOpen(true);
    setMessages([]);
    setConvoId(null);

    try {
      const { data } = await API.post("/conversation", { userIds: [targetCompanyId] });
      setConvoId(data.id);
      const msgs = await API.get(`/messages/${data.id}`);
      setMessages(msgs.data);
    } catch { 
      showToast("Could not open conversation", "err"); 
    }
  };

  const sendMessage = async () => {
    if (!msgText.trim() || !convoId) return;
    setSending(true);
    try {
      const { data } = await API.post("/message", {
        conversationId: convoId,
        encryptedText: msgText,
        iv: "plain",
        encryptedKey: "plain",
      });
      setMessages((prev) => [...prev, data]);
      setMsgText("");
    } catch { 
      showToast("Failed to send message", "err"); 
    } finally { 
      setSending(false); 
    }
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  if (!user) return null;

  const stats = {
    total:       applications.length,
    applied:     applications.filter((a) => a.status === "APPLIED").length,
    shortlisted: applications.filter((a) => a.status === "SHORTLISTED").length,
    accepted:    applications.filter((a) => a.status === "ACCEPTED").length,
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Sans:wght@300;400;500;600&display=swap');

        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #f8f7f4; }
        .dash-root { min-height: 100vh; font-family: 'DM Sans', sans-serif; background: #f8f7f4; color: #1a1a1a; }

        /* Navbar & Global styles */
        .navbar { position: sticky; top: 0; z-index: 50; display: flex; align-items: center; justify-content: space-between; padding: 0 2rem; height: 64px; background: #fff; border-bottom: 1.5px solid #ece9e3; }
        .navbar-brand { font-family: 'Syne', sans-serif; font-size: 1.2rem; font-weight: 800; letter-spacing: -0.03em; color: #1a1a1a; }
        .navbar-brand span { color: #e85d26; }
        .navbar-right { display: flex; align-items: center; gap: 1rem; }
        .navbar-greeting { font-size: 0.85rem; color: #6b7280; }
        .avatar { width: 38px; height: 38px; border-radius: 50%; background: linear-gradient(135deg, #e85d26, #f59e0b); color: #fff; font-family: 'Syne', sans-serif; font-weight: 700; font-size: 1rem; display: flex; align-items: center; justify-content: center; cursor: pointer; border: 2px solid #fff; box-shadow: 0 2px 8px rgba(232,93,38,.3); transition: transform .15s; }
        .avatar:hover { transform: scale(1.07); }

        .dash-body { max-width: 1100px; margin: 0 auto; padding: 2rem 1.5rem 4rem; }
        .stats-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1rem; margin-bottom: 2rem; }
        @media (max-width: 700px) { .stats-grid { grid-template-columns: repeat(2,1fr); } }
        .stat-card { background: #fff; border: 1.5px solid #ece9e3; border-radius: 14px; padding: 1.1rem 1.3rem; }
        .stat-label { font-size: 0.72rem; font-weight: 600; letter-spacing: .08em; text-transform: uppercase; color: #9ca3af; margin-bottom: .4rem; }
        .stat-value { font-family: 'Syne', sans-serif; font-size: 2rem; font-weight: 800; line-height: 1; color: #1a1a1a; font-variant-numeric: tabular-nums; }
        .stat-card.accent { background: #e85d26; border-color: #e85d26; }
        .stat-card.accent .stat-label, .stat-card.accent .stat-value { color: #fff; }

        .search-wrap { position: relative; margin-bottom: 1.5rem; }
        .search-icon { position: absolute; left: 14px; top: 50%; transform: translateY(-50%); color: #9ca3af; }
        .search-input { width: 100%; padding: .75rem 1rem .75rem 2.6rem; border: 1.5px solid #ece9e3; border-radius: 10px; font-family: 'DM Sans', sans-serif; font-size: .9rem; background: #fff; outline: none; transition: border-color .15s, box-shadow .15s; color: #1a1a1a; }
        .search-input:focus { border-color: #e85d26; box-shadow: 0 0 0 3px rgba(232,93,38,.1); }
        
        .tabs { display: flex; gap: .5rem; margin-bottom: 1.5rem; border-bottom: 1.5px solid #ece9e3; padding-bottom: 0; }
        .tab-btn { padding: .6rem 1.2rem; font-family: 'DM Sans', sans-serif; font-size: .875rem; font-weight: 500; border: none; background: none; cursor: pointer; color: #6b7280; border-bottom: 2.5px solid transparent; margin-bottom: -1.5px; transition: color .15s, border-color .15s; border-radius: 6px 6px 0 0; display: flex; align-items: center; gap: .4rem; }
        .tab-btn.active { color: #e85d26; border-bottom-color: #e85d26; font-weight: 600; }
        .tab-badge { background: #f3f4f6; color: #6b7280; font-size: .7rem; font-weight: 700; padding: 1px 7px; border-radius: 99px; }
        .tab-btn.active .tab-badge { background: #fde8de; color: #e85d26; }

        .jobs-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(310px, 1fr)); gap: 1rem; }
        .job-card { background: #fff; border: 1.5px solid #ece9e3; border-radius: 16px; padding: 1.4rem; display: flex; flex-direction: column; gap: .8rem; transition: box-shadow .2s, transform .2s, border-color .2s; }
        .job-card:hover { box-shadow: 0 8px 28px rgba(0,0,0,.07); transform: translateY(-2px); border-color: #d1cfc8; }
        .job-card-header { display: flex; justify-content: space-between; align-items: flex-start; }
        .company-logo { width: 40px; height: 40px; border-radius: 10px; background: linear-gradient(135deg, #fde8de, #fef3c7); display: flex; align-items: center; justify-content: center; font-family: 'Syne', sans-serif; font-weight: 800; font-size: .9rem; color: #e85d26; flex-shrink: 0; }
        .applied-chip { font-size: .7rem; font-weight: 600; background: #d1fae5; color: #065f46; padding: 3px 10px; border-radius: 99px; }
        .job-title { font-family: 'Syne', sans-serif; font-size: 1rem; font-weight: 700; line-height: 1.3; color: #1a1a1a; }
        .job-company { font-size: .82rem; color: #6b7280; font-weight: 500; }
        .job-desc { font-size: .82rem; color: #6b7280; line-height: 1.55; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
        .job-card-footer { display: flex; align-items: center; justify-content: space-between; margin-top: auto; }
        .job-date { font-size: .74rem; color: #9ca3af; }

        .btn-apply { padding: .45rem 1.1rem; font-family: 'DM Sans', sans-serif; font-size: .84rem; font-weight: 600; background: #1a1a1a; color: #fff; border: none; border-radius: 8px; cursor: pointer; transition: background .15s, transform .1s; display: flex; align-items: center; gap: .35rem; }
        .btn-apply:hover:not(:disabled) { background: #e85d26; }
        .btn-apply:active { transform: scale(.97); }
        .btn-apply:disabled { opacity: .55; cursor: not-allowed; }
        .btn-apply.applied { background: #f3f4f6; color: #6b7280; cursor: default; }

        .btn-secondary { padding: .45rem 1rem; font-family: 'DM Sans', sans-serif; font-size: .8rem; font-weight: 600; background: #f3f4f6; color: #1a1a1a; border: 1.5px solid #ece9e3; border-radius: 8px; cursor: pointer; transition: background .15s, border-color .15s; display: flex; align-items: center; gap: .3rem; }
        .btn-secondary:hover { background: #e5e7eb; border-color: #d1d5db; }

        .app-list { display: flex; flex-direction: column; gap: .75rem; }
        .app-card { background: #fff; border: 1.5px solid #ece9e3; border-radius: 14px; padding: 1.1rem 1.4rem; display: flex; align-items: center; gap: 1.2rem; transition: box-shadow .15s; }
        .app-card:hover { box-shadow: 0 4px 16px rgba(0,0,0,.06); }
        .app-status-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
        .app-info { flex: 1; min-width: 0; }
        .app-title { font-family: 'Syne', sans-serif; font-size: .95rem; font-weight: 700; color: #1a1a1a; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .app-company { font-size: .8rem; color: #6b7280; margin-top: 2px; }
        .app-right { display: flex; flex-direction: column; align-items: flex-end; gap: .6rem; }
        .app-actions { display: flex; gap: .5rem; align-items: center; }
        .status-badge { font-size: .72rem; font-weight: 700; padding: 3px 10px; border-radius: 99px; white-space: nowrap; letter-spacing: .04em; }
        .btn-unapply { font-family: 'DM Sans', sans-serif; font-size: .75rem; font-weight: 600; background: transparent; color: #9ca3af; border: none; cursor: pointer; transition: color .15s; }
        .btn-unapply:hover:not(:disabled) { color: #dc2626; text-decoration: underline; }

        /* Chat Overlay */
        .chat-overlay { position: fixed; inset: 0; z-index: 100; background: rgba(0,0,0,.4); backdrop-filter: blur(2px); display: flex; align-items: flex-end; justify-content: flex-end; }
        .chat-drawer { width: 380px; height: 520px; background: #fff; border: 1.5px solid #ece9e3; border-radius: 16px 16px 0 0; margin: 0 1.5rem; display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 -8px 40px rgba(0,0,0,.15); }
        .chat-header { display: flex; align-items: center; justify-content: space-between; padding: 1rem 1.2rem; background: #faf9f7; border-bottom: 1.5px solid #ece9e3; flex-shrink: 0; }
        .chat-name { font-family: 'Syne', sans-serif; font-weight: 700; font-size: .95rem; color: #1a1a1a; }
        .chat-sub { font-size: .75rem; color: #6b7280; margin-top: 2px; }
        .chat-close { width: 28px; height: 28px; border-radius: 7px; background: #f3f4f6; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; color: #4b5563; font-size: 1rem; transition: background .15s; }
        .chat-close:hover { background: #e5e7eb; color: #1a1a1a; }
        .chat-messages { flex: 1; overflow-y: auto; padding: 1rem; display: flex; flex-direction: column; gap: .6rem; background: #fff; }
        .msg-bubble { max-width: 80%; padding: .55rem .85rem; border-radius: 12px; font-size: .85rem; line-height: 1.5; }
        .msg-bubble.sent { align-self: flex-end; background: #e85d26; color: #fff; border-bottom-right-radius: 4px; }
        .msg-bubble.received { align-self: flex-start; background: #f3f4f6; color: #1a1a1a; border-bottom-left-radius: 4px; }
        .msg-time { font-size: .65rem; opacity: .7; margin-top: 3px; display: block; text-align: right; }
        .chat-empty { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; color: #9ca3af; font-size: .85rem; gap: .4rem; }
        .chat-input-row { display: flex; gap: .6rem; padding: .85rem 1rem; border-top: 1.5px solid #ece9e3; background: #faf9f7; flex-shrink: 0; }
        .chat-input { flex: 1; background: #fff; border: 1.5px solid #ece9e3; color: #1a1a1a; border-radius: 9px; font-family: 'DM Sans', sans-serif; font-size: .875rem; padding: .55rem .9rem; outline: none; transition: border-color .15s; }
        .chat-input:focus { border-color: #e85d26; }
        .chat-send { width: 38px; height: 38px; border-radius: 9px; background: #1a1a1a; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; color: #fff; transition: background .15s; flex-shrink: 0; }
        .chat-send:hover:not(:disabled) { background: #e85d26; }
        
        /* Apply Modal Styles */
        .modal-overlay { position: fixed; inset: 0; z-index: 200; background: rgba(0,0,0,.5); display: flex; align-items: center; justify-content: center; padding: 1rem; backdrop-filter: blur(3px); }
        .modal-content { background: #fff; width: 100%; max-width: 500px; border-radius: 16px; box-shadow: 0 10px 40px rgba(0,0,0,.15); overflow: hidden; display: flex; flex-direction: column; }
        .modal-header { padding: 1.2rem 1.5rem; border-bottom: 1.5px solid #ece9e3; display: flex; justify-content: space-between; align-items: center; }
        .modal-title { font-family: 'Syne', sans-serif; font-size: 1.1rem; font-weight: 700; color: #1a1a1a; }
        .modal-body { padding: 1.5rem; display: flex; flex-direction: column; gap: 1.2rem; }
        .form-group { display: flex; flex-direction: column; gap: .5rem; }
        .form-label { font-size: .85rem; font-weight: 600; color: #4b5563; }
        .form-help { font-size: .75rem; color: #6b7280; margin-top: -3px; margin-bottom: 4px; }
        .form-textarea { width: 100%; min-height: 100px; padding: .8rem; border: 1.5px solid #ece9e3; border-radius: 8px; font-family: 'DM Sans', sans-serif; font-size: .9rem; resize: vertical; outline: none; transition: border-color .15s; }
        .form-textarea:focus { border-color: #e85d26; }
        .form-file { width: 100%; padding: .5rem; border: 1.5px dashed #d1cfc8; border-radius: 8px; font-size: .85rem; color: #6b7280; background: #faf9f7; cursor: pointer; }
        .modal-footer { padding: 1.2rem 1.5rem; border-top: 1.5px solid #ece9e3; background: #faf9f7; display: flex; justify-content: flex-end; gap: .8rem; }
        
        .empty { text-align: center; padding: 4rem 2rem; color: #9ca3af; }
        .empty-icon { font-size: 2.5rem; margin-bottom: .75rem; }
        .empty-title { font-family: 'Syne', sans-serif; font-size: 1.1rem; font-weight: 700; color: #6b7280; }
        .toast { position: fixed; bottom: 1.5rem; right: 1.5rem; z-index: 999; padding: .75rem 1.2rem; border-radius: 10px; font-size: .875rem; font-weight: 500; box-shadow: 0 8px 24px rgba(0,0,0,.15); animation: slideUp .25s ease; display: flex; align-items: center; gap: .5rem; }
        .toast.ok { background: #1a1a1a; color: #fff; }
        .toast.err { background: #fef2f2; color: #991b1b; border: 1px solid #fecaca; }
        @keyframes slideUp { from { opacity:0; transform: translateY(12px); } to { opacity:1; transform: translateY(0); } }
      `}</style>

      <div className="dash-root">
        {/* Navbar */}
        <nav className="navbar">
          <span className="navbar-brand">work<span>.</span>flow</span>
          <div className="navbar-right">
            <span className="navbar-greeting">Hi, {user.name?.split(" ")[0]} 👋</span>
            <div className="avatar" onClick={() => router.push("/profile")} title="Profile">
              {user.name?.[0]?.toUpperCase()}
            </div>
          </div>
        </nav>

        <div className="dash-body">
          {/* Stats Grid */}
          <div className="stats-grid">
            <div className="stat-card accent">
              <div className="stat-label">Total Applied</div>
              <div className="stat-value">{stats.total}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Applied</div>
              <div className="stat-value">{stats.applied}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Shortlisted</div>
              <div className="stat-value">{stats.shortlisted}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Accepted</div>
              <div className="stat-value">{stats.accepted}</div>
            </div>
          </div>

          {/* Tabs */}
          <div className="tabs">
            <button className={`tab-btn ${activeTab === "jobs" ? "active" : ""}`} onClick={() => setActiveTab("jobs")}>
              💼 Job Board <span className="tab-badge">{filteredJobs.length}</span>
            </button>
            <button className={`tab-btn ${activeTab === "applications" ? "active" : ""}`} onClick={() => setActiveTab("applications")}>
              📋 My Applications <span className="tab-badge">{applications.length}</span>
            </button>
          </div>

          {/* Jobs Tab */}
          {activeTab === "jobs" && (
            <>
              <div className="search-wrap">
                <span className="search-icon">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                </span>
                <input className="search-input" placeholder="Search by role, company, or keyword…" value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>

              {loadingJobs ? (
                 <div className="empty">Loading jobs...</div>
              ) : filteredJobs.length === 0 ? (
                <div className="empty">
                  <div className="empty-icon">🔍</div>
                  <div className="empty-title">No jobs found</div>
                </div>
              ) : (
                <div className="jobs-grid">
                  {filteredJobs.map((job) => {
                    const isApplied = appliedJobIds.has(job.id);
                    const initials = job.company?.name?.slice(0, 2).toUpperCase() ?? "JB";
                    return (
                      <div className="job-card" key={job.id}>
                        <div className="job-card-header">
                          <div className="company-logo">{initials}</div>
                          {isApplied && <span className="applied-chip">✓ Applied</span>}
                        </div>
                        <div>
                          <div className="job-title">{job.title}</div>
                          <div className="job-company">{job.company?.name ?? "Company"}</div>
                        </div>
                        {job.description && <div className="job-desc">{job.description}</div>}
                        <div className="job-card-footer">
                          <span className="job-date">{job.createdAt ? new Date(job.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : ""}</span>
                          <button
                            className={`btn-apply ${isApplied ? "applied" : ""}`}
                            onClick={() => !isApplied && openApplyModal(job)}
                            disabled={isApplied}
                          >
                            {isApplied ? "Applied" : "Apply Now →"}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {/* Applications Tab */}
          {activeTab === "applications" && (
            <>
              {applications.length === 0 ? (
                <div className="empty">
                  <div className="empty-icon">📭</div>
                  <div className="empty-title">No applications yet</div>
                </div>
              ) : (
                <div className="app-list">
                  {applications.map((app) => {
                    const meta = STATUS_META[app.status] ?? STATUS_META.PENDING;
                    return (
                      <div className="app-card" key={app.id}>
                        <div className="app-status-dot" style={{ background: meta.dot }} />
                        <div className="app-info">
                          <div className="app-title">{app.job?.title ?? "Job"}</div>
                          <div className="app-company">{app.job?.company?.name ?? "Company"}</div>
                        </div>
                        
                        <div className="app-right">
                           <span className="status-badge" style={{ background: meta.bg, color: meta.color }}>
                            {meta.label}
                          </span>
                          
                          <div className="app-actions">
                            <button className="btn-secondary" onClick={() => openChat(app)}>
                              💬 Message
                            </button>
                            <button className="btn-unapply" onClick={() => handleUnapply(app.id)} disabled={unapplying === app.id}>
                              {unapplying === app.id ? "Withdrawing…" : "Withdraw"}
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── Apply Modal ── */}
      {applyModalOpen && selectedJob && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) closeApplyModal(); }}>
          <form className="modal-content" onSubmit={submitApplication}>
            <div className="modal-header">
              <div className="modal-title">Apply to {selectedJob.company?.name || "Company"}</div>
              <button type="button" className="chat-close" onClick={closeApplyModal}>✕</button>
            </div>
            
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Role</label>
                <div style={{ fontSize: '0.95rem', fontWeight: 600 }}>{selectedJob.title}</div>
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="resumeUpload">Upload Resume (Optional)</label>
                <div className="form-help">
                  Select a file to update your profile resume for this application. If you leave this blank, your previously saved resume will be used.
                </div>
                <input 
                  type="file" 
                  id="resumeUpload"
                  className="form-file"
                  accept=".pdf,.doc,.docx"
                  onChange={(e) => setResumeFile(e.target.files?.[0] || null)}
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="coverNote">Cover Note</label>
                <div className="form-help">Briefly explain why you are a good fit for this role.</div>
                <textarea 
                  id="coverNote"
                  className="form-textarea" 
                  placeholder="I am excited to apply for..."
                  value={coverNote}
                  onChange={(e) => setCoverNote(e.target.value)}
                  required
                />
              </div>
            </div>
            
            <div className="modal-footer">
              <button type="button" className="btn-secondary" onClick={closeApplyModal} disabled={applying}>
                Cancel
              </button>
              <button type="submit" className="btn-apply" disabled={applying || !coverNote.trim()}>
                {applying ? "Submitting..." : "Submit Application"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ── Chat Drawer ── */}
      {chatOpen && chatApp && (
        <div className="chat-overlay" onClick={(e) => { if (e.target === e.currentTarget) setChatOpen(false); }}>
          <div className="chat-drawer">
            <div className="chat-header">
              <div>
                <div className="chat-name">{chatApp.job?.company?.name ?? "Company"}</div>
                <div className="chat-sub">{chatApp.job?.title} · {STATUS_META[chatApp.status]?.label}</div>
              </div>
              <button className="chat-close" onClick={() => setChatOpen(false)}>✕</button>
            </div>

            <div className="chat-messages">
              {messages.length === 0 ? (
                <div className="chat-empty">
                  <span style={{ fontSize: "1.5rem" }}>💬</span>
                  <span>Say hello to the hiring team!</span>
                </div>
              ) : (
                messages.map((msg) => {
                  const isSent = msg.senderId === user.id;
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
                  <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className={`toast ${toast.type}`}>
          {toast.type === "ok" ? "✓" : "⚠"} {toast.msg}
        </div>
      )}
    </>
  );
}