/**
 * FlightAware AeroAPI Integration
 * Documentation: https://www.flightaware.com/aeroapi/portal/documentation
 */

const AEROAPI_BASE_URL = "https://aeroapi.flightaware.com/aeroapi"

// Rate limiting configuration
const MAX_RETRIES = 3
const INITIAL_RETRY_DELAY = 1000 // 1 second

/**
 * Fetch with retry logic for rate limiting
 */
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  retries = MAX_RETRIES
): Promise<Response> {
  const response = await fetch(url, options)
  
  // Handle rate limiting (429) with exponential backoff
  if (response.status === 429 && retries > 0) {
    const retryAfter = response.headers.get("Retry-After")
    const delay = retryAfter 
      ? parseInt(retryAfter) * 1000 
      : INITIAL_RETRY_DELAY * (MAX_RETRIES - retries + 1)
    
    console.warn(`Rate limited. Retrying in ${delay}ms... (${retries} retries left)`)
    await new Promise(resolve => setTimeout(resolve, delay))
    return fetchWithRetry(url, options, retries - 1)
  }
  
  return response
}

export interface FlightAwareResponse {
  flights: AeroAPIFlight[]
}

export interface AeroAPIFlight {
  ident: string
  ident_icao: string
  ident_iata: string
  fa_flight_id: string
  operator: string
  operator_icao: string
  operator_iata: string
  flight_number: string
  registration: string
  atc_ident: string
  inbound_fa_flight_id: string | null
  codeshares: string[]
  codeshares_iata: string[]
  blocked: boolean
  diverted: boolean
  cancelled: boolean
  position_only: boolean
  origin: AirportInfo
  destination: AirportInfo
  departure_delay: number
  arrival_delay: number
  filed_ete: number
  scheduled_out: string
  estimated_out: string
  actual_out: string | null
  scheduled_off: string
  estimated_off: string
  actual_off: string | null
  scheduled_on: string
  estimated_on: string
  actual_on: string | null
  scheduled_in: string
  estimated_in: string
  actual_in: string | null
  progress_percent: number
  status: string
  aircraft_type: string
  route_distance: number
  filed_airspeed: number
  filed_altitude: number
  route: string
  baggage_claim: string | null
  seats_cabin_business: number | null
  seats_cabin_coach: number | null
  seats_cabin_first: number | null
  gate_origin: string | null
  gate_destination: string | null
  terminal_origin: string | null
  terminal_destination: string | null
  type: string
}

export interface AirportInfo {
  code: string
  code_icao: string
  code_iata: string
  code_lid: string
  timezone: string
  name: string
  city: string
  airport_info_url: string
}

export interface CachedFlightDetails {
  flightId: string
  date: string
  origin: {
    code: string
    name: string
    city: string
    timezone: string
  }
  destination: {
    code: string
    name: string
    city: string
    timezone: string
  }
  scheduledDeparture: string
  scheduledArrival: string
  aircraftType: string
  fetchedAt: string
}

export interface FlightStatus {
  flightId: string
  date: string
  status: "scheduled" | "departed" | "en_route" | "landed" | "arrived" | "cancelled" | "delayed" | "unknown"
  statusText: string
  progress: number
  actualDeparture: string | null
  estimatedArrival: string | null
  departureDelay: number
  arrivalDelay: number
  lastUpdated: string
}

/**
 * Check if a flight has completed (arrived or cancelled)
 */
export function isFlightCompleted(status: FlightStatus): boolean {
  return status.status === "arrived" || status.status === "cancelled" || status.progress >= 100
}

/**
 * Check if a flight's scheduled departure matches the target date (in the origin's local timezone)
 */
function flightMatchesDate(flight: AeroAPIFlight, targetDate: string): boolean {
  const scheduled = flight.scheduled_out || flight.scheduled_off
  if (!scheduled) return false
  
  // Get the flight's departure date in the origin timezone
  const flightDate = new Date(scheduled)
  const originTz = flight.origin.timezone || "UTC"
  
  // Format the flight date in the origin's timezone
  const flightLocalDate = flightDate.toLocaleDateString("en-CA", { timeZone: originTz }) // YYYY-MM-DD format
  
  return flightLocalDate === targetDate
}

