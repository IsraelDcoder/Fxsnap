const test = require('node:test');
const assert = require('node:assert/strict');

process.env.SUPABASE_URL = 'https://community-test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'community-test-service-role-key';
process.env.FXSNAP_COMMUNITY_ENABLED = 'true';
process.env.FXSNAP_COMMUNITY_ADMIN_SUPABASE_USER_IDS = '';

const { createCommunityApi } = require('./communityApi');

const MEMBER_ID = '00000000-0000-4000-8000-000000000010';
const ACCOUNT_ID = 'usr_community-test-member';
const RULES_VERSION = 'community-rules-v1';

function makeResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => body === null ? '' : JSON.stringify(body),
    json: async () => body,
  };
}

function makeHarness({
  actor = { accountId: ACCOUNT_ID, supabaseUserId: MEMBER_ID },
  initialProfiles = [],
  initialMessages = [],
  initialReactions = [],
  initialConversations = [],
  initialSupportMessages = [],
} = {}) {
  const profiles = [...initialProfiles];
  const messages = [...initialMessages];
  const reactions = [...initialReactions];
  const viewDedup = new Map();
  const shareDedup = new Map();
  const conversations = [...initialConversations];
  const supportMessages = [...initialSupportMessages];
  const pushedCommunityEvents = [];
  const savedNames = [];
  const requests = [];
  global.fetch = async (url, options = {}) => {
    const parsed = new URL(String(url));
    const table = parsed.pathname.split('/').pop();
    const method = options.method || 'GET';
    requests.push({ table, method, query: parsed.search, body: options.body ? JSON.parse(options.body) : null });

    if (table === 'fxsnap_community_record_views' && method === 'POST') {
      const body = JSON.parse(options.body);
      const views = [];
      for (const messageId of body.p_message_ids) {
        const message = messages.find((item) => item.id === messageId && !item.reply_to_id && !item.removed_at);
        if (!message) continue;
        message.view_count ||= 0;
        if (message.account_id !== body.p_account_id) {
          const key = `${messageId}:${body.p_account_id}`;
          const lastViewed = viewDedup.get(key) || 0;
          if (Date.now() - lastViewed >= 24 * 60 * 60 * 1000) {
            message.view_count += 1;
            viewDedup.set(key, Date.now());
          }
        }
        views.push({ message_id: message.id, view_count: message.view_count });
      }
      return makeResponse(200, views);
    }
    if (table === 'fxsnap_community_record_share' && method === 'POST') {
      const body = JSON.parse(options.body);
      const message = messages.find((item) => item.id === body.p_message_id
        && !item.reply_to_id && !item.removed_at);
      if (!message) return makeResponse(200, []);
      message.share_count ||= 0;
      const key = `${body.p_message_id}:${body.p_account_id}`;
      const lastShared = shareDedup.get(key) || 0;
      if (Date.now() - lastShared >= 30_000) {
        message.share_count += 1;
        shareDedup.set(key, Date.now());
      }
      return makeResponse(200, [{ share_count: message.share_count }]);
    }
    if (table === 'fxsnap_community_set_reaction' && method === 'POST') {
      const body = JSON.parse(options.body);
      const currentIndex = reactions.findIndex((item) => (
        item.message_id === body.p_message_id && item.account_id === body.p_account_id
      ));
      const selectedReaction = currentIndex >= 0 && reactions[currentIndex].reaction === body.p_reaction
        ? null
        : body.p_reaction;
      if (currentIndex >= 0) reactions.splice(currentIndex, 1);
      if (selectedReaction) {
        reactions.push({
          message_id: body.p_message_id,
          account_id: body.p_account_id,
          reaction: selectedReaction,
        });
      }
      return makeResponse(200, [{ selected_reaction: selectedReaction }]);
    }

    if (table === 'fxsnap_community_profiles' && method === 'GET') {
      const accountIdsFilter = parsed.searchParams.get('account_id') || '';
      const accountId = accountIdsFilter.startsWith('eq.') ? accountIdsFilter.slice(3) : null;
      const accountIds = accountIdsFilter.startsWith('in.')
        ? [...accountIdsFilter.matchAll(/"([^"]+)"/g)].map((match) => match[1])
        : null;
      const rawUsername = parsed.searchParams.get('username');
      const username = rawUsername?.startsWith('eq.') ? rawUsername.slice(3) : null;
      const usernamePattern = rawUsername?.startsWith('ilike.') ? rawUsername.slice(6) : null;
      return makeResponse(200, profiles.filter((profile) => (
        (!accountId || profile.account_id === accountId)
        && (!accountIds || accountIds.includes(profile.account_id))
        && (!username || profile.username === username)
        && (!usernamePattern || profile.username.toLowerCase() === usernamePattern.toLowerCase())
      )));
    }
    if (table === 'fxsnap_community_profiles' && method === 'POST') {
      const candidate = JSON.parse(options.body);
      if (profiles.some((profile) => profile.username === candidate.username || profile.account_id === candidate.account_id)) {
        return makeResponse(409, { code: '23505' });
      }
      const profile = {
        ...candidate,
        status: 'active',
        muted_until: null,
        joined_at: new Date().toISOString(),
      };
      profiles.push(profile);
      return makeResponse(201, [profile]);
    }
    if (table === 'fxsnap_community_profiles' && method === 'PATCH') {
      const accountId = parsed.searchParams.get('account_id')?.replace(/^eq\./, '');
      const candidate = JSON.parse(options.body);
      if (profiles.some((profile) => profile.account_id !== accountId
        && profile.username.toLowerCase() === candidate.username.toLowerCase())) {
        return makeResponse(409, { code: '23505' });
      }
      const profile = profiles.find((item) => item.account_id === accountId);
      if (!profile) return makeResponse(200, []);
      Object.assign(profile, candidate);
      return makeResponse(200, [profile]);
    }
    if (table === 'fxsnap_support_conversations' && method === 'GET') {
      const accountId = parsed.searchParams.get('account_id')?.replace(/^eq\./, '');
      return makeResponse(200, conversations.filter((conversation) => !accountId || conversation.account_id === accountId));
    }
    if (table === 'fxsnap_support_conversations' && method === 'POST') {
      const conversation = { id: '00000000-0000-4000-8000-000000000031', account_id: JSON.parse(options.body).account_id, status: 'open' };
      conversations.push(conversation);
      return makeResponse(201, [conversation]);
    }
    if (table === 'fxsnap_support_messages' && method === 'GET') {
      const conversationId = parsed.searchParams.get('conversation_id')?.replace(/^eq\./, '');
      return makeResponse(200, supportMessages.filter((message) => message.conversation_id === conversationId));
    }
    if (table === 'fxsnap_support_messages' && method === 'POST') {
      const message = { ...JSON.parse(options.body), id: `00000000-0000-4000-8000-${String(supportMessages.length + 40).padStart(12, '0')}`, created_at: new Date().toISOString() };
      supportMessages.push(message);
      return makeResponse(201, [message]);
    }
    if (table === 'fxsnap_community_messages' && method === 'GET') {
      const idFilter = parsed.searchParams.get('id') || '';
      const id = idFilter.startsWith('eq.') ? idFilter.slice(3) : null;
      const replyToFilter = parsed.searchParams.get('reply_to_id') || '';
      const replyToId = replyToFilter.startsWith('eq.') ? replyToFilter.slice(3) : null;
      const rootOnly = replyToFilter === 'is.null';
      const clientMessageId = parsed.searchParams.get('client_message_id')?.replace(/^eq\./, '');
      const accountId = parsed.searchParams.get('account_id')?.replace(/^eq\./, '');
      const visible = messages.filter((message) => (
        (!id || message.id === id)
        && (!replyToId || message.reply_to_id === replyToId)
        && (!rootOnly || !message.reply_to_id)
        && (!clientMessageId || message.client_message_id === clientMessageId)
        && (!accountId || message.account_id === accountId)
        && (!parsed.searchParams.has('removed_at') || !message.removed_at)
      ));
      return makeResponse(200, visible);
    }
    if (table === 'fxsnap_community_messages' && method === 'POST') {
      const message = {
        ...JSON.parse(options.body),
        id: `00000000-0000-4000-8000-${String(messages.length + 100).padStart(12, '0')}`,
        created_at: new Date().toISOString(),
        removed_at: null,
      };
      messages.push(message);
      return makeResponse(201, [message]);
    }
    if (table === 'fxsnap_community_reactions' && method === 'GET') {
      const messageFilter = parsed.searchParams.get('message_id') || '';
      const accountFilter = parsed.searchParams.get('account_id') || '';
      const reactionFilter = parsed.searchParams.get('reaction') || '';
      const messageId = messageFilter.startsWith('eq.') ? messageFilter.slice(3) : null;
      const accountId = accountFilter.startsWith('eq.') ? accountFilter.slice(3) : null;
      const reaction = reactionFilter.startsWith('eq.') ? reactionFilter.slice(3) : null;
      return makeResponse(200, reactions.filter((item) => (
        (!messageId || item.message_id === messageId)
        && (!accountId || item.account_id === accountId)
        && (!reaction || item.reaction === reaction)
      )));
    }
    if (table === 'fxsnap_community_reactions' && method === 'POST') {
      reactions.push(JSON.parse(options.body));
      return makeResponse(201, []);
    }
    if (table === 'fxsnap_community_reactions' && method === 'DELETE') {
      const messageId = parsed.searchParams.get('message_id')?.replace(/^eq\./, '');
      const accountId = parsed.searchParams.get('account_id')?.replace(/^eq\./, '');
      const reaction = parsed.searchParams.get('reaction')?.replace(/^eq\./, '');
      for (let index = reactions.length - 1; index >= 0; index -= 1) {
        const item = reactions[index];
        if (item.message_id === messageId && item.account_id === accountId && item.reaction === reaction) {
          reactions.splice(index, 1);
        }
      }
      return makeResponse(204, null);
    }
    if (table === 'fxsnap_community_comment_counts') {
      const body = options.body ? JSON.parse(options.body) : {};
      return makeResponse(200, (body.p_message_ids || []).map((messageId) => ({
        message_id: messageId,
        comment_count: messages.filter((message) => message.reply_to_id === messageId && !message.removed_at).length,
      })));
    }
    return makeResponse(200, []);
  };

  const api = createCommunityApi({
    getActor: async () => actor,
    sendJson: (response, status, body) => {
      response.statusCode = status;
      response.body = body;
      return true;
    },
    readJsonBody: async (request) => request.body || {},
    saveCommunityUsername: async (_accountId, username) => { savedNames.push(username); },
    dispatchCommunityPush: async (objectId) => { pushedCommunityEvents.push(objectId); },
  });

  return {
    api,
    profiles,
    messages,
    reactions,
    conversations,
    supportMessages,
    requests,
    savedNames,
    pushedCommunityEvents,
    async call(path, { method = 'GET', body } = {}) {
      const response = {};
      await api({ method, body }, response, new URL(path, 'https://fxsnap.test'));
      return response;
    },
  };
}

