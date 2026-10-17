import { WebPlugin } from '@capacitor/core';

import type {
  ActivityInfo,
  ActivityStateChangedEvent,
  EndOptions,
  LiveActivitiesPlugin,
  PushTokenResult,
  PushTokenUpdatedEvent,
  PushToStartTokenUpdatedEvent,
  StartOptions,
  StartResult,
  UpdateOptions,
  UpdateResult,
} from './definitions';
import type { PluginListenerHandle } from '@capacitor/core';

export class LiveActivitiesWeb extends WebPlugin implements LiveActivitiesPlugin {
  async isSupported(): Promise<{ supported: boolean }> {
    return { supported: false };
  }

  async areActivitiesEnabled(): Promise<{ enabled: boolean }> {
    return { enabled: false };
  }

  async openSettings(): Promise<void> {
    throw this.unimplemented('Live Activities are not supported on web.');
  }

  async start(_options: StartOptions): Promise<StartResult> {
    throw this.unimplemented('Live Activities are not supported on web.');
  }

  async update(_options: UpdateOptions): Promise<UpdateResult> {
    throw this.unimplemented('Live Activities are not supported on web.');
  }

  async end(_options: EndOptions): Promise<void> {
    throw this.unimplemented('Live Activities are not supported on web.');
  }

  async getActiveActivities(): Promise<{ activities: ActivityInfo[] }> {
    return { activities: [] };
  }

  async getPushToken(_options: { activityId: string }): Promise<PushTokenResult> {
    return { token: null, type: null };
  }

  async getPushToStartToken(): Promise<PushTokenResult> {
    return { token: null, type: null };
  }

  async addListener(
    _eventName: 'activityStateChanged' | 'pushTokenUpdated' | 'pushToStartTokenUpdated',
    _listenerFunc: (
      event: ActivityStateChangedEvent | PushTokenUpdatedEvent | PushToStartTokenUpdatedEvent,
    ) => void,
  ): Promise<PluginListenerHandle> {
    return { remove: async () => {} };
  }

  async removeAllListeners(): Promise<void> {}
}
