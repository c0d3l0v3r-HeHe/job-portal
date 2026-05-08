"use client";

import { useState } from "react";
import API from "@/lib/api";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function CompanyRegisterPage() {
  const router = useRouter();

  const [step, setStep] = useState<"form" | "verify">("form");
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
  });

  const [qrCode, setQrCode] = useState<string | null>(null);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [otp, setOtp] = useState("");
  const [error, setError] = useState("");

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    try {
      const { data } = await API.post("/company/register", formData);
      setQrCode(data.qrCode);
      setCompanyId(data.companyId);
      setStep("verify");
    } catch (err: any) {
      setError(err.response?.data?.error || "Registration failed.");
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    try {
      await API.post("/company/verify-registration-2fa", {
        companyId,
        token: otp,
      });

      alert("Company account activated! Please login.");
      router.push("/company-login");
    } catch (err: any) {
      setError(err.response?.data?.error || "Invalid OTP.");
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-black text-white px-4">
      <div className="w-full max-w-md p-8 bg-zinc-900 rounded-xl border border-zinc-800 shadow-2xl">
        {step === "form" && (
          <>
            <h1 className="text-3xl font-bold text-center mb-6">Register Company</h1>
            {error && <div className="bg-red-500/10 border border-red-500/50 text-red-500 p-3 rounded mb-6 text-sm text-center">{error}</div>}
            <form onSubmit={handleRegister} className="space-y-4">
              <input type="text" required placeholder="Company Name" className="w-full p-3 bg-zinc-800 border border-zinc-700 rounded-lg" onChange={(e) => setFormData({ ...formData, name: e.target.value })} />
              <input type="email" required placeholder="Work Email" className="w-full p-3 bg-zinc-800 border border-zinc-700 rounded-lg" onChange={(e) => setFormData({ ...formData, email: e.target.value })} />
              <input type="password" required placeholder="Password" className="w-full p-3 bg-zinc-800 border border-zinc-700 rounded-lg" onChange={(e) => setFormData({ ...formData, password: e.target.value })} />
              <button className="w-full bg-orange-600 hover:bg-orange-500 py-3 rounded-lg font-bold">Register & Setup 2FA</button>
            </form>
          </>
        )}

        {step === "verify" && (
          <>
            <h1 className="text-2xl font-bold text-center mb-4">Secure Your Account</h1>
            {qrCode && <div className="flex justify-center mb-6"><img src={qrCode} alt="QR Code" className="w-48 h-48 bg-white p-2 rounded" /></div>}
            <p className="text-sm text-center text-zinc-400 mb-4">Scan with Google Authenticator or Authy, then enter the code.</p>
            {error && <div className="bg-red-500/10 border border-red-500/50 text-red-500 p-3 rounded mb-6 text-sm text-center">{error}</div>}
            <form onSubmit={handleVerify} className="space-y-4">
              <input type="text" maxLength={6} required placeholder="Enter 6-digit OTP" className="w-full p-3 bg-zinc-800 border border-zinc-700 rounded-lg text-center tracking-widest" value={otp} onChange={(e) => setOtp(e.target.value)} />
              <button className="w-full bg-green-600 hover:bg-green-500 py-3 rounded-lg font-bold">Activate Company Account</button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}