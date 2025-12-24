import { NextRequest, NextResponse } from "next/server"
import { readFile, writeFile } from "fs/promises"
import { join } from "path"
import {
  fetchFlightDetails,
  fetchFlightStatus,
  isWithinTrackingWindow,
  isFlightCompleted,
  type CachedFlightDetails,
  type FlightStatus,
} from "@/lib/flightaware"

const DATA_FILE = join(process.cwd(), "data", "flights.json")

// Rate limiting: minimum delay between API calls (ms)
const API_CALL_DELAY = 200

// In-memory cache for serverless environments (Vercel)
// This persists across requests within the same serverless instance
const memoryCache: {
  flightDetails: Record<string, CachedFlightDetails>
  flightStatus: Record<string, FlightStatus & { cachedAt: string }>
} = {
  flightDetails: {},
  flightStatus: {},
}

interface FlightEntry {
  id: string
  date: string
  origin?: string  // Optional origin airport code for multi-leg flights (e.g., "SFO")
}

interface FlightsData {
  flights: FlightEntry[]
  cachedFlightDetails: Record<string, CachedFlightDetails>
  cachedFlightStatus?: Record<string, FlightStatus & { cachedAt: string }>
}

async function readFlightsData(): Promise<FlightsData> {
  try {
    const data = await readFile(DATA_FILE, "utf-8")
    return JSON.parse(data)
  } catch {
    return { flights: [], cachedFlightDetails: {}, cachedFlightStatus: {} }
  }
}

async function writeFlightsData(data: FlightsData): Promise<void> {
  try {
    await writeFile(DATA_FILE, JSON.stringify(data, null, 2))
  } catch (error) {
    // Silently fail on read-only filesystems (Vercel)
    // Data will still be cached in memory
    console.log("[Cache] Cannot write to filesystem, using memory cache only")
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
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
    if (!flightsData.cachedFlightStatus) {
      flightsData.cachedFlightStatus = {}
    }
    
    // Merge file cache with memory cache (memory cache takes precedence for fresh data)
    const mergedDetails = { ...flightsData.cachedFlightDetails, ...memoryCache.flightDetails }
    const mergedStatus = { ...flightsData.cachedFlightStatus, ...memoryCache.flightStatus }
    
    const results: {
      flightId: string
      date: string
      details: CachedFlightDetails | null
      status: FlightStatus | null
    }[] = []

    let dataUpdated = false
    let apiCallCount = 0

    for (const flight of flightsData.flights) {
      // Build cache key
      const cacheKey = flight.origin 
        ? `${flight.id}_${flight.date}_${flight.origin}`
        : `${flight.id}_${flight.date}`
      
      let details: CachedFlightDetails | null = mergedDetails[cacheKey] || null
      let status: FlightStatus | null = null

      // === FLIGHT DETAILS ===
      // Only fetch if not already cached (details don't change)
      if (!details && isWithinTrackingWindow(flight.date)) {
        console.log(`[API] Fetching details for ${flight.id} on ${flight.date}${flight.origin ? ` from ${flight.origin}` : ""}`)
        
        // Add delay to avoid rate limiting
        if (apiCallCount > 0) await sleep(API_CALL_DELAY)
        
        details = await fetchFlightDetails(flight.id, flight.date, apiKey, flight.origin)
        apiCallCount++
        
        if (details) {
          // Cache in both file and memory
          flightsData.cachedFlightDetails[cacheKey] = details
          memoryCache.flightDetails[cacheKey] = details
          dataUpdated = true
        }
      }

      // === FLIGHT STATUS ===
      // Only fetch status for:
      // 1. Flights within tracking window (2 days)
      // 2. Flights that haven't completed yet
      const cachedStatus = mergedStatus[cacheKey]
      const statusCacheAge = cachedStatus 
        ? Date.now() - new Date(cachedStatus.cachedAt).getTime() 
        : Infinity
      
      // Check if flight is completed (use cached status to determine)
      const flightIsCompleted = cachedStatus && isFlightCompleted(cachedStatus)
      
      if (isWithinTrackingWindow(flight.date) && !flightIsCompleted) {
        // Only refetch status if cache is older than 2 minutes
        const STATUS_CACHE_TTL = 2 * 60 * 1000 // 2 minutes
        
        if (statusCacheAge > STATUS_CACHE_TTL) {
          console.log(`[API] Fetching status for ${flight.id} on ${flight.date}`)
          
          // Add delay to avoid rate limiting
          if (apiCallCount > 0) await sleep(API_CALL_DELAY)
          
          const freshStatus = await fetchFlightStatus(flight.id, flight.date, apiKey, flight.origin)
          apiCallCount++
          
          if (freshStatus) {
            const statusWithCache = {
              ...freshStatus,
              cachedAt: new Date().toISOString()
            }
            // Cache in both file and memory
            flightsData.cachedFlightStatus[cacheKey] = statusWithCache
            memoryCache.flightStatus[cacheKey] = statusWithCache
            status = freshStatus
            dataUpdated = true
          }
        } else {
          // Use cached status
          status = cachedStatus ? { ...cachedStatus } : null
          if (status && 'cachedAt' in status) {
            delete (status as FlightStatus & { cachedAt?: string }).cachedAt
          }
        }
      } else if (cachedStatus) {
        // Use cached status for completed or far-future flights
        status = { ...cachedStatus }
        if ('cachedAt' in status) {
          delete (status as FlightStatus & { cachedAt?: string }).cachedAt
        }
      }

      results.push({
        flightId: flight.id,
        date: flight.date,
        details,
        status,
      })
    }

    // Try to save to file (will silently fail on Vercel)
    if (dataUpdated) {
      await writeFlightsData(flightsData)
    }

    console.log(`[API] Made ${apiCallCount} API calls for ${flightsData.flights.length} flights`)

    return NextResponse.json({
      flights: results,
      updatedAt: new Date().toISOString(),
      apiCallsMade: apiCallCount,
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
    const { id, date, origin } = body

    if (!id || !date) {
      return NextResponse.json(
        { error: "Flight ID and date are required" },
        { status: 400 }
      )
    }

    const flightsData = await readFlightsData()

    // Check if flight already exists
    const exists = flightsData.flights.some(
      (f) => f.id === id && f.date === date && f.origin === origin
    )

    if (!exists) {
      flightsData.flights.push({ id, date, origin })
      await writeFlightsData(flightsData)
    }

    return NextResponse.json({ success: true, flight: { id, date, origin } })
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
    const origin = searchParams.get("origin")

    if (!id || !date) {
      return NextResponse.json(
        { error: "Flight ID and date are required" },
        { status: 400 }
      )
    }

    const flightsData = await readFlightsData()

    flightsData.flights = flightsData.flights.filter(
      (f) => !(f.id === id && f.date === date && f.origin === origin)
    )

    // Also remove cached details and status
    const cacheKey = origin ? `${id}_${date}_${origin}` : `${id}_${date}`
    delete flightsData.cachedFlightDetails[cacheKey]
    if (flightsData.cachedFlightStatus) {
      delete flightsData.cachedFlightStatus[cacheKey]
    }

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
