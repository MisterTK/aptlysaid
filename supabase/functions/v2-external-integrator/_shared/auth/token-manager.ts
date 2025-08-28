// Token encryption/decryption utilities
const DEFAULT_KEY = "4a84bd9de473c1f44b26f3ee151ccb4f"
export async function decryptToken(encryptedTokenData) {
  const configuredKey = Deno.env.get("TOKEN_ENCRYPTION_KEY")
  const keysToTry =
    configuredKey && configuredKey !== DEFAULT_KEY
      ? [DEFAULT_KEY, configuredKey]
      : [DEFAULT_KEY]
  let encryptedData
  // Handle different data formats
  if (typeof encryptedTokenData === "string") {
    try {
      const cleanedData = encryptedTokenData.trim()
      const binaryString = atob(cleanedData)
      encryptedData = new Uint8Array(binaryString.length)
      for (let i = 0; i < binaryString.length; i++) {
        encryptedData[i] = binaryString.charCodeAt(i)
      }
    } catch {
      throw new Error("Invalid base64 encoded token")
    }
  } else if (encryptedTokenData?.type === "Buffer") {
    encryptedData = new Uint8Array(encryptedTokenData.data)
  } else if (encryptedTokenData instanceof ArrayBuffer) {
    encryptedData = new Uint8Array(encryptedTokenData)
  } else {
    throw new Error(
      `Unsupported encrypted token format: ${typeof encryptedTokenData}`,
    )
  }
  if (encryptedData.length < 32) {
    throw new Error(
      `Invalid encrypted token length: ${encryptedData.length} bytes`,
    )
  }
  const iv = encryptedData.slice(0, 16)
  const encrypted = encryptedData.slice(16)
  let lastError = null
  for (const encryptionKey of keysToTry) {
    try {
      const paddedKey = encryptionKey.padEnd(32, "0").slice(0, 32)
      const keyBuffer = new TextEncoder().encode(paddedKey)
      const cryptoKey = await crypto.subtle.importKey(
        "raw",
        keyBuffer,
        {
          name: "AES-CBC",
        },
        false,
        ["decrypt"],
      )
      const decrypted = await crypto.subtle.decrypt(
        {
          name: "AES-CBC",
          iv,
        },
        cryptoKey,
        encrypted,
      )
      const decryptedArray = new Uint8Array(decrypted)
      const paddingLength = decryptedArray[decryptedArray.length - 1]
      if (paddingLength > 0 && paddingLength <= 16) {
        let validPadding = true
        for (
          let i = decryptedArray.length - paddingLength;
          i < decryptedArray.length;
          i++
        ) {
          if (decryptedArray[i] !== paddingLength) {
            validPadding = false
            break
          }
        }
        if (validPadding) {
          const unpadded = decryptedArray.slice(
            0,
            decryptedArray.length - paddingLength,
          )
          return new TextDecoder().decode(unpadded)
        }
      }
      return new TextDecoder().decode(decrypted)
    } catch (decryptError) {
      lastError = decryptError
    }
  }
  throw new Error(
    `Token decryption failed: ${lastError?.message || "Unknown error"}`,
  )
}
export async function encryptToken(plainTextToken) {
  const configuredKey = Deno.env.get("TOKEN_ENCRYPTION_KEY")
  const encryptionKey = configuredKey || DEFAULT_KEY
  const iv = crypto.getRandomValues(new Uint8Array(16))
  const paddedKey = encryptionKey.padEnd(32, "0").slice(0, 32)
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(paddedKey),
    {
      name: "AES-CBC",
    },
    false,
    ["encrypt"],
  )
  const encrypted = await crypto.subtle.encrypt(
    {
      name: "AES-CBC",
      iv,
    },
    key,
    new TextEncoder().encode(plainTextToken),
  )
  const combined = new Uint8Array(iv.length + encrypted.byteLength)
  combined.set(iv)
  combined.set(new Uint8Array(encrypted), iv.length)
  return btoa(String.fromCharCode(...combined))
}
