const crypto = require('node:crypto');
const { AccessToken, RoomServiceClient, TrackSource } = require('livekit-server-sdk');

function createLiveKitService(env = process.env) {
  function config() {
    const serverUrl = String(env.LIVEKIT_URL || '').trim();
    const apiKey = String(env.LIVEKIT_API_KEY || '').trim();
    const apiSecret = String(env.LIVEKIT_API_SECRET || '').trim();
    if (!serverUrl || !apiKey || !apiSecret) {
      throw Object.assign(new Error('LiveKit is not configured on the server.'), { status: 503 });
    }
    let parsed;
    try {
      parsed = new URL(serverUrl);
    } catch {
      throw Object.assign(new Error('LiveKit server URL is invalid.'), { status: 503 });
    }
    if (!['https:', 'wss:'].includes(parsed.protocol) || !parsed.hostname) {
      throw Object.assign(new Error('LiveKit server URL must use HTTPS or secure WebSockets.'), { status: 503 });
    }
    const websocketUrl = new URL(parsed.toString());
    websocketUrl.protocol = 'wss:';
    const serviceUrl = new URL(parsed.toString());
    serviceUrl.protocol = 'https:';
    return { apiKey, apiSecret, serverUrl: websocketUrl.toString().replace(/\/$/, ''), serviceUrl: serviceUrl.toString().replace(/\/$/, '') };
  }

  function roomService() {
    const settings = config();
    return {
      settings,
      client: new RoomServiceClient(settings.serviceUrl, settings.apiKey, settings.apiSecret),
    };
  }

  function participantIdentity(accountId) {
    const { apiSecret } = config();
    return `fxs-${crypto.createHmac('sha256', apiSecret).update(accountId).digest('hex').slice(0, 32)}`;
  }

  async function createRoom(roomName, metadata) {
    const { client } = roomService();
    const existing = await client.listRooms([roomName]);
    if (existing.some((room) => room.name === roomName)) return;
    try {
      await client.createRoom({
        name: roomName,
        emptyTimeout: 3600,
        departureTimeout: 60,
        maxParticipants: 1000,
        metadata: JSON.stringify(metadata),
      });
    } catch (error) {
      const afterConflict = await client.listRooms([roomName]);
      if (!afterConflict.some((room) => room.name === roomName)) throw error;
    }
  }

  async function deleteRoom(roomName) {
    const { client } = roomService();
    const existing = await client.listRooms([roomName]);
    if (existing.some((room) => room.name === roomName)) await client.deleteRoom(roomName);
  }

  async function createParticipantToken({ roomName, accountId, displayName, role }) {
    const settings = config();
    const canPublish = role === 'host' || role === 'speaker';
    const token = new AccessToken(settings.apiKey, settings.apiSecret, {
      identity: participantIdentity(accountId),
      name: displayName || 'FXSnap member',
      ttl: '5m',
    });
    token.addGrant({
      roomJoin: true,
      room: roomName,
      canSubscribe: true,
      canPublish,
      canPublishData: false,
      ...(canPublish ? { canPublishSources: [TrackSource.MICROPHONE] } : { canPublishSources: [] }),
    });
    return { token: await token.toJwt(), serverUrl: settings.serverUrl };
  }

  async function setParticipantRole(roomName, accountId, role) {
    const { client } = roomService();
    const canPublish = role === 'speaker' || role === 'host';
    await client.updateParticipant(roomName, participantIdentity(accountId), {
      permission: {
        canSubscribe: true,
        canPublish,
        canPublishData: false,
        canPublishSources: canPublish ? [TrackSource.MICROPHONE] : [],
      },
    });
  }

  async function listParticipants(roomName) {
    const { client } = roomService();
    return client.listParticipants(roomName);
  }

  async function removeParticipant(roomName, accountId) {
    const { client } = roomService();
    await client.removeParticipant(roomName, participantIdentity(accountId));
  }

  return {
    createRoom,
    deleteRoom,
    createParticipantToken,
    setParticipantRole,
    listParticipants,
    removeParticipant,
  };
}

module.exports = { createLiveKitService };
