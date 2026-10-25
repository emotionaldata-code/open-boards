export async function http<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: 'same-origin',
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'The server is unavailable.' }));
    throw new Error(error.message ?? 'Request failed.');
  }
  return response.status === 204 ? (undefined as T) : (response.json() as Promise<T>);
}
