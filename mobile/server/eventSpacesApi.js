const { z } = require('zod');
const { createLiveKitService } = require('./livekitService');

const PUBLIC_COLUMNS = 'id,title,description,topic,visibility,status,host_account_id,host_name,host_picture_url,scheduled_at,timezone,waiting_room_opens_at,duration_minutes,allow_speaking_requests,comments_enabled,featured,cancellation_reason,created_at,updated_at';
const ADMIN_COLUMNS = `${PUBLIC_COLUMNS},created_by_account_id,cancelled_at,archived_at,actual_started_at,actual_ended_at,livekit_room_name`;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const spaceInput = z.object({
  title: z.string().trim().min(3).max(100),
  description: z.string().trim().max(1200).default(''),
  topic: z.string().trim().min(2).max(48),
  visibility: z.enum(['public', 'private']).default('public'),
  hostAccountId: z.string().trim().min(3).max(160).optional(),
  scheduledAt: z.string().datetime({ offset: true }).nullable().optional(),
  timezone: z.string().trim().min(1).max(80).default('UTC'),
  waitingRoomOpensAt: z.string().datetime({ offset: true }).nullable().optional(),
  durationMinutes: z.number().int().min(5).max(480).nullable().optional(),
  allowSpeakingRequests: z.boolean().default(false),
  commentsEnabled: z.boolean().default(true),
  featured: z.boolean().default(false),
  status: z.enum(['draft', 'scheduled']).default('draft'),
}).strict();

