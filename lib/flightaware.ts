/**
 * FlightAware AeroAPI Integration
 * Documentation: https://www.flightaware.com/aeroapi/portal/documentation
 */

const AEROAPI_BASE_URL = "https://aeroapi.flightaware.com/aeroapi"

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
 * Fetch flight details from FlightAware AeroAPI
 */
export async function fetchFlightDetails(
  flightId: string,
  date: string,
  apiKey: string
): Promise<CachedFlightDetails | null> {
  try {
    // Format: AA1234 -> AA1234, date: 2025-12-25
    // AeroAPI expects dates in ISO format
    const startDate = new Date(date)
    const endDate = new Date(date)
    endDate.setDate(endDate.getDate() + 1)

    const url = `${AEROAPI_BASE_URL}/flights/${flightId}?start=${startDate.toISOString()}&end=${endDate.toISOString()}`

    const response = await fetch(url, {
      headers: {
        "x-apikey": apiKey,
        Accept: "application/json; charset=UTF-8",
      },
    })

    if (!response.ok) {
      console.error(`FlightAware API error: ${response.status} ${response.statusText}`)
      return null
    }

    const data: FlightAwareResponse = await response.json()

    if (!data.flights || data.flights.length === 0) {
      console.warn(`No flight data found for ${flightId} on ${date}`)
      return null
    }

    const flight = data.flights[0]

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
 */
export async function fetchFlightStatus(
  flightId: string,
  date: string,
  apiKey: string
): Promise<FlightStatus | null> {
  try {
    const startDate = new Date(date)
    const endDate = new Date(date)
    endDate.setDate(endDate.getDate() + 1)

    const url = `${AEROAPI_BASE_URL}/flights/${flightId}?start=${startDate.toISOString()}&end=${endDate.toISOString()}`

    const response = await fetch(url, {
      headers: {
        "x-apikey": apiKey,
        Accept: "application/json; charset=UTF-8",
      },
    })

    if (!response.ok) {
      console.error(`FlightAware API error: ${response.status} ${response.statusText}`)
      return null
    }

    const data: FlightAwareResponse = await response.json()

    if (!data.flights || data.flights.length === 0) {
      return null
    }

    const flight = data.flights[0]

    // Determine status
    let status: FlightStatus["status"] = "unknown"
    let statusText = flight.status || "Unknown"

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
    } else if (flight.departure_delay > 0 || flight.arrival_delay > 0) {
      status = "delayed"
      statusText = `Delayed ${Math.round(flight.departure_delay / 60)} min`
    } else {
      status = "scheduled"
      statusText = "Scheduled"
    }

    // Override with API status if available
    if (flight.status) {
      statusText = flight.status
    }

    return {
      flightId,
      date,
      status,
      statusText,
      progress: flight.progress_percent || 0,
      actualDeparture: flight.actual_out || flight.actual_off || null,
      estimatedArrival: flight.estimated_in || flight.estimated_on || null,
      departureDelay: flight.departure_delay || 0,
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

