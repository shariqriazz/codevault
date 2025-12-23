# Storage and Encryption System

**Version:** 1.8.5

This document describes the storage layer for CodeVault code chunks, including the optional AES-256-GCM encryption system for protecting indexed source code at rest.

## Overview

CodeVault stores indexed code chunks as compressed files on disk. Each chunk is identified by a SHA hash and stored in a designated chunk directory. The storage system supports:

- **Gzip compression** for all stored chunks
- **Optional AES-256-GCM encryption** with HKDF key derivation
- **Key rotation** via deprecated key support
- **Backward compatibility** with older encryption formats

## File Structure

Chunks are stored in a configurable chunk directory with the following naming conventions:

| File Pattern | Description |
|--------------|-------------|
| `{sha}.gz` | Gzip-compressed plaintext chunk |
| `{sha}.gz.enc` | Gzip-compressed and encrypted chunk |

When encryption is enabled, the system automatically removes plaintext versions when writing encrypted chunks (and vice versa) to prevent duplicate storage.

## Encryption Configuration

### Environment Variables

| Variable | Description | Format |
|----------|-------------|--------|
| `CODEVAULT_ENCRYPTION_KEY` | Primary encryption key (required for encryption) | Base64 or hex-encoded 32-byte key |
| `CODEVAULT_ENCRYPTION_DEPRECATED_KEYS` | Comma-separated list of deprecated keys for rotation | Base64 or hex-encoded 32-byte keys |

### Key Requirements

- Keys must be exactly **32 bytes** (256 bits)
- Keys can be encoded as either **base64** or **hexadecimal**
- Invalid key formats are rejected with descriptive error messages

### Generating a Key

```bash
# Generate a random 32-byte key (base64)
openssl rand -base64 32

# Generate a random 32-byte key (hex)
openssl rand -hex 32
```

### Enabling Encryption

Set the encryption key environment variable:

```bash
export CODEVAULT_ENCRYPTION_KEY="your-base64-or-hex-encoded-key"
```

Use the `--encrypt` flag when indexing:

```bash
# Enable encryption explicitly
codevault index ./src --encrypt on

# Disable encryption explicitly (default)
codevault index ./src --encrypt off
```

## Encryption Details

### Algorithm

CodeVault uses **AES-256-GCM** (Galois/Counter Mode) for authenticated encryption:

| Parameter | Value | Description |
|-----------|-------|-------------|
| Algorithm | AES-256-GCM | Authenticated encryption with associated data |
| Key length | 32 bytes | 256-bit encryption key |
| Salt length | 16 bytes | Random salt for key derivation |
| IV length | 12 bytes | Initialization vector (nonce) |
| Auth tag length | 16 bytes | Authentication tag for integrity |
| Key ID length | 8 bytes | First 8 bytes of SHA-256 hash of master key |

### Key Derivation

Per-chunk keys are derived using **HKDF** (HMAC-based Key Derivation Function):

```
derived_key = HKDF-SHA256(
    input_key_material = master_key,
    salt = random_16_bytes,
    info = "codevault-chunk-v1",
    output_length = 32
)
```

This ensures each chunk uses a unique encryption key even when the master key is the same.

### Payload Format

Encrypted files follow this binary format:

**Version 2 (Current):**
```
+-------------------+
| Magic Header (8)  |  "CVAULTE1"
+-------------------+
| Version (1)       |  0x02
+-------------------+
| Key ID (8)        |  First 8 bytes of SHA-256(master_key)
+-------------------+
| Salt (16)         |  Random salt for HKDF
+-------------------+
| IV (12)           |  Random initialization vector
+-------------------+
| Ciphertext (var)  |  Encrypted gzip-compressed data
+-------------------+
| Auth Tag (16)     |  GCM authentication tag
+-------------------+
```

**Version 1 (Legacy):**
```
+-------------------+
| Magic Header (8)  |  "CVAULTE1"
+-------------------+
| Version (1)       |  0x01
+-------------------+
| Salt (16)         |  Random salt for HKDF
+-------------------+
| IV (12)           |  Random initialization vector
+-------------------+
| Ciphertext (var)  |  Encrypted gzip-compressed data
+-------------------+
| Auth Tag (16)     |  GCM authentication tag
+-------------------+
```

The key ID in Version 2 enables efficient key selection during decryption when multiple keys are configured.

### Security Features

#### Nonce Reuse Prevention

The system maintains an LRU cache of recently used nonces (key ID + salt + IV combinations) to prevent IV reuse, which would compromise confidentiality. If a collision is detected after 3 generation attempts, encryption aborts with error code `ENCRYPTION_IV_REUSE`.

#### Key ID Matching

Version 2 payloads include a key identifier (first 8 bytes of SHA-256 hash of the master key). During decryption:
1. The system extracts the key ID from the payload
2. Matching keys are tried first for efficiency
3. Non-matching keys are tried as fallback for backward compatibility

#### Authentication

GCM mode provides authenticated encryption. Any tampering with the ciphertext, IV, or salt is detected via the authentication tag, resulting in error code `ENCRYPTION_AUTH_FAILED`.

## Key Rotation

CodeVault supports key rotation through deprecated keys:

```bash
# Set new primary key
export CODEVAULT_ENCRYPTION_KEY="new-key-here"

# Add old keys as deprecated (comma-separated)
export CODEVAULT_ENCRYPTION_DEPRECATED_KEYS="old-key-1,old-key-2"
```