test('members can load and publish replies in a post discussion', async () => {
  const messageId = '00000000-0000-4000-8000-000000000041';
  const commentId = '00000000-0000-4000-8000-000000000042';
  const profile = {
    account_id: ACCOUNT_ID,
    supabase_user_id: MEMBER_ID,
    username: 'chartpro',
    picture_url: null,
    accepted_rules_version: RULES_VERSION,
    status: 'active',
    muted_until: null,
    joined_at: new Date().toISOString(),
  };
  const root = {
    id: messageId,
    account_id: ACCOUNT_ID,
    author_username: 'chartpro',
    is_official: false,
    kind: 'text',
    category: 'market_discussion',
    body: 'Original post',
    payload: {},
    reply_to_id: null,
    pinned_at: null,
    removed_at: null,
    created_at: new Date().toISOString(),
    client_message_id: '00000000-0000-4000-8000-000000000043',
  };
  const comment = {
    ...root,
    id: commentId,
    body: 'Existing reply',
    reply_to_id: messageId,
    client_message_id: '00000000-0000-4000-8000-000000000044',
  };
  const harness = makeHarness({
    initialProfiles: [profile],
    initialMessages: [root, comment],
  });
  const commentsPath = `/api/community/messages/${messageId}/comments`;

  const listed = await harness.call(commentsPath);
  assert.equal(listed.statusCode, 200, JSON.stringify(listed.body));
  assert.equal(listed.body.comments.length, 1);
  assert.equal(listed.body.comments[0].body, 'Existing reply');
  assert.equal(listed.body.comments[0].replyTo.id, messageId);

  const published = await harness.call(commentsPath, {
    method: 'POST',
    body: {
      clientMessageId: '00000000-0000-4000-8000-000000000045',
      body: 'A new reply',
    },
  });
  assert.equal(published.statusCode, 201, JSON.stringify(published.body));
  assert.equal(published.body.message.body, 'A new reply');
  assert.equal(published.body.message.replyTo.id, messageId);
  assert.deepEqual(harness.pushedCommunityEvents, [published.body.message.id]);
});

