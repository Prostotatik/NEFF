import { ClaimConsole } from "@/components/ClaimConsole";
import { Masthead, Footer } from "@/components/Chrome";
import s from "@/components/neff.module.css";

export default function Home() {
  return (
    <main className="shell">
      {/* The hero's ambient light sits behind everything and is purely
          decorative, so it is a sibling rather than a background on .shell —
          that keeps it from tinting the panels stacked on top of it. */}
      <div className={s.ambient} aria-hidden="true" />
      <Masthead />
      <ClaimConsole />
      <Footer />
    </main>
  );
}
