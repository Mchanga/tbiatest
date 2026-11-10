import axios from "axios";

export const api = axios.create({
  baseURL: (
    import.meta.env.VITE_API_URL || "http://localhost:5000/api/v1"
  ).replace(/\/$/, ""),
  withCredentials: true,
  headers: { "Content-Type": "application/json" },
});

let accessToken: string | null = null;
let refreshRequest: Promise<string | null> | null = null;
export const setAccessToken = (token: string | null) => {
  accessToken = token;
};
export function refreshAccessToken(): Promise<string | null> {
  if (!refreshRequest) {
    refreshRequest = axios
      .post(
        `${api.defaults.baseURL}/auth/refresh`,
        {},
        { withCredentials: true },
      )
      .then((response) => {
        const token = response.data?.data?.accessToken ?? null;
        setAccessToken(token);
        return token;
      })
      .catch(() => {
        setAccessToken(null);
        return null;
      })
      .finally(() => {
        refreshRequest = null;
      });
  }
  return refreshRequest;
}
api.interceptors.request.use((config) => {
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`;
  return config;
});
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;
    if (
      error.response?.status === 401 &&
      original &&
      !original._refreshed &&
      !original.url?.includes("/auth/")
    ) {
      original._refreshed = true;
      try {
        await refreshAccessToken();
        if (accessToken)
          original.headers.Authorization = `Bearer ${accessToken}`;
        return api(original);
      } catch {
        setAccessToken(null);
      }
    }
    return Promise.reject(error);
  },
);

export type ApiEnvelope<T> = {
  success: boolean;
  data: T;
  message?: string;
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};
export function unwrap<T>(value: ApiEnvelope<T> | T): T {
  return value && typeof value === "object" && "data" in value
    ? (value as ApiEnvelope<T>).data
    : (value as T);
}
