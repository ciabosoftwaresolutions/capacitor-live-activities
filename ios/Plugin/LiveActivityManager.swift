import Foundation

#if canImport(ActivityKit)
import ActivityKit
#endif

// ---------------------------------------------------------------------------
// Generic JSON-driven ActivityAttributes
// ---------------------------------------------------------------------------
// Both the plugin and the companion Widget Extension share this type so they
// can exchange data through the shared App Group without any custom codegen.

@available(iOS 16.2, *)
public struct LiveActivityAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        public var title: String
        public var subtitle: String?
        public var progress: Double?
        public var icon: String?
        public var extras: [String: AnyCodable]

        public init(
            title: String,
            subtitle: String? = nil,
            progress: Double? = nil,
            icon: String? = nil,
            extras: [String: AnyCodable] = [:]
        ) {
            self.title = title
            self.subtitle = subtitle
            self.progress = progress
            self.icon = icon
            self.extras = extras
        }
    }

    public var activityType: String
    public var staticData: [String: AnyCodable]

    public init(activityType: String, staticData: [String: AnyCodable] = [:]) {
        self.activityType = activityType
        self.staticData = staticData
    }
}

// ---------------------------------------------------------------------------
// AnyCodable — lightweight wrapper so we can store arbitrary JSON in Codable
// ---------------------------------------------------------------------------

public struct AnyCodable: Codable, Hashable {
    public let value: Any

    public init(_ value: Any) { self.value = value }

    public init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if let v = try? container.decode(Bool.self)   { value = v; return }
        if let v = try? container.decode(Int.self)    { value = v; return }
        if let v = try? container.decode(Double.self) { value = v; return }
        if let v = try? container.decode(String.self) { value = v; return }
        if let v = try? container.decode([String: AnyCodable].self) { value = v; return }
        if let v = try? container.decode([AnyCodable].self) { value = v; return }
        value = NSNull()
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch value {
        case let v as Bool:                    try container.encode(v)
        case let v as Int:                     try container.encode(v)
        case let v as Double:                  try container.encode(v)
        case let v as String:                  try container.encode(v)
        case let v as [String: AnyCodable]:    try container.encode(v)
        case let v as [AnyCodable]:            try container.encode(v)
        default:                               try container.encodeNil()
        }
    }

    public static func == (lhs: AnyCodable, rhs: AnyCodable) -> Bool {
        // Simple equality for Hashable conformance
        "\(lhs.value)" == "\(rhs.value)"
    }

    public func hash(into hasher: inout Hasher) {
        hasher.combine("\(value)")
    }
}

// ---------------------------------------------------------------------------
// LiveActivityManager
// ---------------------------------------------------------------------------

@available(iOS 16.2, *)
public class LiveActivityManager {

    static let shared = LiveActivityManager()
    private init() {}

    // activityId → Activity<LiveActivityAttributes>
    private var activities: [String: Activity<LiveActivityAttributes>] = [:]

    // MARK: - isSupported

    func isSupported() -> Bool {
        ActivityAuthorizationInfo().areActivitiesEnabled
    }

    // MARK: - areActivitiesEnabled

    func areActivitiesEnabled() -> Bool {
        ActivityAuthorizationInfo().areActivitiesEnabled
    }

    // MARK: - start

    func start(
        attributes: [String: Any],
        state: [String: Any],
        staleAfterSeconds: Double?
    ) throws -> String {
        guard ActivityAuthorizationInfo().areActivitiesEnabled else {
            throw LiveActivityError.activitiesDisabled
        }

        let activityType = attributes["activityType"] as? String ?? "unknown"
        var staticData: [String: AnyCodable] = [:]
        for (k, v) in attributes where k != "activityType" {
            staticData[k] = AnyCodable(v)
        }

        let contentState = try buildContentState(from: state)
        let activityAttributes = LiveActivityAttributes(
            activityType: activityType,
            staticData: staticData
        )

        var staleDate: Date? = nil
        if let seconds = staleAfterSeconds, seconds > 0 {
            staleDate = Date().addingTimeInterval(seconds)
        }

        let activity = try Activity<LiveActivityAttributes>.request(
            attributes: activityAttributes,
            contentState: contentState,
            pushType: nil
        )

        let activityId = activity.id
        activities[activityId] = activity

        // Observe state changes and forward them as Capacitor events
        Task {
            for await stateUpdate in activity.activityStateUpdates {
                NotificationCenter.default.post(
                    name: .liveActivityStateChanged,
                    object: nil,
                    userInfo: [
                        "activityId": activityId,
                        "activityState": stateUpdate.rawStateString
                    ]
                )
            }
        }

        // Observe push token changes (issued on first request, may rotate)
        Task {
            for await tokenData in activity.pushTokenUpdates {
                let token = tokenData.map { String(format: "%02x", $0) }.joined()
                NotificationCenter.default.post(
                    name: .liveActivityPushTokenUpdated,
                    object: nil,
                    userInfo: [
                        "activityId": activityId,
                        "token": token,
                        "type": "apns"
                    ]
                )
            }
        }

        return activityId
    }

