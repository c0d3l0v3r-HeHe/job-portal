"use client";

import { useRouter } from "next/navigation";

export default function Home() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">

      {/* ================= HERO ================= */}
      <div className="text-center mt-20 mb-12 px-6">
        <h1 className="text-4xl font-bold text-gray-900">
          Job Portal 🚀
        </h1>

        {/* FIXED CONTRAST */}
        <p className="text-gray-700 mt-3 text-lg">
          Find jobs. Hire talent. Everything in one place.
        </p>
      </div>

      {/* ================= CARDS ================= */}
      <div className="flex flex-1 items-center justify-center px-6">
        <div className="max-w-5xl w-full grid md:grid-cols-2 gap-8">

          {/* USER CARD */}
          <div className="bg-white p-8 rounded-2xl shadow-md hover:shadow-xl transition border border-gray-200">

            <h2 className="text-2xl font-semibold text-gray-900 mb-2">
              👨‍💻 For Job Seekers
            </h2>

            {/* FIXED */}
            <p className="text-gray-700 mb-6">
              Apply to jobs, upload your resume, and track your applications.
            </p>

            <div className="space-y-3">
              <button
                onClick={() => router.push("/login")}
                className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white py-3 rounded-lg font-semibold hover:opacity-90"
              >
                Login
              </button>

              {/* FIXED BUTTON VISIBILITY */}
              <button
                onClick={() => router.push("/register")}
                className="w-full border border-gray-400 text-gray-800 hover:bg-gray-100 py-3 rounded-lg"
              >
                Register
              </button>
            </div>
          </div>

          {/* COMPANY CARD */}
          <div className="bg-white p-8 rounded-2xl shadow-md hover:shadow-xl transition border border-gray-200">

            <h2 className="text-2xl font-semibold text-gray-900 mb-2">
              🏢 For Companies
            </h2>

            {/* FIXED */}
            <p className="text-gray-700 mb-6">
              Post jobs, manage applicants, and hire the best talent.
            </p>

            <div className="space-y-3">
              <button
                onClick={() => router.push("/company-login")}
                className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 text-white py-3 rounded-lg font-semibold hover:opacity-90"
              >
                Company Login
              </button>

              {/* FIXED */}
              <button
                onClick={() => router.push("/register-company")}
                className="w-full border border-gray-400 text-gray-800 hover:bg-gray-100 py-3 rounded-lg"
              >
                Register Company
              </button>
            </div>
          </div>

        </div>
      </div>

      {/* ================= FOOTER ================= */}
      <div className="text-center text-gray-600 text-sm mb-6">
        © 2026 Job Portal
      </div>
    </div>
  );
}