test('Community bootstrap returns the member profile and first feed page together', async () => {
  const profile = {
    account_id: ACCOUNT_ID,
    supabase_user_id: MEMBER_ID,
    username: 'chartpro',
    picture_url: null,
    accepted_rules_version: RULES_VERSION,
    status: 'active',
    muted_until: null,
    joined_at: new Date().toISOString(),
  };
  const post = {
    id: '00000000-0000-4000-8000-000000000051',
    account_id: ACCOUNT_ID,
    author_username: profile.username,
    is_official: false,
    kind: 'text',
    category: 'trading',
    body: 'First feed post',
    payload: {},
    reply_to_id: null,
    pinned_at: null,
    removed_at: null,
    created_at: new Date().toISOString(),
    client_message_id: '00000000-0000-4000-8000-000000000052',
    view_count: 0,
    share_count: 0,
  };
  const harness = makeHarness({ initialProfiles: [profile], initialMessages: [post] });
  const response = await harness.call('/api/community/bootstrap?feed=global&limit=30');

  assert.equal(response.statusCode, 200, JSON.stringify(response.body));
  assert.equal(response.body.profile.username, 'chartpro');
  assert.equal(response.body.messages.length, 1);
  assert.equal(response.body.messages[0].body, 'First feed post');
  assert.equal(response.body.nextCursor, null);
});

