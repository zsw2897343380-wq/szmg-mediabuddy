import { createContext, useContext, type ReactNode } from "react";
import { createPortal } from "react-dom";

export type CapabilityResource = "experts" | "skills" | "connectors";

export const CapabilityHeaderContext = createContext<{
  element: HTMLDivElement | null;
  resource: CapabilityResource | null;
} | null>(null);

export function CapabilityHeaderActions({
  resource,
  children,
}: {
  resource: CapabilityResource;
  children: ReactNode;
}) {
  const header = useContext(CapabilityHeaderContext);
  if (!header) return <>{children}</>;
  return header.element && header.resource === resource
    ? createPortal(children, header.element)
    : null;
}
