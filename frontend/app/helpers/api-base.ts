/** Choose the private container URL for SSR and the public URL in browsers. */
export function resolveApiBase(publicUrl: string, internalUrl: string, server: boolean): string {
  const base = server && internalUrl ? internalUrl : publicUrl;
  return `${base.replace(/\/+$/, '')}/api`;
}
