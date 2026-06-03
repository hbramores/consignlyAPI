const USERNAME_PATTERN = /^[A-Za-z0-9_]{3,30}$/;
const CODE_PATTERN = /^[A-Za-z0-9_-]{1,40}$/;
const NAME_PATTERN = /^[A-Za-z0-9\s.,'&()/_-]{1,100}$/;
const TEXT_PATTERN = /^[A-Za-z0-9\s.,'&()/#:;!?%+@_-]{0,255}$/;
const PHONE_PATTERN = /^[0-9+() -]{1,20}$/;

const isString = (value) => typeof value === "string";
const trimmed = (value) => (isString(value) ? value.trim() : "");

const isPositiveNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0;
};

const isInteger = (value) => {
  const number = Number(value);
  return Number.isInteger(number);
};

const isRequiredText = (value, pattern = TEXT_PATTERN) => {
  const text = trimmed(value);
  return text.length > 0 && pattern.test(text);
};

const isOptionalText = (value) => {
  const text = trimmed(value);
  return text.length === 0 || TEXT_PATTERN.test(text);
};

module.exports = {
  CODE_PATTERN,
  NAME_PATTERN,
  PHONE_PATTERN,
  TEXT_PATTERN,
  USERNAME_PATTERN,
  isInteger,
  isOptionalText,
  isPositiveNumber,
  isRequiredText,
  trimmed,
};
