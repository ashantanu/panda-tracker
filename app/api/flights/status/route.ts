import { NextRequest, NextResponse } from "next/server"
import { readFile, writeFile } from "fs/promises"
import { join } from "path"
import {
  fetchFlightStatus,
  isWithinTrackingWindow,
  isFlightCompleted,
  type FlightStatus,
  type CachedFlightDetails,
} from "@/lib/flightaware"

const DATA_FILE = join(process.cwd(), "data", "flights.json")
const API_CALL_DELAY = 200

// In-memory cache for serverless environments (Vercel)
const memoryCache: {
  flightStatus: Record<string, FlightStatus & { cachedAt: string }>
} = {
  flightStatus: {},
}

interface FlightEntry {
  id: string
  date: string
  origin?: string
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
    console.log("[Cache] Cannot write to filesystem, using memory cache only")
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * GET /api/flights/status
 * Fetches current status for flights within the tracking window (2 days)
 * that haven't completed yet. Uses caching to minimize API calls.
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
    if (!flightsData.cachedFlightStatus) {
      flightsData.cachedFlightStatus = {}
    }
    
    // Merge file cache with memory cache (memory cache takes precedence for fresh data)
    const mergedStatus = { ...flightsData.cachedFlightStatus, ...memoryCache.flightStatus }
    
    const statuses: FlightStatus[] = []
    let dataUpdated = false
    let apiCallCount = 0

    const STATUS_CACHE_TTL = 2 * 60 * 1000 // 2 minutes

    for (const flight of flightsData.flights) {
      const cacheKey = flight.origin 
        ? `${flight.id}_${flight.date}_${flight.origin}`
        : `${flight.id}_${flight.date}`

      const cachedStatus = mergedStatus[cacheKey]
      const statusCacheAge = cachedStatus 
        ? Date.now() - new Date(cachedStatus.cachedAt).getTime() 
        : Infinity

      // Skip flights that are completed or outside tracking window
      const flightIsCompleted = cachedStatus && isFlightCompleted(cachedStatus)
      
      if (!isWithinTrackingWindow(flight.date)) {
        // Use cached status if available
        if (cachedStatus) {
          const status = { ...cachedStatus }
          delete (status as FlightStatus & { cachedAt?: string }).cachedAt
          statuses.push(status)
        }
        continue
      }

      if (flightIsCompleted) {
        // Use cached status for completed flights
        const status = { ...cachedStatus }
        delete (status as FlightStatus & { cachedAt?: string }).cachedAt
        statuses.push(status)
        continue
      }

      // Only refetch if cache is stale
      if (statusCacheAge > STATUS_CACHE_TTL) {
        console.log(`[API] Fetching status for ${flight.id} on ${flight.date}`)
        
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
          statuses.push(freshStatus)
          dataUpdated = true
        }
      } else if (cachedStatus) {
        // Use cached status
        const status = { ...cachedStatus }
        delete (status as FlightStatus & { cachedAt?: string }).cachedAt
        statuses.push(status)
      }
    }

    // Try to save to file (will silently fail on Vercel)
    if (dataUpdated) {
      await writeFlightsData(flightsData)
    }

    console.log(`[API Status] Made ${apiCallCount} API calls`)

    return NextResponse.json({
      statuses,
      updatedAt: new Date().toISOString(),
      apiCallsMade: apiCallCount,
    })
  } catch (error) {
    console.error("Error fetching flight statuses:", error)
    return NextResponse.json(
      { error: "Failed to fetch flight statuses" },
      { status: 500 }
    )
  }
}
