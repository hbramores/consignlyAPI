const crypto = require("crypto");

const HASH_PREFIX = "pbkdf2";
const HASH_ITERATIONS = 310000;
const KEY_LENGTH = 32;
const DIGEST = "sha256";

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("base64");
  const hash = crypto
    .pbkdf2Sync(password, salt, HASH_ITERATIONS, KEY_LENGTH, DIGEST)
    .toString("base64");

  return `${HASH_PREFIX}$${HASH_ITERATIONS}$${salt}$${hash}`;
}

function isHashedPassword(value) {
  return typeof value === "string" && value.startsWith(`${HASH_PREFIX}$`);
}

function verifyPassword(password, storedPassword) {
  if (!isHashedPassword(storedPassword)) {
    return password === storedPassword;
  }

  const parts = storedPassword.split("$");

  if (parts.length !== 4) {
    return false;
  }

  const [, iterations, salt, storedHash] = parts;
  const hash = crypto
    .pbkdf2Sync(password, salt, Number(iterations), KEY_LENGTH, DIGEST)
    .toString("base64");

  const storedBuffer = Buffer.from(storedHash);
  const hashBuffer = Buffer.from(hash);

  if (storedBuffer.length !== hashBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(storedBuffer, hashBuffer);
}

module.exports = {
  hashPassword,
  isHashedPassword,
  verifyPassword,
};
