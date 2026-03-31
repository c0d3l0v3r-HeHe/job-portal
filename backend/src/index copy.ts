import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { jwt, sign } from 'hono/jwt'
import { PrismaClient } from '../generated/prisma/client'
import { PrismaBunSqlite } from 'prisma-adapter-bun-sqlite'
import { encryptFile } from './utils/encryption'

// --------------------------------------
// Prisma Initialization (CORRECT WAY)
// --------------------------------------
const adapter = new PrismaBunSqlite({
  url: 'file:./dev.db'
})

const prisma = new PrismaClient({ adapter })

// --------------------------------------
// App Setup
// --------------------------------------
const app = new Hono()
const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_key_change_in_production'

app.use('*', cors())

app.get('/', (c) => {
  return c.text('Hello, World!')
})

// ==========================================
// 1. PUBLIC AUTH ROUTES
// ==========================================

app.post('/api/auth/verify-registration-2fa', async (c) => {
  try {
    const { userId, token } = await c.req.json()

    const user = await prisma.user.findUnique({
      where: { id: userId }
    })

    if (!user?.totpSecret) {
      return c.json({ error: 'Invalid request' }, 400)
    }

    const isValid = verifyTOTP(token, user.totpSecret)

    if (!isValid) {
      return c.json({ error: 'Invalid OTP' }, 400)
    }

    await prisma.user.update({
      where: { id: userId },
      data: { totpEnabled: true }
    })

    return c.json({
      message: "Account successfully activated. You can now login."
    })

  } catch (err) {
    console.error(err)
    return c.json({ error: 'Verification failed' }, 500)
  }
})

app.post('/api/auth/register', async (c) => {
  try {
    const { email, password, name } = await c.req.json()

    if (!email || !password) {
      return c.json({ error: 'Email and password required' }, 400)
    }

    const existingUser = await prisma.user.findUnique({
      where: { email }
    })

    if (existingUser) {
      return c.json({ error: 'Email already in use' }, 400)
    }

    const passwordHash = await Bun.password.hash(password)

    // 🔐 Generate TOTP secret immediately
    const { secret, otpauth } = generateTOTPSecret(email)

    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        name,
        role: 'USER',
        totpSecret: secret,
        totpEnabled: false
      }
    })

    const qrCode = await QRCode.toDataURL(otpauth)

    return c.json({
      message: "Scan QR code and verify OTP to activate account",
      qrCode,
      userId: user.id
    }, 201)

  } catch (error) {
    console.error(error)
    return c.json({ error: 'Registration failed' }, 500)
  }
})

app.post('/api/auth/login', async (c) => {
  try {
    console.log("Login request received");

    const { email, password } = await c.req.json()

    if (!email || !password) {
      return c.json({ error: 'Email and password required' }, 400)
    }

    const user = await prisma.user.findUnique({
      where: { email }
    })

    if (!user) {
      return c.json({ error: 'Invalid email or password' }, 401)
    }

    const isMatch = await Bun.password.verify(password, user.passwordHash)

    if (!isMatch) {
      return c.json({ error: 'Invalid email or password' }, 401)
    }

    // 🚨 Block if account not activated
    if (!user.totpEnabled) {
      return c.json({
        error: 'Account not activated. Complete 2FA setup first.'
      }, 403)
    }

    // 🔐 Always require OTP in mandatory mode
    return c.json({
      requires2FA: true,
      userId: user.id
    })

  } catch (error) {
    console.error(error)
    return c.json({ error: 'Login failed' }, 500)
  }
})

app.post('/api/auth/2fa-login', async (c) => {
  try {
    const { userId, token } = await c.req.json()

    const user = await prisma.user.findUnique({
      where: { id: userId }
    })

    if (!user || !user.totpSecret) {
      return c.json({ error: 'Invalid request' }, 400)
    }

    const isValid = verifyTOTP(token, user.totpSecret)

    if (!isValid) {
      return c.json({ error: 'Invalid 2FA code' }, 401)
    }

    const payload = {
      id: user.id,
      role: user.role,
      exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24
    }

    const jwtToken = await sign(payload, JWT_SECRET)

    return c.json({
      token: jwtToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role
      }
    })
  } catch (err) {
    console.error(err)
    return c.json({ error: '2FA login failed' }, 500)
  }
})

