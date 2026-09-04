import { ClaimConsole } from "@/components/ClaimConsole";
import { Masthead, Footer } from "@/components/Chrome";

export default function Home() {
  return (
    <main className="shell">
      <Masthead />
      {/* The hero lives inside the console because it has to get out of the way
          the moment a verification starts — during a run the thing worth looking
          at is the probe grid, not the pitch. */}
      <ClaimConsole />
      <Footer />
    </main>
  );
}
