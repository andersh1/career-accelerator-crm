// Auth protection is handled server-side in (crm)/layout.tsx via getServerSession.
// This file is intentionally empty — no edge middleware needed.
export function middleware() {}
export const config = { matcher: [] };
