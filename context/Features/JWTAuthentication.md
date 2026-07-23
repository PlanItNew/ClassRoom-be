# JWT Authentication Specification

## Overview
Using JWT (JSON Web Token) authentication method using access tokens and refresh tokens.

## Refresh Tokens Table
Create a table with a `userId`-based primary key to store users' refresh tokens.

## Token Specifications

### Access Token Specification
Payload carries:
1. `userId`
2. `iat` (issued at)
3. `exp` (expiration time: 30 minutes)

### Refresh Token Specification
Payload carries:
1. `userId`
2. `iat` (issued at)
3. `exp` (expiration time: 10 days)

Store refresh tokens in the database using `userId` as the primary key.

---

## Authentication Flows

### 1. Login
- **Payload Needed**:
  1. `userName`
  2. `password`
- **Actions**:
  1. Check `userName` and verify hashed password.
  2. Build a refresh token valid for 10 days and an access token valid for 30 minutes.
  3. Store the refresh token in the database.
- **Response**:
  1. Return the JWT as a secure cookie with `httpOnly`, `secure`, and `expires` (30 minutes), along with a success message.

### 2. Logout
- **Payload Needed**:
  1. `userName`
  2. JWT (Access Token)
- **Actions**:
  1. Delete the refresh token from the database.
- **Response**:
  1. Clear/unset the JWT cookie.

### 3. Signup (User Creation)
- **Payload Needed**:
  1. `userName`
  2. `email`
  3. `password`
  4. `fullName`
  5. `role`
- **Actions**:
  1. Hash the password.
  2. Create the user in the database.
- **Response**:
  1. Return the JWT as a secure cookie with `httpOnly`, `secure`, and `expires` (30 minutes), along with a success message.

---

## User Routes
1. `POST /login`
2. `POST /signup`
3. `POST /logout`

---

## Middleware

### Authentication Middleware
1. Validates the access token; if invalid or expired, attempts to refresh the token using the refresh token.
2. Applied to all protected routes (excluding `/login` and `/signup`).
