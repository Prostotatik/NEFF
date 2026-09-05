import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Report } from "@/components/Report";
import { Masthead, Footer } from "@/components/Chrome";
import { DetailsRail, OrbitalStage } from "@/components/RunHero";
import { Mechanism } from "@/components/Mechanism";
import { loadRun } from "@/lib/store";
import s from "@/components/neff.module.css";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const run = await loadRun(id);
  if (!run) return { title: "NEFF — report not found" };
  return {
    title: `${run.verdict.truthScore}/100 · ${run.verdict.label} — NEFF`,
    description: run.verdict.headline,
  };
}

export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const run = await loadRun(id);
  if (!run) notFound();

  return (
    <main className="shell">
      <div className={s.ambient} aria-hidden="true" />
      <Masthead />

      {/* A stored report gets the same hero as a live one — the orbital scene
          and the details rail are the verdict, not an animation that only the
          person who ran it deserves to see. The left column carries what the
          console carries on the landing page: what was checked. */}
      <div className={s.hero}>
        <div className={s.heroLeft}>
          <div className={s.reportStamp}>
            <span className="eyebrow">Report {run.id}</span>
            <span className="eyebrow-dim">
              {new Date(run.createdAt).toISOString().replace("T", " ").slice(0, 16)} UTC
            </span>
          </div>
          <h1 className={s.thesis}>
            <span className={s.thesisOne}>{run.verdict.label}</span>
            <span className={s.thesisThree}>
              on {run.consensus.effectiveWitnesses.toFixed(1)} witness
              {run.consensus.effectiveWitnesses === 1 ? "" : "es"}
            </span>
          </h1>
          <div className={s.scanbar} aria-hidden="true" />
          <p className={s.subthesis}>
            A panel of {run.consensus.respondents} models on the Gonka Network, probed{" "}
            {run.totals.calls} times. Every inference below is traceable to the node that served it.
          </p>
          <a className={s.railButton} href="/" style={{ maxWidth: "16rem" }}>
            Verify another claim
            <span aria-hidden="true">→</span>
          </a>
        </div>

        <OrbitalStage run={run} probes={[]} running={false} status={null} />
        <DetailsRail run={run} receipts={run.receipts} running={false} status={null} />
      </div>

      {/* The reference puts the three probe cards between the hero and the
          report, and a permalink reader has had no chance to see them — they are
          what makes the numbers below mean anything. */}
      <Mechanism />

      <Report run={run} />
      <Footer />
    </main>
  );
}