test('members can add and remove a reaction on a post', async () => {
  const messageId = '00000000-0000-4000-8000-000000000051';
  const profile = {
    account_id: ACCOUNT_ID,
    supabase_user_id: MEMBER_ID,
    username: 'chartpro',
    picture_url: null,
    accepted_rules_version: RULES_VERSION,
    status: 'active',
    muted_until: null,
    joined_at: new Date().toISOString(),
  };
  const message = {
    id: messageId,
    account_id: ACCOUNT_ID,
    author_username: 'chartpro',
    is_official: false,
    kind: 'text',
    category: 'market_discussion',
    body: 'Original post',
    payload: {},
    reply_to_id: null,
    pinned_at: null,
    removed_at: null,
    created_at: new Date().toISOString(),
    client_message_id: '00000000-0000-4000-8000-000000000052',
  };
  const harness = makeHarness({ initialProfiles: [profile], initialMessages: [message] });
  const path = `/api/community/messages/${messageId}/reactions`;
  const request = { method: 'POST', body: { reaction: 'love' } };

  const added = await harness.call(path, request);
  assert.equal(added.statusCode, 200, JSON.stringify(added.body));
  assert.equal(added.body.reacted, true);
  assert.equal(harness.reactions.length, 1);
  assert.deepEqual(harness.pushedCommunityEvents, [messageId]);

  const legacyPostView = await harness.call(`/api/community/messages/${messageId}`);
  assert.equal(legacyPostView.body.post.reactions.find((item) => item.reaction === 'like')?.reacted, true);
  assert.equal(legacyPostView.body.post.reactions.find((item) => item.reaction === 'love')?.reacted, true);

  const removed = await harness.call(path, request);
  assert.equal(removed.statusCode, 200, JSON.stringify(removed.body));
  assert.equal(removed.body.reacted, false);
  assert.equal(harness.reactions.length, 0);
  assert.deepEqual(harness.pushedCommunityEvents, [messageId]);

  const legacyRequest = await harness.call(path, { method: 'POST', body: { reaction: 'like' } });
  assert.equal(legacyRequest.body.selectedReaction, 'love');
  assert.equal(harness.reactions[0].reaction, 'love');
});

test('all reaction choices replace the prior selection and concurrent requests leave one reaction', async () => {
  const messageId = '00000000-0000-4000-8000-000000000061';
  const profile = {
    account_id: ACCOUNT_ID,
    supabase_user_id: MEMBER_ID,
    username: 'chartpro',
    picture_url: null,
    accepted_rules_version: RULES_VERSION,
    status: 'active',
    muted_until: null,
    joined_at: new Date().toISOString(),
  };
  const message = {
    id: messageId,
    account_id: 'usr_another-member',
    author_username: 'another',
    is_official: false,
    kind: 'text',
    category: 'market_discussion',
    body: 'A post',
    payload: {},
    reply_to_id: null,
    pinned_at: null,
    removed_at: null,
    created_at: new Date().toISOString(),
    client_message_id: '00000000-0000-4000-8000-000000000062',
  };
  const harness = makeHarness({ initialProfiles: [profile], initialMessages: [message] });
  const path = `/api/community/messages/${messageId}/reactions`;
  for (const reaction of ['love', 'fire', 'funny', 'clap', 'wow']) {
    const response = await harness.call(path, { method: 'POST', body: { reaction } });
    assert.equal(response.statusCode, 200, JSON.stringify(response.body));
    assert.equal(response.body.selectedReaction, reaction);
    assert.equal(harness.reactions.length, 1);
    assert.equal(harness.reactions[0].reaction, reaction);
  }
  const toggledOff = await harness.call(path, { method: 'POST', body: { reaction: 'wow' } });
  assert.equal(toggledOff.body.selectedReaction, null);
  assert.equal(harness.reactions.length, 0);

  for (const reaction of ['love', 'fire', 'funny', 'clap', 'wow']) {
    const selected = await harness.call(path, { method: 'POST', body: { reaction } });
    assert.equal(selected.body.selectedReaction, reaction);
    const removed = await harness.call(path, { method: 'POST', body: { reaction } });
    assert.equal(removed.body.selectedReaction, null);
    assert.equal(harness.reactions.length, 0);
  }

  await Promise.all(['love', 'fire', 'funny', 'clap', 'wow'].map((reaction) => (
    harness.call(path, { method: 'POST', body: { reaction } })
  )));
  assert.equal(harness.reactions.length, 1);
});

test('view events deduplicate viewers for 24 hours and exclude authors', async () => {
  const postId = '00000000-0000-4000-8000-000000000071';
  const ownPostId = '00000000-0000-4000-8000-000000000072';
  const otherPostId = '00000000-0000-4000-8000-000000000073';
  const posts = [postId, ownPostId, otherPostId].map((id, index) => ({
    id,
    account_id: index === 1 ? ACCOUNT_ID : 'usr_another-member',
    author_username: 'another',
    is_official: false,
    kind: 'text',
    category: 'market_discussion',
    body: 'A post',
    payload: {},
    reply_to_id: index === 2 ? postId : null,
    pinned_at: null,
    removed_at: null,
    created_at: new Date().toISOString(),
    client_message_id: `00000000-0000-4000-8000-${String(index + 74).padStart(12, '0')}`,
    view_count: 0,
    share_count: 0,
  }));
  const profile = {
    account_id: ACCOUNT_ID,
    supabase_user_id: MEMBER_ID,
    username: 'chartpro',
    picture_url: null,
    accepted_rules_version: RULES_VERSION,
    status: 'active',
    muted_until: null,
    joined_at: new Date().toISOString(),
  };
  const harness = makeHarness({ initialProfiles: [profile], initialMessages: posts });
  const first = await harness.call('/api/community/views', {
    method: 'POST',
    body: { messageIds: [postId, ownPostId, otherPostId] },
  });
  assert.equal(first.statusCode, 200, JSON.stringify(first.body));
  assert.deepEqual(first.body.views, [{ messageId: postId, viewCount: 1 }]);
  const repeated = await harness.call('/api/community/views', {
    method: 'POST',
    body: { messageIds: [postId] },
  });
  assert.equal(repeated.body.views[0].viewCount, 1);
  assert.equal(posts[0].view_count, 1);
  assert.equal(posts[1].view_count, 0);
  assert.equal(posts[2].view_count, 0);
});

