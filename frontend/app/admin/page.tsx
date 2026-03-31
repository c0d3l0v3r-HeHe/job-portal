"use client";
import { useEffect, useState } from "react";
import API from "@/lib/api";
import { useRouter } from "next/navigation";

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  createdAt: string;
}

interface AuditLog {
  id: string;
  action: string;
  metadata: string;
  hash: string;
  createdAt: string;
}

export default function AdminDashboard() {
  const [users, setUsers] = useState<User[]>([]);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"users" | "logs">("users");
  const router = useRouter();

  useEffect(() => {
    const fetchAdminData = async () => {
      try {
        const [usersRes, logsRes] = await Promise.all([
          API.get("/admin/users"),
          API.get("/admin/logs")
        ]);
        setUsers(usersRes.data);
        setLogs(logsRes.data);
      } catch (err) {
        alert("Access Denied: Admins Only");
        router.push("/dashboard"); // Redirect non-admins
      } finally {
        setLoading(false);
      }
    };
    fetchAdminData();
  }, [router]);

  if (loading) return <div className="p-10 text-center text-gray-600 font-medium">Loading secure data...</div>;

  return (
    <div className="p-8 bg-gray-50 min-h-screen font-sans">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold mb-6 text-gray-800 border-b pb-4">Admin Control Panel</h1>
        
        {/* Tabs */}
        <div className="flex gap-4 mb-6">
          <button 
            onClick={() => setActiveTab("users")}
            className={`px-5 py-2 rounded-lg font-semibold transition ${activeTab === "users" ? "bg-gray-800 text-white" : "bg-white text-gray-600 border shadow-sm"}`}
          >
            Manage Users
          </button>
          <button 
            onClick={() => setActiveTab("logs")}
            className={`px-5 py-2 rounded-lg font-semibold transition ${activeTab === "logs" ? "bg-gray-800 text-white" : "bg-white text-gray-600 border shadow-sm"}`}
          >
            Tamper-Evident Logs
          </button>
        </div>

        {/* Users Table */}
        {activeTab === "users" && (
          <div className="bg-white shadow-md rounded-lg overflow-hidden border border-gray-200">
            <table className="w-full text-left border-collapse">
              <thead className="bg-gray-100 text-gray-700 uppercase text-xs tracking-wider">
                <tr>
                  <th className="p-4 border-b">Name</th>
                  <th className="p-4 border-b">Email</th>
                  <th className="p-4 border-b">Role</th>
                  <th className="p-4 border-b">Joined Date</th>
                </tr>
              </thead>
              <tbody className="text-gray-600 text-sm">
                {users.map((user) => (
                  <tr key={user.id} className="hover:bg-gray-50 transition">
                    <td className="p-4 border-b font-medium text-gray-800">{user.name || "N/A"}</td>
                    <td className="p-4 border-b">{user.email}</td>
                    <td className="p-4 border-b">
                      <span className={`px-2 py-1 rounded-full text-xs font-bold ${user.role === 'ADMIN' ? 'bg-purple-100 text-purple-700' : 'bg-green-100 text-green-700'}`}>
                        {user.role}
                      </span>
                    </td>
                    <td className="p-4 border-b">{new Date(user.createdAt).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Audit Logs Table */}
        {activeTab === "logs" && (
          <div className="bg-white shadow-md rounded-lg overflow-hidden border border-gray-200">
            <div className="bg-blue-50 border-b border-blue-100 p-4 text-xs text-blue-800 font-medium">
              🔒 <strong>Integrity Verified:</strong> Each log below is cryptographically chained to the previous log. Altering database records will break the chain.
            </div>
            <table className="w-full text-left border-collapse">
              <thead className="bg-gray-100 text-gray-700 uppercase text-xs tracking-wider">
                <tr>
                  <th className="p-4 border-b">Timestamp</th>
                  <th className="p-4 border-b">Action</th>
                  <th className="p-4 border-b">Metadata Payload</th>
                  <th className="p-4 border-b">Block Hash (SHA-256)</th>
                </tr>
              </thead>
              <tbody className="text-gray-600 text-sm">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-gray-50 transition">
                    <td className="p-4 border-b whitespace-nowrap">{new Date(log.createdAt).toLocaleString()}</td>
                    <td className="p-4 border-b font-bold text-gray-800">{log.action}</td>
                    <td className="p-4 border-b font-mono text-xs break-words max-w-xs">{log.metadata}</td>
                    <td className="p-4 border-b font-mono text-xs text-gray-400 break-all">{log.hash}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {logs.length === 0 && (
              <div className="p-8 text-center text-gray-500">No logs generated yet. Perform some actions in the app!</div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}