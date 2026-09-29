// The WeatherKit bridge (D-57). Rust calls two C functions: `eden_weatherkit_forecast` blocks its caller (a blocking
// thread, never the main one) while WeatherKit answers, and returns one JSON document the caller frees with
// `eden_weatherkit_free`. Every figure leaves in metric and every time as milliseconds since the epoch, the way the
// app's forecast model holds them; a failure leaves as `{"error": "..."}`. The entitlement that lets WeatherKit
// answer is the app's own: without it the service refuses, and the app falls back to its default provider.
import CoreLocation
import Foundation
import WeatherKit

private struct Reading: Encodable {
    var time: Double
    var temp: Double
    var feelsLike: Double
    var condition: String
    var daylight: Bool
    var humidity: Double
    var dewPoint: Double
    var windSpeed: Double
    var windGust: Double?
    var windDirection: Double
    var pressure: Double
    var visibility: Double
    var cloudCover: Double
    var precipitation: Double
    var uv: Double
}

private struct Hour: Encodable {
    var time: Double
    var temp: Double
    var condition: String
    var daylight: Bool
    var precipChance: Double
}

private struct Day: Encodable {
    var time: Double
    var condition: String
    var hi: Double
    var lo: Double
    var precipChance: Double
    var precipAmount: Double
    var uvMax: Double
    var sunrise: Double?
    var sunset: Double?
}

private struct Credit: Encodable {
    var name: String
    var markLight: String?
    var markDark: String?
    var legalUrl: String
}

private struct Payload: Encodable {
    var timeZone: String
    var current: Reading
    var hours: [Hour]
    var days: [Day]
    var attribution: Credit
}

private struct Failure: Encodable {
    var error: String
}

/// How long the whole forecast may take before the bridge answers with an error, and the geocoder within it.
private let forecastSeconds: Double = 20
private let geocoderSeconds: Double = 4

private func ms(_ date: Date) -> Double {
    (date.timeIntervalSince1970 * 1000).rounded()
}

private func celsius(_ value: Measurement<UnitTemperature>) -> Double {
    value.converted(to: .celsius).value
}

private func kmh(_ value: Measurement<UnitSpeed>) -> Double {
    value.converted(to: .kilometersPerHour).value
}

private func reading(of day: DayWeather) -> Day {
    Day(
        time: ms(day.date),
        condition: day.condition.rawValue,
        hi: celsius(day.highTemperature),
        lo: celsius(day.lowTemperature),
        precipChance: day.precipitationChance * 100,
        precipAmount: day.precipitationAmount.converted(to: .millimeters).value,
        uvMax: Double(day.uvIndex.value),
        sunrise: day.sun.sunrise.map(ms),
        sunset: day.sun.sunset.map(ms)
    )
}

/// The mark as a data URI, so the page draws it without reaching Apple's host.
private func dataURI(_ url: URL) async -> String? {
    guard let (data, response) = try? await URLSession.shared.data(from: url) else { return nil }
    let type = response.mimeType ?? "image/png"
    return "data:\(type);base64,\(data.base64EncodedString())"
}

/// The first of an operation and a deadline: nil when the deadline wins. No call into Apple's services may hold the
/// forecast for ever.
private func within<T: Sendable>(seconds: Double, _ operation: @escaping @Sendable () async -> T?) async -> T? {
    await withTaskGroup(of: T?.self) { group in
        group.addTask { await operation() }
        group.addTask {
            try? await Task.sleep(nanoseconds: UInt64(seconds * 1_000_000_000))
            return nil
        }
        let first = await group.next() ?? nil
        group.cancelAll()
        return first
    }
}

/// The place's timezone from Apple's geocoder; the device's when it cannot say in time.
private func timeZone(of location: CLLocation) async -> TimeZone {
    let identifier = await within(seconds: geocoderSeconds) {
        let placemarks = try? await CLGeocoder().reverseGeocodeLocation(location)
        return placemarks?.first?.timeZone?.identifier
    }
    return identifier.flatMap(TimeZone.init(identifier:)) ?? TimeZone.current
}

