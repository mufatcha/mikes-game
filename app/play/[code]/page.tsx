import { Suspense } from "react";
import PlaySession from "@/components/PlaySession";

export default function Page({ params }: PageProps<"/play/[code]">) {
  return (
    <Suspense
      fallback={<main className="flex min-h-screen items-center justify-center text-zinc-400">Loading…</main>}
    >
      {params.then(({ code }) => (
        <PlaySession code={code} />
      ))}
    </Suspense>
  );
}
