import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { jwt, sign } from 'hono/jwt'
import { PrismaClient } from '../generated/prisma/client'
import { PrismaBunSqlite } from 'prisma-adapter-bun-sqlite'
import * as crypto from 'crypto'
import QRCode from 'qrcode'
import { encryptFile, decryptFile } from './utils/encryption'
import { generateTOTPSecret, verifyTOTP } from './utils/totp'
import { readFileSync } from "fs"
// --------------------------------------
// Prisma
// --------------------------------------
// creates the prisma adapter and then prismma client 
const adapter = new PrismaBunSqlite({
  url: 'file:./dev.db'
})
const prisma = new PrismaClient({ adapter })

// --------------------------------------
// App Setup
// --------------------------------------
// create the hono app 
const app = new Hono()
const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_key'

app.use('*', cors())

// --------------------------------------
// AUDIT LOG HELPER (IMPORTANT)
// --------------------------------------
async function createAuditLog(action: string, userId: string | null, metadata: any) {
  const lastLog = await prisma.auditLog.findFirst({
    orderBy: { createdAt: 'desc' }
  })

  const prevHash = lastLog ? lastLog.hash : "GENESIS"
  const dataString = action + JSON.stringify(metadata) + prevHash

  const hash = crypto
    .createHash('sha256')
    .update(dataString)
    .digest('hex')

  await prisma.auditLog.create({
    data: {
      action,
      userId: null, 
      metadata: JSON.stringify({
        ...metadata,
        actorId: userId 
      }),
      prevHash,
      hash
    }
  })
}

// ---------------------------------------
// RATE LIMITERS
// ---------------------------------------
// --------------------------------------
// ADVANCED RATE LIMITER FACTORY
// --------------------------------------
const rateLimitMap = new Map<string, { count: number, resetTime: number }>();

// This factory creates custom limiters for different actions
const createRateLimiter = (actionName: string, windowMs: number, maxRequests: number) => {
  return async (c: any, next: any) => {
    const now = Date.now();
    const ip = c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || 'unknown-ip';
    
    // We attach the actionName to the IP so different limits don't overlap
    // e.g., "IP_192.168.1.1_login" vs "IP_192.168.1.1_upload"
    const identifier = `IP_${ip}_${actionName}`;

    let record = rateLimitMap.get(identifier);

    if (!record || record.resetTime < now) {
      record = { count: 1, resetTime: now + windowMs };
      rateLimitMap.set(identifier, record);
    } else {
      record.count++;
      
      if (record.count > maxRequests) {
        console.log(`[SECURITY] Rate limit exceeded for ${actionName} by IP: ${ip}`);
        
        await createAuditLog("RATE_LIMIT_EXCEEDED", null, { ip, action: actionName });
        
        return c.json({ 
          error: `Too many requests for ${actionName}. Please wait and try again later.` 
        }, 429);
      }
    }

    await next();
  };
};

// --- Instantiate our specific shields ---
const loginLimiter    = createRateLimiter('login',    5 * 60 * 1000,  5);  // 5 per 5 mins
const registerLimiter = createRateLimiter('register', 15 * 60 * 1000, 3);  // 3 per 15 mins
const uploadLimiter   = createRateLimiter('upload',   10 * 60 * 1000, 5);  // 5 per 10 mins
const generalLimiter  = createRateLimiter('api',      1 * 60 * 1000,  100); // 100 per 1 min

// --------------------------------------
// ROOT
// --------------------------------------
app.get('/', (c) => c.text('Backend Running'))

// ==========================================
// AUTH ROUTES
// ==========================================

app.post('/api/auth/register', registerLimiter, async (c) => {
  const { email, password, name } = await c.req.json()

  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) return c.json({ error: 'Email exists' }, 400)

  const passwordHash = await Bun.password.hash(password)
  const { secret, otpauth } = generateTOTPSecret(email)

  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      name,
      totpSecret: secret,
      totpEnabled: false
    }
  })

  const qrCode = await QRCode.toDataURL(otpauth)

  return c.json({ qrCode, userId: user.id })
})

