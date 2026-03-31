"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import API from "@/lib/api";

export default function RegisterCompany() {
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
  });

  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      await API.post("/company/register", form);

      alert("Registered successfully!");
      router.push("/company-login");

    } catch (err: any) {
        console.log(err)
      alert(err.response?.data?.error || "Failed");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 px-6">

      <form
        onSubmit={handleSubmit}
        className="bg-white p-8 rounded-2xl shadow-lg w-full max-w-md space-y-5 border border-gray-200"
      >
        {/* TITLE */}
        <h1 className="text-2xl font-bold text-gray-900 text-center">
          Register Your Company 🏢
        </h1>

        {/* INPUTS */}
        <div className="space-y-4">

          <input
            type="text"
            placeholder="Company Name"
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="w-full p-3 border border-gray-400 rounded-md text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            required
          />

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
          Register Company
        </button>

        {/* FOOTER */}
        <p className="text-center text-gray-700 text-sm">
          Already have an account?{" "}
          <span
            onClick={() => router.push("/company-login")}
            className="text-indigo-600 font-medium cursor-pointer hover:underline"
          >
            Login
          </span>
        </p>
      </form>
    </div>
  );
}