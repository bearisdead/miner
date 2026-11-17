import { createFileRoute } from "@tanstack/react-router";
import { MinerApp } from "@/components/miner/miner-app";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return <MinerApp />;
}
