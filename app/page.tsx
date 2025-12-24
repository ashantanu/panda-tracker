"use client"

import { DinoGame } from "@/components/dino-game"
import { FlightTracker } from "@/components/flight-tracker"

export default function Home() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-[#0f0f1e] via-[#1a1a2e] to-[#0f0f1e]">
      <div className="container mx-auto px-4 py-8 max-w-5xl">
        <div className="mb-8 relative">
          <div className="absolute inset-0 bg-gradient-to-r from-yellow-400 via-red-500 to-pink-500 rounded-lg blur-xl opacity-30 animate-pulse"></div>
          <div className="relative bg-black border-4 border-white rounded-lg p-6 shadow-[0_0_0_4px_#000,0_0_0_8px_#FFD700,0_0_20px_#FFD700]">
            <h1 className="text-6xl font-bold text-center font-mono tracking-wider text-white pixel-text mb-2 [text-shadow:4px_4px_0_#FFD700,8px_8px_0_#FF1493]">
              SWETA TRACKER
            </h1>
            <div className="flex items-center justify-center gap-4 text-yellow-400 font-mono text-sm">
              <span className="animate-pulse">▸ WILL SHE MAKE IT? ◂</span>
            </div>
          </div>
        </div>

        <DinoGame />

        <div className="mt-12 relative">
          <div className="absolute inset-0 bg-gradient-to-r from-cyan-500 via-blue-500 to-purple-500 rounded-lg blur-xl opacity-20"></div>
          <div className="relative bg-gradient-to-b from-[#1a1a2e] to-[#0f0f1e] border-4 border-cyan-400 rounded-lg p-6 shadow-[0_0_0_4px_#000,0_0_0_8px_#00FFFF,0_0_15px_#00FFFF]">
            <div className="flex items-center justify-between mb-6 border-b-2 border-cyan-400 pb-4">
              <h2 className="text-3xl font-bold font-mono text-cyan-400 [text-shadow:2px_2px_0_#000,3px_3px_0_#0088FF]">
                FLIGHT STATUS
              </h2>
              <div className="flex gap-2">
                <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse"></div>
                <div className="w-3 h-3 bg-yellow-500 rounded-full animate-pulse [animation-delay:200ms]"></div>
                <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse [animation-delay:400ms]"></div>
              </div>
            </div>
            <FlightTracker />
          </div>
        </div>
      </div>
    </main>
  )
}
