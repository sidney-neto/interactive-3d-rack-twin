import { InfrastructureProvider } from "../data/InfrastructureProvider";
import { AppShell } from "./AppShell";

export default function App() {
  return (
    <InfrastructureProvider>
      <AppShell />
    </InfrastructureProvider>
  );
}
