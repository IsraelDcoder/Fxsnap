import {
  communityPushCopy,
  communityPostDestinationParams,
  pushTicketRetryError,
  selectCommunityPushRecipients,
  shouldRetrySystemAnnouncementTicket,
  systemAnnouncementPushEnabled,
  systemAnnouncementRoute,
} from './policy.ts';

type DenoRuntime = {
  env: { get(name: string): string | undefined };
  serve(handler: (request: Request) => Response | Promise<Response>): void;
};

const denoRuntime = (globalThis as typeof globalThis & { Deno: DenoRuntime }).Deno;

type PushDevice = {
  device_id: string;
  expo_token: string;
  preferences: Record<string, unknown> | null;
  account_id: string;
  supabase_user_id: string;
};

type CommunityEvent = {
  id: number;
  event_type: 'post' | 'reply' | 'reaction';
  object_id: string;
  actor_account_id: string;
  recipient_account_id: string | null;
};

type ExpoTicket = {
  status: 'ok' | 'error';
  id?: string;
  message?: string;
  details?: { error?: string };
};

type SystemAnnouncementPushJob = {
  id: string;
  announcement_id: string;
  device_id: string;
  attempts: number;
};

type SystemAnnouncement = {
  id: string;
  title: string;
  destination: string;
  destination_params: Record<string, unknown> | null;
  channels: Record<string, unknown>;
  status: string;
};

type SystemPushDevice = {
  device_id: string;
  expo_token: string;
  preferences: Record<string, unknown> | null;
};

type PendingSystemPush =
  | { job: SystemAnnouncementPushJob; reason: string; cancelled?: boolean }
  | { job: SystemAnnouncementPushJob; message: Record<string, unknown> };

const EXPO_SEND_URL = 'https://exp.host/--/api/v2/push/send';
const EXPO_RECEIPTS_URL = 'https://exp.host/--/api/v2/push/getReceipts';
const EXPO_CHUNK_SIZE = 100;
const RECEIPT_DELAY_MS = 15 * 60 * 1000;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

function timingSafeEqual(left: string, right: string) {
  const encoder = new TextEncoder();
  const leftBytes = encoder.encode(left);
  const rightBytes = encoder.encode(right);
  if (leftBytes.length !== rightBytes.length) return false;
  let difference = 0;
  for (let index = 0; index < leftBytes.length; index += 1) difference |= leftBytes[index] ^ rightBytes[index];
  return difference === 0;
}

function supabaseHeaders(serviceKey: string, extra: Record<string, string> = {}) {
  return {
    apikey: serviceKey,
    authorization: `Bearer ${serviceKey}`,
    'content-type': 'application/json',
    ...extra,
  };
}

async function supabaseRequest<T>(
  baseUrl: string,
  serviceKey: string,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch(`${baseUrl}/rest/v1/${path}`, {
    ...init,
    headers: supabaseHeaders(serviceKey, init.headers as Record<string, string> | undefined),
  });
  const text = await response.text();
  let payload: unknown = null;
  if (text) {
    try { payload = JSON.parse(text); } catch { payload = null; }
  }
  if (!response.ok) {
    const error = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
    throw new Error(`Supabase request failed (${response.status}, ${String(error.code || 'unknown')}).`);
  }
  return payload as T;
}

async function getPushDevices(baseUrl: string, serviceKey: string) {
  const entries: PushDevice[] = [];
  for (let offset = 0; ; offset += 1000) {
    const rows = await supabaseRequest<PushDevice[]>(
      baseUrl,
      serviceKey,
      'fxsnap_push_devices?select=device_id,expo_token,preferences,account_id,supabase_user_id&account_id=not.is.null&supabase_user_id=not.is.null&order=device_id.asc',
      { headers: { range: `${offset}-${offset + 999}` } },
    );
    entries.push(...(rows || []).filter((entry) => entry.preferences?.community !== false));
    if (!rows || rows.length < 1000) return entries;
  }
}

async function getActorUsername(baseUrl: string, serviceKey: string, accountId: string) {
  const profiles = await supabaseRequest<Array<{ username: string }>>(
    baseUrl,
    serviceKey,
    `fxsnap_community_profiles?account_id=eq.${encodeURIComponent(accountId)}&select=username&limit=1`,
  );
  return profiles?.[0]?.username || 'Someone';
}

