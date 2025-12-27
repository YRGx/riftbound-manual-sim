const API_BASE_URL = "https://api.riftcodex.com";

export type QueryParams = Record<string, string | number | undefined | null>;

export function buildRiftcodexUrl(path: string, params?: QueryParams) {
  const url = new URL(path, API_BASE_URL);
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value === undefined || value === null || value === "") {
        return;
      }
      url.searchParams.set(key, String(value));
    });
  }
  return url;
}

export async function fetchRiftcodexJson<T>(path: string, params?: QueryParams, init?: RequestInit) {
  const url = buildRiftcodexUrl(path, params);
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
    },
    ...init,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Riftcodex request failed (${response.status}): ${text || response.statusText}`);
  }

  return (await response.json()) as T;
}

export { API_BASE_URL };
