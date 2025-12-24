"use client"

import { Card } from "@/components/ui/card"

export function DinoGame() {
  return (
    <Card className="p-6 bg-card overflow-hidden">
      <div className="flex flex-col items-center gap-4">
        {/* Mobile landscape hint - only visible on small screens */}
        <p className="md:hidden text-xs text-yellow-400 font-mono flex items-center gap-2 bg-yellow-400/10 px-3 py-1.5 rounded-full border border-yellow-400/30">
          <span>📱↻</span>
          <span>Rotate to landscape for best experience</span>
        </p>
        
        <div className="relative w-full max-w-[600px] aspect-[600/200] bg-white rounded-lg border-2 border-border overflow-hidden">
          <iframe
            src="/dino-game.html"
            className="absolute inset-0 w-full h-full border-0"
            title="Dino Game"
            scrolling="no"
          />
        </div>
        <p className="text-sm text-muted-foreground font-mono">Press SPACE or Click to play</p>
      </div>
    </Card>
  )
}
