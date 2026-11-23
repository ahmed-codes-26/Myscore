/**
 * Placeholder admin authorization middleware.
 * Currently calls next() as specified for Phase 4.
 * Can be replaced with JWT or PIN verification later.
 */
export function requireAdmin(req, res, next) {
  next();
}
