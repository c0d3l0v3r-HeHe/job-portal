"use client";
import { useState } from "react";
import API from "@/lib/api";

export default function UploadResume() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);

  const handleUpload = async () => {
    if (!file) return alert("Please select a file first");

    const formData = new FormData();
    formData.append("resume", file);

    setLoading(true);
    try {
      await API.post("/resume/upload", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      alert("Resume uploaded and encrypted successfully!");
    } catch (err) {
      alert("Upload failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 bg-white rounded-lg shadow-sm border">
      <h2 className="text-lg font-semibold mb-4 text-black">Upload Your Resume</h2>
      <input 
        type="file" 
        onChange={(e) => setFile(e.target.files?.[0] || null)}
        className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
      />
      <button 
        onClick={handleUpload}
        disabled={loading}
        className="mt-4 bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 disabled:bg-gray-400"
      >
        {loading ? "Encrypting & Uploading..." : "Upload Securely"}
      </button>
    </div>
  );
}