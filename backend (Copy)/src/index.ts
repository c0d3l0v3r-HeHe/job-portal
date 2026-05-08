import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { jwt, sign } from 'hono/jwt'
import { PrismaClient } from '../generated/prisma/client'
import { PrismaBunSqlite } from 'prisma-adapter-bun-sqlite'
import * as crypto from 'crypto'
import QRCode from 'qrcode'
import { encryptFile } from './utils/encryption'
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

// --------------------------------------
// ROOT
// --------------------------------------
app.get('/', (c) => c.text('Backend Running'))

// ==========================================
// AUTH ROUTES
// ==========================================

app.post('/api/auth/register', async (c) => {
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

app.post('/api/auth/login', async (c) => {
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
protectedApi.post('/resume/upload', async (c) => {
  const payload = c.get('jwtPayload') as { id: string }

  const body = await c.req.parseBody()
  const file = body['resume'] as File

  const buffer = Buffer.from(await file.arrayBuffer())
  const { filepath, iv } = encryptFile(buffer, file.name)

  const resume = await prisma.resume.upsert({
    where: { userId: payload.id },
    update: { encryptedFilePath: filepath, iv, originalName: file.name },
    create: { userId: payload.id, encryptedFilePath: filepath, iv, originalName: file.name }
  })

  await createAuditLog("UPLOAD_RESUME", payload.id, {})

  return c.json(resume)
})

// ---------- COMPANY ----------
app.post('/api/company/register', async (c) => {
  console.log("company request received ")

  try {
    const { name, email, password } = await c.req.json()

    const existing = await prisma.company.findUnique({
      where: { email }
    })

    if (existing) {
      return c.json({ error: "Company already exists" }, 400)
    }

    const passwordHash = await Bun.password.hash(password)

    const company = await prisma.company.create({
      data: {
        name,
        email,
        passwordHash
      }
    })

    return c.json({ message: "Company registered successfully" })

  } catch (err) {
    console.error(err)
    return c.json({ error: "Failed to register company" }, 500)
  }
})

app.post('/api/company/login', async (c) => {
  console.log("company login request received ")
  try {
    const { email, password } = await c.req.json()

    const company = await prisma.company.findUnique({
      where: { email }
    })

    if (!company) {
      return c.json({ error: "Invalid credentials" }, 400)
    }

    const valid = await Bun.password.verify(password, company.passwordHash)

    if (!valid) {
      return c.json({ error: "Invalid credentials" }, 400)
    }

    const token = await sign(
      { id: company.id, role: "COMPANY" },
      JWT_SECRET
    )

    return c.json({
      token,
      company
    })

  } catch (err) {
    console.error(err)
    return c.json({ error: "Login failed" }, 500)
  }
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

// ---------- APPLY ----------
protectedApi.post('/apply', async (c) => {
  const payload = c.get('jwtPayload') as { id: string }
  // Extract coverNote safely
  const { jobId, coverNote } = await c.req.json()

  const appData = await prisma.application.create({
    data: { 
      userId: payload.id, 
      jobId,
      coverNote // NEW
    }
  })

  await createAuditLog("APPLY_JOB", payload.id, { jobId })

  return c.json(appData)
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
  const { applicationId, status } = await c.req.json()

  const updated = await prisma.application.update({
    where: { id: applicationId },
    data: { status }
  })

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