"use client";

import { useState } from "react";
import API from "@/lib/api";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function CompanyLoginPage() {
  const router = useRouter();

  const [formData, setFormData] = useState({
    email: "",
    password: "",
  });

  // This was missing! It stores and updates the error message.
  const [error, setError] = useState(""); 
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const { data } = await API.post("/company/login", formData);
      
      // If credentials are correct, the backend tells us to go to the 2FA screen
      if (data.requires2FA) {
        sessionStorage.setItem("2fa_company", data.companyId);
        router.push("/company-verify-otp");
      }
    } catch (err: any) {
      // Now this works perfectly!
      setError(err.response?.data?.error || "Login failed. Please check your credentials.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-black text-white px-4">
      <div className="w-full max-w-md p-8 bg-zinc-900 rounded-xl border border-zinc-800 shadow-2xl">
        <h1 className="text-3xl font-bold text-center mb-6 text-orange-500">Company Login</h1>

        {/* Display the error if it exists */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/50 text-red-500 p-3 rounded mb-6 text-sm text-center">
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <input
            type="email"
            required
            placeholder="Work Email"
            className="w-full p-3 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-none focus:border-orange-500"
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
          />

          <input
            type="password"
            required
            placeholder="Password"
            className="w-full p-3 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-none focus:border-orange-500"
            onChange={(e) => setFormData({ ...formData, password: e.target.value })}
          />

          <button 
            type="submit" 
            disabled={loading}
            className="w-full bg-orange-600 hover:bg-orange-500 disabled:opacity-50 py-3 rounded-lg font-bold transition-colors"
          >
            {loading ? "Authenticating..." : "Login"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-zinc-500">
          Don't have a company account?{" "}
          <Link href="/company-register" className="text-orange-400 hover:text-orange-300">
            Register here
          </Link>
        </p>
      </div>
    </div>
  );
}