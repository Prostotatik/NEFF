import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Report } from "@/components/Report";
import { Masthead, Footer } from "@/components/Chrome";
import { loadRun } from "@/lib/store";
import s from "@/components/quorum.module.css";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const run = await loadRun(id);
  if (!run) return { title: "Quorum — report not found" };
  return {
    title: `${run.verdict.truthScore}/100 · ${run.verdict.label} — Quorum`,
    description: run.verdict.headline,
  };
}

export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const run = await loadRun(id);
  if (!run) notFound();

  return (
    <main className="shell">
      <Masthead />
      <header className={s.hero}>
        <p className="eyebrow">
          Report {run.id} · {new Date(run.createdAt).toISOString().replace("T", " ").slice(0, 16)} UTC
        </p>
        <h1 className={s.thesis}>{run.verdict.label}</h1>
        <p className={s.subthesis}>{run.verdict.headline}</p>
      </header>
      <Report run={run} />
      <Footer />
    </main>
  );
}