async function getRootCommunityPostId(baseUrl: string, serviceKey: string, messageId: string) {
  let currentId = messageId;
  const visited = new Set<string>();
  for (let depth = 0; depth < 32 && !visited.has(currentId); depth += 1) {
    visited.add(currentId);
    const messages = await supabaseRequest<Array<{ id: string; reply_to_id: string | null }>>(
      baseUrl,
      serviceKey,
      `fxsnap_community_messages?select=id,reply_to_id&id=eq.${encodeURIComponent(currentId)}&limit=1`,
    );
    const message = messages?.[0];
    if (!message) return null;
    if (!message.reply_to_id) return message.id;
    currentId = message.reply_to_id;
  }
  return null;
}

async function removeDevice(baseUrl: string, serviceKey: string, deviceId: string) {
  await supabaseRequest<null>(
    baseUrl,
    serviceKey,
    `fxsnap_push_devices?device_id=eq.${encodeURIComponent(deviceId)}`,
    { method: 'DELETE', headers: { prefer: 'return=minimal' } },
  );
}

async function finishEvent(baseUrl: string, serviceKey: string, id: number, error: string | null = null) {
  await supabaseRequest<null>(baseUrl, serviceKey, 'rpc/fxsnap_community_finish_push_event', {
    method: 'POST',
    body: JSON.stringify({ p_id: id, p_error: error }),
  });
}

async function sendExpo(messages: Array<Record<string, unknown>>, accessToken: string) {
  const response = await fetch(EXPO_SEND_URL, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
      accept: 'application/json',
      'accept-encoding': 'gzip, deflate',
    },
    body: JSON.stringify(messages),
  });
  const payload = await response.json().catch(() => null) as { data?: ExpoTicket[] } | null;
  if (!response.ok || !Array.isArray(payload?.data)) {
    throw new Error(`Expo push request failed (${response.status}).`);
  }
  return payload.data;
}

async function saveReceipt(
  baseUrl: string,
  serviceKey: string,
  ticketId: string,
  deviceId: string,
  eventId: number,
) {
  await supabaseRequest<null>(baseUrl, serviceKey, 'fxsnap_push_receipts', {
    method: 'POST',
    headers: { prefer: 'resolution=ignore-duplicates,return=minimal' },
    body: JSON.stringify({ receipt_id: ticketId, device_id: deviceId, event_id: eventId }),
  });
}

async function logExpoFailure(
  error: unknown,
  eventId: string | number,
  deviceId: string,
  phase: 'ticket' | 'receipt',
) {
  const detail = error && typeof error === 'object' ? error as Record<string, unknown> : {};
  const code = typeof detail.code === 'string' ? detail.code : 'UnknownError';
  const message = typeof detail.message === 'string' ? detail.message.slice(0, 240) : 'Expo reported a push delivery error.';
  console.error('[Notifications] Expo push delivery error.', { phase, eventId, deviceId, code, message });
}