private func forecast(latitude: Double, longitude: Double, pastDays: Int, forecastDays: Int) async throws -> Payload {
    let location = CLLocation(latitude: latitude, longitude: longitude)
    let zone = await timeZone(of: location)
    var calendar = Calendar(identifier: .gregorian)
    calendar.timeZone = zone

    let now = Date()
    let today = calendar.startOfDay(for: now)
    let firstDay = calendar.date(byAdding: .day, value: -pastDays, to: today) ?? today
    let lastDay = calendar.date(byAdding: .day, value: forecastDays, to: today) ?? today
    let firstHour = calendar.date(byAdding: .hour, value: -1, to: now) ?? now
    let lastHour = calendar.date(byAdding: .hour, value: 36, to: now) ?? now

    let service = WeatherService.shared
    let (current, hourly, daily) = try await service.weather(
        for: location,
        including: .current,
        .hourly(startDate: firstHour, endDate: lastHour),
        .daily(startDate: today, endDate: lastDay)
    )
    // The days behind today are their own request: one daily request spans ten days at most. If it fails the
    // forecast still stands, and the app fills the week's past from its mirror or its default provider.
    var days = daily.forecast.map(reading(of:))
    if pastDays > 0,
        let past = try? await service.weather(for: location, including: .daily(startDate: firstDay, endDate: today))
    {
        days = past.forecast.filter { $0.date < today }.map(reading(of:)) + days
    }
    let attribution = try await service.attribution
    async let markLight = dataURI(attribution.combinedMarkLightURL)
    async let markDark = dataURI(attribution.combinedMarkDarkURL)

    return Payload(
        timeZone: zone.identifier,
        current: Reading(
            time: ms(current.date),
            temp: celsius(current.temperature),
            feelsLike: celsius(current.apparentTemperature),
            condition: current.condition.rawValue,
            daylight: current.isDaylight,
            humidity: current.humidity * 100,
            dewPoint: celsius(current.dewPoint),
            windSpeed: kmh(current.wind.speed),
            windGust: current.wind.gust.map(kmh),
            windDirection: current.wind.direction.converted(to: .degrees).value,
            pressure: current.pressure.converted(to: .hectopascals).value,
            visibility: current.visibility.converted(to: .kilometers).value,
            cloudCover: current.cloudCover * 100,
            precipitation: current.precipitationIntensity.converted(to: .kilometersPerHour).value * 1_000_000,
            uv: Double(current.uvIndex.value)
        ),
        hours: hourly.forecast.map { hour in
            Hour(
                time: ms(hour.date),
                temp: celsius(hour.temperature),
                condition: hour.condition.rawValue,
                daylight: hour.isDaylight,
                precipChance: hour.precipitationChance * 100
            )
        },
        days: days,
        attribution: Credit(
            name: attribution.serviceName,
            markLight: await markLight,
            markDark: await markDark,
            legalUrl: attribution.legalPageURL.absoluteString
        )
    )
}

private func cString<T: Encodable>(_ value: T) -> UnsafeMutablePointer<CChar>? {
    let data = (try? JSONEncoder().encode(value)) ?? Data("{\"error\":\"encoding failed\"}".utf8)
    return strdup(String(decoding: data, as: UTF8.self))
}

/// A box the task fills and the waiting thread empties, under a lock: whichever comes second finds the other's mark.
private final class Box: @unchecked Sendable {
    private let lock = NSLock()
    private var value: UnsafeMutablePointer<CChar>?
    private var abandoned = false

    /// Stores the answer, or frees it when the caller has stopped waiting.
    func fill(_ answer: UnsafeMutablePointer<CChar>?) {
        lock.lock()
        defer { lock.unlock() }
        if abandoned { free(answer) } else { value = answer }
    }

    /// Takes the answer; nil marks the box abandoned, so a late answer is freed and never leaks.
    func take() -> UnsafeMutablePointer<CChar>? {
        lock.lock()
        defer { lock.unlock() }
        if value == nil { abandoned = true }
        return value
    }
}

@_cdecl("eden_weatherkit_forecast")
public func edenWeatherKitForecast(
    _ latitude: Double,
    _ longitude: Double,
    _ pastDays: Int32,
    _ forecastDays: Int32
) -> UnsafeMutablePointer<CChar>? {
    let done = DispatchSemaphore(value: 0)
    let box = Box()
    Task.detached {
        do {
            box.fill(
                cString(
                    try await forecast(
                        latitude: latitude,
                        longitude: longitude,
                        pastDays: Int(pastDays),
                        forecastDays: Int(forecastDays)
                    )
                )
            )
        } catch {
            box.fill(cString(Failure(error: String(describing: error))))
        }
        done.signal()
    }
    _ = done.wait(timeout: .now() + forecastSeconds)
    return box.take() ?? cString(Failure(error: "WeatherKit did not answer in \(Int(forecastSeconds)) seconds"))
}

@_cdecl("eden_weatherkit_free")
public func edenWeatherKitFree(_ pointer: UnsafeMutablePointer<CChar>?) {
    free(pointer)
}
