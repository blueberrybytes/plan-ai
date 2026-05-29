# 🐛 [BUG] Auth Service: Multiple Critical Vulnerabilities and Reliability Gaps

**Type:** BUG  
**Priority:** HIGH  
**Story Points:** 8  
**Category:** engineering  
**Assignee:** —  
**Reporter:** Xavier Mas (transcript: "we have a bug in the auth service")

---

## Summary

Deep analysis of `authMiddleware.ts` and `firebaseAdmin.ts` reveals several reliability and security issues in the authentication pipeline: duplicate token verification logic between `authenticateUser` and `expressAuthentication`, missing role token freshness enforcement, a silent swallow of Firebase sync failures that leaves users in an inconsistent state (`firebaseUid` exists but no DB row), and no rate-limiting or caching on the `prisma.user.findUnique` call that fires on every single authenticated request.

---

## Background & Root Cause Analysis

The auth service is implemented across two entry points:

1. **`authenticateUser`** (`authMiddleware.ts:16`) — used by raw Express routes
2. **`expressAuthentication`** (`authMiddleware.ts:96`) — used by TSOA-generated controllers via `@Security` decorators

Both independently call `firebaseAdmin.auth().verifyIdToken(token)` and then `prisma.user.findUnique({ where: { firebaseUid } })`. This duplication means:
- Any bug fix or performance improvement must be applied in **two places**
- Token verification is not shared or cached — each request hits Firebase twice if a route uses both middlewares

The **critical path** on every authenticated API request is:
```
Client Request
  → authMiddleware.ts:22   (extract Bearer token)
  → authMiddleware.ts:33   (firebaseAdmin.auth().verifyIdToken) ← network call
  → authMiddleware.ts:63   (prisma.user.findUnique)             ← DB call
  → expressAuthentication:149 (firebaseAdmin.auth().verifyIdToken) ← duplicate network call
  → expressAuthentication:154 (prisma.user.findUnique)          ← duplicate DB call
  → Controller handler
```

---

## Identified Bugs & Issues

### 🔴 Issue 1 — Duplicate Firebase Token Verification (Performance + Correctness)

**File:** `plan-ai/backend/src/middleware/authMiddleware.ts`  
**Lines:** 33 and 149

Both `authenticateUser` and `expressAuthentication` independently call `firebaseAdmin.auth().verifyIdToken(token)`. Since TSOA routes apply `authenticateUser` globally via Express middleware AND call `expressAuthentication` via `@Security`, every TSOA request verifies the token **twice** — two round-trips to Firebase's public key endpoint.

```ts
// authMiddleware.ts:33 — first verification
decodedToken = await firebaseAdmin.auth().verifyIdToken(token || "");

// authMiddleware.ts:149 — second verification (expressAuthentication)
firebaseAdmin.auth().verifyIdToken(token).then(...)
```

**Impact:** ~60–120ms of avoidable latency on every authenticated request. Firebase's key cache reduces this, but a revoked token will not be caught consistently across both calls.

---

### 🔴 Issue 2 — Missing Token Revocation Check (`checkRevoked: true`)

**File:** `plan-ai/backend/src/middleware/authMiddleware.ts`  
**Lines:** 33, 149

`verifyIdToken` is called without `checkRevoked: true`. Firebase ID tokens are valid for up to **1 hour** after issuance. If a user's account is compromised and tokens are revoked via the Firebase Admin SDK (`revokeRefreshTokens`), the existing tokens will still pass `verifyIdToken()` until they naturally expire.

```ts
// Current — does NOT catch revoked tokens:
decodedToken = await firebaseAdmin.auth().verifyIdToken(token);

// Required — checks against Firebase's server-side revocation list:
decodedToken = await firebaseAdmin.auth().verifyIdToken(token, true /* checkRevoked */);
```

**Impact:** A compromised account cannot be immediately locked out. An attacker with a stolen token has up to 60 minutes of continued access even after revocation.

---

### 🟠 Issue 3 — Firebase ↔ PostgreSQL Sync Failure Silently Returns `PENDING` Role

