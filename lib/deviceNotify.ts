'use client';

import { Capacitor } from '@capacitor/core';

/**
 * Notifications on the device itself, outside the app's own bell.
 *
 * On the phone app they are native local notifications, which can also be
 * scheduled: a reminder set for tomorrow still arrives with the app closed.
 * On the web they are browser notifications, which only fire while a tab is
 * open and cannot be scheduled, so a deadline reminder is phone-only.
 */

export type DeviceAlert = { id: number; title: string; body: string; at?: Date };
export type AlertPermission = 'granted' | 'denied' | 'prompt' | 'unsupported';

const isNative = () => Capacitor.isNativePlatform();
const plugin = async () => (await import('@capacitor/local-notifications')).LocalNotifications;

export async function alertPermission(): Promise<AlertPermission> {
  if (isNative()) {
    const { display } = await (await plugin()).checkPermissions();
    return display === 'granted' ? 'granted' : display === 'denied' ? 'denied' : 'prompt';
  }
  if (typeof Notification === 'undefined') return 'unsupported';
  return Notification.permission === 'default' ? 'prompt' : Notification.permission;
}

export async function askAlertPermission(): Promise<boolean> {
  if (isNative()) {
    const { display } = await (await plugin()).requestPermissions();
    return display === 'granted';
  }
  if (typeof Notification === 'undefined') return false;
  return (await Notification.requestPermission()) === 'granted';
}

/** Shows alerts now. Several at once become one summary on the web, where each would be its own popup. */
export async function showAlerts(alerts: DeviceAlert[]): Promise<void> {
  if (!alerts.length) return;
  if (isNative()) {
    await (await plugin()).schedule({ notifications: alerts.map((a) => ({ id: a.id, title: a.title, body: a.body })) });
    return;
  }
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  const shown = alerts.length > 3
    ? [{ ...alerts[0], title: `${alerts.length} new from Canvas`, body: alerts.slice(0, 3).map((a) => a.title).join(' · ') }]
    : alerts;
  for (const alert of shown) new Notification(alert.title, { body: alert.body, tag: String(alert.id) });
}

/**
 * Replaces one group of scheduled reminders with another: every id in
 * `previous` is cancelled first, so a moved deadline or a finished task does
 * not leave its old reminder behind. Phone app only.
 */
export async function replaceScheduled(previous: number[], next: DeviceAlert[]): Promise<boolean> {
  if (!isNative()) return false;
  const notifications = await plugin();
  if (previous.length) await notifications.cancel({ notifications: previous.map((id) => ({ id })) });
  const future = next.filter((a) => a.at && a.at.getTime() > Date.now());
  if (future.length) {
    await notifications.schedule({
      notifications: future.map((a) => ({ id: a.id, title: a.title, body: a.body, schedule: { at: a.at!, allowWhileIdle: true } })),
    });
  }
  return true;
}
