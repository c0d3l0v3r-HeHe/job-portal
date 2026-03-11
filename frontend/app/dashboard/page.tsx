"use client";
import UploadResume from "@/components/UploadResume";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function Dashboard() {
  const [user, setUser] = useState<any>(null);
  const router = useRouter();

  useEffect(() => {
    const storedUser = localStorage.getItem("user");
    if (!storedUser) {
      router.push("/login");
    } else {
      setUser(JSON.parse(storedUser));
    }
  }, [router]);

  if (!user) return null;

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="bg-white p-6 rounded-lg shadow-md border-t-4 border-blue-500">
          <h1 className="text-2xl font-bold text-gray-800">Welcome, {user.name}!</h1>
          <p className="text-gray-600">{user.email}</p>
          <button 
            onClick={() => { localStorage.clear(); router.push("/login"); }}
            className="mt-4 text-sm text-red-500 hover:underline"
          >
            Logout
          </button>
        </div>

        <UploadResume />
        
        {user.role === "ADMIN" && (
          <button 
            onClick={() => router.push("/admin")}
            className="w-full bg-purple-600 text-white p-3 rounded-lg font-bold hover:bg-purple-700 transition"
          >
            Go to Admin Panel
          </button>
        )}
      </div>
    </div>
  );
}