app.post('/api/auth/verify-registration-2fa', async (c) => {
  const { userId, token } = await c.req.json()

  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user?.totpSecret) return c.json({ error: 'Invalid' }, 400)

  const valid = verifyTOTP(token, user.totpSecret)
  if (!valid) return c.json({ error: 'Invalid OTP' }, 400)

  await prisma.user.update({
    where: { id: userId },
    data: { totpEnabled: true }
  })

  return c.json({ message: 'Activated' })
})

app.post('/api/auth/login', loginLimiter, async (c) => {
  console.log("login request")
  const { email, password } = await c.req.json()

  const user = await prisma.user.findUnique({ where: { email } })
  if (!user) return c.json({ error: 'Invalid' }, 401)

  const match = await Bun.password.verify(password, user.passwordHash)
  if (!match) return c.json({ error: 'Invalid' }, 401)

  if (!user.totpEnabled) {
    return c.json({ error: 'Enable 2FA first' }, 403)
  }

  return c.json({ requires2FA: true, userId: user.id })
})

// Move this ABOVE the protectedApi.use('*', jwt(...)) line 
// so you can access it in the browser address bar
app.get('/api/admin/verify-logs', async (c) => {
  const logs = await prisma.auditLog.findMany({ orderBy: { createdAt: 'asc' } });
  const results = [];
  let systemIntegrity = "SECURE";

  for (let i = 0; i < logs.length; i++) {
    const log = logs[i];
    const prevHash = i === 0 ? "GENESIS" : logs[i - 1].hash;

    // Recalculate hash: action + metadata string + prevHash
    const dataString = log.action + log.metadata + prevHash;
    const computedHash = crypto.createHash('sha256').update(dataString).digest('hex');

    if (computedHash !== log.hash) {
      systemIntegrity = "COMPROMISED";
      results.push({
        logId: log.id,
        action: log.action,
        error: "Hash mismatch! Data has been modified.",
        expected: computedHash,
        actual: log.hash
      });
      break; // Stop at the first sign of trouble
    }
  }

  return c.json({ 
    status: systemIntegrity,
    checkedCount: logs.length,
    issues: results 
  });
});

app.post('/api/auth/2fa-login', async (c) => {
  const { userId, token } = await c.req.json()

  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user || !user.totpSecret) return c.json({ error: 'Invalid' }, 400)

  const valid = verifyTOTP(token, user.totpSecret)
  if (!valid) return c.json({ error: 'Invalid OTP' }, 401)

  const jwtToken = await sign(
    { id: user.id, role: user.role },
    JWT_SECRET
  )

  await createAuditLog("LOGIN_SUCCESS", user.id, {})

  return c.json({
    token: jwtToken,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role
    }
  })
})

// ==========================================
// PROTECTED ROUTES
// ==========================================

const protectedApi = new Hono()

protectedApi.use('*', generalLimiter)

protectedApi.use('*', jwt({
  secret: JWT_SECRET,
  alg: 'HS256'
}))

// ---------- PROFILE ----------
protectedApi.get('/profile', async (c) => {
  const payload = c.get('jwtPayload') as { id: string }

  const user = await prisma.user.findUnique({
    where: { id: payload.id },
    include: { resume: true }
  })

  return c.json(user)
})

// ---------- RESUME ----------

protectedApi.get('/resumes', async (c) => {
  const payload = c.get('jwtPayload') as { id: string }
  const resumes = await prisma.resume.findMany({
    where: { userId: payload.id },
    orderBy: { createdAt: 'desc' }
  })
  return c.json(resumes)
})

