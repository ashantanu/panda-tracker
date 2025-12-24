import { NextRequest, NextResponse } from "next/server"
import { readFile, writeFile } from "fs/promises"
import { join } from "path"
import {
  fetchFlightDetails,
  fetchFlightStatus,
  isWithinTrackingWindow,
  type CachedFlightDetails,
  type FlightStatus,
} from "@/lib/flightaware"

const DATA_FILE = join(process.cwd(), "data", "flights.json")

interface FlightEntry {
  id: string
  date: string
  origin?: string  // Optional origin airport code for multi-leg flights (e.g., "SFO")
}

interface FlightsData {
  flights: FlightEntry[]
  cachedFlightDetails: Record<string, CachedFlightDetails>
}

async function readFlightsData(): Promise<FlightsData> {
  try {
    const data = await readFile(DATA_FILE, "utf-8")
    return JSON.parse(data)
  } catch {
    return { flights: [], cachedFlightDetails: {} }
  }
}

async function writeFlightsData(data: FlightsData): Promise<void> {
  await writeFile(DATA_FILE, JSON.stringify(data, null, 2))
}

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
    const results: {
      flightId: string
      date: string
      details: CachedFlightDetails | null
      status: FlightStatus | null
    }[] = []

    let dataUpdated = false

    for (const flight of flightsData.flights) {
      // Include origin in cache key for multi-leg flights
      const cacheKey = flight.origin 
        ? `${flight.id}_${flight.date}_${flight.origin}`
        : `${flight.id}_${flight.date}`
      let details: CachedFlightDetails | null = flightsData.cachedFlightDetails[cacheKey] || null

      // Fetch and cache flight details if not already cached
      if (!details) {
        console.log(`Fetching details for ${flight.id} on ${flight.date}${flight.origin ? ` from ${flight.origin}` : ""}...`)
        details = await fetchFlightDetails(flight.id, flight.date, apiKey, flight.origin)
        if (details) {
          flightsData.cachedFlightDetails[cacheKey] = details
          dataUpdated = true
        }
      }

      // Only fetch status for flights within tracking window
      let status: FlightStatus | null = null
      if (isWithinTrackingWindow(flight.date)) {
        console.log(`Fetching status for ${flight.id} on ${flight.date}...`)
        status = await fetchFlightStatus(flight.id, flight.date, apiKey, flight.origin)
      }

      results.push({
        flightId: flight.id,
        date: flight.date,
        details,
        status,
      })
    }

    // Save updated cache
    if (dataUpdated) {
      await writeFlightsData(flightsData)
    }

    return NextResponse.json({
      flights: results,
      updatedAt: new Date().toISOString(),
    })
  } catch (error) {
    console.error("Error fetching flights:", error)
    return NextResponse.json(
      { error: "Failed to fetch flight data" },
      { status: 500 }
    )
  }
}

// POST endpoint to add new flights to track
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { id, date } = body

    if (!id || !date) {
      return NextResponse.json(
        { error: "Flight ID and date are required" },
        { status: 400 }
      )
    }

    const flightsData = await readFlightsData()

    // Check if flight already exists
    const exists = flightsData.flights.some(
      (f) => f.id === id && f.date === date
    )

    if (!exists) {
      flightsData.flights.push({ id, date })
      await writeFlightsData(flightsData)
    }

    return NextResponse.json({ success: true, flight: { id, date } })
  } catch (error) {
    console.error("Error adding flight:", error)
    return NextResponse.json(
      { error: "Failed to add flight" },
      { status: 500 }
    )
  }
}

// DELETE endpoint to remove a flight from tracking
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get("id")
    const date = searchParams.get("date")

    if (!id || !date) {
      return NextResponse.json(
        { error: "Flight ID and date are required" },
        { status: 400 }
      )
    }

    const flightsData = await readFlightsData()

    flightsData.flights = flightsData.flights.filter(
      (f) => !(f.id === id && f.date === date)
    )

    // Also remove cached details
    const cacheKey = `${id}_${date}`
    delete flightsData.cachedFlightDetails[cacheKey]

    await writeFlightsData(flightsData)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error removing flight:", error)
    return NextResponse.json(
      { error: "Failed to remove flight" },
      { status: 500 }
    )
  }
}

