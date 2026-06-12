import { createContext, useContext } from "react";

interface NavigationContextType {
  activeSection: string;
  subSection: string;
  navigate: (section: string, sub?: string) => void;
}

export const NavigationContext = createContext<NavigationContextType>({
  activeSection: "dashboard",
  subSection: "",
  navigate: () => {},
});

export function useNavigation() {
  return useContext(NavigationContext);
}
