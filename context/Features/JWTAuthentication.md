# JWT Authentication System Architecture & Specification

## 1. Overview
The application implements a secure, dual-cookie JWT (JSON Web Token) authentication architecture using short-lived Access Tokens (30 minutes) and long-lived Refresh Tokens (10 days). Raw refresh tokens are never stored in the database; only SHA-256 hashes are persisted to prevent credential exposure in case of database leaks.

---

## 2. Database Schema (`refresh_tokens`)

```sql
CREATE TABLE refresh_tokens (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL
);
```

- **`userId`**: Primary key referencing `users.id` (one active refresh token session per user).
- **`token_hash`**: SHA-256 hex digest of the issued refresh token.
- **Timing-Safe Verification**: Verified using `crypto.timingSafeEqual` via `verifyHashedToken` helper to prevent timing attacks.

---

## 3. Token Specifications & Dual-Cookie Delivery

### Access Token (`jwt` Cookie)
- **Lifetime**: 30 minutes (`JWT_ACCESS_EXPIRY`)
- **Payload**: `{ userId: string, iat: number, exp: number }`
- **Delivery**: Set in `jwt` HTTP-only cookie.
- **Cookie Security**: `httpOnly: true`, `sameSite: "strict"`, `secure: production`.

### Refresh Token (`refresh_token` Cookie)
- **Lifetime**: 10 days (`JWT_REFRESH_EXPIRY`)
- **Payload**: `{ userId: string, iat: number, exp: number }`
- **Storage**: Raw token sent to client via `refresh_token` cookie; SHA-256 hash stored in DB (`refresh_tokens.token_hash`).
- **Cookie Security**: `httpOnly: true`, `sameSite: "strict"`, `secure: production`.

---

## 4. Authentication Flows

### 1. Signup (`POST /api/auth/register`)
- **Payload**: `{ userName, email, password, fullName, role }`
- **Role Allowlisting**: Validated strictly against allowed enum values (`TEACHER` or `STUDENT`). Arbitrary or unapproved roles are rejected with `400 Bad Request`.
- **User Creation**: Password hashed with `bcrypt` (salt rounds: 7). User created atomically within a database transaction.
- **Cookie Delivery**: Calls `issueTokensAndSetCookie(userId, res)` to issue both `jwt` and `refresh_token` cookies.

### 2. Login (`POST /api/auth/login`)
- **Payload**: `{ userName, password }`
- **Verification**: Looks up user by `userName` and verifies password using `bcrypt.compare`.
- **Token Issue & Storage**: Generates access & refresh tokens, hashes the refresh token using SHA-256, upserts `token_hash` into `refresh_tokens` table (`onConflictDoUpdate`), and sets both cookies (`jwt` and `refresh_token`).

### 3. Logout (`POST /api/auth/logout`)
- **Protected Endpoint**: Requires `authenticateToken` middleware.
- **Verified Identity**: `userId` is strictly derived from `req.user.id` (authenticated context).
- **Server Revocation**: Deletes the user's refresh token record from `refresh_tokens` table (`DELETE FROM refresh_tokens WHERE user_id = userId`).
- **Cookie Clearing**: Clears both `jwt` and `refresh_token` cookies via `res.clearCookie("jwt")` and `res.clearCookie("refresh_token")`.

---

## 5. Middleware & Automatic Token Refresh

### `authenticateToken` Middleware Flow
1. **Extract Token**: Extracts access token from `jwt` cookie (or `Authorization: Bearer` header).
2. **Verify Access Token**:
   - **Valid Access Token**: Fetches user details, populates `req.user`, and calls `next()`.
3. **Selective Expiration Handling**:
   - **`TokenExpiredError` (Only Expiration)**:
     1. Decodes access token to retrieve `userId`.
     2. Reads `refresh_token` cookie from client.
     3. Verifies `refresh_token` signature and expiration.
     4. Compares `userId` in access token vs refresh token payload.
     5. Fetches stored `token_hash` from DB for `userId`.
     6. Verifies refresh token hash using timing-safe comparison (`verifyHashedToken`).
     7. Re-issues a fresh 30-minute access token (`jwt` cookie), sets `req.user`, and calls `next()`.
   - **`JsonWebTokenError` / `NotBeforeError` (Malformed or Tampered Tokens)**:
     - Immediately rejects with `401 Unauthorized`. Does **NOT** attempt token refresh.

---

## 6. Role Authorization (`requireRole` Middleware)
- Protects endpoints by inspecting `req.user.role`.
- Grants access if role matches required permission (e.g. `TEACHER` or `STUDENT`), otherwise responds with `403 Forbidden`.
