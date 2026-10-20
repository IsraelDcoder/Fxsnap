const test = require('node:test');
const assert = require('node:assert/strict');

process.env.SUPABASE_URL = 'https://events-test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'events-test-service-role-key';

const { createEventSpacesApi } = require('./eventSpacesApi');
const HOST_ACCOUNT_ID = 'usr_events-host';
const ADMIN_ACCOUNT_ID = 'usr_events-admin';
const LISTENER_ACCOUNT_ID = 'usr_events-listener';
const HOST_PROFILE = {
  account_id: HOST_ACCOUNT_ID,
  username: 'fxsnap_host',
  picture_url: 'https://example.com/host.png',
  status: 'active',
};

function response(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => body === null ? '' : JSON.stringify(body),
  };
}

function makeHarness({ isAdmin = true, accountId = ADMIN_ACCOUNT_ID } = {}) {
  const spaces = [];
  const participants = [];
  const liveRooms = new Set();
  const liveParticipants = new Map();
  const roleChanges = [];
  let actorState = { isAdmin, accountId };
  let idCounter = 1;

  global.fetch = async (url, options = {}) => {
    const parsed = new URL(String(url));
    const table = parsed.pathname.split('/').pop();
    const method = options.method || 'GET';
    if (table === 'fxsnap_community_profiles') return response(200, [HOST_PROFILE]);
    if (table === 'fxsnap_event_spaces') {
      const id = parsed.searchParams.get('id')?.replace(/^eq\./, '');
      if (method === 'GET') {
        const results = id ? spaces.filter((space) => space.id === id) : spaces;
        if (parsed.searchParams.get('visibility') === 'eq.public') {
          return response(200, results.filter((space) => (
            space.visibility === 'public'
            && ['scheduled', 'waiting_room_open', 'live'].includes(space.status)
          )));
        }
        return response(200, results);
      }
      if (method === 'POST') {
        const space = {
          ...JSON.parse(options.body),
          id: `00000000-0000-4000-8000-${String(idCounter++).padStart(12, '0')}`,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        spaces.push(space);
        return response(201, [space]);
      }
      if (method === 'PATCH') {
        const space = spaces.find((entry) => entry.id === id);
        if (!space) return response(200, []);
        Object.assign(space, JSON.parse(options.body));
        return response(200, [space]);
      }
      return response(405, null);
    }
    if (table === 'fxsnap_event_participants') {
      const eventId = parsed.searchParams.get('event_space_id')?.replace(/^eq\./, '');
      const targetAccount = parsed.searchParams.get('account_id')?.replace(/^eq\./, '');
      if (method === 'GET') {
        let rows = participants.filter((participant) => participant.event_space_id === eventId);
        if (targetAccount) rows = rows.filter((participant) => participant.account_id === targetAccount);
        if (parsed.searchParams.get('status') === 'neq.removed') rows = rows.filter((participant) => participant.status !== 'removed');
        return response(200, rows);
      }
      if (method === 'POST') {
        const value = JSON.parse(options.body);
        let participant = participants.find((entry) => (
          entry.event_space_id === value.event_space_id && entry.account_id === value.account_id
        ));
        if (participant) Object.assign(participant, value);
        else {
          participant = { ...value, joined_at: new Date().toISOString() };
          participants.push(participant);
        }
        return response(201, [participant]);
      }
      if (method === 'PATCH') {
        const changes = JSON.parse(options.body);
        const matching = participants.filter((participant) => (
          participant.event_space_id === eventId
          && (!targetAccount || participant.account_id === targetAccount)
          && (!parsed.searchParams.get('status') || participant.status !== 'removed')
        ));
        for (const participant of matching) Object.assign(participant, changes);
        return response(200, matching);
      }
      if (method === 'DELETE') {
        for (let index = participants.length - 1; index >= 0; index -= 1) {
          if (participants[index].event_space_id === eventId && participants[index].account_id === targetAccount) {
            participants.splice(index, 1);
          }
        }
        return response(204, null);
      }
    }
    return response(404, { message: 'missing' });
  };

  const livekit = {
    participantIdentity: (id) => `lk-${id}`,
    createRoom: async (roomName) => { liveRooms.add(roomName); },
    deleteRoom: async (roomName) => {
      liveRooms.delete(roomName);
      liveParticipants.delete(roomName);
    },
    createParticipantToken: async ({ roomName, accountId, role }) => {
      if (!liveParticipants.has(roomName)) liveParticipants.set(roomName, []);
      const active = liveParticipants.get(roomName);
      if (!active.some((entry) => entry.identity === `lk-${accountId}`)) {
        active.push({ identity: `lk-${accountId}` });
      }
      return { token: `${role}-signed-test-token`, serverUrl: 'wss://events-test.livekit.cloud' };
    },
    setParticipantRole: async (roomName, id, role) => { roleChanges.push({ roomName, id, role }); },
    listParticipants: async (roomName) => liveParticipants.get(roomName) || [],
    removeParticipant: async (roomName, id) => {
      liveParticipants.set(roomName, (liveParticipants.get(roomName) || []).filter((entry) => entry.identity !== `lk-${id}`));
    },
  };

  const api = createEventSpacesApi({
    getActor: async (_request, res) => {
      if (res) res.statusCode = 200;
      return {
        accountId: actorState.accountId,
        displayName: actorState.accountId === HOST_ACCOUNT_ID ? 'FXSnap Host' : 'FXSnap member',
        isAdmin: actorState.isAdmin,
      };
    },
    sendJson: (res, status, body) => {
      res.statusCode = status;
      res.body = body;
    },
    readJsonBody: async (request) => request.body || {},
    livekit,
  });
  return {
    spaces,
    participants,
    liveRooms,
    roleChanges,
    setActor(next) { actorState = next; },
    async call(path, { method = 'GET', body } = {}) {
      const res = {};
      await api({ method, body }, res, new URL(path, 'https://fxsnap.test'));
      return res;
    },
  };
}

function validInput(overrides = {}) {
  const scheduledAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  return {
    title: 'Gold Market Breakdown',
    description: 'A live session for gold traders.',
    topic: 'XAUUSD',
    visibility: 'public',
    hostAccountId: HOST_ACCOUNT_ID,
    scheduledAt,
    timezone: 'Africa/Lagos',
    waitingRoomOpensAt: new Date(Date.parse(scheduledAt) - 15 * 60 * 1000).toISOString(),
    durationMinutes: 60,
    allowSpeakingRequests: true,
    commentsEnabled: true,
    featured: false,
    status: 'scheduled',
    ...overrides,
  };
}

async function createWaitingRoom(harness) {
  const created = await harness.call('/api/admin/event-spaces', {
    method: 'POST',
    body: validInput(),
  });
  assert.equal(created.statusCode, 201, JSON.stringify(created.body));
  const opened = await harness.call(`/api/admin/event-spaces/${created.body.space.id}`, {
    method: 'PATCH',
    body: { action: 'open_waiting_room' },
  });
  assert.equal(opened.statusCode, 200);
  return created.body.space.id;
}

test('only authorized administrators can create and change event spaces', async () => {
  const harness = makeHarness({ isAdmin: false });
  const result = await harness.call('/api/admin/event-spaces', {
    method: 'POST',
    body: validInput(),
  });
  assert.equal(result.statusCode, 403);
  assert.equal(harness.spaces.length, 0);
});

test('admins can create, schedule, and open an event waiting room', async () => {
  const harness = makeHarness();
  const eventId = await createWaitingRoom(harness);
  assert.equal(harness.spaces[0].host_name, HOST_PROFILE.username);
  assert.equal(harness.spaces[0].timezone, 'Africa/Lagos');
  assert.equal(harness.spaces[0].status, 'waiting_room_open');
});

test('draft sessions require a valid future schedule before publishing', async () => {
  const harness = makeHarness();
  const created = await harness.call('/api/admin/event-spaces', {
    method: 'POST',
    body: validInput({ status: 'draft', scheduledAt: null, waitingRoomOpensAt: null }),
  });
  assert.equal(created.statusCode, 201, JSON.stringify(created.body));

  const rejected = await harness.call(`/api/admin/event-spaces/${created.body.space.id}`, {
    method: 'PATCH',
    body: { action: 'publish' },
  });
  assert.equal(rejected.statusCode, 400);

  const published = await harness.call(`/api/admin/event-spaces/${created.body.space.id}`, {
    method: 'PATCH',
    body: {
      action: 'publish',
      scheduledAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
      waitingRoomOpensAt: new Date(Date.now() + 105 * 60 * 1000).toISOString(),
      timezone: 'UTC',
    },
  });
  assert.equal(published.statusCode, 200, JSON.stringify(published.body));
  assert.equal(published.body.space.status, 'scheduled');
});

test('public event listing excludes drafts, private spaces, and cancelled sessions', async () => {
  const harness = makeHarness();
  await harness.call('/api/admin/event-spaces', { method: 'POST', body: validInput() });
  await harness.call('/api/admin/event-spaces', { method: 'POST', body: validInput({ visibility: 'private' }) });
  await harness.call('/api/admin/event-spaces', {
    method: 'POST',
    body: validInput({ status: 'draft', scheduledAt: null, waitingRoomOpensAt: null }),
  });
  const spaces = await harness.call('/api/admin/event-spaces');
  await harness.call(`/api/admin/event-spaces/${spaces.body.spaces[1].id}`, {
    method: 'PATCH',
    body: { action: 'cancel', reason: 'Time change' },
  });

  const publicResult = await harness.call('/api/events/spaces');
  assert.equal(publicResult.statusCode, 200);
  assert.equal(publicResult.body.spaces.length, 1);
  assert.equal(publicResult.body.spaces[0].visibility, 'public');
  assert.equal(publicResult.body.spaces[0].status, 'scheduled');
});

test('LiveKit room lifecycle starts and ends with the event status', async () => {
  const harness = makeHarness();
  const eventId = await createWaitingRoom(harness);
  const started = await harness.call(`/api/events/spaces/${eventId}/lifecycle`, {
    method: 'POST',
    body: { action: 'start_live' },
  });
  assert.equal(started.statusCode, 200, JSON.stringify(started.body));
  assert.equal(started.body.space.status, 'live');
  assert.match(started.body.space.livekit_room_name, /^fxsnap-event-/);
  assert.equal(harness.liveRooms.has(started.body.space.livekit_room_name), true);

  const ended = await harness.call(`/api/events/spaces/${eventId}/lifecycle`, {
    method: 'POST',
    body: { action: 'end_live' },
  });
  assert.equal(ended.statusCode, 200);
  assert.equal(ended.body.space.status, 'ended');
  assert.equal(harness.liveRooms.size, 0);
});

test('listeners wait for host admission and receive no publisher token', async () => {
  const harness = makeHarness();
  const eventId = await createWaitingRoom(harness);

  harness.setActor({ isAdmin: false, accountId: LISTENER_ACCOUNT_ID });
  const waiting = await harness.call(`/api/events/spaces/${eventId}/join`, { method: 'POST' });
  assert.equal(waiting.statusCode, 200);
  assert.equal(waiting.body.status, 'waiting');

  harness.setActor({ isAdmin: true, accountId: ADMIN_ACCOUNT_ID });
  const started = await harness.call(`/api/events/spaces/${eventId}/lifecycle`, {
    method: 'POST',
    body: { action: 'start_live' },
  });
  assert.equal(started.statusCode, 200);
  harness.setActor({ isAdmin: false, accountId: LISTENER_ACCOUNT_ID });
  const stillWaiting = await harness.call(`/api/events/spaces/${eventId}/join`, { method: 'POST' });
  assert.equal(stillWaiting.body.status, 'waiting');

  harness.setActor({ isAdmin: true, accountId: ADMIN_ACCOUNT_ID });
  const admitted = await harness.call(`/api/admin/event-spaces/${eventId}/participants/${LISTENER_ACCOUNT_ID}`, {
    method: 'POST',
    body: { action: 'admit' },
  });
  assert.equal(admitted.statusCode, 200, JSON.stringify(admitted.body));
  harness.setActor({ isAdmin: false, accountId: LISTENER_ACCOUNT_ID });
  const join = await harness.call(`/api/events/spaces/${eventId}/join`, { method: 'POST' });
  assert.equal(join.statusCode, 200);
  assert.equal(join.body.role, 'listener');
  assert.equal(join.body.token, 'listener-signed-test-token');
});

test('a designated host can start the room and moderate speaker permissions', async () => {
  const harness = makeHarness();
  const eventId = await createWaitingRoom(harness);
  harness.setActor({ isAdmin: false, accountId: HOST_ACCOUNT_ID });
  const hostWaiting = await harness.call(`/api/events/spaces/${eventId}/join`, { method: 'POST' });
  assert.equal(hostWaiting.body.status, 'waiting');
  const started = await harness.call(`/api/events/spaces/${eventId}/lifecycle`, {
    method: 'POST',
    body: { action: 'start_live' },
  });
  assert.equal(started.statusCode, 200);
  const hostJoin = await harness.call(`/api/events/spaces/${eventId}/join`, { method: 'POST' });
  assert.equal(hostJoin.body.role, 'host');

  harness.setActor({ isAdmin: false, accountId: LISTENER_ACCOUNT_ID });
  const joined = await harness.call(`/api/events/spaces/${eventId}/join`, { method: 'POST' });
  assert.equal(joined.body.role, 'listener');
  const request = await harness.call(`/api/events/spaces/${eventId}/speak`, { method: 'POST' });
  assert.equal(request.statusCode, 200);
  assert.equal(request.body.status, 'speaker_requested');

  harness.setActor({ isAdmin: false, accountId: HOST_ACCOUNT_ID });
  const approved = await harness.call(`/api/admin/event-spaces/${eventId}/participants/${LISTENER_ACCOUNT_ID}`, {
    method: 'POST',
    body: { action: 'approve_speaker' },
  });
  assert.equal(approved.statusCode, 200, JSON.stringify(approved.body));
  assert.equal(approved.body.participant.status, 'speaker');
  assert.equal(harness.roleChanges.at(-1).role, 'speaker');
});

test('unassigned members cannot moderate an event or join private rooms', async () => {
  const admin = makeHarness();
  const created = await admin.call('/api/admin/event-spaces', {
    method: 'POST',
    body: validInput({ visibility: 'private' }),
  });
  const eventId = created.body.space.id;
  admin.setActor({ isAdmin: false, accountId: LISTENER_ACCOUNT_ID });
  const denied = await admin.call(`/api/events/spaces/${eventId}/join`, { method: 'POST' });
  assert.equal(denied.statusCode, 403);
  const moderation = await admin.call(`/api/admin/event-spaces/${eventId}/participants/${HOST_ACCOUNT_ID}`, {
    method: 'POST',
    body: { action: 'admit' },
  });
  assert.equal(moderation.statusCode, 403);
});
