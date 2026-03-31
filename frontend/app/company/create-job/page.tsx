"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import API from "@/lib/api";

export default function CreateJob() {
  const router = useRouter();

  const [form, setForm] = useState({
    title: "",
    description: "",
  });

  const [loading, setLoading] = useState(false);

  // 🔒 AUTH CHECK
  useEffect(() => {
    const token = localStorage.getItem("token");
    const company = localStorage.getItem("company");

    if (!token || !company) {
      router.push("/company-login");
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!form.title || !form.description) {
      alert("All fields are required");
      return;
    }

    try {
      setLoading(true);

      const token = localStorage.getItem("token");

      await API.post(
        "/job",
        form,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      alert("Job created successfully 🚀");

      router.push("/company");

    } catch (err: any) {
      console.log(err);
      alert(err.response?.data?.error || "Failed to create job");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center px-6">

      <form
        onSubmit={handleSubmit}
        className="bg-white p-8 rounded-2xl shadow-lg w-full max-w-xl space-y-6 border border-gray-200"
      >
        {/* TITLE */}
        <h1 className="text-2xl font-bold text-gray-900 text-center">
          Create Job Posting 💼
        </h1>

        {/* INPUTS */}
        <div className="space-y-4">

          <input
            type="text"
            placeholder="Job Title (e.g. Frontend Developer)"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            className="w-full p-3 border border-gray-400 rounded-md text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            required
          />

          <textarea
            placeholder="Job Description (responsibilities, requirements...)"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            rows={6}
            className="w-full p-3 border border-gray-400 rounded-md text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            required
          />
        </div>

        {/* ACTIONS */}
        <div className="flex gap-4">

          <button
            type="submit"
            disabled={loading}
            className="flex-1 bg-gradient-to-r from-indigo-600 to-purple-600 text-white py-3 rounded-md font-semibold hover:opacity-90 transition disabled:opacity-50"
          >
            {loading ? "Creating..." : "Create Job"}
          </button>

          <button
            type="button"
            onClick={() => router.push("/company")}
            className="flex-1 border border-gray-400 text-gray-800 py-3 rounded-md hover:bg-gray-100 transition"
          >
            Cancel
          </button>

        </div>
      </form>
    </div>
  );
}