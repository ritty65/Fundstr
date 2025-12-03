# Comprehensive Analysis and Gameplan: NIP-07 Connection Failure on Welcome Page

## 1. Problem Identification

**Symptom:**
The user sees the error message "Extension connection failed. Make sure a NIP-07 extension is installed and try again." despite the UI stating "NIP-07 detected. Click connect to unlock it."

**Root Cause Analysis:**
A race condition exists between the application's boot process, the `WelcomeSlideNostr` component's polling interval, and the user's interaction with the "Connect" button.

1.  **Boot Phase:** On application startup, `src/boot/ndk.ts` initializes the Nostr store by calling `nostrStore.initSignerIfNotSet()`. This calls `checkNip07Signer()`. Since the browser extension (`window.nostr`) is often not yet injected at this very early stage, the check fails, and `nostrStore.nip07LastFailureCause` is set to `'extension-missing'`.

2.  **Welcome Page Load:** The `WelcomeSlideNostr.vue` component mounts and starts a polling interval (`refreshNip07Status`) every 500ms.

3.  **Extension Injection:** The extension injects `window.nostr`. The `WelcomeSlideNostr` component detects this via `Boolean(window.nostr)` and updates the UI to "NIP-07 detected".

4.  **Polling Check:** The interval triggers `refreshNip07Status`. It sets `checkingNip07.value = true` and calls `nostr.checkNip07Signer(false)`. This starts an asynchronous check in the store. This check might take some time (e.g., waiting for `enable()` or user approval).

5.  **User Interaction:** The user clicks "Connect". The handler `connectNip07` is called.

6.  **The Bug:** `connectNip07` calls `await refreshNip07Status(true)`.
    *   Inside `refreshNip07Status`, the guard `if (checkingNip07.value) return` triggers because the *polling check* (Step 4) is still running.
    *   The function returns immediately (resolving to `undefined`) without waiting for the actual check to complete or starting a new forced check.

7.  **Failure:** `connectNip07` continues immediately. It checks `nip07Available.value`, which is still `false` (either default or from the failed boot check). It throws an error.
    *   The error handling logic calls `resolveNip07Error()`.
    *   It reads `nostr.nip07LastFailureCause`. Since the *current* polling check hasn't finished/updated the status yet, it reads the *stale* value from the Boot Phase (Step 1), which is `'extension-missing'`.
    *   This results in the confusing error message claiming the extension is missing, contradicting the UI.

## 2. Weak Points & Gaps

*   **Fragile State Management:** The `WelcomeSlideNostr` component relies on a boolean flag (`checkingNip07`) to prevent concurrent checks but does not properly queue or await the active check when a forced refresh is requested.
*   **Stale Error State:** The `nostr` store persists the `nip07LastFailureCause` indefinitely until a new check *completes*, leading to stale error messages during intermediate states.
*   **Race Condition:** The boot-time check is almost guaranteed to fail for NIP-07, priming the store with a "failure" state that persists until the user interaction flow completes a successful check.

## 3. Gameplan

The goal is to ensure that when the user clicks "Connect", the application awaits the result of a fresh or ongoing valid check before determining success/failure.

### Step 1: Fix `WelcomeSlideNostr.vue` Race Condition
*   Refactor `refreshNip07Status` to return a `Promise`.
*   Replace the `checkingNip07` boolean guard with a promise-based lock. If a check is already in progress, `refreshNip07Status` should return the existing promise so `connectNip07` waits for it to resolve.
*   Ensure that `force=true` is respected: if a background check is running but a forced check is requested, we should ideally ensure the running check satisfies the requirement or chain a new one (though simply awaiting the running one is usually sufficient as `checkNip07Signer` handles concurrency).

### Step 2: Verification
*   Since E2E tests for extensions are difficult, verification will rely on code analysis and potentially unit tests if feasible.
*   The logic change ensures `await refreshNip07Status(true)` actually awaits a result.

## 4. Superprompt for Coding AI

```markdown
**Task:** Fix Race Condition in `WelcomeSlideNostr.vue` causing False Negative NIP-07 Connection Errors

**Context:**
Users encounter an "Extension connection failed" error when clicking "Connect" on the Welcome page, even when the UI shows "NIP-07 detected". This is caused by a race condition where `connectNip07` returns early because a background polling check is active, resulting in the code reading a stale `'extension-missing'` failure cause from app boot.

**Objectives:**
1.  Refactor `refreshNip07Status` in `src/pages/welcome/WelcomeSlideNostr.vue`.
2.  Instead of returning early when `checkingNip07` is true, return the *promise* of the ongoing check.
3.  Ensure `connectNip07` awaits the actual completion of the check before proceeding to evaluate `nip07Available`.

**Implementation Details:**
*   Change `refreshNip07Status` to return `Promise<void>`.
*   Introduce a `refreshPromise` variable (or similar mechanism) to track the active async operation.
*   In `refreshNip07Status`:
    *   If `refreshPromise` exists, return it.
    *   Otherwise, assign the async operation to `refreshPromise`.
    *   Ensure `refreshPromise` is cleared in a `finally` block.
    *   Within the operation, call `await nostr.checkNip07Signer(force)`.
*   This ensures that `await refreshNip07Status(true)` in `connectNip07` blocks until the check (background or foreground) is finished, ensuring `nostr.nip07LastFailureCause` and `nip07Available` are up-to-date.

**File to Modify:**
*   `src/pages/welcome/WelcomeSlideNostr.vue`
```