protectedApi.post('/resume/upload', uploadLimiter, async (c) => {
  const payload = c.get('jwtPayload') as { id: string }
  const body = await c.req.parseBody()
  const file = body['resume'] as File

  const buffer = Buffer.from(await file.arrayBuffer())
  const { filepath, iv } = encryptFile(buffer, file.name)

  // ⚠️ Changed from upsert to create
  const resume = await prisma.resume.create({
    data: { userId: payload.id, encryptedFilePath: filepath, iv, originalName: file.name }
  })

  await createAuditLog("UPLOAD_RESUME", payload.id, {})
  return c.json(resume)
})

// ---------- DELETE RESUME ----------
protectedApi.delete('/resume/:id', async (c) => {
  const payload = c.get('jwtPayload') as { id: string }
  const resumeId = c.req.param('id')

  const resume = await prisma.resume.findUnique({ where: { id: resumeId } })
  if (!resume) return c.json({ error: 'Not found' }, 404)
  if (resume.userId !== payload.id) return c.json({ error: 'Forbidden' }, 403)

  await prisma.resume.delete({ where: { id: resumeId } })
  await createAuditLog("DELETE_RESUME", payload.id, { resumeId })
  
  return c.json({ message: 'Deleted' })
})

// ---------- COMPANY AUTH (WITH 2FA) ----------

app.post('/api/company/register', registerLimiter, async (c) => {
  try {
    const { name, email, password } = await c.req.json()

    const existing = await prisma.company.findUnique({ where: { email } })
    if (existing) return c.json({ error: "Company already exists" }, 400)

    const passwordHash = await Bun.password.hash(password)
    const { secret, otpauth } = generateTOTPSecret(email) // Generate 2FA secret

    const company = await prisma.company.create({
      data: {
        name,
        email,
        passwordHash,
        totpSecret: secret,     // NEW
        totpEnabled: false      // NEW
      }
    })

    const qrCode = await QRCode.toDataURL(otpauth)

    return c.json({ qrCode, companyId: company.id })

  } catch (err) {
    console.error(err)
    return c.json({ error: "Failed to register company" }, 500)
  }
})

// NEW: Company verify registration 2FA
app.post('/api/company/verify-registration-2fa', async (c) => {
  const { companyId, token } = await c.req.json()

  const company = await prisma.company.findUnique({ where: { id: companyId } })
  if (!company?.totpSecret) return c.json({ error: 'Invalid company' }, 400)

  const valid = verifyTOTP(token, company.totpSecret)
  if (!valid) return c.json({ error: 'Invalid OTP' }, 400)

  await prisma.company.update({
    where: { id: companyId },
    data: { totpEnabled: true }
  })

  return c.json({ message: 'Activated' })
})

app.post('/api/company/login', loginLimiter, async (c) => {
  try {
    const { email, password } = await c.req.json()

    const company = await prisma.company.findUnique({ where: { email } })
    if (!company) return c.json({ error: "Invalid credentials" }, 400)

    const valid = await Bun.password.verify(password, company.passwordHash)
    if (!valid) return c.json({ error: "Invalid credentials" }, 400)

    if (!company.totpEnabled) {
      return c.json({ error: 'Enable 2FA first' }, 403)
    }

    // Don't give the token yet! Just confirm credentials are good.
    return c.json({ requires2FA: true, companyId: company.id })

  } catch (err) {
    console.error(err)
    return c.json({ error: "Login failed" }, 500)
  }
})

// NEW: Company final 2FA login
app.post('/api/company/2fa-login', async (c) => {
  const { companyId, token } = await c.req.json()

  const company = await prisma.company.findUnique({ where: { id: companyId } })
  if (!company || !company.totpSecret) return c.json({ error: 'Invalid' }, 400)

  const valid = verifyTOTP(token, company.totpSecret)
  if (!valid) return c.json({ error: 'Invalid OTP' }, 401)

  const jwtToken = await sign(
    { id: company.id, role: "COMPANY" },
    JWT_SECRET
  )

  await createAuditLog("COMPANY_LOGIN_SUCCESS", company.id, {})

  return c.json({
    token: jwtToken,
    company: { id: company.id, email: company.email, name: company.name }
  })
})