async function processReceipts(baseUrl: string, serviceKey: string, accessToken: string) {
  const cutoff = new Date(Date.now() - RECEIPT_DELAY_MS).toISOString();
  const receipts = await supabaseRequest<Array<{ receipt_id: string; device_id: string; event_id: number }>>(
    baseUrl,
    serviceKey,
    `fxsnap_push_receipts?select=receipt_id,device_id,event_id&created_at=lte.${encodeURIComponent(cutoff)}&order=created_at.asc&limit=300`,
  );
  let processed = 0;

  for (let offset = 0; offset < receipts.length; offset += EXPO_CHUNK_SIZE) {
    const chunk = receipts.slice(offset, offset + EXPO_CHUNK_SIZE);
    const response = await fetch(EXPO_RECEIPTS_URL, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${accessToken}`,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify({ ids: chunk.map((receipt) => receipt.receipt_id) }),
    });
    const payload = await response.json().catch(() => null) as {
      data?: Record<string, { status?: string; message?: string; details?: { error?: string } }>;
    } | null;
    if (!response.ok || !payload?.data) throw new Error(`Expo receipt request failed (${response.status}).`);

    for (const receipt of chunk) {
      const result = payload.data[receipt.receipt_id];
      if (!result) continue;
      if (result.status === 'error') {
        const error = { code: result.details?.error, message: result.message };
        await logExpoFailure(error, receipt.event_id, receipt.device_id, 'receipt');
        if (result.details?.error === 'DeviceNotRegistered') {
          await removeDevice(baseUrl, serviceKey, receipt.device_id);
        }
      }
      await supabaseRequest<null>(
        baseUrl,
        serviceKey,
        `fxsnap_push_receipts?receipt_id=eq.${encodeURIComponent(receipt.receipt_id)}`,
        { method: 'DELETE', headers: { prefer: 'return=minimal' } },
      );
      processed += 1;
    }
  }
  return processed;
}

function quotedInFilter(values: string[]) {
  return `in.(${values.map((value) => `"${value.replace(/["\\]/g, '')}"`).join(',')})`;
}

async function finishSystemPushJob(
  baseUrl: string,
  serviceKey: string,
  jobId: string,
  options: { ticketId?: string; error?: string; retryable?: boolean; cancelled?: boolean } = {},
) {
  await supabaseRequest<null>(baseUrl, serviceKey, 'rpc/fxsnap_system_announcement_finish_push_job', {
    method: 'POST',
    body: JSON.stringify({
      p_id: jobId,
      p_ticket_id: options.ticketId || null,
      p_error: options.error || null,
      p_retryable: options.retryable !== false,
      p_cancelled: options.cancelled === true,
    }),
  });
}

async function processSystemReceipts(baseUrl: string, serviceKey: string, accessToken: string) {
  const cutoff = new Date(Date.now() - RECEIPT_DELAY_MS).toISOString();
  const receipts = await supabaseRequest<Array<{ receipt_id: string; push_job_id: string; device_id: string }>>(
    baseUrl,
    serviceKey,
    `fxsnap_system_announcement_push_receipts?select=receipt_id,push_job_id,device_id&created_at=lte.${encodeURIComponent(cutoff)}&order=created_at.asc&limit=300`,
  );
  let processed = 0;

  for (let offset = 0; offset < receipts.length; offset += EXPO_CHUNK_SIZE) {
    const chunk = receipts.slice(offset, offset + EXPO_CHUNK_SIZE);
    const response = await fetch(EXPO_RECEIPTS_URL, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${accessToken}`,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify({ ids: chunk.map((receipt) => receipt.receipt_id) }),
    });
    const payload = await response.json().catch(() => null) as {
      data?: Record<string, { status?: string; message?: string; details?: { error?: string } }>;
    } | null;
    if (!response.ok || !payload?.data) throw new Error(`Expo announcement receipt request failed (${response.status}).`);

    for (const receipt of chunk) {
      const result = payload.data[receipt.receipt_id];
      if (!result) continue;
      if (result.status === 'ok') {
        await supabaseRequest<null>(
          baseUrl,
          serviceKey,
          `fxsnap_system_announcement_push_queue?id=eq.${encodeURIComponent(receipt.push_job_id)}&status=eq.accepted`,
          { method: 'PATCH', headers: { prefer: 'return=minimal' }, body: JSON.stringify({ status: 'delivered', last_error: null, updated_at: new Date().toISOString() }) },
        );
      } else {
        const reason = result.message || result.details?.error || 'Expo did not confirm delivery.';
        await supabaseRequest<null>(
          baseUrl,
          serviceKey,
          `fxsnap_system_announcement_push_queue?id=eq.${encodeURIComponent(receipt.push_job_id)}&status=eq.accepted`,
          { method: 'PATCH', headers: { prefer: 'return=minimal' }, body: JSON.stringify({ status: 'failed', last_error: reason.slice(0, 500), updated_at: new Date().toISOString() }) },
        );
        await logExpoFailure({
          code: result.details?.error,
          message: result.message,
        }, `system:${receipt.push_job_id}`, receipt.device_id, 'receipt');
        if (result.details?.error === 'DeviceNotRegistered') {
          await removeDevice(baseUrl, serviceKey, receipt.device_id);
        }
      }
      await supabaseRequest<null>(
        baseUrl,
        serviceKey,
        `fxsnap_system_announcement_push_receipts?receipt_id=eq.${encodeURIComponent(receipt.receipt_id)}`,
        { method: 'DELETE', headers: { prefer: 'return=minimal' } },
      );
      processed += 1;
    }
  }
  return processed;
}

