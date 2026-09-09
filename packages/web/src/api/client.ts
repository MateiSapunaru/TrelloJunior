export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

type RequestOptions = {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
};

// credentials: "include" is what makes the browser send the httpOnly auth cookie on
// cross-origin requests to the API (different port = different origin, even though
// same site) - without it every request would look logged-out regardless of the
// cookie set on login.
export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  // Read lazily (not as a module-level const) so tests can point this at a
  // different server per-test (e.g. a Pact mock provider) via vi.stubEnv,
  // without needing a dynamic import to dodge a value captured at module load.
  const apiUrl: string = import.meta.env.VITE_API_URL ?? "http://localhost:4000";
  const res = await fetch(`${apiUrl}${path}`, {
    method: options.method ?? "GET",
    headers: options.body !== undefined ? { "Content-Type": "application/json" } : undefined,
    credentials: "include",
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  const isJson = res.headers.get("content-type")?.includes("application/json") ?? false;
  const data: unknown = isJson ? await res.json() : undefined;

  if (!res.ok) {
    const message = isJson && data && typeof data === "object" && "error" in data ? String(data.error) : res.statusText;
    throw new ApiError(res.status, message);
  }

  return data as T;
}