    // MARK: - update

    func update(
        activityId: String,
        state: [String: Any],
        alertTitle: String?,
        alertBody: String?
    ) async throws {
        guard let activity = activities[activityId] else {
            throw LiveActivityError.activityNotFound(activityId)
        }

        let contentState = try buildContentState(from: state)
        var alertConfig: AlertConfiguration? = nil

        if let title = alertTitle, let body = alertBody {
            alertConfig = AlertConfiguration(
                title: LocalizedStringResource(stringLiteral: title),
                body: LocalizedStringResource(stringLiteral: body),
                sound: .default
            )
        }

        await activity.update(
            ActivityContent(
                state: contentState,
                staleDate: nil
            ),
            alertConfiguration: alertConfig
        )
    }

    // MARK: - end

    func end(
        activityId: String,
        finalState: [String: Any]?,
        dismissalPolicy: String?
    ) async throws {
        guard let activity = activities[activityId] else {
            throw LiveActivityError.activityNotFound(activityId)
        }

        let policy: ActivityUIDismissalPolicy
        switch dismissalPolicy {
        case "immediate":    policy = .immediate
        case "after-delay":  policy = .after(.now + 30)
        default:             policy = .default
        }

        if let stateDict = finalState {
            let contentState = try buildContentState(from: stateDict)
            await activity.end(
                ActivityContent(state: contentState, staleDate: nil),
                dismissalPolicy: policy
            )
        } else {
            await activity.end(dismissalPolicy: policy)
        }

        activities.removeValue(forKey: activityId)
    }

    // MARK: - getPushToken

    func getPushToken(activityId: String) -> String? {
        guard let activity = activities[activityId] else { return nil }
        guard let tokenData = activity.pushToken else { return nil }
        return tokenData.map { String(format: "%02x", $0) }.joined()
    }

    // MARK: - getActiveActivities

    func getActiveActivities() -> [[String: String]] {
        Activity<LiveActivityAttributes>.activities.map { activity in
            [
                "activityId": activity.id,
                "activityType": activity.attributes.activityType,
                "state": activity.activityState.rawStateString
            ]
        }
    }

    // MARK: - Helpers

    private func buildContentState(from dict: [String: Any]) throws -> LiveActivityAttributes.ContentState {
        guard let title = dict["title"] as? String else {
            throw LiveActivityError.missingField("title")
        }

        var extras: [String: AnyCodable] = [:]
        let reserved: Set<String> = ["title", "subtitle", "progress", "icon"]
        for (k, v) in dict where !reserved.contains(k) {
            extras[k] = AnyCodable(v)
        }

        return LiveActivityAttributes.ContentState(
            title: title,
            subtitle: dict["subtitle"] as? String,
            progress: dict["progress"] as? Double,
            icon: dict["icon"] as? String,
            extras: extras
        )
    }
}

// MARK: - Helpers on ActivityState

@available(iOS 16.2, *)
private extension ActivityState {
    var rawStateString: String {
        switch self {
        case .active:    return "active"
        case .ended:     return "ended"
        case .dismissed: return "dismissed"
        @unknown default: return "active"
        }
    }
}

// MARK: - Notification name

extension Notification.Name {
    static let liveActivityStateChanged    = Notification.Name("LiveActivityStateChanged")
    static let liveActivityPushTokenUpdated = Notification.Name("LiveActivityPushTokenUpdated")
}

// MARK: - Errors

enum LiveActivityError: LocalizedError {
    case activitiesDisabled
    case activityNotFound(String)
    case missingField(String)

    var errorDescription: String? {
        switch self {
        case .activitiesDisabled:        return "Live Activities are disabled for this app."
        case .activityNotFound(let id):  return "No active Live Activity found with id: \(id)"
        case .missingField(let field):   return "Required field missing from state: \(field)"
        }
    }
}