function createEventSpacesApi({
  getActor,
  sendJson,
  readJsonBody,
  livekit = createLiveKitService(),
  sendLiveSpaceNotification = async () => ({ sent: 0 }),
}) {
  function config() {
    const supabaseUrl = String(process.env.SUPABASE_URL || process.env.SUPABASE_PROJECT_URL || '').replace(/\/+$/, '');
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    if (!supabaseUrl || !serviceKey) throw Object.assign(new Error('Events storage is not configured.'), { status: 503 });
    return { supabaseUrl, serviceKey };
  }

  async function database(path, { method = 'GET', body, prefer } = {}) {
    const { supabaseUrl, serviceKey } = config();
    let response;
    try {
      response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
        method,
        headers: {
          apikey: serviceKey,
          authorization: `Bearer ${serviceKey}`,
          'content-type': 'application/json',
          ...(prefer ? { prefer } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    } catch (error) {
      console.error('[Events] Storage request failed.', error instanceof Error ? error.message : 'Unknown error.');
      throw Object.assign(new Error('Events storage is temporarily unavailable.'), { status: 502 });
    }
    const payloadText = await response.text();
    let payload = null;
    if (payloadText) {
      try { payload = JSON.parse(payloadText); } catch { payload = null; }
    }
    if (!response.ok) {
      console.error('[Events] Storage rejected a request.', { status: response.status, path: path.split('?')[0] });
      const status = response.status === 404 ? 503 : response.status >= 500 ? 502 : response.status;
      throw Object.assign(new Error(status === 503
        ? 'Events database migration is not installed or is unavailable.'
        : 'Events storage could not complete the request.'), { status });
    }
    return payload;
  }

  function isoDate(value) {
    if (value == null) return null;
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? new Date(parsed).toISOString() : undefined;
  }

  function validTimeZone(timezone) {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: timezone });
      return true;
    } catch {
      return false;
    }
  }

  async function resolveHost(accountId, actor) {
    const target = accountId || actor.accountId;
    if (target !== actor.accountId && !actor.isAdmin) {
      throw Object.assign(new Error('Only administrators can assign a different host.'), { status: 403 });
    }
    const rows = await database(
      `fxsnap_community_profiles?account_id=eq.${encodeURIComponent(target)}&select=account_id,username,picture_url,status&limit=1`,
    );
    const profile = Array.isArray(rows) ? rows[0] : null;
    if (!profile || !['active', 'muted'].includes(profile.status)) {
      throw Object.assign(new Error('Choose an active FXSnap Community member as the host.'), { status: 400 });
    }
    return {
      accountId: profile.account_id,
      name: profile.username,
      pictureUrl: profile.picture_url || null,
    };
  }

  function validateSchedule(input, now = Date.now()) {
    if (!validTimeZone(input.timezone)) {
      throw Object.assign(new Error('Choose a valid IANA timezone.'), { status: 400 });
    }
    const scheduledAt = isoDate(input.scheduledAt);
    const waitingRoomOpensAt = isoDate(input.waitingRoomOpensAt);
    if (scheduledAt === undefined || waitingRoomOpensAt === undefined) {
      throw Object.assign(new Error('Enter valid session and waiting-room dates.'), { status: 400 });
    }
    if (input.status === 'scheduled' && (!scheduledAt || Date.parse(scheduledAt) <= now)) {
      throw Object.assign(new Error('A scheduled session must start in the future.'), { status: 400 });
    }
    if (scheduledAt && waitingRoomOpensAt && Date.parse(waitingRoomOpensAt) > Date.parse(scheduledAt)) {
      throw Object.assign(new Error('The waiting room must open before the scheduled start.'), { status: 400 });
    }
    if (input.status === 'draft' && scheduledAt && Date.parse(scheduledAt) <= now) {
      throw Object.assign(new Error('Draft session dates must be in the future.'), { status: 400 });
    }
    return { scheduledAt, waitingRoomOpensAt };
  }

  async function adminActor(req, res) {
    const actor = await getActor(req, res);
    if (!actor) return null;
    if (!actor.isAdmin) {
      sendJson(res, 403, { error: 'Administrator permissions are required.' });
      return null;
    }
    return actor;
  }

  async function authenticatedActor(req, res) {
    return getActor(req, res);
  }

  async function getSpace(id) {
    const rows = await database(`fxsnap_event_spaces?id=eq.${id}&select=${ADMIN_COLUMNS}&limit=1`);
    const space = Array.isArray(rows) ? rows[0] : null;
    if (!space) throw Object.assign(new Error('Event space not found.'), { status: 404 });
    return space;
  }

  function canManageSpace(space, actor) {
    return actor.isAdmin || actor.accountId === space.host_account_id;
  }

  function participantRow(space, actor, status) {
    return {
      event_space_id: space.id,
      account_id: actor.accountId,
      display_name: actor.displayName || 'FXSnap member',
      livekit_identity: livekit.participantIdentity(actor.accountId),
      status,
      updated_at: new Date().toISOString(),
    };
  }

  async function upsertParticipant(row) {
    return database('fxsnap_event_participants?on_conflict=event_space_id,account_id', {
      method: 'POST',
      prefer: 'resolution=merge-duplicates,return=representation',
      body: row,
    });
  }

  async function getParticipant(spaceId, accountId) {
    const rows = await database(
      `fxsnap_event_participants?event_space_id=eq.${spaceId}&account_id=eq.${encodeURIComponent(accountId)}&select=event_space_id,account_id,display_name,livekit_identity,status,joined_at,updated_at&limit=1`,
    );
    return Array.isArray(rows) ? rows[0] : null;
  }

  async function setParticipantStatus(space, participant, status) {
    const rows = await database(
      `fxsnap_event_participants?event_space_id=eq.${space.id}&account_id=eq.${encodeURIComponent(participant.account_id)}`,
      {
        method: 'PATCH',
        prefer: 'return=representation',
        body: { status, updated_at: new Date().toISOString() },
      },
    );
    return Array.isArray(rows) ? rows[0] : null;
  }

  async function handleParticipantRequest(req, res, match) {
    const [, id, action] = match;
    const actor = await authenticatedActor(req, res);
    if (!actor) return true;
    const space = await getSpace(id);
    const isHost = canManageSpace(space, actor);
    if (space.visibility !== 'public' && !isHost) {
      return sendJson(res, 403, { error: 'This is a private event space.' });
    }

    if (action === 'join' && req.method === 'POST') {
      if (!['waiting_room_open', 'live'].includes(space.status)) {
        return sendJson(res, 409, { error: 'This event space is not accepting participants.' });
      }
      const previous = await getParticipant(space.id, actor.accountId);
      if (previous?.status === 'removed') {
        return sendJson(res, 403, { error: 'You were removed from this event space.' });
      }
      if (space.status === 'waiting_room_open') {
        const participant = await upsertParticipant(participantRow(space, actor, 'waiting'));
        return sendJson(res, 200, {
          status: 'waiting',
          participant: Array.isArray(participant) ? participant[0] : null,
        });
      }
      if (previous?.status === 'waiting' && !isHost) {
        return sendJson(res, 200, { status: 'waiting', participant: previous });
      }
      const participantStatus = previous?.status === 'speaker' ? 'speaker' : 'listener';
      await upsertParticipant(participantRow(space, actor, participantStatus));
      const role = isHost ? 'host' : participantStatus;
      const credentials = await livekit.createParticipantToken({
        roomName: space.livekit_room_name || `fxsnap-event-${space.id.replaceAll('-', '')}`,
        accountId: actor.accountId,
        displayName: actor.displayName || 'FXSnap member',
        role,
      });
      return sendJson(res, 200, { status: 'live', role, ...credentials });
    }

    if (action === 'participants' && req.method === 'GET') {
      if (!['waiting_room_open', 'live'].includes(space.status)) {
        return sendJson(res, 409, { error: 'This event space is not accepting participants.' });
      }
      const rows = await database(
        `fxsnap_event_participants?event_space_id=eq.${space.id}&select=account_id,display_name,livekit_identity,status,joined_at&status=neq.removed&order=joined_at.asc`,
      );
      const liveParticipants = space.status === 'live' && space.livekit_room_name
        ? await livekit.listParticipants(space.livekit_room_name)
        : [];
      const onlineIdentities = new Set(liveParticipants.map((participant) => participant.identity));
      const roster = (Array.isArray(rows) ? rows : [])
        .filter((participant) => participant.account_id !== actor.accountId)
        .filter((participant) => isHost || (participant.status !== 'waiting' && onlineIdentities.has(participant.livekit_identity)))
        .map((participant) => ({
          ...(isHost ? { accountId: participant.account_id } : {}),
          displayName: participant.display_name,
          status: participant.status,
          online: onlineIdentities.has(participant.livekit_identity),
        }));
      return sendJson(res, 200, {
        isHost,
        ownStatus: (await getParticipant(space.id, actor.accountId))?.status || null,
        allowSpeakingRequests: space.allow_speaking_requests,
        roster,
      });
    }

    if (action === 'leave' && req.method === 'POST') {
      await database(
        `fxsnap_event_participants?event_space_id=eq.${space.id}&account_id=eq.${encodeURIComponent(actor.accountId)}`,
        { method: 'DELETE' },
      );
      return sendJson(res, 200, { left: true });
    }

    if (action === 'speak' && req.method === 'POST') {
      if (space.status !== 'live' || !space.allow_speaking_requests) {
        return sendJson(res, 409, { error: 'Speaking requests are not available for this session.' });
      }
      const participant = await getParticipant(space.id, actor.accountId);
      if (!participant || !['listener', 'speaker_requested'].includes(participant.status)) {
        return sendJson(res, 403, { error: 'Join the live session as a listener before requesting to speak.' });
      }
      const updated = await setParticipantStatus(space, participant, 'speaker_requested');
      return sendJson(res, 200, { requested: true, status: updated?.status || 'speaker_requested' });
    }

    return sendJson(res, 404, { error: 'Event participant endpoint not found.' });
  }

  async function handleParticipantModeration(req, res, match) {
    const [, id, accountId] = match;
    const actor = await authenticatedActor(req, res);
    if (!actor) return true;
    const space = await getSpace(id);
    if (!canManageSpace(space, actor)) {
      return sendJson(res, 403, { error: 'Only the event host or an administrator can manage participants.' });
    }
    if (space.status !== 'live' && space.status !== 'waiting_room_open') {
      return sendJson(res, 409, { error: 'Participants can only be managed while the room is open.' });
    }
    const participant = await getParticipant(space.id, accountId);
    if (!participant) return sendJson(res, 404, { error: 'Event participant not found.' });
    const body = await readJsonBody(req);
    const action = body.action;

    if (action === 'admit' && participant.status === 'waiting' && space.status === 'live') {
      const updated = await setParticipantStatus(space, participant, 'listener');
      return sendJson(res, 200, { participant: updated });
    }
    if (action === 'approve_speaker' && ['listener', 'speaker_requested'].includes(participant.status) && space.status === 'live') {
      const currentParticipants = await livekit.listParticipants(space.livekit_room_name);
      if (currentParticipants.some((entry) => entry.identity === participant.livekit_identity)) {
        await livekit.setParticipantRole(space.livekit_room_name, accountId, 'speaker');
      }
      const updated = await setParticipantStatus(space, participant, 'speaker');
      return sendJson(res, 200, { participant: updated });
    }
    if (action === 'decline_speaker' && participant.status === 'speaker_requested') {
      const updated = await setParticipantStatus(space, participant, 'listener');
      return sendJson(res, 200, { participant: updated });
    }
    if (action === 'remove_speaker' && participant.status === 'speaker') {
      const currentParticipants = await livekit.listParticipants(space.livekit_room_name);
      if (currentParticipants.some((entry) => entry.identity === participant.livekit_identity)) {
        await livekit.setParticipantRole(space.livekit_room_name, accountId, 'listener');
      }
      const updated = await setParticipantStatus(space, participant, 'listener');
      return sendJson(res, 200, { participant: updated });
    }
    if (action === 'remove' && participant.status !== 'removed') {
      if (space.status === 'live') {
        const currentParticipants = await livekit.listParticipants(space.livekit_room_name);
        if (currentParticipants.some((entry) => entry.identity === participant.livekit_identity)) {
          await livekit.removeParticipant(space.livekit_room_name, accountId);
        }
      }
      await setParticipantStatus(space, participant, 'removed');
      return sendJson(res, 200, { removed: true });
    }
    return sendJson(res, 409, { error: 'That participant action is not valid for their current status.' });
  }

  async function transitionLiveState(space, action) {
    const now = new Date().toISOString();
    if (action === 'start_live') {
      if (space.status !== 'waiting_room_open') {
        throw Object.assign(new Error('Open the waiting room before starting this session.'), { status: 409 });
      }
      const roomName = space.livekit_room_name || `fxsnap-event-${space.id.replaceAll('-', '')}`;
      await livekit.createRoom(roomName, { eventSpaceId: space.id });
      try {
        const rows = await database(`fxsnap_event_spaces?id=eq.${space.id}`, {
          method: 'PATCH',
          prefer: 'return=representation',
          body: {
            status: 'live',
            livekit_room_name: roomName,
            actual_started_at: now,
            updated_at: now,
          },
        });
        if (!Array.isArray(rows) || !rows[0]) {
          throw Object.assign(new Error('The LiveKit room started, but the event status could not be updated.'), { status: 502 });
        }
        const updatedSpace = rows[0];
        void Promise.resolve(sendLiveSpaceNotification(updatedSpace)).catch((error) => {
          console.error('[Events] Live-space notification broadcast failed.', error instanceof Error ? error.message : 'Unknown error.');
        });
        return updatedSpace;
      } catch (error) {
        try {
          await livekit.deleteRoom(roomName);
        } catch (cleanupError) {
          console.error('[Events] LiveKit room cleanup after a failed start was unsuccessful.', cleanupError instanceof Error ? cleanupError.message : 'Unknown error.');
        }
        throw error;
      }
    }
    if (action === 'end_live') {
      if (space.status !== 'live') {
        throw Object.assign(new Error('Only a live session can be ended.'), { status: 409 });
      }
      if (space.livekit_room_name) await livekit.deleteRoom(space.livekit_room_name);
      await database(`fxsnap_event_participants?event_space_id=eq.${space.id}&status=neq.removed`, {
        method: 'PATCH',
        body: { status: 'removed', updated_at: now },
      });
      const rows = await database(`fxsnap_event_spaces?id=eq.${space.id}`, {
        method: 'PATCH',
        prefer: 'return=representation',
        body: { status: 'ended', actual_ended_at: now, updated_at: now },
      });
      return Array.isArray(rows) ? rows[0] : null;
    }
    throw Object.assign(new Error('Unknown live-session action.'), { status: 400 });
  }

  async function handleLifecycleRequest(req, res, match) {
    if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed.' });
    const actor = await authenticatedActor(req, res);
    if (!actor) return true;
    const space = await getSpace(match[1]);
    if (!canManageSpace(space, actor)) {
      return sendJson(res, 403, { error: 'Only the event host or an administrator can control this session.' });
    }
    const body = await readJsonBody(req);
    const updated = await transitionLiveState(space, body.action);
    return sendJson(res, 200, { space: updated });
  }

  async function handle(req, res, url) {
    const pathname = url.pathname;
    if (pathname === '/api/events/spaces' && req.method === 'GET') {
      try {
        const rows = await database(
          `fxsnap_event_spaces?select=${PUBLIC_COLUMNS}&visibility=eq.public&status=in.(scheduled,waiting_room_open,live)&order=scheduled_at.asc.nullslast`,
        );
        return sendJson(res, 200, { spaces: Array.isArray(rows) ? rows : [] });
      } catch (error) {
        return sendJson(res, error.status || 500, { error: error.message || 'Could not load event spaces.' });
      }
    }
    const eventDetailRoute = pathname.match(/^\/api\/events\/spaces\/([0-9a-f-]+)$/i);
    if (eventDetailRoute && UUID_PATTERN.test(eventDetailRoute[1]) && req.method === 'GET') {
      try {
        const actor = await authenticatedActor(req, res);
        if (!actor) return true;
        const space = await getSpace(eventDetailRoute[1]);
        if (space.visibility !== 'public' && !canManageSpace(space, actor)) {
          return sendJson(res, 403, { error: 'This is a private event space.' });
        }
        return sendJson(res, 200, {
          space: Object.fromEntries(Object.entries(space).filter(([key]) => ![
            'livekit_room_name',
            'created_by_account_id',
            'cancelled_at',
            'archived_at',
            'actual_started_at',
            'actual_ended_at',
          ].includes(key))),
        });
      } catch (error) {
        return sendJson(res, error.status || 500, { error: error.message || 'Could not load the event space.' });
      }
    }
    const participantRoute = pathname.match(/^\/api\/events\/spaces\/([0-9a-f-]+)\/(join|leave|participants|speak)$/i);
    if (participantRoute && UUID_PATTERN.test(participantRoute[1])) {
      try {
        return await handleParticipantRequest(req, res, participantRoute);
      } catch (error) {
        return sendJson(res, error.status || 500, { error: error.message || 'Could not process the event participant request.' });
      }
    }
    const lifecycleRoute = pathname.match(/^\/api\/events\/spaces\/([0-9a-f-]+)\/lifecycle$/i);
    if (lifecycleRoute && UUID_PATTERN.test(lifecycleRoute[1])) {
      try {
        return await handleLifecycleRequest(req, res, lifecycleRoute);
      } catch (error) {
        return sendJson(res, error.status || 500, { error: error.message || 'Could not update the live session.' });
      }
    }
    const moderationRoute = pathname.match(/^\/api\/admin\/event-spaces\/([0-9a-f-]+)\/participants\/([^/]+)$/i);
    if (moderationRoute && UUID_PATTERN.test(moderationRoute[1]) && req.method === 'POST') {
      try {
        return await handleParticipantModeration(req, res, moderationRoute);
      } catch (error) {
        return sendJson(res, error.status || 500, { error: error.message || 'Could not update the event participant.' });
      }
    }
    if (!pathname.startsWith('/api/admin/event-spaces')) return false;

    try {
      const actor = await adminActor(req, res);
      if (!actor) return true;

      if (pathname === '/api/admin/event-spaces/access' && req.method === 'GET') {
        return sendJson(res, 200, { allowed: true, accountId: actor.accountId, hostName: actor.displayName || 'FXSnap Host' });
      }
      if (pathname === '/api/admin/event-spaces/hosts' && req.method === 'GET') {
        const rows = await database(
          'fxsnap_community_profiles?select=account_id,username,picture_url,status&status=in.(active,muted)&order=username.asc&limit=200',
        );
        return sendJson(res, 200, {
          hosts: (Array.isArray(rows) ? rows : []).map((row) => ({
            accountId: row.account_id,
            username: row.username,
            pictureUrl: row.picture_url || null,
          })),
        });
      }
      if (pathname === '/api/admin/event-spaces' && req.method === 'GET') {
        const rows = await database(`fxsnap_event_spaces?select=${ADMIN_COLUMNS}&order=updated_at.desc`);
        return sendJson(res, 200, { spaces: Array.isArray(rows) ? rows : [] });
      }
      if (pathname === '/api/admin/event-spaces' && req.method === 'POST') {
        const parsed = spaceInput.safeParse(await readJsonBody(req));
        if (!parsed.success) return sendJson(res, 400, { error: 'Check the required space details and try again.' });
        const input = parsed.data;
        const schedule = validateSchedule(input);
        const host = await resolveHost(input.hostAccountId, actor);
        const rows = await database('fxsnap_event_spaces', {
          method: 'POST',
          prefer: 'return=representation',
          body: {
            title: input.title,
            description: input.description,
            topic: input.topic,
            visibility: input.visibility,
            status: input.status,
            host_account_id: host.accountId,
            host_name: host.name,
            host_picture_url: host.pictureUrl,
            scheduled_at: schedule.scheduledAt,
            timezone: input.timezone,
            waiting_room_opens_at: schedule.waitingRoomOpensAt,
            duration_minutes: input.durationMinutes ?? null,
            allow_speaking_requests: input.allowSpeakingRequests,
            comments_enabled: input.commentsEnabled,
            featured: input.featured,
            created_by_account_id: actor.accountId,
          },
        });
        return sendJson(res, 201, { space: Array.isArray(rows) ? rows[0] : null });
      }
      if (pathname === '/api/admin/event-spaces/go-live' && req.method === 'POST') {
        const parsed = spaceInput.safeParse(await readJsonBody(req));
        if (!parsed.success) return sendJson(res, 400, { error: 'Check the required space details and try again.' });
        const input = { ...parsed.data, status: 'draft', scheduledAt: null, waitingRoomOpensAt: null };
        validateSchedule(input);
        const host = await resolveHost(input.hostAccountId, actor);
        const createdRows = await database('fxsnap_event_spaces', {
          method: 'POST',
          prefer: 'return=representation',
          body: {
            title: input.title,
            description: input.description,
            topic: input.topic,
            visibility: input.visibility,
            status: 'waiting_room_open',
            host_account_id: host.accountId,
            host_name: host.name,
            host_picture_url: host.pictureUrl,
            scheduled_at: null,
            timezone: input.timezone,
            waiting_room_opens_at: new Date().toISOString(),
            duration_minutes: input.durationMinutes ?? null,
            allow_speaking_requests: input.allowSpeakingRequests,
            comments_enabled: input.commentsEnabled,
            featured: input.featured,
            created_by_account_id: actor.accountId,
          },
        });
        const created = Array.isArray(createdRows) ? createdRows[0] : null;
        if (!created) return sendJson(res, 502, { error: 'Could not create the event space.' });
        const space = await transitionLiveState(created, 'start_live');
        return sendJson(res, 201, { space });
      }

      const match = pathname.match(/^\/api\/admin\/event-spaces\/([0-9a-f-]+)$/i);
      if (!match || !UUID_PATTERN.test(match[1]) || req.method !== 'PATCH') {
        return sendJson(res, 404, { error: 'Event space not found.' });
      }
      const id = match[1];
      const currentRows = await database(`fxsnap_event_spaces?id=eq.${id}&select=${ADMIN_COLUMNS}&limit=1`);
      const current = Array.isArray(currentRows) ? currentRows[0] : null;
      if (!current) return sendJson(res, 404, { error: 'Event space not found.' });
      const body = await readJsonBody(req);
      const now = new Date().toISOString();
      let changes;
      if (body.action === 'publish') {
        if (current.status !== 'draft') return sendJson(res, 409, { error: 'Only draft spaces can be published.' });
        const parsed = spaceInput.safeParse({
          title: current.title,
          description: current.description,
          topic: current.topic,
          visibility: current.visibility,
          hostAccountId: current.host_account_id,
          scheduledAt: body.scheduledAt ?? current.scheduled_at,
          timezone: body.timezone ?? current.timezone,
          waitingRoomOpensAt: body.waitingRoomOpensAt ?? current.waiting_room_opens_at,
          durationMinutes: current.duration_minutes,
          allowSpeakingRequests: current.allow_speaking_requests,
          commentsEnabled: current.comments_enabled,
          featured: current.featured,
          status: 'scheduled',
        });
        if (!parsed.success) return sendJson(res, 400, { error: 'A valid future start time is required before publishing.' });
        const input = parsed.data;
        const schedule = validateSchedule(input);
        changes = { status: 'scheduled', scheduled_at: schedule.scheduledAt, waiting_room_opens_at: schedule.waitingRoomOpensAt };
      } else if (body.action === 'open_waiting_room') {
        if (current.status !== 'scheduled') return sendJson(res, 409, { error: 'Only scheduled sessions can open a waiting room.' });
        changes = { status: 'waiting_room_open' };
      } else if (body.action === 'start_live' || body.action === 'end_live') {
        const space = await transitionLiveState(current, body.action);
        return sendJson(res, 200, { space });
      } else if (body.action === 'cancel') {
        if (!['draft', 'scheduled', 'waiting_room_open'].includes(current.status)) {
          return sendJson(res, 409, { error: 'This session can no longer be cancelled.' });
        }
        changes = {
          status: 'cancelled',
          cancelled_at: now,
          cancellation_reason: typeof body.reason === 'string' ? body.reason.trim().slice(0, 300) : null,
        };
      } else if (body.action === 'archive') {
        if (!['ended', 'cancelled'].includes(current.status)) {
          return sendJson(res, 409, { error: 'Only ended or cancelled sessions can be archived.' });
        }
        changes = { status: 'archived', archived_at: now };
      } else if (current.status === 'draft' || current.status === 'scheduled') {
        const editable = spaceInput.partial().safeParse(body);
        if (!editable.success) return sendJson(res, 400, { error: 'Check the space details and try again.' });
        const input = { ...current, ...editable.data };
        const schedule = validateSchedule({
          ...input,
          status: current.status,
          scheduledAt: editable.data.scheduledAt ?? current.scheduled_at,
          waitingRoomOpensAt: editable.data.waitingRoomOpensAt ?? current.waiting_room_opens_at,
          timezone: editable.data.timezone ?? current.timezone,
        });
        const host = editable.data.hostAccountId
          ? await resolveHost(editable.data.hostAccountId, actor)
          : null;
        changes = {
          ...(editable.data.title === undefined ? {} : { title: editable.data.title }),
          ...(editable.data.description === undefined ? {} : { description: editable.data.description }),
          ...(editable.data.topic === undefined ? {} : { topic: editable.data.topic }),
          ...(editable.data.visibility === undefined ? {} : { visibility: editable.data.visibility }),
          ...(editable.data.scheduledAt === undefined ? {} : { scheduled_at: schedule.scheduledAt }),
          ...(editable.data.timezone === undefined ? {} : { timezone: editable.data.timezone }),
          ...(editable.data.waitingRoomOpensAt === undefined ? {} : { waiting_room_opens_at: schedule.waitingRoomOpensAt }),
          ...(editable.data.durationMinutes === undefined ? {} : { duration_minutes: editable.data.durationMinutes }),
          ...(editable.data.allowSpeakingRequests === undefined ? {} : { allow_speaking_requests: editable.data.allowSpeakingRequests }),
          ...(editable.data.commentsEnabled === undefined ? {} : { comments_enabled: editable.data.commentsEnabled }),
          ...(editable.data.featured === undefined ? {} : { featured: editable.data.featured }),
          ...(host ? { host_account_id: host.accountId, host_name: host.name, host_picture_url: host.pictureUrl } : {}),
        };
      } else {
        return sendJson(res, 409, { error: 'This space can no longer be edited.' });
      }
      changes.updated_at = now;
      const rows = await database(`fxsnap_event_spaces?id=eq.${id}`, {
        method: 'PATCH',
        prefer: 'return=representation',
        body: changes,
      });
      return sendJson(res, 200, { space: Array.isArray(rows) ? rows[0] : null });
    } catch (error) {
      return sendJson(res, error.status || 500, { error: error.message || 'Could not update the event space.' });
    }
  }

  return handle;
}

module.exports = { createEventSpacesApi };
