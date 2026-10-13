function redactNotificationDetail(value: string) {
  return value
    .replace(/Exponent(?:Push)?Token\[[^\]]+\]/gi, '[redacted Expo push token]')
    .replace(/\bBearer\s+\S+/gi, 'Bearer [redacted]')
    .replace(/\b(access[_-]?token|api[_-]?key|secret)\s*[:=]\s*[^,\s]+/gi, '$1=[redacted]');
}

export function formatExpoPushTokenError(error: unknown) {
  if (typeof error !== 'object' || error === null) return redactNotificationDetail(String(error));
  const value = error as Record<string, unknown>;
  const fields = [
    typeof value.name === 'string' ? value.name : null,
    typeof value.message === 'string' ? value.message : null,
    typeof value.code === 'string' || typeof value.code === 'number' ? `code=${value.code}` : null,
    typeof value.details === 'string' ? value.details : null,
  ].filter((field): field is string => Boolean(field));
  if (typeof value.cause === 'object' && value.cause !== null) {
    const cause = value.cause as Record<string, unknown>;
    const causeDetails = [
      typeof cause.name === 'string' ? cause.name : null,
      typeof cause.message === 'string' ? cause.message : null,
    ].filter((field): field is string => Boolean(field));
    if (causeDetails.length) fields.push(`cause=${causeDetails.join(': ')}`);
  } else if (typeof value.cause === 'string') {
    fields.push(`cause=${value.cause}`);
  }
  return redactNotificationDetail(fields.length ? fields.join(' | ') : String(error));
}

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
    return `Expo could not issue a push token.${detail ? ` Error: ${detail}` : ' Check this app build’s Firebase push configuration.'}`;
  }

  if (/network request failed|failed to fetch|networkerror|internet connection|timed? ?out|timeout/i.test(message)) {
    return 'FXSnap could not reach the notification service. Check your internet connection and try again.';
  }

  if (/Expo project ID is missing/i.test(message)) {
    return 'Notifications are not configured for this app build. Please install the latest FXSnap release.';
  }

  return message;
}