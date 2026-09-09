// Auth provider surface for the lifted auth-ui components.
//
// The better-auth-ui registry items talk to `useAuth()` from their own
// package; here that contract is satisfied by our JWT store, which already
// owns the token, the boot-time /whoami and every auth mutation.
// Scope note: the forgot/reset-password registry items are not lifted - our
// FastAPI + JWT backend ships no reset endpoint, so those cards would be dead
// code that 404s on submit.
// observation point: `ui.auth.provider`.
export { AuthProvider, useAuth } from '../../lib/store';
export type { AuthState } from '../../lib/store';
