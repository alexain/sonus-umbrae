export const IDENTIFIER_SOURCE = '[A-Za-z][A-Za-z0-9_]*';
export const IDENTIFIER_PATTERN = new RegExp(`^${IDENTIFIER_SOURCE}$`);

export function isValidIdentifier(value: string): boolean {
  return IDENTIFIER_PATTERN.test(value);
}

export function invalidIdentifierMessage(value: string): string {
  return `invalid identifier '${value}': names must begin with a letter and may contain only letters, digits and _`;
}