// ---------- JOB ----------
protectedApi.post('/job', async (c) => {
  try {
    const payload = c.get('jwtPayload') as { id: string }
    
    // Add the new fields here
    const { title, description, location, isRemote, jobType, tags } = await c.req.json()

    const company = await prisma.company.findUnique({
      where: { id: payload.id }
    })

    if (!company) {
      return c.json({ error: 'Not a company account' }, 403)
    }

    const job = await prisma.job.create({
      data: {
        title,
        description,
        location,           // NEW
        isRemote,           // NEW
        jobType,            // NEW
        tags,               // NEW
        companyId: company.id
      }
    })

    await createAuditLog("CREATE_JOB", payload.id, { jobId: job.id })
    return c.json(job)

  } catch (err) {
    console.error(err)
    return c.json({ error: 'Failed to create job' }, 500)
  }
})

// protectedApi.get('/company/me', async (c) => {
//   try {
//     const payload = c.get('jwtPayload') as { id: string }

//     const company = await prisma.company.findUnique({
//       where: { id: payload.id }, // ✅ FIXED
//       include: { jobs: true }
//     })

//     if (!company) {
//       return c.json({ error: "Company not found" }, 404)
//     }

//     return c.json(company)

//   } catch (err) {
//     console.error("COMPANY ME ERROR:", err)
//     return c.json({ error: "Failed to fetch company" }, 500)
//   }
// })

protectedApi.get('/company/me', async (c) => {
  try {
    const payload = c.get('jwtPayload') as { id: string }

    const company = await prisma.company.findUnique({
      where: { id: payload.id }, 
      include: { 
        jobs: {
          include: {
            applications: {
              include: {
                user: true, 
                notes: true // ✅ ADD THIS LINE: Fetch recruiter notes!
              }
            }
          }
        } 
      }
    })

    if (!company) return c.json({ error: "Company not found" }, 404)
    return c.json(company)

  } catch (err) {
    console.error("COMPANY ME ERROR:", err)
    return c.json({ error: "Failed to fetch company" }, 500)
  }
})


// Add this under your applications/status routes
protectedApi.post('/application/:id/notes', async (c) => {
  const payload = c.get('jwtPayload') as { id: string, role: string }
  const applicationId = c.req.param('id')
  const { note } = await c.req.json()

  // Security check: Only companies can add recruiter notes
  if (payload.role !== "COMPANY") {
    return c.json({ error: "Forbidden" }, 403)
  }

  const newNote = await prisma.recruiterNote.create({
    data: {
      note,
      applicationId,
      authorId: payload.id
    }
  })

  return c.json(newNote)
})

protectedApi.get('/jobs', async (c) => {
  const { keyword, location, isRemote, type } = c.req.query()

  // Build a dynamic Prisma query safely
  const whereClause: any = { AND: [] }

  if (keyword) {
    whereClause.AND.push({
      OR: [
        { title: { contains: keyword } },
        { tags: { contains: keyword } },
        { company: { name: { contains: keyword } } }
      ]
    })
  }
  if (location) {
    whereClause.AND.push({ location: { contains: location } })
  }
  if (isRemote === 'true') {
    whereClause.AND.push({ isRemote: true })
  }
  if (type) {
    whereClause.AND.push({ jobType: type })
  }

  // If no filters were applied, remove the empty AND to get all jobs
  if (whereClause.AND.length === 0) delete whereClause.AND

  const jobs = await prisma.job.findMany({ 
    where: whereClause,
    include: { company: true } 
  })
  
  return c.json(jobs)
})


