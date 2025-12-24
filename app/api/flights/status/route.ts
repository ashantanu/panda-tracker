import { NextRequest, NextResponse } from "next/server"
import { readFile } from "fs/promises"
import { join } from "path"
import {
  fetchFlightStatus,
  isWithinTrackingWindow,
  type FlightStatus,
} from "@/lib/flightaware"

const DATA_FILE = join(process.cwd(), "data", "flights.json")

interface FlightEntry {
  id: string
  date: string
  origin?: string
}

interface FlightsData {
  flights: FlightEntry[]
  cachedFlightDetails: Record<string, unknown>
}

async function readFlightsData(): Promise<FlightsData> {
  try {
    const data = await readFile(DATA_FILE, "utf-8")
    return JSON.parse(data)
  } catch {
    return { flights: [], cachedFlightDetails: {} }
  }
}

/**
 * GET /api/flights/status
 * Fetches current status for all flights within the tracking window (2 days)
 * This is the endpoint to call for real-time status updates
 */
export async function GET(request: NextRequest) {
  const apiKey = process.env.FLIGHTAWARE_API_KEY

  if (!apiKey) {
    return NextResponse.json(
      { error: "FlightAware API key not configured" },
      { status: 500 }
    )
  }

  try {
    const flightsData = await readFlightsData()
    const statuses: FlightStatus[] = []

    // Only fetch status for flights within the tracking window
    for (const flight of flightsData.flights) {
      if (isWithinTrackingWindow(flight.date)) {
        console.log(`Fetching status for ${flight.id} on ${flight.date}${flight.origin ? ` from ${flight.origin}` : ""}...`)
        const status = await fetchFlightStatus(flight.id, flight.date, apiKey, flight.origin)
        if (status) {
          statuses.push(status)
        }
      }
    }

    return NextResponse.json({
      statuses,
      updatedAt: new Date().toISOString(),
    })
  } catch (error) {
    console.error("Error fetching flight statuses:", error)
    return NextResponse.json(
      { error: "Failed to fetch flight statuses" },
      { status: 500 }
    )
  }
}

