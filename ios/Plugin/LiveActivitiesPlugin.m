#import <Foundation/Foundation.h>
#import <Capacitor/Capacitor.h>

CAP_PLUGIN(LiveActivitiesPlugin, "LiveActivities",
  CAP_PLUGIN_METHOD(isSupported, CAPPluginReturnPromise);
  CAP_PLUGIN_METHOD(areActivitiesEnabled, CAPPluginReturnPromise);
  CAP_PLUGIN_METHOD(start, CAPPluginReturnPromise);
  CAP_PLUGIN_METHOD(update, CAPPluginReturnPromise);
  CAP_PLUGIN_METHOD(end, CAPPluginReturnPromise);
  CAP_PLUGIN_METHOD(getActiveActivities, CAPPluginReturnPromise);
  CAP_PLUGIN_METHOD(getPushToken, CAPPluginReturnPromise);
  CAP_PLUGIN_METHOD(getPushToStartToken, CAPPluginReturnPromise);
)