test('share events persist separately and return the updated share count', async () => {
  const postId = '00000000-0000-4000-8000-000000000081';
  const message = {
    id: postId,
    account_id: 'usr_another-member',
    author_username: 'another',
    is_official: false,
    kind: 'text',
    category: 'market_discussion',
    body: 'A post',
    payload: {},
    reply_to_id: null,
    pinned_at: null,
    removed_at: null,
    created_at: new Date().toISOString(),
    client_message_id: '00000000-0000-4000-8000-000000000082',
    view_count: 7,
    share_count: 0,
  };
  const profile = {
    account_id: ACCOUNT_ID,
    supabase_user_id: MEMBER_ID,
    username: 'chartpro',
    picture_url: null,
    accepted_rules_version: RULES_VERSION,
    status: 'active',
    muted_until: null,
    joined_at: new Date().toISOString(),
  };
  const harness = makeHarness({ initialProfiles: [profile], initialMessages: [message] });
  const path = `/api/community/messages/${postId}/shares`;
  const first = await harness.call(path, { method: 'POST' });
  const second = await harness.call(path, { method: 'POST' });
  assert.equal(first.body.shareCount, 1);
  assert.equal(second.body.shareCount, 1);
  assert.equal(message.view_count, 7);
});

test('Community rollout gate rejects requests before identity lookup', async () => {
  const previous = process.env.FXSNAP_COMMUNITY_ENABLED;
  process.env.FXSNAP_COMMUNITY_ENABLED = 'false';
  const harness = makeHarness();
  try {
    const response = await harness.call('/api/community/me');
    assert.equal(response.statusCode, 503);
    assert.equal(harness.requests.length, 0);
  } finally {
    process.env.FXSNAP_COMMUNITY_ENABLED = previous;
  }
});

test('public Community allows linked accounts without a beta allowlist', async () => {
  const previousEnabled = process.env.FXSNAP_COMMUNITY_ENABLED;
  const previousBetaIds = process.env.FXSNAP_COMMUNITY_BETA_SUPABASE_USER_IDS;
  process.env.FXSNAP_COMMUNITY_ENABLED = 'true';
  delete process.env.FXSNAP_COMMUNITY_BETA_SUPABASE_USER_IDS;
  const harness = makeHarness();
  try {
    const response = await harness.call('/api/community/me');
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.profile, null);
  } finally {
    process.env.FXSNAP_COMMUNITY_ENABLED = previousEnabled;
    if (previousBetaIds === undefined) delete process.env.FXSNAP_COMMUNITY_BETA_SUPABASE_USER_IDS;
    else process.env.FXSNAP_COMMUNITY_BETA_SUPABASE_USER_IDS = previousBetaIds;
  }
});

test('unauthenticated accounts cannot make protected Community requests', async () => {
  let storageRequests = 0;
  global.fetch = async () => {
    storageRequests += 1;
    return makeResponse(200, []);
  };
  const api = createCommunityApi({
    getActor: async (_request, response) => {
      response.statusCode = 401;
      response.body = { error: 'Sign in with Google.' };
      return null;
    },
    sendJson: (response, status, body) => {
      response.statusCode = status;
      response.body = body;
    },
    readJsonBody: async (request) => request.body || {},
  });
  const response = {};
  await api(
    { method: 'POST', body: { kind: 'text', body: 'Not signed in.' } },
    response,
    new URL('/api/community/messages', 'https://fxsnap.test'),
  );
  assert.equal(response.statusCode, 401);
  assert.equal(storageRequests, 0);
});

test('Community topic search returns matching real category definitions', async () => {
  const harness = makeHarness({
    initialProfiles: [{
      account_id: ACCOUNT_ID,
      supabase_user_id: MEMBER_ID,
      username: 'chartpro',
      picture_url: null,
      accepted_rules_version: RULES_VERSION,
      status: 'active',
      muted_until: null,
      joined_at: new Date().toISOString(),
    }],
  });
  const response = await harness.call('/api/community/search?q=trad&kind=topics');
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body.topics, [{ id: 'trading', label: 'Trading' }]);
});

test('Community search rejects short queries and unsupported result types', async () => {
  const harness = makeHarness({
    initialProfiles: [{
      account_id: ACCOUNT_ID,
      supabase_user_id: MEMBER_ID,
      username: 'chartpro',
      picture_url: null,
      accepted_rules_version: RULES_VERSION,
      status: 'active',
      muted_until: null,
      joined_at: new Date().toISOString(),
    }],
  });
  const response = await harness.call('/api/community/search?q=x&kind=posts');
  assert.equal(response.statusCode, 400);
});

