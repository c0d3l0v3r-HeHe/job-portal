"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import API from "@/lib/api";

export default function CompanyLogin() {
  const [form, setForm] = useState({ email: "", password: "" });
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const { data } = await API.post("/company/login", form);

      localStorage.setItem("token", data.token);
      localStorage.setItem("company", JSON.stringify(data.company));

      router.push("/company");

    } catch (err: any) {
      console.log(err);
      alert(err.response?.data?.error || "Login failed");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 px-6">

      <form
        onSubmit={handleLogin}
        className="bg-white p-8 rounded-2xl shadow-lg w-full max-w-md space-y-5 border border-gray-200"
      >
        {/* TITLE */}
        <h1 className="text-2xl font-bold text-gray-900 text-center">
          Company Login 🔐
        </h1>

        {/* INPUTS */}
        <div className="space-y-4">

          <input
            type="email"
            placeholder="Company Email"
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            className="w-full p-3 border border-gray-400 rounded-md text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            required
          />

          <input
            type="password"
            placeholder="Password"
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            className="w-full p-3 border border-gray-400 rounded-md text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            required
          />
        </div>

        {/* BUTTON */}
        <button
          className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 text-white py-3 rounded-md font-semibold hover:opacity-90 transition"
        >
          Login
        </button>

        {/* FOOTER */}
        <p className="text-center text-gray-700 text-sm">
          Don’t have a company account?{" "}
          <span
            onClick={() => router.push("/register-company")}
            className="text-indigo-600 font-medium cursor-pointer hover:underline"
          >
            Register
          </span>
        </p>
      </form>
    </div>
  );
}