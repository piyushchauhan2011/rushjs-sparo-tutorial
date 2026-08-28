import type { AuthResponse, User } from "@hotel/shared-types";
import * as React from "react";

import { api } from "./api.js";
import { clearSession, getStoredUser, storeSession } from "./token.js";

interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (
    email: string,
    password: string,
    fullName: string,
  ) => Promise<void>;
  logout: () => void;
}

const AuthContext = React.createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = React.useState<User | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);

  // localStorage isn't available during SSR, so the session can only be restored
  // after hydration — which is why `user` starts null on the server.
  React.useEffect(() => {
    setUser(getStoredUser<User>());
    setIsLoading(false);
  }, []);

  function persist(response: AuthResponse) {
    storeSession(response.accessToken, response.user);
    setUser(response.user);
  }

  async function login(email: string, password: string) {
    persist(await api.login({ email, password }));
  }

  async function register(email: string, password: string, fullName: string) {
    persist(await api.register({ email, password, fullName }));
  }

  function logout() {
    clearSession();
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, isLoading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = React.useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
