import Foundation
import Capacitor

// ActivityKit is only available on iOS 16.2+. The conditional import stops the
// compiler complaining when the host app targets an older iOS version.
#if canImport(ActivityKit)
import ActivityKit
#endif

@objc(LiveActivitiesPlugin)
public class LiveActivitiesPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "LiveActivitiesPlugin"
    public let jsName = "LiveActivities"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isSupported", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "areActivitiesEnabled", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openSettings", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "update", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "end", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getActiveActivities", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getPushToken", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getPushToStartToken", returnType: CAPPluginReturnPromise),
    ]

    private var stateObserver: NSObjectProtocol?
    private var tokenObserver: NSObjectProtocol?
    private var pushToStartObserver: NSObjectProtocol?
    private var actionObserver: NSObjectProtocol?

    public override func load() {
        stateObserver = NotificationCenter.default.addObserver(
            forName: .liveActivityStateChanged,
            object: nil,
            queue: .main
        ) { [weak self] notification in
            guard let userInfo = notification.userInfo else { return }
            self?.notifyListeners("activityStateChanged", data: userInfo as? [String: Any] ?? [:])
        }

        tokenObserver = NotificationCenter.default.addObserver(
            forName: .liveActivityPushTokenUpdated,
            object: nil,
            queue: .main
        ) { [weak self] notification in
            guard let userInfo = notification.userInfo else { return }
            self?.notifyListeners("pushTokenUpdated", data: userInfo as? [String: Any] ?? [:])
        }

        pushToStartObserver = NotificationCenter.default.addObserver(
            forName: .liveActivityPushToStartTokenUpdated,
            object: nil,
            queue: .main
        ) { [weak self] notification in
            guard let userInfo = notification.userInfo else { return }
            self?.notifyListeners("pushToStartTokenUpdated", data: userInfo as? [String: Any] ?? [:])
        }

        actionObserver = NotificationCenter.default.addObserver(
            forName: .liveActivityActionPerformed,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            self?.deliverPendingActions()
        }
        // Taps that launched the app before the plugin existed
        deliverPendingActions()

        // Begin observing the push-to-start token immediately so the server
        // can launch activities even before the app calls start().
        if #available(iOS 16.2, *) {
            LiveActivityManager.shared.startObservingPushToStartToken()
        }
    }

    deinit {
        [stateObserver, tokenObserver, pushToStartObserver, actionObserver].compactMap { $0 }.forEach {
            NotificationCenter.default.removeObserver($0)
        }
    }

    /// Forwards queued action-button taps to JS. Retained until a listener
    /// subscribes, so taps made before the web app was ready aren't lost.
    private func deliverPendingActions() {
        for action in LiveActivityActionQueue.drain() {
            notifyListeners("actionPerformed", data: action, retainUntilConsumed: true)
        }
    }

    // MARK: - isSupported

    @objc func isSupported(_ call: CAPPluginCall) {
        if #available(iOS 16.2, *) {
            call.resolve(["supported": LiveActivityManager.shared.isSupported()])
        } else {
            call.resolve(["supported": false])
        }
    }

    // MARK: - areActivitiesEnabled

    @objc func areActivitiesEnabled(_ call: CAPPluginCall) {
        if #available(iOS 16.2, *) {
            call.resolve(["enabled": LiveActivityManager.shared.areActivitiesEnabled()])
        } else {
            call.resolve(["enabled": false])
        }
    }

    // MARK: - openSettings

    @objc func openSettings(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard let url = URL(string: UIApplication.openSettingsURLString) else {
                call.reject("Unable to open settings")
                return
            }
            UIApplication.shared.open(url) { _ in call.resolve() }
        }
    }

    // MARK: - start

    @objc func start(_ call: CAPPluginCall) {
        guard #available(iOS 16.2, *) else {
            call.reject("Live Activities require iOS 16.2 or later.")
            return
        }

        guard let attributes = call.getObject("attributes") else {
            call.reject("Missing required option: attributes")
            return
        }
        guard let state = call.getObject("state") else {
            call.reject("Missing required option: state")
            return
        }

        let staleAfter = call.getDouble("staleAfterSeconds")

        do {
            let activityId = try LiveActivityManager.shared.start(
                attributes: attributes as [String: Any],
                state: state as [String: Any],
                staleAfterSeconds: staleAfter
            )
            call.resolve(["activityId": activityId])
        } catch {
            call.reject(error.localizedDescription)
        }
    }

    // MARK: - update

    @objc func update(_ call: CAPPluginCall) {
        guard #available(iOS 16.2, *) else {
            call.reject("Live Activities require iOS 16.2 or later.")
            return
        }

        guard let activityId = call.getString("activityId") else {
            call.reject("Missing required option: activityId")
            return
        }
        guard let state = call.getObject("state") else {
            call.reject("Missing required option: state")
            return
        }

        let alertTitle = call.getString("alertTitle")
        let alertBody  = call.getString("alertBody")

        Task {
            do {
                try await LiveActivityManager.shared.update(
                    activityId: activityId,
                    state: state as [String: Any],
                    alertTitle: alertTitle,
                    alertBody: alertBody
                )
                call.resolve()
            } catch {
                call.reject(error.localizedDescription)
            }
            Self.postActionHandled(activityId)
        }
    }

    // MARK: - end

    @objc func end(_ call: CAPPluginCall) {
        guard #available(iOS 16.2, *) else {
            call.reject("Live Activities require iOS 16.2 or later.")
            return
        }

        guard let activityId = call.getString("activityId") else {
            call.reject("Missing required option: activityId")
            return
        }

        let finalState     = call.getObject("finalState") as? [String: Any]
        let dismissPolicy  = call.getString("dismissalPolicy")

        Task {
            do {
                try await LiveActivityManager.shared.end(
                    activityId: activityId,
                    finalState: finalState,
                    dismissalPolicy: dismissPolicy
                )
                call.resolve()
            } catch {
                call.reject(error.localizedDescription)
            }
            Self.postActionHandled(activityId)
        }
    }

    /// Lets a running `LiveActivityActionIntent` finish: the app has reacted.
    private static func postActionHandled(_ activityId: String) {
        NotificationCenter.default.post(
            name: .liveActivityActionHandled,
            object: nil,
            userInfo: ["activityId": activityId]
        )
    }

    // MARK: - getPushToken

    @objc func getPushToken(_ call: CAPPluginCall) {
        guard #available(iOS 16.2, *) else {
            call.resolve(["token": NSNull(), "type": NSNull()])
            return
        }

        guard let activityId = call.getString("activityId") else {
            call.reject("Missing required option: activityId")
            return
        }

        let token = LiveActivityManager.shared.getPushToken(activityId: activityId)
        if let token = token {
            call.resolve(["token": token, "type": "apns"])
        } else {
            // Token may not be available yet — it's emitted via pushTokenUpdated
            // when the system issues it asynchronously after start().
            call.resolve(["token": NSNull(), "type": "apns"])
        }
    }

    // MARK: - getPushToStartToken

    @objc func getPushToStartToken(_ call: CAPPluginCall) {
        guard #available(iOS 17.2, *) else {
            // Push-to-start requires iOS 17.2+
            call.resolve(["token": NSNull(), "type": NSNull()])
            return
        }

        let token = LiveActivityManager.shared.getPushToStartToken()
        if let token = token {
            call.resolve(["token": token, "type": "apns"])
        } else {
            // Not issued yet — listen to pushToStartTokenUpdated for the value.
            call.resolve(["token": NSNull(), "type": "apns"])
        }
    }

    // MARK: - getActiveActivities

    @objc func getActiveActivities(_ call: CAPPluginCall) {
        if #available(iOS 16.2, *) {
            let activities = LiveActivityManager.shared.getActiveActivities()
            call.resolve(["activities": activities])
        } else {
            call.resolve(["activities": []])
        }
    }
}
