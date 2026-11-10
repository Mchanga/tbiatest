import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { api, refreshAccessToken, setAccessToken, unwrap } from "../../lib/api";

export type User = {
  uid: string;
  full_name: string;
  email: string;
  phone?: string;
  region?: string;
  bio?: string;
  account_type?: string;
  status?: string;
  roleId?: string;
  roleIds?: string[];
  role_slugs?: string[];
  permissions?: string[];
};
type AuthContextValue = {
  user: User | null;
  ready: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (
    input: Record<string, unknown>,
  ) => Promise<{ verificationEmailSent: boolean }>;
  signOut: () => Promise<void>;
  refreshMe: () => Promise<void>;
};
const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const refreshMe = useCallback(async () => {
    try {
      const res = await api.get("/users/me");
      const profile = unwrap<User>(res.data);
      setUser(profile);
    } catch {
      setUser(null);
    }
  }, []);
  useEffect(() => {
    let active = true;
    refreshAccessToken()
      .then(async (token) => {
        if (!active) return;
        if (token) {
          setAccessToken(token);
          await refreshMe();
        }
      })
      .finally(() => {
        if (active) setReady(true);
      });
    return () => {
      active = false;
    };
  }, [refreshMe]);
  const signIn = async (email: string, password: string) => {
    const response = await api.post("/auth/login", { email, password });
    setAccessToken(response.data?.data?.accessToken ?? null);
    await refreshMe();
  };
  const signUp = async (input: Record<string, unknown>) => {
    const response = await api.post<{ verificationEmailSent?: boolean }>(
      "/auth/register",
      input,
    );
    return {
      verificationEmailSent: response.data.verificationEmailSent === true,
    };
  };
  const signOut = async () => {
    try {
      await api.post("/auth/logout");
    } finally {
      setAccessToken(null);
      setUser(null);
    }
  };
  const value = useMemo(
    () => ({ user, ready, signIn, signUp, signOut, refreshMe }),
    [user, ready],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used within AuthProvider");
  return value;
}