test('Community member profile returns authenticated member identity and persisted counts', async () => {
  const profile = {
    account_id: ACCOUNT_ID,
    supabase_user_id: MEMBER_ID,
    username: 'chartpro',
    picture_url: 'https://example.com/chartpro.png',
    accepted_rules_version: RULES_VERSION,
    status: 'active',
    muted_until: null,
    joined_at: new Date().toISOString(),
  };
  const post = {
    id: '00000000-0000-4000-8000-000000000091',
    account_id: ACCOUNT_ID,
    author_username: profile.username,
    is_official: false,
    kind: 'text',
    category: 'learning',
    body: 'A recent post',
    payload: {},
    reply_to_id: null,
    pinned_at: null,
    removed_at: null,
    created_at: new Date().toISOString(),
    client_message_id: '00000000-0000-4000-8000-000000000092',
    view_count: 1500,
    share_count: 6,
  };
  const harness = makeHarness({ initialProfiles: [profile], initialMessages: [post] });
  const response = await harness.call('/api/community/members/chartpro');
  assert.equal(response.statusCode, 200, JSON.stringify({ body: response.body, requests: harness.requests }));
  assert.equal(response.body.member.accountId, ACCOUNT_ID);
  assert.equal(response.body.member.pictureUrl, profile.picture_url);
  assert.equal(response.body.member.isCurrentUser, true);
  assert.equal(response.body.member.followerCount, 0);
  assert.equal(response.body.member.followingCount, 0);
  assert.equal(response.body.member.posts[0].viewCount, 1500);
  assert.equal(response.body.member.posts[0].shareCount, 6);
});

test('members can edit and remove only their own text content', async () => {
  const otherAccountId = 'usr_community-test-other';
  const otherUserId = '00000000-0000-4000-8000-000000000011';
  const messageId = '00000000-0000-4000-8000-000000000041';
  const profiles = [{
    account_id: ACCOUNT_ID,
    supabase_user_id: MEMBER_ID,
    username: 'chartpro',
    picture_url: 'https://example.com/chartpro.png',
    accepted_rules_version: RULES_VERSION,
    status: 'active',
    muted_until: null,
    joined_at: new Date().toISOString(),
  }, {
    account_id: otherAccountId,
    supabase_user_id: otherUserId,
    username: 'marketmentor',
    picture_url: null,
    accepted_rules_version: RULES_VERSION,
    status: 'active',
    muted_until: null,
    joined_at: new Date().toISOString(),
  }];
  const messages = [{
    id: messageId,
    account_id: ACCOUNT_ID,
    author_username: 'chartpro',
    is_official: false,
    kind: 'text',
    category: 'market_discussion',
    body: 'Original post',
    payload: {},
    reply_to_id: null,
    pinned_at: null,
    removed_at: null,
    created_at: new Date().toISOString(),
    client_message_id: '00000000-0000-4000-8000-000000000042',
  }];
  global.fetch = async (url, options = {}) => {
    const parsed = new URL(String(url));
    const table = parsed.pathname.split('/').pop();
    const method = options.method || 'GET';
    if (table === 'fxsnap_community_profiles' && method === 'GET') {
      const accountFilter = parsed.searchParams.get('account_id') || '';
      const exact = accountFilter.startsWith('eq.') ? accountFilter.slice(3) : null;
      const inFilter = accountFilter.startsWith('in.') ? accountFilter.slice(3) : null;
      const accountIds = inFilter ? [...inFilter.matchAll(/"([^"]+)"/g)].map((match) => match[1]) : null;
      return makeResponse(200, profiles.filter((profile) => (
        (!exact || profile.account_id === exact)
        && (!accountIds || accountIds.includes(profile.account_id))
      )));
    }
    if (table === 'fxsnap_community_messages' && method === 'GET') {
      const id = parsed.searchParams.get('id')?.replace(/^eq\./, '');
      return makeResponse(200, messages.filter((message) => message.id === id && !message.removed_at));
    }
    if (table === 'fxsnap_community_messages' && method === 'PATCH') {
      const id = parsed.searchParams.get('id')?.replace(/^eq\./, '');
      const accountId = parsed.searchParams.get('account_id')?.replace(/^eq\./, '');
      const message = messages.find((item) => item.id === id && item.account_id === accountId && !item.removed_at);
      if (!message) return makeResponse(200, []);
      Object.assign(message, JSON.parse(options.body));
      return makeResponse(200, [message]);
    }
    if (table === 'fxsnap_community_comment_counts') {
      return makeResponse(200, [{ message_id: messageId, comment_count: 2 }]);
    }
    return makeResponse(200, []);
  };

  function apiFor(actor) {
    return createCommunityApi({
      getActor: async () => actor,
      sendJson: (response, status, body) => {
        response.statusCode = status;
        response.body = body;
      },
      readJsonBody: async (request) => request.body || {},
    });
  }

  async function call(api, method, body) {
    const response = {};
    await api(
      { method, body },
      response,
      new URL(`/api/community/messages/${messageId}`, 'https://fxsnap.test'),
    );
    return response;
  }

  const ownerApi = apiFor({ accountId: ACCOUNT_ID, supabaseUserId: MEMBER_ID, pictureUrl: null });
  const edited = await call(ownerApi, 'PATCH', {
    body: 'Edited post',
    category: 'market_discussion',
    imageWidth: 1200,
    imageHeight: 800,
  });
  assert.equal(edited.statusCode, 200, JSON.stringify(edited.body));
  assert.equal(edited.body.message.body, 'Edited post');
  assert.equal(edited.body.message.authorPictureUrl, 'https://example.com/chartpro.png');
  assert.equal(edited.body.message.commentCount, 2);
  assert.equal(edited.body.message.payload.imageWidth, 1200);
  assert.equal(edited.body.message.payload.imageHeight, 800);
  const invalidImageDimensions = await call(ownerApi, 'PATCH', {
    body: 'Invalid image dimensions',
    imageWidth: 0,
    imageHeight: 800,
  });
  assert.equal(invalidImageDimensions.statusCode, 400);
  assert.equal(messages[0].body, 'Edited post');

  const otherApi = apiFor({ accountId: otherAccountId, supabaseUserId: otherUserId });
  const rejectedEdit = await call(otherApi, 'PATCH', { body: 'Unauthorized edit' });
  const rejectedDelete = await call(otherApi, 'DELETE');
  assert.equal(rejectedEdit.statusCode, 403);
  assert.equal(rejectedDelete.statusCode, 403);
  assert.equal(messages[0].body, 'Edited post');
  assert.equal(messages[0].removed_at, null);

  const deleted = await call(ownerApi, 'DELETE');
  assert.equal(deleted.statusCode, 200);
  assert.equal(deleted.body.removed, true);
  assert.ok(messages[0].removed_at);
});

