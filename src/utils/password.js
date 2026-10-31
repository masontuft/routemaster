import bcrypt from "bcrypt";

const ROUNDS = 12;

// bcrypt only reads the first 72 bytes, so longer passwords are rejected at validation time.
export const MAX_PASSWORD_BYTES = 72;

export function hashPassword(password) {
    return bcrypt.hash(password, ROUNDS);
}

export function verifyPassword(password, hash) {
    return bcrypt.compare(password, hash);
}
