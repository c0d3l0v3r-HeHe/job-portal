import { authenticator } from '@otplib/preset-default'

authenticator.options = {
  window: 1,
}

export function generateTOTPSecret(email: string) {
  const secret = authenticator.generateSecret()

  const otpauth = authenticator.keyuri(
    email,
    'JobPortal',
    secret
  )

  return { secret, otpauth }
}

export function verifyTOTP(token: string, secret: string) {
  return authenticator.verify({ token, secret })
}