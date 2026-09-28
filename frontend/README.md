# Job Portal — Frontend

Web client for the Secure Job Portal (FCS — Fundamentals of Computer Security course project).

Built with **Next.js 16**, **React 19**, **Tailwind CSS 4** and **Axios**. It talks to the backend API at `https://localhost:5000/api`.

## Setup & Run

Start the [backend](../backend/README.md) first, then:

```bash
cd frontend
bun install
bun run dev          # development server → http://localhost:3000
```

To run the frontend over **HTTPS** with the bundled certificate (`certificate.crt` / `private.key`):

```bash
bun server.ts        # → https://localhost:4000
```

Production build:

```bash
bun run build
bun run start
```

The backend uses a self-signed certificate — open `https://localhost:5000` once in the browser and accept it, otherwise API calls from the frontend will be blocked.

## Project Structure

```
frontend/
├── app/
│   ├── page.tsx                  # landing page
│   ├── register/                 # job-seeker registration + 2FA QR setup
│   ├── verify-otp/               # job-seeker OTP login step
│   ├── login/                    # job-seeker login
│   ├── register-company/         # company registration + 2FA QR setup
│   ├── company-verify-otp/       # company OTP login step
│   ├── company-login/            # company login
│   ├── dashboard/                # job seeker: browse jobs, apply, applications, messages
│   ├── profile/                  # job seeker: manage resumes
│   ├── company/                  # company: dashboard, applicants, messaging
│   │   └── create-job/           # company: post a new job
│   └── admin/                    # admin: users, audit logs, integrity check
├── components/
│   ├── UploadResume.tsx          # resume upload widget
│   └── VirtualKeyboard.tsx       # randomized on-screen keypad for OTP entry
├── lib/
│   ├── api.ts                    # Axios client, attaches the JWT to every request
│   └── pki.ts                    # Web Crypto ECDSA key generation, signing, verification
└── server.ts                     # custom HTTPS server (port 4000)
```

## How It Works

### Login with 2FA

1. On registration, the page shows the **QR code** returned by the backend; the user scans it with an authenticator app and confirms the first code.
2. Login is two steps: email + password, then the 6-digit TOTP code (`/verify-otp` or `/company-verify-otp`).
3. The JWT returned by the backend is saved in `localStorage`, and `lib/api.ts` adds it as `Authorization: Bearer <token>` to every request.

### Job Seeker

- **Dashboard** (`/dashboard`) — browse and search jobs, apply with a cover note and an optional resume file, track application status, withdraw applications, and chat with companies.
- **Digital signature** — when applying, `lib/pki.ts` generates an **ECDSA P-256** key pair with the browser's Web Crypto API, registers the public key with the backend, and signs the application data with the private key.
- **Profile** (`/profile`) — upload resumes with the `UploadResume` component (sent to the backend and encrypted there), view the list of uploaded resumes with their upload dates, and delete them.

### Company

- **Dashboard** (`/company`) — see all posted jobs and their applicants, change application status, add private recruiter notes, verify an applicant's digital signature, and message candidates.
- **Post a job** (`/company/create-job`) — title, description, location, remote option, job type and tags.
- **Secure resume download** — clicking **Resume** on an applicant opens an OTP prompt using the `VirtualKeyboard` component. The digits are shuffled every time, which protects the code against keyloggers and shoulder-surfing. The OTP is sent to the backend, which decrypts the resume and the browser downloads it as `<ApplicantName>_Resume.pdf`.

### Admin

- **Admin panel** (`/admin`) — list registered users, view the audit log, and run the audit-log integrity check that tells whether any log entry has been tampered with. Non-admin users are redirected to the dashboard.
