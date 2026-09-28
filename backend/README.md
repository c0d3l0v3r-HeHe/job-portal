# Job Portal — Backend

REST API for the Secure Job Portal (FCS — Fundamentals of Computer Security course project).

Built with **Bun**, **Hono**, **Prisma** and **SQLite**. It serves over HTTPS on port **5000**.

## Tech Stack

| Purpose | Library |
|---|---|
| Runtime | Bun |
| Web framework | Hono (`hono/jwt`, `hono/cors`) |
| Database / ORM | SQLite + Prisma (`prisma-adapter-bun-sqlite`) |
| Password hashing | `Bun.password` (argon2) |
| Two-factor auth | `@otplib/preset-default` (TOTP), `qrcode` |
| Crypto | Node `crypto` — AES-256-CBC file encryption, SHA-256 audit hash chain |
| Tests | Jest + ts-jest |

## Setup & Run

```bash
cd backend
bun install

# create backend/.env (see below), then:
bunx prisma generate     # generates the Prisma client into generated/prisma
bunx prisma db push      # creates/updates the SQLite database (dev.db)

bun run dev              # starts https://localhost:5000 with hot reload
```

### Environment variables (`backend/.env`)

```env
DATABASE_URL="file:./dev.db"
JWT_SECRET="<a long random string>"
ENCRYPTION_KEY="<64 hex chars = 32-byte AES key>"
```

Generate an encryption key with:

```bash
openssl rand -hex 32
```

### TLS

The server loads `certificate.crt` and `private.key` from the `backend/` folder. To create a fresh self-signed pair:

```bash
openssl req -x509 -newkey rsa:2048 -nodes -keyout private.key -out certificate.crt -days 365 -subj "/CN=localhost"
```

### Tests

```bash
bun run test
```

Unit tests in `tests/` cover the auth, job, application, resume, message, PKI, audit and rate-limiter services.

## Project Structure

```
backend/
├── src/
│   ├── index.ts              # server entry point — all routes
│   ├── app.ts                # testable app factory (dependency-injected)
│   ├── services/             # service layer used by app.ts and the tests
│   └── utils/
│       ├── encryption.ts     # AES-256-CBC encrypt/decrypt for resume files
│       └── totp.ts           # TOTP secret generation & verification
├── prisma/schema.prisma      # data model
├── generated/prisma/         # generated Prisma client
├── uploads/                  # encrypted resume files (*.enc)
└── tests/                    # Jest unit tests
```

## How It Works

### Authentication & 2FA

1. `POST /register` hashes the password and generates a TOTP secret, returning it as a **QR code**.
2. The user scans it and calls `verify-registration-2fa` with the first code — only then is 2FA enabled and the account usable.
3. `POST /login` checks email + password and responds with `requires2FA`.
4. `POST /2fa-login` verifies the TOTP code and issues a **JWT** (HS256) containing the user id and role.

Users and companies follow the same flow on separate routes (`/api/auth/*` and `/api/company/*`). All other routes under `/api` require `Authorization: Bearer <token>`.

### Resume Encryption

Resumes are never stored in plain form.

- `encryptFile()` in `src/utils/encryption.ts` generates a random 16-byte IV, encrypts the file with **AES-256-CBC** using `ENCRYPTION_KEY`, and saves it to `uploads/<timestamp>-<name>.enc`.
- The `Resume` table stores the encrypted file path, the IV and the original file name.
- `decryptFile()` decrypts on demand, only when an authorized company downloads a resume.
- A user can keep multiple resumes; the latest one is used for applications.

### OTP-Gated Resume Access

When a company downloads an applicant's resume (`POST /api/application/:id/resume`), the backend:

1. checks the company owns the job the application belongs to,
2. verifies a fresh TOTP code sent with the request,
3. decrypts the applicant's resume and streams it back as a file download,
4. records a `VIEW_SENSITIVE_RESUME` entry in the audit log.

### Digital Signatures (PKI)

