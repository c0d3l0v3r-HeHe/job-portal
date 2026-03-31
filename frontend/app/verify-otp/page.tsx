"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import API from "@/lib/api";

export default function VerifyOTP() {
  const [otp, setOtp] = useState("");
  const router = useRouter();

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();

    const userId = sessionStorage.getItem("2fa_user");
    if (!userId) {
      alert("Session expired. Please login again.");
      router.push("/login");
      return;
    }

    try {
      const { data } = await API.post("/auth/2fa-login", {
        userId,
        token: otp
      });

      // Store final token
      localStorage.setItem("token", data.token);
      localStorage.setItem("user", JSON.stringify(data.user));

      sessionStorage.removeItem("2fa_user");

      router.push("/dashboard");

    } catch (err: any) {
      alert(err.response?.data?.error || "Invalid OTP");
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50">
      <form
        onSubmit={handleVerify}
        className="p-8 bg-white shadow-lg rounded-xl w-96 border border-gray-200"
      >
        <h1 className="text-2xl font-bold mb-6 text-center text-blue-600">
          Two-Factor Authentication
        </h1>

        <input
          type="text"
          maxLength={6}
          placeholder="Enter 6-digit code"
          className="w-full p-3 border border-gray-300 rounded-md text-black focus:outline-none focus:ring-2 focus:ring-blue-500 text-center tracking-widest"
          value={otp}
          onChange={(e) => setOtp(e.target.value)}
          required
        />

        <button className="w-full mt-4 bg-blue-600 text-white font-semibold py-3 rounded-md hover:bg-blue-700 transition duration-200">
          Verify
        </button>
      </form>
    </div>
  );
}