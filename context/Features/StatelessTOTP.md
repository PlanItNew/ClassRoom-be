# Stateless Time-Window TOTP System Architecture & Specification

## 1. Overview
The application implements a stateless, time-window-based One-Time Password (TOTP) utility using RFC 6238 specifications. OTPs are derived dynamically from a static server secret key and a dynamic user identifier/secret, eliminating the need to persist active OTP records in a database.

---

## 2. Mathematical Time Block Rounding

The core of the stateless design relies on discrete time block rounding. Any continuous Unix timestamp (in seconds) is rounded down to the starting timestamp of its current time block:

$$t\_window = \lfloor \frac{\text{Current\_Timestamp}}{\text{Window\_Size}} \rfloor \times \text{Window\_Size}$$

### Example
- **Current Unix Timestamp**: `1784581142` (representing 08:59:02 PM)
- **Window Size**: `300` seconds (5-minute block)
- **Division**: `1784581142 / 300 = 5948603.806`
- **Floor**: `floor(5948603.806) = 5948603`
- **Multiplication**: `5948603 * 300 = 1784580900` (representing 08:55:00 PM)

Every single second between **08:55:00 PM** and **08:59:59 PM** yields the exact same timestamp (`1784580900`), guaranteeing identical OTP generation across the 5-minute block.

---

## 3. Deterministic Secret Derivation (`getCombinedSecret`)

To maintain statelessness while ensuring uniqueness per user, secret keys are derived deterministically:

$$\text{CombinedSecret} = \text{Base32}(\text{SHA-256}(\text{ServerSecret} : \text{UserSecret}))$$

1. Concatenates the static server secret (`OTP_SECRET_KEY`) with the user identifier or user secret.
2. Hashes the string using SHA-256 to produce a 32-byte binary payload.
3. Encodes the 32-byte payload into a standard Base32 string using `ScureBase32Plugin` to meet RFC 6238 TOTP requirements.

---

## 4. Latency Handling & Look-Back Validation (`epochTolerance`)

To handle network transmission delays and client-server clock drift (e.g., when an OTP is requested at `11:59:59` PM and submitted at `12:00:30` AM), the system configures `epochTolerance` in `otplib`:

- **Tolerance Tuple**: `[pastSec, futureSec]`
- **`pastSec`**: Accepts tokens generated up to `lookBack * timeWindow` seconds in the past (e.g., 300 seconds for 1 look-back block).
- **`futureSec`**: `0` (future tokens are strictly rejected).

---

## 5. Singleton Utility Class (`TimeWindowOTP`)

The implementation resides in [`src/utils/totp.class.ts`](file:///Users/kaif/Desktop/Projects/edu-be/src/utils/totp.class.ts):

- **Singleton Access**: Exported instance `totpUtil` derived from `TimeWindowOTP.getInstance()`.
- **Environment Integration**: Integrates directly with `appConfig.otp_secret_key`, `appConfig.time_window`, `appConfig.look_back`, and `appConfig.look_forward`.
- **Methods**:
  - `generateOtp(userSecret: string): Promise<string>`: Generates a 6-digit TOTP string for the user.
  - `verifyOtp(userSecret: string, token: string): Promise<boolean>`: Verifies user-submitted token with look-back validation.
  - `getTimeWindow(timestampInSeconds?: number): number`: Returns the rounded window timestamp in seconds.
  - `getCombinedSecret(userSecret: string): string`: Computes the Base32 derived secret.

---

## 6. Usage Example

```typescript
import { totpUtil } from "../utils/totp.class.js";

// Generate OTP for a user
const otp = await totpUtil.generateOtp("user_id_123");

// Verify OTP submitted by user
const isValid = await totpUtil.verifyOtp("user_id_123", otp);
```
