"use client";
import { useState } from "react";
import API from "@/lib/api";
import { useRouter } from "next/navigation";

export default function Login() {
  const [form, setForm] = useState({ email: "", password: "" });
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const { data } = await API.post("/auth/login", form);

      // 🔐 If 2FA required
      if (data.requires2FA) {
        // store temporary userId for second step
        sessionStorage.setItem("2fa_user", data.userId);
        router.push("/verify-otp");
        return;
      }

      // Normal login
      localStorage.setItem("token", data.token);
      if (data.user) {
        localStorage.setItem("user", JSON.stringify(data.user));
      } else {
        console.error("User missing in response", data);
      }

      if (data.user.role === "COMPANY") {
        router.push("/company");
      } else if (data.user.role === "ADMIN") {
        router.push("/admin");
      } else {
        router.push("/dashboard");
      }

    } catch (err: any) {
      alert(err.response?.data?.error || "Invalid Credentials");
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50">
      <form onSubmit={handleLogin} className="p-8 bg-white shadow-lg rounded-xl w-96 border border-gray-200">
        <h1 className="text-3xl font-extrabold mb-6 text-center text-blue-600">Welcome Back</h1>
        <div className="space-y-4">
          <input
            type="email"
            placeholder="Email Address"
            className="w-full p-3 border border-gray-300 rounded-md text-black focus:outline-none focus:ring-2 focus:ring-blue-500"
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            required
          />
          <input
            type="password"
            placeholder="Password"
            className="w-full p-3 border border-gray-300 rounded-md text-black focus:outline-none focus:ring-2 focus:ring-blue-500"
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            required
          />
          <button className="w-full bg-blue-600 text-white font-semibold py-3 rounded-md hover:bg-blue-700 transition duration-200">
            Sign In
          </button>
        </div>
        <p className="mt-4 text-sm text-center text-gray-600">
          Don't have an account? <a href="/register" className="text-blue-500 hover:underline">Register</a>
        </p>
      </form>
    </div>
  );
}