test('reserved official username cannot be claimed by a member', async () => {
  const harness = makeHarness();
  const response = await harness.call('/api/community/username?value=fxsnap_official');
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.available, false);
  assert.match(response.body.reason, /reserved/i);
  assert.equal(harness.requests.length, 0);
});

test('username join validates acceptance and stores the name on the account', async () => {
  const harness = makeHarness();
  const rejected = await harness.call('/api/community/join', {
    method: 'POST',
    body: { username: 'chartpro', acceptedRulesVersion: 'outdated' },
  });
  assert.equal(rejected.statusCode, 400);
  assert.equal(harness.profiles.length, 0);

  const joined = await harness.call('/api/community/join', {
    method: 'POST',
    body: { username: 'chartpro', acceptedRulesVersion: RULES_VERSION },
  });
  assert.equal(joined.statusCode, 201);
  assert.equal(joined.body.profile.username, 'chartpro');
  assert.deepEqual(harness.savedNames, ['chartpro']);

  const repeated = await harness.call('/api/community/join', {
    method: 'POST',
    body: { username: 'differentname', acceptedRulesVersion: RULES_VERSION },
  });
  assert.equal(repeated.statusCode, 200);
  assert.equal(repeated.body.profile.username, 'chartpro');
  assert.deepEqual(harness.savedNames, ['chartpro', 'chartpro']);
});

test('username uniqueness conflict is returned without replacing the existing profile', async () => {
  const harness = makeHarness();
  harness.profiles.push({
    account_id: 'usr_another-member',
    supabase_user_id: '00000000-0000-4000-8000-000000000011',
    username: 'chartpro',
    accepted_rules_version: RULES_VERSION,
    status: 'active',
    muted_until: null,
    joined_at: new Date().toISOString(),
  });
  const response = await harness.call('/api/community/join', {
    method: 'POST',
    body: { username: 'chartpro', acceptedRulesVersion: RULES_VERSION },
  });
  assert.equal(response.statusCode, 409);
  assert.match(response.body.error, /already taken/i);
  assert.equal(harness.profiles.length, 1);
});

test('community username updates are validated, unique, and synchronized to the account', async () => {
  const harness = makeHarness({
    initialProfiles: [{
      account_id: ACCOUNT_ID,
      supabase_user_id: MEMBER_ID,
      username: 'chartpro',
      accepted_rules_version: RULES_VERSION,
      status: 'active',
      muted_until: null,
      joined_at: new Date().toISOString(),
    }, {
      account_id: 'usr_another-member',
      supabase_user_id: '00000000-0000-4000-8000-000000000011',
      username: 'marketmentor',
      accepted_rules_version: RULES_VERSION,
      status: 'active',
      muted_until: null,
      joined_at: new Date().toISOString(),
    }],
  });

  const invalid = await harness.call('/api/community/profile', {
    method: 'PATCH',
    body: { username: 'not valid!' },
  });
  assert.equal(invalid.statusCode, 400);

  const duplicate = await harness.call('/api/community/profile', {
    method: 'PATCH',
    body: { username: 'marketmentor' },
  });
  assert.equal(duplicate.statusCode, 409);
  assert.equal(harness.profiles[0].username, 'chartpro');

  const updated = await harness.call('/api/community/profile', {
    method: 'PATCH',
    body: { username: 'new_trader' },
  });
  assert.equal(updated.statusCode, 200);
  assert.equal(updated.body.profile.username, 'new_trader');
  assert.deepEqual(harness.savedNames, ['new_trader']);

  const unknownFields = await harness.call('/api/community/profile', {
    method: 'PATCH',
    body: { username: 'anothername', isAdmin: true },
  });
  assert.equal(unknownFields.statusCode, 400);
  assert.equal(harness.profiles[0].username, 'new_trader');
});