When reading encrypted chunks:
1. The system attempts decryption with the primary key first
2. If that fails (or key ID does not match), deprecated keys are tried in order
3. Version 2 payloads use key ID matching for efficient key selection

To complete a key rotation:
1. Set the new key as primary and old key as deprecated
2. Re-index the codebase to encrypt all chunks with the new key
3. Once re-indexing is complete, remove the deprecated key

## API Reference

### Writing Chunks

```typescript
import { writeChunkToDisk, resolveEncryptionPreference } from './storage/encrypted-chunks';

const encryption = resolveEncryptionPreference({ mode: 'on' });

const result = await writeChunkToDisk({
  chunkDir: '/path/to/chunks',
  sha: 'abc123...',
  code: 'function example() { ... }',
  encryption
});

console.log(result);
// { encrypted: true, path: '/path/to/chunks/abc123.gz.enc' }
```

### Reading Chunks

```typescript
import { readChunkFromDisk } from './storage/encrypted-chunks';

const result = await readChunkFromDisk({
  chunkDir: '/path/to/chunks',
  sha: 'abc123...'
  // key and keySet are optional; defaults to environment configuration
});

if (result) {
  console.log(result.code);      // The decompressed source code
  console.log(result.encrypted); // Whether the chunk was encrypted
}
```

### Checking Encryption Status

```typescript
import { isChunkEncryptedOnDisk, getActiveEncryptionKey } from './storage/encrypted-chunks';

// Check if a specific chunk is encrypted
const isEncrypted = isChunkEncryptedOnDisk('/path/to/chunks', 'abc123...');

// Check if encryption is configured
const hasKey = getActiveEncryptionKey() !== null;
```

### Resolving Encryption Preference

```typescript
import { resolveEncryptionPreference } from './storage/encrypted-chunks';

// Returns { enabled: boolean, key: Buffer | null, reason: string }
const pref = resolveEncryptionPreference({ mode: 'on' });

// Reason values:
// - 'flag_off': Encryption explicitly disabled via --encrypt off
// - 'enabled': Encryption enabled with valid key
// - 'missing_key': No key configured (encryption disabled)
// - 'invalid_key': Key configured but invalid format (encryption disabled)
```

### Removing Chunks

```typescript
import { removeChunkArtifacts } from './storage/encrypted-chunks';

// Removes both .gz and .gz.enc files for the given SHA
await removeChunkArtifacts('/path/to/chunks', 'abc123...');
```

## Error Codes

| Code | Description |
|------|-------------|
| `ENCRYPTION_KEY_REQUIRED` | Encrypted chunk found but no key is configured |
| `ENCRYPTION_KEY_NOT_FOUND` | Chunk was encrypted with a key that is not available |
| `ENCRYPTION_KEY_ID_MISMATCH` | Key ID in payload does not match the provided key |
| `ENCRYPTION_AUTH_FAILED` | GCM authentication failed (data corrupted or wrong key) |
| `ENCRYPTION_IV_REUSE` | IV collision detected during encryption |
| `ENCRYPTION_FORMAT_UNRECOGNIZED` | Encrypted file has invalid or unknown header |
| `ENCRYPTION_VERSION_UNSUPPORTED` | Encryption version newer than supported |
| `ENCRYPTION_PAYLOAD_INVALID` | Encrypted payload is truncated or malformed |
| `ENCRYPTION_DECRYPT_FAILED` | Generic decryption failure |
| `CHUNK_DECOMPRESSION_FAILED` | Gzip decompression failed after decryption |
| `CHUNK_READ_FAILED` | Failed to read plaintext chunk file |

## Best Practices

### Security

1. **Never commit encryption keys** to version control
2. **Use environment variables** or secure secret management for keys
3. **Rotate keys periodically** using the deprecated keys mechanism
4. **Verify decryption** after key rotation by searching the indexed codebase

### Performance

1. **Encryption adds minimal overhead** due to hardware AES acceleration on modern CPUs
2. **Key derivation is per-chunk** but uses efficient HKDF
3. **Key caching** refreshes every 5 seconds to pick up environment changes
4. **Nonce tracking** uses an LRU cache (100,000 entries) to bound memory usage

### Operational

1. **Test encryption locally** before deploying to production
2. **Back up encryption keys** securely before any key rotation
3. **Monitor for decryption errors** during key rotation periods
4. **Complete re-indexing** after key rotation to update all chunks

## Troubleshooting

### "Chunk is encrypted and no CODEVAULT_ENCRYPTION_KEY is configured"

The indexed data contains encrypted chunks but no key is set. Set the `CODEVAULT_ENCRYPTION_KEY` environment variable with the correct key.

### "Chunk was encrypted with key id X but no matching key is configured"

The chunk was encrypted with a key that is no longer available. Add the original key to `CODEVAULT_ENCRYPTION_DEPRECATED_KEYS` to enable decryption.

### "Failed to decrypt chunk: authentication failed"

Either the key is wrong or the encrypted file is corrupted. Verify the key is correct. If the file is corrupted, re-index the affected source files.

### "CODEVAULT_ENCRYPTION_KEY must be a 32-byte key encoded as base64 or hex"

The configured key is not valid. Ensure the key is exactly 32 bytes when decoded from base64 or hex.
