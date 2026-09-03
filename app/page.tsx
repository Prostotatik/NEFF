import { ClaimConsole } from "@/components/ClaimConsole";
import { Masthead, Footer } from "@/components/Chrome";
import s from "@/components/quorum.module.css";

export default function Home() {
  return (
    <main className="shell">
      <Masthead />

      <header className={s.hero}>
        <p className="eyebrow">Independence-weighted fact verification · every inference on Gonka</p>
        <h1 className={s.thesis}>
          Three models agreeing is <em>one witness</em> if they all read the same page.
        </h1>
        <p className={s.subthesis}>
          Quorum does not count votes. It probes each model with the claim, with the claim negated,
          and with a demand for its sources — then reports how many genuinely independent witnesses
          are behind the verdict, and discounts the truth score by it.
        </p>
      </header>

      <ClaimConsole />
      <Footer />
    </main>
  );
}