// ==========================================
// 2. PROTECTED ROUTES
// ==========================================
import QRCode from 'qrcode'
import { generateTOTPSecret, verifyTOTP } from './utils/totp'

const protectedApi = new Hono()

protectedApi.use('*', jwt({
  secret: JWT_SECRET,
  alg: 'HS256'
}))

protectedApi.post('/2fa/setup', async (c) => {
  try {
    const payload = c.get('jwtPayload') as { id: string }

    const user = await prisma.user.findUnique({
      where: { id: payload.id }
    })

    if (!user) return c.json({ error: 'User not found' }, 404)

    const { secret, otpauth } = generateTOTPSecret(user.email)

    const qrCode = await QRCode.toDataURL(otpauth)

    // Temporarily store secret (not yet enabled)
    await prisma.user.update({
      where: { id: user.id },
      data: { totpSecret: secret }
    })

    return c.json({
      qrCode,
      message: 'Scan QR and verify with code to enable 2FA'
    })
  } catch (err) {
    console.error(err)
    return c.json({ error: '2FA setup failed' }, 500)
  }
})

protectedApi.post('/2fa/verify', async (c) => {
  try {
    const payload = c.get('jwtPayload') as { id: string }
    const { token } = await c.req.json()

    const user = await prisma.user.findUnique({
      where: { id: payload.id }
    })

    if (!user?.totpSecret) {
      return c.json({ error: '2FA not initialized' }, 400)
    }

    const isValid = verifyTOTP(token, user.totpSecret)

    if (!isValid) {
      return c.json({ error: 'Invalid TOTP code' }, 400)
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { totpEnabled: true }
    })

    return c.json({ message: '2FA enabled successfully' })
  } catch (err) {
    console.error(err)
    return c.json({ error: 'Verification failed' }, 500)
  }
})


protectedApi.get('/profile', async (c) => {
  try {
    const payload = c.get('jwtPayload') as { id: string; role: string }

    const user = await prisma.user.findUnique({
      where: { id: payload.id },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        createdAt: true,
        resume: true
      }
    })

    return c.json(user)
  } catch (error) {
    console.error(error)
    return c.json({ error: 'Failed to fetch profile' }, 500)
  }
})

protectedApi.put('/profile', async (c) => {
  try {
    const payload = c.get('jwtPayload') as { id: string }

    const { name, email } = await c.req.json()

    const updatedUser = await prisma.user.update({
      where: { id: payload.id },
      data: { name, email },
      select: { id: true, email: true, name: true }
    })

    return c.json(updatedUser)
  } catch (error) {
    console.error(error)
    return c.json({ error: 'Failed to update profile' }, 500)
  }
})

protectedApi.post('/resume/upload', async (c) => {
  try {
    console.log("Resume upload request received");
    const payload = c.get('jwtPayload') as { id: string }

    const body = await c.req.parseBody()
    const file = body['resume']

    if (!(file instanceof File)) {
      return c.json({ error: 'Invalid file upload' }, 400)
    }

    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    const { filepath, iv } = encryptFile(buffer, file.name)

    const resume = await prisma.resume.upsert({
      where: { userId: payload.id },
      update: {
        encryptedFilePath: filepath,
        iv,
        originalName: file.name
      },
      create: {
        userId: payload.id,
        encryptedFilePath: filepath,
        iv,
        originalName: file.name
      }
    })
    console.log(`Resume ID : ${resume.id}`);
    return c.json({
      message: 'Resume uploaded securely',
      resumeId: resume.id
    })
  } catch (error) {
    console.error(error)
    return c.json({ error: 'Upload failed' }, 500)
  }
})



protectedApi.get('/admin/users', async (c) => {
  const payload = c.get('jwtPayload') as { role: string }

  if (payload.role !== 'ADMIN') {
    return c.json(
      { error: 'Access denied. Admin privileges required.' },
      403
    )
  }

  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        createdAt: true
      }
    })

    return c.json(users)
  } catch (error) {
    console.error(error)
    return c.json({ error: 'Failed to fetch users' }, 500)
  }
})

app.route('/api', protectedApi)

// --------------------------------------
// Bun Server Export
// --------------------------------------
export default {
  port: process.env.PORT || 5000,
  fetch: app.fetch
}