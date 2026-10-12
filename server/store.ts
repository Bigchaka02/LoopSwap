// Compatibility entrypoint; one persistence implementation owns all mutations.
export { rawDb, readSnapshot, mutate, sha256, canonicalJson, reconcileDatabase } from './storage';
