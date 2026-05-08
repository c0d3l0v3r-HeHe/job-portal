// lib/pki.ts

// 1. Generate a new Public/Private Key Pair (ECDSA P-256)
export async function generateKeyPair() {
  const keyPair = await window.crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"]
  );

  const publicKeyJwk = await window.crypto.subtle.exportKey("jwk", keyPair.publicKey);
  const privateKeyJwk = await window.crypto.subtle.exportKey("jwk", keyPair.privateKey);

  return { publicKeyJwk, privateKeyJwk };
}

// 2. Sign Data (User signs their Job ID + Cover Note)
export async function signData(privateKeyJwk: any, data: string): Promise<string> {
  const privateKey = await window.crypto.subtle.importKey(
    "jwk", privateKeyJwk, { name: "ECDSA", namedCurve: "P-256" }, true, ["sign"]
  );

  const encoder = new TextEncoder();
  const signatureBuffer = await window.crypto.subtle.sign(
    { name: "ECDSA", hash: { name: "SHA-256" } },
    privateKey,
    encoder.encode(data)
  );

  // Convert buffer to base64 string for easy database storage
  return btoa(String.fromCharCode(...new Uint8Array(signatureBuffer)));
}

// 3. Verify Data (Company verifies the signature matches the data and public key)
export async function verifySignature(publicKeyJwk: any, signatureBase64: string, data: string): Promise<boolean> {
  try {
    const publicKey = await window.crypto.subtle.importKey(
      "jwk", publicKeyJwk, { name: "ECDSA", namedCurve: "P-256" }, true, ["verify"]
    );

    const signatureBuffer = Uint8Array.from(atob(signatureBase64), c => c.charCodeAt(0));
    const encoder = new TextEncoder();

    return await window.crypto.subtle.verify(
      { name: "ECDSA", hash: { name: "SHA-256" } },
      publicKey,
      signatureBuffer,
      encoder.encode(data)
    );
  } catch (err) {
    return false;
  }
}