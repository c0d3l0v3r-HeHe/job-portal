"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import UploadResume from "@/components/UploadResume";

export default function Profile() {
  const [user, setUser] = useState<any>(null);
  const router = useRouter();

  useEffect(() => {
    const storedUser = localStorage.getItem("user");

    if (!storedUser || storedUser === "undefined") {
      router.push("/login");
      return;
    }

    setUser(JSON.parse(storedUser));
  }, [router]);

  if (!user) return null;

  return (
    <div className="min-h-screen bg-gray-50 p-6">

      {/* 🔙 BACK BUTTON */}
      <button
        onClick={() => router.push("/dashboard")}
        className="mb-6 text-sm text-blue-600 hover:underline"
      >
        ← Back to Dashboard
      </button>

      <div className="max-w-3xl mx-auto space-y-6">

        {/* ================= PROFILE HEADER ================= */}
        <div className="bg-white p-6 rounded-xl shadow flex items-center gap-4">
          
          {/* Avatar */}
          <div className="w-14 h-14 rounded-full bg-gradient-to-r from-blue-500 to-indigo-500 text-white flex items-center justify-center text-xl font-bold shadow">
            {user.name?.[0]?.toUpperCase()}
          </div>

          {/* Info */}
          <div className="flex-1">
            <h1 className="text-xl font-bold text-gray-800">
              {user.name}
            </h1>
            <p className="text-gray-500 text-sm">{user.email}</p>

            <span className="inline-block mt-2 text-xs font-semibold bg-gray-200 text-gray-700 px-2 py-1 rounded">
              {user.role}
            </span>
          </div>
        </div>

        {/* ================= RESUME SECTION ================= */}
        <div className="bg-white p-6 rounded-xl shadow space-y-4">
          <h2 className="text-lg font-semibold text-gray-800">
            📄 Resume
          </h2>

          <UploadResume />
        </div>

        {/* ================= ACTIONS ================= */}
        <div className="bg-white p-6 rounded-xl shadow space-y-4">
          
          {/* 👑 ADMIN DASHBOARD BUTTON (ONLY VISIBLE TO ADMINS) */}
          {user.role === "ADMIN" && (
            <button
              onClick={() => router.push("/admin")}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2 rounded-md transition shadow-sm"
            >
              👑 Open Admin Dashboard
            </button>
          )}

          <button
            onClick={() => {
              localStorage.clear();
              router.push("/login");
            }}
            className="w-full bg-red-500 hover:bg-red-600 text-white font-medium py-2 rounded-md transition shadow-sm"
          >
            Logout
          </button>

        </div>
      </div>
    </div>
  );
}