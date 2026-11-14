import type { Metadata } from "next";
import WrathwaterApp from "@/components/wrathwater/WrathwaterApp";

export const metadata: Metadata = {
  title: "Wrathwater",
  description: "Sail the open sea, sink ships and raise your bounty until you're the King of Wrathwater.",
};

export default function Page() {
  return <WrathwaterApp />;
}
