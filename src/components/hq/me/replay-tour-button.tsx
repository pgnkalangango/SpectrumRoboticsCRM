"use client";

import { PlayCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ReplayTourButton() {
  return (
    <Button variant="soft" size="sm" onClick={() => window.dispatchEvent(new Event("hq:start-tour"))}>
      <PlayCircle /> Replay the walkthrough
    </Button>
  );
}
