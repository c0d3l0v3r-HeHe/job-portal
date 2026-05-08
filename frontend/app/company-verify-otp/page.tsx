"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import API from "@/lib/api";

export default function CompanyVerifyOTP() {
  const [otp, setOtp] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const companyId = sessionStorage.getItem("2fa_company");
    if (!companyId) {
      alert("Session expired. Please login again.");
      router.push("/company-login");
      return;
    }

    try {
      const { data } = await API.post("/company/2fa-login", {
        companyId,
        token: otp
      });

      // Save token and company data
      localStorage.setItem("token", data.token);
      localStorage.setItem("company", JSON.stringify(data.company));
      sessionStorage.removeItem("2fa_company");

      router.push("/company"); // Or wherever your company dashboard is

    } catch (err: any) {
      setError(err.response?.data?.error || "Invalid OTP");
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-[#0f0f0f]">
      <form
        onSubmit={handleVerify}
        className="p-8 bg-[#1a1a1a] shadow-2xl rounded-xl w-96 border border-[#2a2a2a]"
      >
        <h1 className="text-2xl font-bold mb-6 text-center text-[#e85d26]">
          Company Authentication
        </h1>
        
        {error && <div className="bg-red-500/10 border border-red-500/50 text-red-500 p-3 rounded mb-6 text-sm text-center">{error}</div>}

        <input
          type="text"
          maxLength={6}
          placeholder="Enter 6-digit code"
          className="w-full p-3 bg-[#252525] border border-[#333] text-white rounded-md focus:outline-none focus:border-[#e85d26] text-center tracking-widest mb-4"
          value={otp}
          onChange={(e) => setOtp(e.target.value)}
          required
        />

        <button className="w-full bg-[#e85d26] text-white font-semibold py-3 rounded-md hover:bg-[#cf4d1d] transition duration-200">
          Verify Login
        </button>
      </form>
    </div>
  );
}