The frontend generates an **ECDSA P-256** key pair per user and registers the public key via `POST /api/pki/register`. Job applications are signed in the browser and the signature is stored with the application. Companies fetch the applicant's public key (`GET /api/pki/key/:userId`) to verify that the application was really submitted by that user and was not modified.

### Tamper-Evident Audit Log

Every sensitive action (login, resume upload/delete/view, job application, message, rate-limit breach…) is written to the `AuditLog` table. Each entry stores:

```
hash = SHA-256(action + metadata + prevHash)
```

This links every entry to the one before it (starting from `GENESIS`). `GET /api/admin/verify-logs` recomputes the whole chain and reports `SECURE` or `COMPROMISED`, pointing to the first entry that was modified.

### Rate Limiting

Per-IP limits are applied per action:

| Action | Limit |
|---|---|
| Login | 5 requests / 5 min |
| Register | 3 requests / 15 min |
| Upload / Apply | 5 requests / 10 min |
| General API | 100 requests / 1 min |

Exceeding a limit returns `429` and is recorded in the audit log.

## Data Model

| Model | Purpose |
|---|---|
| `User` | Job seeker (or admin) account, password hash, TOTP secret, role |
| `Company` | Employer account with its own TOTP secret |
| `Job` | Posting with location, remote flag, job type and tags |
| `Application` | User ↔ Job, with status, cover note and digital signature |
| `RecruiterNote` | Private notes a company adds to an application |
| `Resume` | Encrypted file path, IV and original filename |
| `Conversation`, `ConversationParticipant`, `Message` | Messaging between users and companies |
| `UserKey` | Registered PKI public keys |
| `OtpLog` | OTP attempt history |
| `AuditLog` | Hash-chained log of sensitive actions |

## API Reference

All paths are prefixed with `https://localhost:5000`.

### Public

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/auth/register` | Register a user, returns TOTP QR code |
| `POST` | `/api/auth/verify-registration-2fa` | Activate 2FA with the first OTP |
| `POST` | `/api/auth/login` | Email + password check |
| `POST` | `/api/auth/2fa-login` | Verify OTP, returns JWT |
| `POST` | `/api/company/register` | Register a company, returns TOTP QR code |
| `POST` | `/api/company/verify-registration-2fa` | Activate company 2FA |
| `POST` | `/api/company/login` | Company email + password check |
| `POST` | `/api/company/2fa-login` | Verify company OTP, returns JWT |
| `GET` | `/api/admin/verify-logs` | Verify audit-log hash chain |

### Protected (JWT required)

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/profile` | Current user's profile |
| `GET` | `/api/resumes` | List the user's resumes |
| `POST` | `/api/resume/upload` | Upload and encrypt a resume (form field `resume`) |
| `DELETE` | `/api/resume/:id` | Delete one of the user's resumes |
| `GET` | `/api/jobs` | List / search jobs |
| `POST` | `/api/job` | Create a job (company) |
| `GET` | `/api/company/me` | Company profile with its jobs and applicants |
| `POST` | `/api/apply` | Apply to a job with cover note, signature and optional resume |
| `GET` | `/api/applications` | The user's applications |
| `PUT` | `/api/application/status` | Update an application's status (company) |
| `DELETE` | `/api/application/:id` | Withdraw an application |
| `POST` | `/api/application/:id/notes` | Add a recruiter note (company) |
| `POST` | `/api/application/:id/resume` | OTP-gated, decrypted resume download (company) |
| `POST` | `/api/conversation` | Start or fetch a user ↔ company conversation |
| `POST` | `/api/message` | Send a message |
| `GET` | `/api/messages/:conversationId` | Get messages in a conversation |
| `POST` | `/api/pki/register` | Register the user's public key |
| `GET` | `/api/pki/key/:userId` | Fetch a user's public key |
| `GET` | `/api/admin/users` | List users (admin) |
| `GET` | `/api/admin/logs` | View audit logs (admin) |
| `GET` | `/api/admin/verify-logs` | Verify audit-log integrity (admin) |

Example requests with `curl` are in [tests.md](tests.md).
