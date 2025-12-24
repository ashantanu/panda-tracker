"use client"

import { useState, useEffect, useCallback } from "react"
import { formatTime, formatDate, getTimezoneAbbr } from "@/lib/flightaware"

interface FlightData {
  flightId: string
  date: string
  details: {
    origin: { code: string; name: string; city: string; timezone: string }
    destination: { code: string; name: string; city: string; timezone: string }
    scheduledDepartureUTC: string
    scheduledArrivalUTC: string
    scheduledDepartureLocal: string
    scheduledArrivalLocal: string
    aircraftType: string
  } | null
  status: {
    status: string
    statusText: string
    progress: number
    actualDeparture: string | null
    estimatedArrival: string | null
    departureDelay: number
    arrivalDelay: number
  } | null
}

interface APIResponse {
  flights: FlightData[]
  updatedAt: string
}

type StatusType = "on-time" | "delayed" | "cancelled" | "arrived" | "en-route" | "unknown"

export function FlightTracker() {
  const [flights, setFlights] = useState<FlightData[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<string | null>(null)

  const fetchFlights = useCallback(async () => {
    try {
      const response = await fetch("/api/flights")
      if (!response.ok) {
        throw new Error("Failed to fetch flight data")
      }
      const data: APIResponse = await response.json()
      setFlights(data.flights)
      setLastUpdated(data.updatedAt)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchFlights()

    // Refresh status every 5 minutes
    const interval = setInterval(fetchFlights, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [fetchFlights])

  const getDisplayStatus = (flight: FlightData): StatusType => {
    if (!flight.status) return "unknown"

    const s = flight.status.status.toLowerCase()
    if (s === "cancelled") return "cancelled"
    if (s === "arrived" || s === "landed") return "arrived"
    if (s === "en_route" || s === "departed") return "en-route"
    if (s === "delayed" || flight.status.departureDelay > 900) return "delayed" // >15 min delay
    if (s === "scheduled") return "on-time"
    return "unknown"
  }

  const getStatusColor = (status: StatusType) => {
    switch (status) {
      case "on-time":
        return "text-cyan-400"
      case "delayed":
        return "text-yellow-400"
      case "cancelled":
        return "text-pink-500"
      case "arrived":
        return "text-green-400"
      case "en-route":
        return "text-blue-400"
      default:
        return "text-gray-400"
    }
  }

  const getStatusText = (flight: FlightData): string => {
    if (!flight.status) return "SCHEDULED"
    return flight.status.statusText.toUpperCase()
  }

  const getProgressColor = (status: StatusType) => {
    switch (status) {
      case "on-time":
        return "bg-cyan-400"
      case "delayed":
        return "bg-yellow-400"
      case "cancelled":
        return "bg-pink-500"
      case "arrived":
        return "bg-green-400"
      case "en-route":
        return "bg-blue-400"
      default:
        return "bg-gray-400"
    }
  }

  const getProgressGlow = (status: StatusType) => {
    switch (status) {
      case "on-time":
        return "shadow-[0_0_10px_rgba(34,211,238,0.8)]"
      case "delayed":
        return "shadow-[0_0_10px_rgba(250,204,21,0.8)]"
      case "cancelled":
        return "shadow-[0_0_10px_rgba(236,72,153,0.8)]"
      case "arrived":
        return "shadow-[0_0_10px_rgba(74,222,128,0.8)]"
      case "en-route":
        return "shadow-[0_0_10px_rgba(96,165,250,0.8)]"
      default:
        return "shadow-[0_0_10px_rgba(156,163,175,0.8)]"
    }
  }

  const getRoute = (flight: FlightData): string => {
    if (!flight.details) return "---"
    return `${flight.details.origin.code} → ${flight.details.destination.code}`
  }

  const getProgress = (flight: FlightData): number => {
    if (!flight.status) return 0
    return flight.status.progress
  }

  const getDepartureTime = (flight: FlightData): string => {
    const tz = flight.details?.origin.timezone
    // For actual departure (real-time), format it
    if (flight.status?.actualDeparture) {
      return formatTime(flight.status.actualDeparture, tz)
    }
    // Use pre-formatted local time if available
    if (flight.details?.scheduledDepartureLocal) {
      return flight.details.scheduledDepartureLocal
    }
    if (flight.details?.scheduledDepartureUTC) {
      return formatTime(flight.details.scheduledDepartureUTC, tz)
    }
    return "--:--"
  }

  const getArrivalTime = (flight: FlightData): string => {
    const tz = flight.details?.destination.timezone
    // For estimated arrival (real-time), format it
    if (flight.status?.estimatedArrival) {
      return formatTime(flight.status.estimatedArrival, tz)
    }
    // Use pre-formatted local time if available
    if (flight.details?.scheduledArrivalLocal) {
      return flight.details.scheduledArrivalLocal
    }
    if (flight.details?.scheduledArrivalUTC) {
      return formatTime(flight.details.scheduledArrivalUTC, tz)
    }
    return "--:--"
  }

  const getDepartureTimezone = (flight: FlightData): string => {
    // Only show timezone if we're not using the pre-formatted local time
    if (flight.details?.scheduledDepartureLocal && !flight.status?.actualDeparture) {
      return "" // Local time already has date context
    }
    if (!flight.details?.origin.timezone) return ""
    return getTimezoneAbbr(flight.details.origin.timezone)
  }

  const getArrivalTimezone = (flight: FlightData): string => {
    // Only show timezone if we're not using the pre-formatted local time
    if (flight.details?.scheduledArrivalLocal && !flight.status?.estimatedArrival) {
      return ""
    }
    if (!flight.details?.destination.timezone) return ""
    return getTimezoneAbbr(flight.details.destination.timezone)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-cyan-400 font-mono animate-pulse">
          LOADING FLIGHT DATA...
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-black border-2 border-pink-500 rounded p-4">
        <p className="text-pink-500 font-mono">ERROR: {error}</p>
        <button
          onClick={fetchFlights}
          className="mt-2 px-4 py-2 bg-cyan-500 text-black font-mono rounded hover:bg-cyan-400 transition"
        >
          RETRY
        </button>
      </div>
    )
  }

  if (flights.length === 0) {
    return (
      <div className="bg-black border-2 border-gray-700 rounded p-4">
        <p className="text-gray-400 font-mono">NO FLIGHTS TO TRACK</p>
        <p className="text-sm text-gray-500 font-mono mt-2">
          Add flights to data/flights.json to start tracking
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {flights.map((flight) => {
        const status = getDisplayStatus(flight)
        return (
        <div
            key={`${flight.flightId}-${flight.date}`}
          className="bg-black border-2 border-pink-500 rounded p-4 shadow-[0_0_15px_rgba(236,72,153,0.5)] hover:shadow-[0_0_25px_rgba(236,72,153,0.8)] transition-shadow"
        >
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
            <div>
              <div className="flex items-center gap-2">
                <div className="text-cyan-400 text-xl font-mono">✈</div>
                  <h3 className="font-bold font-mono text-xl text-white tracking-wider">
                    {flight.flightId}
                  </h3>
                </div>
                <p className="text-sm text-cyan-300 font-mono ml-8">
                  {formatDate(flight.date)}
                </p>
            </div>
            <div className="text-right sm:text-left">
              <p
                  className={`font-bold font-mono tracking-wider ${getStatusColor(status)} [text-shadow:0_0_10px_currentColor]`}
              >
                  {getStatusText(flight)}
                </p>
                <p className="text-sm text-pink-400 font-mono">
                  {getRoute(flight)}
              </p>
              </div>
          </div>

            <div className="space-y-2">
              <div className="flex justify-between text-xs font-mono text-gray-400">
                <span className="text-cyan-400">
                  {getDepartureTime(flight)}
                  {getDepartureTimezone(flight) && (
                    <span className="text-gray-500 ml-1 text-[10px]">{getDepartureTimezone(flight)}</span>
                  )}
                </span>
                <span className="text-pink-400 font-bold">{getProgress(flight)}%</span>
                <span className="text-cyan-400">
                  {getArrivalTime(flight)}
                  {getArrivalTimezone(flight) && (
                    <span className="text-gray-500 ml-1 text-[10px]">{getArrivalTimezone(flight)}</span>
                  )}
                </span>
              </div>

            <div className="relative h-6 bg-gray-900 border-2 border-gray-700 rounded overflow-hidden">
              <div
                className="absolute inset-0 opacity-20"
                style={{
                  backgroundImage:
                    "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.1) 2px, rgba(255,255,255,0.1) 4px)",
                }}
                />

              <div
                  className={`absolute top-0 left-0 h-full transition-all duration-500 ${getProgressColor(status)} ${getProgressGlow(status)}`}
                  style={{ width: `${getProgress(flight)}%` }}
              >
                  <div className="absolute inset-0 animate-pulse opacity-50 bg-white" />
              </div>

              <div
                className="absolute inset-0 pointer-events-none"
                style={{
                  backgroundImage:
                    "repeating-linear-gradient(90deg, transparent, transparent 8px, rgba(0,0,0,0.2) 8px, rgba(0,0,0,0.2) 10px)",
                }}
                />
              </div>
            </div>

            {/* Extra details when available */}
            {flight.details && (
              <div className="mt-3 pt-3 border-t border-gray-800 grid grid-cols-2 gap-2 text-xs font-mono">
                <div>
                  <span className="text-gray-500">FROM:</span>{" "}
                  <span className="text-gray-300">{flight.details.origin.city}</span>
                </div>
                <div>
                  <span className="text-gray-500">TO:</span>{" "}
                  <span className="text-gray-300">{flight.details.destination.city}</span>
                </div>
              </div>
            )}
          </div>
        )
      })}

      {lastUpdated && (
        <div className="text-center text-xs text-gray-500 font-mono">
          Last updated: {new Date(lastUpdated).toLocaleTimeString()}
        </div>
      )}

      <div className="bg-black border-2 border-cyan-400 rounded p-4 mt-6 shadow-[0_0_15px_rgba(34,211,238,0.3)]">
        <p className="text-sm text-cyan-400 mb-2 font-bold font-mono tracking-wider">
          ⚙ FLIGHTAWARE API STATUS:
        </p>
        <ul className="text-xs text-gray-300 font-mono space-y-1 leading-relaxed">
          <li className="flex items-start gap-2">
            <span className="text-cyan-400">▸</span>
            <span>Flight details are cached in data/flights.json</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-yellow-400">▸</span>
            <span>Status updates only for flights within 2 days</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-pink-500">▸</span>
            <span>Set FLIGHTAWARE_API_KEY in .env.local</span>
          </li>
        </ul>
      </div>
    </div>
  )
}