/**
 * Fetch flight details from FlightAware AeroAPI
 * @param origin - Optional origin airport code (e.g., "SFO") to filter multi-leg flights
 */
export async function fetchFlightDetails(
  flightId: string,
  date: string,
  apiKey: string,
  origin?: string
): Promise<CachedFlightDetails | null> {
  try {
    // First, try fetching without date filter to get scheduled/future flights
    // FlightAware's date filter only works for historical flights
    let url = `${AEROAPI_BASE_URL}/flights/${flightId}`
    
    const response = await fetchWithRetry(url, {
      headers: {
        "x-apikey": apiKey,
        Accept: "application/json; charset=UTF-8",
      },
    })

    if (!response.ok) {
      if (response.status === 429) {
        console.error(`FlightAware API rate limited after retries`)
      } else {
        console.error(`FlightAware API error: ${response.status} ${response.statusText}`)
      }
      return null
    }

    const data: FlightAwareResponse = await response.json()

    if (!data.flights || data.flights.length === 0) {
      console.warn(`No flight data found for ${flightId}`)
      return null
    }

    // Filter flights by date (in local timezone) and origin
    let matchingFlights = data.flights.filter((f) => flightMatchesDate(f, date))
    
    // If origin is specified, filter by origin airport
    if (origin) {
      const originUpper = origin.toUpperCase()
      matchingFlights = matchingFlights.filter(
        (f) =>
          f.origin.code_iata?.toUpperCase() === originUpper ||
          f.origin.code?.toUpperCase() === originUpper ||
          f.origin.code_icao?.toUpperCase() === originUpper
      )
    }

    if (matchingFlights.length === 0) {
      // Log available flights for debugging
      console.warn(`No flight found for ${flightId} on ${date}${origin ? ` from ${origin}` : ""}`)
      console.log(`Available flights:`, data.flights.slice(0, 3).map(f => ({
        origin: f.origin.code_iata,
        dest: f.destination.code_iata,
        scheduled: f.scheduled_out,
        localDate: f.scheduled_out ? new Date(f.scheduled_out).toLocaleDateString("en-CA", { timeZone: f.origin.timezone || "UTC" }) : null
      })))
      return null
    }

    const flight = matchingFlights[0]

    return {
      flightId,
      date,
      origin: {
        code: flight.origin.code_iata || flight.origin.code,
        name: flight.origin.name,
        city: flight.origin.city,
        timezone: flight.origin.timezone,
      },
      destination: {
        code: flight.destination.code_iata || flight.destination.code,
        name: flight.destination.name,
        city: flight.destination.city,
        timezone: flight.destination.timezone,
      },
      scheduledDeparture: flight.scheduled_out || flight.scheduled_off,
      scheduledArrival: flight.scheduled_in || flight.scheduled_on,
      aircraftType: flight.aircraft_type,
      fetchedAt: new Date().toISOString(),
    }
  } catch (error) {
    console.error(`Error fetching flight ${flightId}:`, error)
    return null
  }
}

/**
 * Fetch current flight status from FlightAware AeroAPI
 * Only called for flights within 2 days from now
 * @param origin - Optional origin airport code (e.g., "SFO") to filter multi-leg flights
 */