test('a non-admin member cannot access admin reports', async () => {
  const harness = makeHarness();
  harness.profiles.push({
    account_id: ACCOUNT_ID,
    supabase_user_id: MEMBER_ID,
    username: 'chartpro',
    accepted_rules_version: RULES_VERSION,
    status: 'active',
    muted_until: null,
    joined_at: new Date().toISOString(),
  });
  const response = await harness.call('/api/admin/community/reports');
  assert.equal(response.statusCode, 403);
  assert.match(response.body.error, /administrator/i);
  assert.equal(harness.requests.filter((request) => request.table === 'fxsnap_community_reports').length, 0);
  const supportInbox = await harness.call('/api/admin/community/support');
  assert.equal(supportInbox.statusCode, 403);
});

test('a member can load only their own private support history', async () => {
  const conversationId = '00000000-0000-4000-8000-000000000033';
  const harness = makeHarness({
    initialProfiles: [{
      account_id: ACCOUNT_ID,
      supabase_user_id: MEMBER_ID,
      username: 'chartpro',
      accepted_rules_version: RULES_VERSION,
      status: 'active',
      muted_until: null,
      joined_at: new Date().toISOString(),
    }],
    initialConversations: [{ id: conversationId, account_id: ACCOUNT_ID, status: 'open' }],
    initialSupportMessages: [{
      id: '00000000-0000-4000-8000-000000000034',
      conversation_id: conversationId,
      sender_account_id: ACCOUNT_ID,
      sender_kind: 'member',
      body: 'Private test message.',
      created_at: new Date().toISOString(),
    }],
  });
  const result = await harness.call('/api/community/support');
  assert.equal(result.statusCode, 200);
  assert.equal(result.body.conversation.id, conversationId);
  assert.equal(result.body.messages.length, 1);
  assert.equal(result.body.messages[0].body, 'Private test message.');
});

test('a signed-in member cannot access another member’s private support thread', async () => {
  const otherAccountId = 'usr_another-member';
  const otherUserId = '00000000-0000-4000-8000-000000000011';
  const harness = makeHarness({
    actor: { accountId: otherAccountId, supabaseUserId: otherUserId },
    initialProfiles: [{
      account_id: otherAccountId,
      supabase_user_id: otherUserId,
      username: 'anothermember',
      accepted_rules_version: RULES_VERSION,
      status: 'active',
      muted_until: null,
      joined_at: new Date().toISOString(),
    }],
    initialConversations: [{
      id: '00000000-0000-4000-8000-000000000032',
      account_id: ACCOUNT_ID,
      status: 'open',
    }],
  });
  const result = await harness.call('/api/community/support');
  assert.equal(result.statusCode, 200);
  assert.equal(result.body.conversation, null);
  assert.deepEqual(result.body.messages, []);
  assert.equal(harness.requests.some((request) => request.table === 'fxsnap_support_messages'), false);
});

test('admin may claim the reserved official username when no account owns it', async () => {
  const adminId = '00000000-0000-4000-8000-000000000012';
  const previous = process.env.FXSNAP_COMMUNITY_ADMIN_SUPABASE_USER_IDS;
  process.env.FXSNAP_COMMUNITY_ADMIN_SUPABASE_USER_IDS = adminId;
  try {
    const harness = makeHarness({ actor: { accountId: 'usr_official-admin', supabaseUserId: adminId } });
    const available = await harness.call('/api/community/username?value=fxsnap_official');
    assert.equal(available.body.available, true);
    const joined = await harness.call('/api/community/join', {
      method: 'POST',
      body: { username: 'fxsnap_official', acceptedRulesVersion: RULES_VERSION },
    });
    assert.equal(joined.statusCode, 201);
    assert.equal(joined.body.profile.username, 'fxsnap_official');
    assert.equal(joined.body.profile.isAdmin, true);
  } finally {
    process.env.FXSNAP_COMMUNITY_ADMIN_SUPABASE_USER_IDS = previous;
  }
});

test('invalid structured signal is rejected before persistence', async () => {
  const harness = makeHarness({
    initialProfiles: [{
      account_id: ACCOUNT_ID,
      supabase_user_id: MEMBER_ID,
      username: 'chartpro',
      accepted_rules_version: RULES_VERSION,
      status: 'active',
      muted_until: null,
      joined_at: new Date().toISOString(),
    }],
  });
  const response = await harness.call('/api/community/messages', {
    method: 'POST',
    body: {
      clientMessageId: '00000000-0000-4000-8000-000000000041',
      kind: 'signal',
      payload: { instrument: 'EURUSD', direction: 'BUY' },
    },
  });
  assert.equal(response.statusCode, 400);
  assert.equal(harness.requests.some((request) => request.table === 'fxsnap_community_messages' && request.method === 'POST'), false);
});
