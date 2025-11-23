const SENSITIVE_FIELDS = [
  "password",
  "api_key",
  "apiKey",
  "token",
  "secret",
  "auth",
  "authorization",
  "key",
];

/**
 * Redacts sensitive fields from a JSON string or plain text.
 * Replaces values of sensitive fields with "***".
 */
export function redactSensitiveData(data: string): string {
  try {
    const parsed = JSON.parse(data);
    const redacted = redactObject(parsed);
    return JSON.stringify(redacted);
  } catch {
    // If not valid JSON, use text-based redaction
    return redactPlainText(data);
  }
}

function redactPlainText(text: string): string {
  let result = text;

  // Redact patterns like key=value, key: value, "key":"value"
  for (const field of SENSITIVE_FIELDS) {
    // Match key=value or key:value patterns (URL-encoded, form data, etc.)
    result = result.replace(
      new RegExp(`(${field})=([^&\\s]+)`, 'gi'),
      '$1=***'
    );
    result = result.replace(
      new RegExp(`(${field}):\\s*([^,\\s\\n}]+)`, 'gi'),
      '$1: ***'
    );
    // Match "key":"value" patterns
    result = result.replace(
      new RegExp(`("${field}"\\s*:\\s*")([^"]+)(")`, 'gi'),
      '$1***$3'
    );
  }

  return result;
}

function redactObject(obj: unknown): unknown {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(redactObject);
  }

  if (typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (isSensitiveField(key)) {
        result[key] = "***";
      } else {
        result[key] = redactObject(value);
      }
    }
    return result;
  }

  return obj;
}

function isSensitiveField(fieldName: string): boolean {
  const lowerField = fieldName.toLowerCase();
  return SENSITIVE_FIELDS.some((sensitive) =>
    lowerField.includes(sensitive.toLowerCase())
  );
}
