export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 6;
export const CODE_ATTEMPTS = 5;

export function generateAccessCode(): string {
  const bytes = new Uint8Array(CODE_LENGTH);
  crypto.getRandomValues(bytes);
  let code = '';
  for (const byte of bytes) {
    code += CODE_ALPHABET[byte % CODE_ALPHABET.length];
  }
  return code;
}

export function normalizeAccessCode(value: string): string {
  return value.trim().toUpperCase();
}

export function isValidAccessCode(value: string): boolean {
  return normalizeAccessCode(value).length === CODE_LENGTH;
}
