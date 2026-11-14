// Minimal JSON-Schema check for tool inputs. With eager input streaming the API no longer
// validates tool arguments, and the SDK's tolerant parser can hand back a silently truncated
// object — so every input is checked here before a tool runs. Returns a problem string or null.

type Schema = { type?: string; properties?: Record<string, Schema>; required?: string[]; items?: Schema; enum?: unknown[] };

export function validateInput(schema: Record<string, unknown>, input: unknown, path = 'input'): string | null {
  const s = schema as Schema;
  if (s.type === 'object') {
    if (!input || typeof input !== 'object' || Array.isArray(input)) return `${path} must be an object`;
    const obj = input as Record<string, unknown>;
    for (const k of s.required ?? []) if (obj[k] === undefined || obj[k] === null) return `${path}.${k} is required`;
    for (const [k, sub] of Object.entries(s.properties ?? {})) {
      if (obj[k] === undefined) continue;
      const p = validateInput(sub as Record<string, unknown>, obj[k], `${path}.${k}`);
      if (p) return p;
    }
    return null;
  }
  if (s.type === 'array') {
    if (!Array.isArray(input)) return `${path} must be an array`;
    if (s.items) for (let i = 0; i < input.length; i++) { const p = validateInput(s.items as Record<string, unknown>, input[i], `${path}[${i}]`); if (p) return p; }
    return null;
  }
  if (s.type === 'string' && typeof input !== 'string') return `${path} must be a string`;
  if ((s.type === 'number' || s.type === 'integer') && typeof input !== 'number') return `${path} must be a number`;
  if (s.type === 'boolean' && typeof input !== 'boolean') return `${path} must be a boolean`;
  if (s.enum && !s.enum.includes(input)) return `${path} must be one of ${s.enum.join(', ')}`;
  return null;
}
