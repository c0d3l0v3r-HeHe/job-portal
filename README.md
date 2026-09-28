# Secure Job Portal

A full-stack job portal built as the course project for **FCS — Fundamentals of Computer Security**.

The portal connects **job seekers** and **companies**: companies post jobs and review applicants, job seekers upload resumes and apply, and both sides can message each other. The main goal of the project is to apply computer-security fundamentals to every part of this workflow — authentication, data at rest, data in transit, integrity, and accountability.

## Project Scope

| Area | What the project implements |
|---|---|
| **Authentication** | Password hashing, mandatory TOTP two-factor authentication (Google Authenticator / any TOTP app), JWT-based sessions |
| **Authorization** | Role-based access (`USER`, `COMPANY`, `ADMIN`); ownership checks on resumes, jobs and applications |
| **Data at rest** | Resumes are encrypted with AES-256-CBC before being written to disk |
| **Data in transit** | Both backend and frontend are served over HTTPS (TLS) |
| **Integrity & non-repudiation** | Job applications are digitally signed in the browser (ECDSA P-256) using a PKI key pair |
| **Accountability** | Tamper-evident, hash-chained audit log of all sensitive actions, with an integrity-verification endpoint |
| **Abuse protection** | Per-IP rate limiting on login, registration, upload and general API traffic |
| **Sensitive access** | Companies must enter a fresh OTP (on a randomized virtual keypad) to download an applicant's resume |

## Architecture

```
┌──────────────────────┐   HTTPS + JWT    ┌──────────────────────┐        ┌───────────────┐
│  Frontend (Next.js)  │ ───────────────▶ │  Backend (Bun+Hono)  │ ─────▶ │ SQLite (Prisma)│
│  https://localhost   │                  │ https://localhost:5000│        └───────────────┘
│  Web Crypto (PKI)    │                  │  AES-256 file crypto  │ ─────▶  uploads/*.enc
└──────────────────────┘                  └──────────────────────┘
```

- **[backend/](backend/README.md)** — REST API built with Bun, Hono and Prisma (SQLite). Handles auth + 2FA, jobs, applications, resumes, messaging, PKI keys, audit logging and rate limiting.
- **[frontend/](frontend/README.md)** — Next.js (React, Tailwind) web app with separate flows for job seekers, companies and admins.

## How It Works (end-to-end)

1. **Register** — a user or company registers; the backend hashes the password and returns a QR code for a new TOTP secret. The account is activated only after the first valid OTP is entered.
2. **Login** — email + password, then a TOTP code. Only after both succeed does the backend issue a JWT, which the frontend attaches to every API request.
3. **Company posts a job** — with title, description, location, remote flag, job type and tags.
4. **Job seeker applies** — optionally attaches a resume (encrypted on the server) and a cover note. The browser signs the application with the user's private key; the public key is registered with the backend.
5. **Company reviews applicants** — updates application status (Applied → Reviewing → Shortlisted → Accepted/Rejected), adds recruiter notes, verifies the applicant's signature, and messages candidates.
6. **Company downloads a resume** — requires a fresh OTP; the backend decrypts the file on demand and streams it back.
7. **Every sensitive action** — login, upload, delete, resume view, application, message, rate-limit breach — is appended to a SHA-256 hash-chained audit log that admins can verify for tampering.

## Quick Start

**Prerequisites:** [Bun](https://bun.sh) installed, and a TOTP app (Google Authenticator, Authy, etc.) for 2FA.

```bash
# 1. Backend  (https://localhost:5000)
cd backend
bun install
bunx prisma generate
bunx prisma db push
bun run dev

# 2. Frontend (in a second terminal)
cd frontend
bun install
bun run dev
```

Both servers use the TLS certificate pair (`certificate.crt` / `private.key`) in their folders. Since it is self-signed, open `https://localhost:5000` once in your browser and accept the certificate so the frontend can talk to the API.

See the [backend README](backend/README.md) and [frontend README](frontend/README.md) for environment variables, the full API reference and page-by-page details.
