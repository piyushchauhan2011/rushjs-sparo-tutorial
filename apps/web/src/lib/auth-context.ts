import type { User } from "@hotel/shared-types";
import * as React from "react";

// The context and the `useAuth` hook live apart from the AuthProvider component
// so that auth.tsx exports only a component. A module that mixes component and
// non-component exports can't be hot-patched by React Fast Refresh — editing it
// forces a full page reload (see react-refresh/only-export-components).
export interface AuthContextValue {
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

export const AuthContext = React.createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const context = React.useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
