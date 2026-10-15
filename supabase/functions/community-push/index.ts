import { communityPushCopy, selectCommunityPushRecipients } from './policy.ts';

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
  eventId: number,
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

Deno.serve(async (request) => {
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);

  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  const accessToken = Deno.env.get('EXPO_ACCESS_TOKEN') || '';
  const baseUrl = (Deno.env.get('SUPABASE_URL') || '').replace(/\/+$/, '');
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
    const receiptsProcessed = await processReceipts(baseUrl, serviceKey, accessToken);
    const events = await supabaseRequest<CommunityEvent[]>(
      baseUrl,
      serviceKey,
      'rpc/fxsnap_community_claim_push_events',
      { method: 'POST', body: JSON.stringify({ p_limit: limit, p_object_id: objectId }) },
    );
    if (!events?.length) return json({ processed: 0, sent: 0, failed: 0, receiptsProcessed });

    const devices = await getPushDevices(baseUrl, serviceKey);
    let sent = 0;
    let failed = 0;

    for (const event of events) {
      try {
        const actorUsername = event.event_type === 'post'
          ? 'Someone'
          : await getActorUsername(baseUrl, serviceKey, event.actor_account_id);
        const activity = communityPushCopy(event.event_type, actorUsername);
        const recipients = selectCommunityPushRecipients(devices, event)
          .map((device) => ({
            device,
            message: {
              to: device.expo_token,
              ...activity,
              data: { type: 'community_activity', route: '/community', eventType: event.event_type },
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
            if (ticket.status === 'ok' && ticket.id) {
              await saveReceipt(baseUrl, serviceKey, ticket.id, device.device_id, event.id);
              sent += 1;
            } else if (ticket.status === 'error') {
              await logExpoFailure({
                code: ticket.details?.error,
                message: ticket.message,
              }, event.id, device.device_id, 'ticket');
              if (ticket.details?.error === 'DeviceNotRegistered') {
                await removeDevice(baseUrl, serviceKey, device.device_id);
              }
              failed += 1;
            }
          }
        }
        await finishEvent(baseUrl, serviceKey, event.id);
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

    return json({ processed: events.length, sent, failed, receiptsProcessed });
  } catch (error) {
    console.error('[Notifications] Community push dispatch failed.', error instanceof Error ? error.message : 'Unknown error.');
    return json({ error: 'Community push dispatch failed.' }, 500);
  }
});