protectedApi.post('/application/:id/resume', async (c) => {
  const payload = c.get('jwtPayload') as { id: string, role: string }
  const applicationId = c.req.param('id')
  
  // Accept the OTP token from the frontend
  const { otpToken } = await c.req.json()

  if (payload.role !== "COMPANY") {
    return c.json({ error: "Forbidden. Only companies can view resumes." }, 403)
  }

  // 1. Fetch Company & Verify OTP
  const company = await prisma.company.findUnique({ where: { id: payload.id } })
  if (!company) return c.json({ error: "Company not found" }, 404)
  
  // NOTE: For testing/demo purposes, if you haven't built the "Setup 2FA" screen for companies yet, 
  // you might want to mock this check or temporarily bypass it until you seed a secret.
  if (company.totpEnabled && company.totpSecret) {
    const valid = verifyTOTP(otpToken, company.totpSecret)
    if (!valid) return c.json({ error: "Invalid authenticator code" }, 401)
  }

  // 2. Fetch Application & Resume
  const application = await prisma.application.findUnique({
    where: { id: applicationId },
    include: { 
      job: true,
      user: { include: { resumes: { orderBy: { createdAt: 'desc' }, take: 1 } } }
    }
  })

  if (!application) return c.json({ error: "Application not found" }, 404)
  if (application.job.companyId !== payload.id) return c.json({ error: "Forbidden." }, 403)

  const resume = application.user.resumes[0]
  if (!resume) return c.json({ error: "Candidate has not uploaded a resume" }, 404)

  // 3. Decrypt and Return
  try {
    const decryptedBuffer = decryptFile(resume.encryptedFilePath, resume.iv)
    
    await createAuditLog("VIEW_SENSITIVE_RESUME", payload.id, { applicationId })

    c.header('Content-Type', 'application/octet-stream')
    c.header('Content-Disposition', `attachment; filename="${resume.originalName}"`)
    return c.body(new Uint8Array(decryptedBuffer))
  } catch (err) {
    return c.json({ error: "Failed to decrypt resume file" }, 500)
  }
})


// ---------- APPLICATIONS ----------
protectedApi.get('/applications', async (c) => {
  const payload = c.get('jwtPayload') as { id: string }

  const apps = await prisma.application.findMany({
    where: { userId: payload.id },
    include: { job: true }
  })

  return c.json(apps)
})

// ---------- STATUS ----------
protectedApi.put('/application/status', async (c) => {
  const payload = c.get('jwtPayload') as { id: string, role: string }
  const { applicationId, status } = await c.req.json()

  // Security: Only companies can update status
  if (payload.role !== "COMPANY") {
    return c.json({ error: "Forbidden" }, 403)
  }

  // Find the application and verify ownership
  const application = await prisma.application.findUnique({
    where: { id: applicationId },
    include: { job: true }
  })

  if (!application) return c.json({ error: 'Application not found' }, 404)
  
  if (application.job.companyId !== payload.id) {
    return c.json({ error: 'Forbidden. You do not own this job listing.' }, 403)
  }

  const updated = await prisma.application.update({
    where: { id: applicationId },
    data: { status }
  })

  await createAuditLog("UPDATE_APPLICATION_STATUS", payload.id, { applicationId, status })

  return c.json(updated)
})

// ---------- CHAT ----------
// protectedApi.post('/conversation', async (c) => {
//   const payload = c.get('jwtPayload') as { id: string }
//   const { userIds } = await c.req.json()

//   const convo = await prisma.conversation.create({
//     data: {
//       participants: {
//         create: [...new Set([payload.id, ...userIds])].map((id: string) => ({ userId: id }))
//       }
//     }
//   })

//   return c.json(convo)
// })