async function processSystemAnnouncementPushes(baseUrl: string, serviceKey: string, accessToken: string, limit: number) {
  const jobs = await supabaseRequest<SystemAnnouncementPushJob[]>(
    baseUrl,
    serviceKey,
    'rpc/fxsnap_system_announcement_claim_push_jobs',
    { method: 'POST', body: JSON.stringify({ p_limit: limit }) },
  );
  if (!jobs?.length) return { processed: 0, sent: 0, failed: 0 };

  const ids = [...new Set(jobs.map((job) => job.device_id).filter((id) => /^[a-zA-Z0-9_-]{1,160}$/.test(id)))];
  const announcementIds = [...new Set(jobs.map((job) => job.announcement_id))];
  const [devices, announcements] = await Promise.all([
    ids.length
      ? supabaseRequest<SystemPushDevice[]>(
        baseUrl,
        serviceKey,
        `fxsnap_push_devices?select=device_id,expo_token,preferences&device_id=${quotedInFilter(ids)}`,
      )
      : Promise.resolve([]),
    announcementIds.length
      ? supabaseRequest<SystemAnnouncement[]>(
        baseUrl,
        serviceKey,
        `fxsnap_system_announcements?select=id,title,destination,destination_params,channels,status&id=${quotedInFilter(announcementIds)}`,
      )
      : Promise.resolve([]),
  ]);
  const deviceById = new Map((devices || []).map((device) => [device.device_id, device]));
  const announcementById = new Map((announcements || []).map((announcement) => [announcement.id, announcement]));
  let sent = 0;
  let failed = 0;

  const pending: PendingSystemPush[] = [];
  for (const job of jobs) {
    if (!/^[a-zA-Z0-9_-]{1,160}$/.test(job.device_id)) {
      pending.push({ job, reason: 'Push device identifier was invalid.' });
      continue;
    }
    const device = deviceById.get(job.device_id);
    const announcement = announcementById.get(job.announcement_id);
    if (!device || !announcement) {
      pending.push({ job, reason: 'Push device or announcement is no longer available.' });
      continue;
    }
    if (announcement.status !== 'published') {
      pending.push({ job, cancelled: true, reason: 'The announcement was cancelled before delivery.' });
      continue;
    }
    if (!systemAnnouncementPushEnabled(device.preferences) || !device.expo_token) {
      pending.push({ job, cancelled: true, reason: 'The device opted out of system announcement push.' });
      continue;
    }
    const route = systemAnnouncementRoute(announcement.destination);
    if (!route) {
      pending.push({ job, reason: 'Announcement destination is not allowed.' });
      continue;
    }
    pending.push({
      job,
      message: {
        to: device.expo_token,
        title: announcement.title,
        body: 'Tap to view this FXSnap announcement.',
        data: {
          type: 'system_announcement',
          route,
          announcementId: announcement.id,
          destinationParams: route === '/community'
            && typeof announcement.destination_params?.postId === 'string'
            && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(announcement.destination_params.postId)
            ? { postId: announcement.destination_params.postId }
            : {},
          inAppBanner: announcement.channels.in_app_banner === true,
        },
        channelId: 'fxsnap-system',
        sound: 'default',
        priority: 'high',
      },
    });
  }

  for (const entry of pending) {
    if ('reason' in entry) {
      await finishSystemPushJob(baseUrl, serviceKey, entry.job.id, {
        error: entry.reason,
        retryable: false,
        cancelled: 'cancelled' in entry && entry.cancelled === true,
      });
      failed += entry.cancelled ? 0 : 1;
    }
  }

  const deliverable = pending.filter((entry): entry is Extract<PendingSystemPush, { message: Record<string, unknown> }> => 'message' in entry);
  for (let offset = 0; offset < deliverable.length; offset += EXPO_CHUNK_SIZE) {
    const chunk = deliverable.slice(offset, offset + EXPO_CHUNK_SIZE);
    try {
      const tickets = await sendExpo(chunk.map((entry) => entry.message), accessToken);
      if (tickets.length !== chunk.length) throw new Error('Expo returned an unexpected ticket count.');
      for (let index = 0; index < tickets.length; index += 1) {
        const { job } = chunk[index];
        const ticket = tickets[index];
        if (ticket.status === 'ok' && ticket.id) {
          const accepted = await supabaseRequest<boolean>(baseUrl, serviceKey, 'rpc/fxsnap_system_announcement_accept_push_job', {
            method: 'POST',
            body: JSON.stringify({ p_id: job.id, p_ticket_id: ticket.id, p_device_id: job.device_id }),
          });
          if (accepted) sent += 1;
          else failed += 1;
          continue;
        }
        const code = ticket.details?.error;
        const message = ticket.message || 'Expo did not accept the push notification.';
        await finishSystemPushJob(baseUrl, serviceKey, job.id, {
          error: `${code ? `${code}: ` : ''}${message}`,
          retryable: shouldRetrySystemAnnouncementTicket(ticket),
        });
        if (code === 'DeviceNotRegistered') await removeDevice(baseUrl, serviceKey, job.device_id);
        await logExpoFailure({ code, message }, `system:${job.id}`, job.device_id, 'ticket');
        failed += 1;
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message.slice(0, 500) : 'Unknown Expo push failure.';
      for (const { job } of chunk) {
        await finishSystemPushJob(baseUrl, serviceKey, job.id, { error: reason, retryable: true });
      }
      failed += chunk.length;
    }
  }

  return { processed: jobs.length, sent, failed };
}

denoRuntime.serve(async (request) => {
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);

  const serviceKey = denoRuntime.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  const accessToken = denoRuntime.env.get('EXPO_ACCESS_TOKEN') || '';
  const baseUrl = (denoRuntime.env.get('SUPABASE_URL') || '').replace(/\/+$/, '');
  if (!serviceKey || !accessToken || !baseUrl) {
    console.error('[Notifications] Community push Edge Function is missing required configuration.');
    return json({ error: 'Community push delivery is not configured.' }, 503);
  }

  const authorization = request.headers.get('authorization') || '';
  if (!timingSafeEqual(authorization, `Bearer ${serviceKey}`)) {
    return json({ error: 'Unauthorized.' }, 401);
  }

  let body: { objectId?: unknown; limit?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid request body.' }, 400);
  }
  const objectId = typeof body.objectId === 'string' ? body.objectId : null;
  const requestedLimit = typeof body.limit === 'number' ? body.limit : 100;
  const limit = Math.min(100, Math.max(1, Math.floor(requestedLimit)));

  try {
    const [communityReceiptsProcessed, systemReceiptsProcessed] = await Promise.all([
      processReceipts(baseUrl, serviceKey, accessToken),
      processSystemReceipts(baseUrl, serviceKey, accessToken),
    ]);
    const events = await supabaseRequest<CommunityEvent[]>(
      baseUrl,
      serviceKey,
      'rpc/fxsnap_community_claim_push_events',
      { method: 'POST', body: JSON.stringify({ p_limit: limit, p_object_id: objectId }) },
    );
    const devices = events?.length ? await getPushDevices(baseUrl, serviceKey) : [];
    let sent = 0;
    let failed = 0;

    for (const event of events || []) {
      try {
        let retryError: string | null = null;
        const actorUsername = event.event_type === 'post'
          ? 'Someone'
          : await getActorUsername(baseUrl, serviceKey, event.actor_account_id);
        const activity = communityPushCopy(event.event_type, actorUsername);
        const postId = event.event_type === 'post'
          ? event.object_id
          : await getRootCommunityPostId(baseUrl, serviceKey, event.object_id);
        const recipients = selectCommunityPushRecipients(devices, event)
          .map((device) => ({
            device,
            message: {
              to: device.expo_token,
              ...activity,
              data: {
                type: 'community_activity',
                route: '/community',
                eventType: event.event_type,
                destinationParams: communityPostDestinationParams(postId),
              },
              channelId: 'fxsnap-community',
              sound: 'default',
              priority: 'default',
            },
          }));

        for (let offset = 0; offset < recipients.length; offset += EXPO_CHUNK_SIZE) {
          const chunk = recipients.slice(offset, offset + EXPO_CHUNK_SIZE);
          const tickets = await sendExpo(chunk.map((recipient) => recipient.message), accessToken);
          if (tickets.length !== chunk.length) throw new Error('Expo returned an unexpected ticket count.');
          for (let index = 0; index < tickets.length; index += 1) {
            const ticket = tickets[index];
            const device = chunk[index].device;
            const ticketError = pushTicketRetryError(ticket);
            if (!ticketError && ticket.status === 'ok' && ticket.id) {
              await saveReceipt(baseUrl, serviceKey, ticket.id, device.device_id, event.id);
              sent += 1;
            } else {
              await logExpoFailure({
                code: ticket.details?.error,
                message: ticket.message || ticketError,
              }, event.id, device.device_id, 'ticket');
              if (ticket.details?.error === 'DeviceNotRegistered') {
                await removeDevice(baseUrl, serviceKey, device.device_id);
              } else {
                retryError ||= ticketError;
              }
              failed += 1;
            }
          }
        }
        await finishEvent(baseUrl, serviceKey, event.id, retryError);
      } catch (error) {
        const detail = error instanceof Error ? error.message : 'Unknown push delivery error.';
        await finishEvent(baseUrl, serviceKey, event.id, detail.slice(0, 500));
        console.error('[Notifications] Community activity push delivery failed.', {
          eventId: event.id,
          message: detail.slice(0, 240),
        });
        failed += 1;
      }
    }

    const systemAnnouncements = await processSystemAnnouncementPushes(baseUrl, serviceKey, accessToken, limit);
    return json({
      processed: (events || []).length + systemAnnouncements.processed,
      sent: sent + systemAnnouncements.sent,
      failed: failed + systemAnnouncements.failed,
      receiptsProcessed: communityReceiptsProcessed + systemReceiptsProcessed,
      systemAnnouncements,
    });
  } catch (error) {
    console.error('[Notifications] Community push dispatch failed.', error instanceof Error ? error.message : 'Unknown error.');
    return json({ error: 'Community push dispatch failed.' }, 500);
  }
});