export async function fetchFlightStatus(
  flightId: string,
  date: string,
  apiKey: string,
  origin?: string
): Promise<FlightStatus | null> {
  try {
    // Fetch without date filter to get both scheduled and in-progress flights
    const url = `${AEROAPI_BASE_URL}/flights/${flightId}`

    const response = await fetchWithRetry(url, {
      headers: {
        "x-apikey": apiKey,
        Accept: "application/json; charset=UTF-8",
      },
    })

    if (!response.ok) {
      if (response.status === 429) {
        console.error(`FlightAware API rate limited after retries`)
      } else {
        console.error(`FlightAware API error: ${response.status} ${response.statusText}`)
      }
      return null
    }

    const data: FlightAwareResponse = await response.json()

    if (!data.flights || data.flights.length === 0) {
      return null
    }

    // Filter by date and origin
    let matchingFlights = data.flights.filter((f) => flightMatchesDate(f, date))
    
    if (origin) {
      const originUpper = origin.toUpperCase()
      matchingFlights = matchingFlights.filter(
        (f) =>
          f.origin.code_iata?.toUpperCase() === originUpper ||
          f.origin.code?.toUpperCase() === originUpper ||
          f.origin.code_icao?.toUpperCase() === originUpper
      )
    }

    if (matchingFlights.length === 0) {
      return null
    }

    const flight = matchingFlights[0]

    // Calculate delay from estimated vs scheduled times (more reliable than departure_delay field)
    let calculatedDelay = 0
    if (flight.estimated_out && flight.scheduled_out) {
      const estimated = new Date(flight.estimated_out).getTime()
      const scheduled = new Date(flight.scheduled_out).getTime()
      calculatedDelay = Math.max(0, (estimated - scheduled) / 1000) // in seconds
    }
    
    // Use the larger of reported delay or calculated delay
    const effectiveDelay = Math.max(flight.departure_delay || 0, calculatedDelay)
    
    // Check if API status text indicates delay
    const apiStatusText = flight.status || ""
    const apiIndicatesDelay = apiStatusText.toLowerCase().includes("delay")

    // Determine status
    let status: FlightStatus["status"] = "unknown"
    let statusText = apiStatusText || "Unknown"

    if (flight.cancelled) {
      status = "cancelled"
      statusText = "Cancelled"
    } else if (flight.actual_in) {
      status = "arrived"
      statusText = "Arrived"
    } else if (flight.actual_on) {
      status = "landed"
      statusText = "Landed"
    } else if (flight.actual_off || flight.actual_out) {
      status = flight.progress_percent > 0 ? "en_route" : "departed"
      statusText = flight.progress_percent > 0 ? "En Route" : "Departed"
    } else if (effectiveDelay > 0 || apiIndicatesDelay) {
      status = "delayed"
      const delayMins = Math.round(effectiveDelay / 60)
      statusText = delayMins > 0 ? `Delayed ${delayMins} min` : "Delayed"
      // Keep API status text if it's more informative
      if (apiStatusText && apiStatusText !== "Scheduled") {
        statusText = apiStatusText
      }
    } else {
      status = "scheduled"
      statusText = apiStatusText || "Scheduled"
    }

    return {
      flightId,
      date,
      status,
      statusText,
      progress: flight.progress_percent || 0,
      actualDeparture: flight.actual_out || flight.actual_off || null,
      estimatedArrival: flight.estimated_in || flight.estimated_on || null,
      departureDelay: effectiveDelay,
      arrivalDelay: flight.arrival_delay || 0,
      lastUpdated: new Date().toISOString(),
    }
  } catch (error) {
    console.error(`Error fetching status for ${flightId}:`, error)
    return null
  }
}

/**
 * Check if a flight date is within the tracking window (within 2 days)
 */
export function isWithinTrackingWindow(flightDate: string): boolean {
  const now = new Date()
  const flight = new Date(flightDate)
  
  // Set times to start of day for comparison
  now.setHours(0, 0, 0, 0)
  flight.setHours(0, 0, 0, 0)
  
  const diffDays = (flight.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
  
  // Within 2 days in the future, or in the past (for completed flights)
  return diffDays >= -1 && diffDays <= 2
}

/**
 * Format time for display in a specific timezone
 */
export function formatTime(isoString: string | null, timezone?: string): string {
  if (!isoString) return "--:--"
  const date = new Date(isoString)
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: timezone,
  })
}

/**
 * Get short timezone abbreviation
 */
export function getTimezoneAbbr(timezone: string): string {
  try {
    const date = new Date()
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      timeZoneName: "short",
    })
    const parts = formatter.formatToParts(date)
    const tzPart = parts.find((p) => p.type === "timeZoneName")
    return tzPart?.value || ""
  } catch {
    return ""
  }
}

/**
 * Format date for display
 */
export function formatDate(isoString: string): string {
  const date = new Date(isoString)
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

