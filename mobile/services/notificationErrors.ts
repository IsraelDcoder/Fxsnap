export function getNotificationEnableErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error || 'Unknown notification error.');
  const registrationFailure = message.match(/Push token registration failed \((\d{3})\)(?::\s*(.*))?/i);

  if (registrationFailure) {
    const status = Number(registrationFailure[1]);
    const detail = registrationFailure[2]?.trim();
    if (status === 503) return 'FXSnap notification registration is temporarily unavailable. Please try again later.';
    if (status === 401 || status === 403) return 'FXSnap could not verify this device. Please restart the app and try again.';
    if (status >= 500) return `FXSnap could not save this device for notifications.${detail ? ` Server detail: ${detail}` : ' Please try again later.'}`;
    return `The notification service rejected this device.${detail ? ` Server detail: ${detail}` : ' Please reinstall or update the app and try again.'}`;
  }

  if (/Expo push-token request failed/i.test(message)) {
    const detail = message.replace(/^.*?Expo push-token request failed:\s*/i, '').trim();
    return `Expo could not issue a push token. Check this app build's push credentials and try again.${detail ? ` Detail: ${detail}` : ''}`;
  }

  if (/network request failed|failed to fetch|networkerror|internet connection|timed? ?out|timeout/i.test(message)) {
    return 'FXSnap could not reach the notification service. Check your internet connection and try again.';
  }

  if (/Expo project ID is missing/i.test(message)) {
    return 'Notifications are not configured for this app build. Please install the latest FXSnap release.';
  }

  return message;
}