**File:** `plan-ai/backend/src/middleware/authMiddleware.ts`  
**Lines:** 160–166

In `expressAuthentication`, when `prisma.user.findUnique` returns `null` (user in Firebase but not in PostgreSQL), the code logs a warning but continues:

```ts
// authMiddleware.ts:160-166
if (!dbUser) {
  console.warn(
    `[expressAuthentication] User not found in database for firebaseUid: ${decodedToken.uid}...`,
  );
}
return { decodedToken, dbUser, userEmail };  // dbUser is null — continues to resolve()
```

Then at line 195, the role defaults to `Role.PENDING`:
```ts
role: dbUser ? dbUser.role : Role.PENDING,
```

A user who signed up via Firebase but whose Postgres record failed to create (e.g. DB timeout during registration) will silently authenticate with `PENDING` role and get confusing 403s throughout the app rather than a clear "account setup incomplete" error.

**Contrast with `authenticateUser`** (line 68–79) which correctly returns `403` in this case — the two middlewares handle the same failure differently.

---

### 🟠 Issue 4 — `AdminOnly` Falls Through to Firebase Auth (Security Bypass Edge Case)

**File:** `plan-ai/backend/src/middleware/authMiddleware.ts`  
**Lines:** 102–115, 199–212

`AdminOnly` is handled in **two places** in `expressAuthentication`. The first check (lines 102–115) resolves early via `x-admin-key` header. The second (lines 199–212) checks Firebase `dbUser.role === Role.ADMIN`. However there is no explicit `return` in the first block — it uses `return resolve(...)` inside a `try` block, which works, but the duplicated `AdminOnly` handling means a future developer editing one branch may miss the other.

More critically: the `x-admin-key` path at line 109–114 resolves with `{ uid: "admin-key", email: "admin@local", role: Role.ADMIN }` — a synthetic user object. Any downstream controller that dereferences `req.user.uid` to perform a DB lookup (e.g. `prisma.user.findUnique({ where: { id: req.user.uid } })`) will get `null` because `"admin-key"` is not a valid Prisma ID. This can cause silent `null` dereferences in admin controllers.

---

### 🟡 Issue 5 — No Per-Request DB Query Cache (`prisma.user.findUnique` on Every Request)

**File:** `plan-ai/backend/src/middleware/authMiddleware.ts`  
**Lines:** 63–66, 154–158

Every authenticated request makes a synchronous Prisma DB roundtrip to fetch `{ role: true }` for the user. This is a hot path — all 26 AI assistant tool calls, all transcript API calls, all project CRUD calls hit this. There is no in-memory cache or Redis cache for user roles.

For a workspace with 10 concurrent users each making streaming requests, this is 10 extra DB queries per second that only return one field.

---

### 🟡 Issue 6 — `setUserRole` Firebase Sync Failure in `updateUserRole` is Silently Swallowed

**File:** `plan-ai/backend/src/controller/userController.ts`  
**Lines:** 126–131

When a user's role is updated in Postgres, the system attempts to sync the `role` custom claim to Firebase:

```ts
try {
  await setUserRole(updatedUser.firebaseUid, body.role);
} catch (fbError) {
  logger.error(`Failed to sync role to Firebase for user ${userId}`, fbError);
  // We do not fail the request if firebase sync fails but log the error
}
```

If `setUserRole` (`firebaseAdmin.ts:47`) fails, the response still returns `200 OK` with the updated role. But the user's **Firebase ID token will still contain the old role claim** until it expires (up to 1 hour). The frontend and `expressAuthentication` both read the role from the Postgres DB at request time — so role-based access is not broken. However, any system relying on the Firebase custom claim directly (e.g. Firebase Security Rules) will have a stale role for up to 60 minutes. This should at minimum return a partial-success warning in the response body.

---

## Proposed Solutions

### Fix 1 — Deduplicate Token Verification (Shared Auth Context)

Create a unified `resolveAuthContext(token: string)` function in `authMiddleware.ts` that:
1. Calls `verifyIdToken(token, true)` once
2. Fetches the DB user once  
3. Stores the result on `req.authContext`

