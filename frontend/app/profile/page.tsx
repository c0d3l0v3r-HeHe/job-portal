"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import UploadResume from "@/components/UploadResume";
import API from "@/lib/api";

type Resume = {
  id: string;
  originalName: string;
  createdAt: string;
};

export default function Profile() {
  const [user, setUser] = useState<any>(null);
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  // Load User Data
  useEffect(() => {
    const storedUser = localStorage.getItem("user");
    if (!storedUser || storedUser === "undefined") {
      router.push("/login");
      return;
    }
    setUser(JSON.parse(storedUser));
  }, [router]);

  // Fetch Resumes
  const fetchResumes = async () => {
    try {
      setLoading(true);
      const { data } = await API.get("/resumes");
      setResumes(data);
    } catch (err) {
      console.error("Failed to load resumes", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) fetchResumes();
  }, [user]);

  // Handle Delete
  const handleDeleteResume = async (resumeId: string) => {
    if (!confirm("Are you sure you want to delete this resume?")) return;

    try {
      await API.delete(`/resume/${resumeId}`);
      // Remove it from the UI immediately
      setResumes((prev) => prev.filter((r) => r.id !== resumeId));
    } catch (err) {
      alert("Failed to delete resume");
      console.error(err);
    }
  };

  if (!user) return null;

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      {/* 🔙 BACK BUTTON */}
      <button
        onClick={() => router.push("/dashboard")}
        className="mb-6 text-sm text-blue-600 hover:underline font-medium"
      >
        ← Back to Dashboard
      </button>

      <div className="max-w-3xl mx-auto space-y-6">
        {/* ================= PROFILE HEADER ================= */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-gradient-to-r from-blue-500 to-indigo-500 text-white flex items-center justify-center text-xl font-bold shadow-sm">
            {user.name?.[0]?.toUpperCase()}
          </div>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-gray-800">{user.name}</h1>
            <p className="text-gray-500 text-sm">{user.email}</p>
            <span className="inline-block mt-2 text-xs font-semibold bg-gray-100 text-gray-600 px-2.5 py-1 rounded-md">
              {user.role}
            </span>
          </div>
        </div>

        {/* ================= RESUME SECTION ================= */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 space-y-6">
          <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
            📄 My Resumes
          </h2>

          {/* Upload Component (Pass fetchResumes so it updates the list after upload) */}
          <UploadResume onUploadSuccess={fetchResumes} />

          <hr className="border-gray-100" />

          {/* Resumes List */}
          <div>
            <h3 className="text-sm font-semibold text-gray-600 mb-3 uppercase tracking-wider">
              Uploaded Files
            </h3>
            
            {loading ? (
              <p className="text-sm text-gray-500">Loading your resumes...</p>
            ) : resumes.length === 0 ? (
              <div className="bg-gray-50 rounded-lg p-6 text-center border border-dashed border-gray-200">
                <p className="text-sm text-gray-500">No resumes uploaded yet.</p>
              </div>
            ) : (
              <ul className="space-y-3">
                {resumes.map((resume) => (
                  <li 
                    key={resume.id} 
                    className="flex items-center justify-between p-3.5 bg-white border border-gray-200 rounded-lg hover:border-gray-300 transition"
                  >
                    <div className="flex items-center gap-3 overflow-hidden">
                      <span className="text-xl">📋</span>
                      <div className="flex flex-col truncate">
                        <span className="text-sm font-medium text-gray-800 truncate">
                          {resume.originalName}
                        </span>
                        <span className="text-xs text-gray-500">
                          Uploaded {new Date(resume.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                        </span>
                      </div>
                    </div>
                    
                    <button
                      onClick={() => handleDeleteResume(resume.id)}
                      className="ml-4 text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded-md transition shrink-0"
                    >
                      Delete
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* ================= ACTIONS ================= */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 space-y-4">
          {user.role === "ADMIN" && (
            <button
              onClick={() => router.push("/admin")}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2.5 rounded-lg transition shadow-sm"
            >
              👑 Open Admin Dashboard
            </button>
          )}

          <button
            onClick={() => {
              localStorage.clear();
              router.push("/login");
            }}
            className="w-full bg-red-50 hover:bg-red-50 text-red-600 font-semibold py-2.5 border border-red-100 rounded-lg transition"
          >
            Sign Out
          </button>
        </div>
      </div>
    </div>
  );
}