protectedApi.post('/conversation', async (c) => {
  const payload = c.get('jwtPayload') as { id: string, role: string }
  const { userIds } = await c.req.json()
  const targetId = userIds[0] // Could be a userId OR a companyId

  const isCompany = payload.role === "COMPANY"

  // 1. Find existing conversation
  const existingConvo = await prisma.conversation.findFirst({
    where: {
      AND: [
        // If I am a company, I look for targetId in userId. If I am a user, I look for targetId in companyId.
        isCompany 
          ? { participants: { some: { userId: targetId } } } 
          : { participants: { some: { companyId: targetId } } },
        // Look for my own ID in the proper column
        isCompany 
          ? { participants: { some: { companyId: payload.id } } }
          : { participants: { some: { userId: payload.id } } }
      ]
    }
  })

  if (existingConvo) {
    return c.json(existingConvo)
  }

  // 2. If none exists, create a new one
  const convo = await prisma.conversation.create({
    data: {
      participants: {
        create: [
          // Assign the target to the correct column
          isCompany ? { userId: targetId } : { companyId: targetId },
          // Assign myself to the correct column
          isCompany ? { companyId: payload.id } : { userId: payload.id }
        ]
      }
    }
  })

  return c.json(convo)
})

// protectedApi.post('/message', async (c) => {
//   const payload = c.get('jwtPayload') as { id: string }
//   const { conversationId, encryptedText, iv, encryptedKey } = await c.req.json()

//   const message = await prisma.message.create({
//     data: {
//       senderId: payload.id,
//       conversationId,
//       encryptedText,
//       iv,
//       encryptedKey
//     }
//   })

//   await createAuditLog("SEND_MESSAGE", payload.id, { conversationId })

//   return c.json(message)
// })


protectedApi.post('/message', async (c) => {
  const payload = c.get('jwtPayload') as { id: string, role: string }
  const { conversationId, encryptedText, iv, encryptedKey } = await c.req.json()

  const isCompany = payload.role === "COMPANY"

  const message = await prisma.message.create({
    data: {
      senderId: isCompany ? null : payload.id,
      companyId: isCompany ? payload.id : null,
      conversationId,
      encryptedText,
      iv,
      encryptedKey
    }
  })

  await createAuditLog("SEND_MESSAGE", payload.id, { conversationId })

  return c.json(message)
})

protectedApi.get('/messages/:conversationId', async (c) => {
  const conversationId = c.req.param('conversationId')

  const messages = await prisma.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: 'asc' }
  })

  return c.json(messages)
})

// Add this inside protectedApi in your index.ts
// (alongside the other protectedApi routes like /apply, /applications, etc.)

protectedApi.delete('/application/:id', async (c) => {
  const payload = c.get('jwtPayload') as { id: string }
  const id = c.req.param('id')

  const app = await prisma.application.findUnique({ where: { id } })

  if (!app) return c.json({ error: 'Application not found' }, 404)
  if (app.userId !== payload.id) return c.json({ error: 'Forbidden' }, 403)

  await prisma.application.delete({ where: { id } })
  await createAuditLog("WITHDRAW_APPLICATION", payload.id, { applicationId: id })

  return c.json({ message: 'Withdrawn' })
})


// ==========================================
// ADMIN ROUTES
// ==========================================

// Fetch all users
protectedApi.get('/admin/users', async (c) => {
  const payload = c.get('jwtPayload') as { id: string, role: string }
  
  // Security: Only let admins fetch this
  if (payload.role !== 'ADMIN') return c.json({ error: 'Forbidden' }, 403)

  const users = await prisma.user.findMany({
    select: { id: true, name: true, email: true, role: true, createdAt: true },
    orderBy: { createdAt: 'desc' }
  })
  
  return c.json(users)
})

// Fetch Tamper-Evident Audit Logs
protectedApi.get('/admin/logs', async (c) => {
  const payload = c.get('jwtPayload') as { id: string, role: string }
  if (payload.role !== 'ADMIN') return c.json({ error: 'Forbidden' }, 403)

  const logs = await prisma.auditLog.findMany({
    orderBy: { createdAt: 'desc' },
    take: 100 // Only fetch the 100 most recent logs so it doesn't crash the browser
  })
  
  return c.json(logs)
})