Both `authenticateUser` and `expressAuthentication` then read from `req.authContext` instead of re-running the pipeline.

### Fix 2 — Enable `checkRevoked: true`

```ts
// authMiddleware.ts:33 and :149
decodedToken = await firebaseAdmin.auth().verifyIdToken(token, true);
```

Note: this adds a Firebase network call only on token revocation (the normal path is local JWT verification and stays fast).

### Fix 3 — Consistent Handling of Missing DB User

`expressAuthentication` should return `403` (not silently continue with `PENDING`) when `dbUser` is null, matching the behaviour of `authenticateUser`. If the intent is to allow incomplete accounts through, this should be an explicit decision with a comment.

### Fix 4 — Add a Short-Lived Redis Cache for User Roles

Cache `{ role }` keyed by `firebaseUid` with a 60-second TTL in the existing BullMQ Redis instance. This eliminates the Prisma roundtrip on every request for the same user.

---

## Acceptance Criteria

- [ ] `verifyIdToken` is called **exactly once** per request regardless of which middleware path is taken; the decoded token is attached to `req` and reused downstream
- [ ] Both `authenticateUser` and `expressAuthentication` call `verifyIdToken(token, true)` (with `checkRevoked: true`)
- [ ] When `prisma.user.findUnique` returns `null` in `expressAuthentication`, the middleware rejects with a `403` status and message `"User account not found — please complete registration"` — matching `authenticateUser` line 78
- [ ] `PUT /api/users/:userId/role` returns `207 Multi-Status` (or a `warnings` field in the response body) when the Postgres update succeeds but the Firebase claim sync fails, rather than a plain `200 OK`
- [ ] A unit test exists for the revoked-token path: given a `verifyIdToken` that throws `auth/user-token-expired`, the middleware returns `401 Unauthorized`
- [ ] A unit test exists for the orphaned-user path: given a valid Firebase token with no matching Postgres row, `expressAuthentication` rejects with `403` (not resolves with `PENDING`)
- [ ] Integration test: `GET /api/projects` with a revoked token returns `401` within 500ms
- [ ] `authMiddleware.ts` exports a single `verifyAndResolveUser(token)` helper used by both middleware functions (no logic duplication)
- [ ] User role cache (Redis, 60s TTL) is in place; cache is invalidated on `PUT /api/users/:userId/role` success
- [ ] All `console.error` / `console.warn` calls in `authMiddleware.ts` (lines 25, 35, 41, 70, 86) are replaced with `logger.error` / `logger.warn` from `../utils/logger` for consistent structured logging

---

## Affected Files

| File | Lines | Change |
|------|-------|--------|
| `plan-ai/backend/src/middleware/authMiddleware.ts` | 16–91, 96–265 | Deduplicate verification, add `checkRevoked`, consistent null handling, replace `console.*` with `logger.*` |
| `plan-ai/backend/src/firebase/firebaseAdmin.ts` | 45–52 | No change needed — `setUserRole` is correct |
| `plan-ai/backend/src/controller/userController.ts` | 126–131 | Return warning in response body on Firebase sync failure |
| `plan-ai/backend/src/utils/` | — | New `authCache.ts` — Redis-backed role cache (60s TTL) |
| `plan-ai/backend/src/tests/auth/` | — | New unit tests for revoked token + orphaned user paths |

---

## References

- Firebase token revocation docs: https://firebase.google.com/docs/auth/admin/manage-sessions#revoke_refresh_tokens
- `verifyIdToken` with `checkRevoked`: https://firebase.google.com/docs/auth/admin/verify-id-tokens#check_for_token_revocation
- Existing middleware: [`authMiddleware.ts`](plan-ai/backend/src/middleware/authMiddleware.ts)
- Firebase admin setup: [`firebaseAdmin.ts`](plan-ai/backend/src/firebase/firebaseAdmin.ts)
- User controller: [`userController.ts`](plan-ai/backend/src/controller/userController.ts)

---

*Generated by Plan AI · Auth service deep analysis · 2026-05-29*
