import { ResultsClient } from "@/components/ResultsClient";

export default async function ResearchResultPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ResultsClient sessionId={id} />;
}