protectedApi.get('/admin/verify-logs', async (c) => {
  const logs = await prisma.auditLog.findMany({ orderBy: { createdAt: 'asc' } });
  const results = [];
  let isValid = true;

  for (let i = 0; i < logs.length; i++) {
    const log = logs[i];
    const prevHash = i === 0 ? "GENESIS" : logs[i - 1].hash;

    // The same formula used during creation
    const dataString = log.action + log.metadata + prevHash;
    const computedHash = crypto.createHash('sha256').update(dataString).digest('hex');

    if (computedHash !== log.hash) {
      isValid = false;
      results.push({
        id: log.id,
        status: "TAMPERED",
        expected: computedHash,
        actual: log.hash
      });
      // Once one is broken, the whole chain from here on is invalid
      break; 
    }
  }

  return c.json({ 
    systemIntegrity: isValid ? "SECURE" : "COMPROMISED",
    details: isValid ? "All hashes match." : "Hash mismatch detected!",
    tamperedLogs: results
  });
});

// --- PKI: Register Public Key ---
protectedApi.post('/pki/register', async (c) => {
  const payload = c.get('jwtPayload') as { id: string }
  const { publicKey } = await c.req.json()

  console.log(`[BACKEND - PKI] Registering key for user ${payload.id}`);

  const key = await prisma.userKey.upsert({
    where: { userId_publicKey: { userId: payload.id, publicKey: JSON.stringify(publicKey) } },
    update: {},
    create: { userId: payload.id, publicKey: JSON.stringify(publicKey) }
  })

  return c.json({ message: "Key registered", keyId: key.id })
})

// --- PKI: Fetch User's Public Key ---
protectedApi.get('/pki/key/:userId', async (c) => {
  const userId = c.req.param('userId')
  console.log(`[BACKEND - PKI] Company requested key for user ${userId}`);
  
  const key = await prisma.userKey.findFirst({
    where: { userId },
    orderBy: { createdAt: 'desc' }
  })
  
  if (!key) {
    console.log(`[BACKEND - PKI] ERROR: No key found in DB for user ${userId}`);
    return c.json({ error: "No public key found" }, 404)
  }
  return c.json({ publicKey: JSON.parse(key.publicKey) })
})

// --- UPDATE EXISTING APPLY ROUTE ---
protectedApi.post('/apply', uploadLimiter, async (c) => {
  const payload = c.get('jwtPayload') as { id: string }
  const body = await c.req.parseBody()
  
  const jobId = body['jobId'] as string
  const coverNote = (body['coverNote'] as string) || "" 
  const signature = body['signature'] as string 
  const file = body['resume'] as File | undefined

  console.log(`[BACKEND - APPLY] Received application from user ${payload.id}`);
  console.log(`[BACKEND - APPLY] JobID: "${jobId}"`);
  console.log(`[BACKEND - APPLY] CoverNote: "${coverNote}"`);
  console.log(`[BACKEND - APPLY] Signature attached? ${signature ? "YES" : "NO"}`);

  if (!jobId) return c.json({ error: "jobId is required" }, 400)

  if (file) {
    const buffer = Buffer.from(await file.arrayBuffer())
    const { filepath, iv } = encryptFile(buffer, file.name)
    await prisma.resume.create({
      data: { userId: payload.id, encryptedFilePath: filepath, iv, originalName: file.name }
    })
  }

  const appData = await prisma.application.create({
    data: { 
      userId: payload.id, 
      jobId,
      coverNote,
      signature 
    }
  })

  await createAuditLog("APPLY_JOB_WITH_PKI", payload.id, { jobId })
  return c.json(appData)
})

// --------------------------------------
app.route('/api', protectedApi)

// --------------------------------------
export default {
  port: 5000,
  fetch: app.fetch,

  tls: {
    cert: readFileSync("certificate.crt"),
    key: readFileSync("private.key"),
  }
}