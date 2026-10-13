import type {
  CommunityCategory,
  CommunityMessage,
  CommunityNotification,
  CommunityProfile,
  CommunitySearchKind,
  CommunitySearchResults,
} from '@/services/community';

const PREVIEW_ACCOUNT_ID = 'preview-local-account';
const PREVIEW_USERNAME = 'demo_trader';
const PREVIEW_POST_ID = '00000000-0000-4000-8000-000000000101';
const PREVIEW_COMMENT_ID = '00000000-0000-4000-8000-000000000102';
const PREVIEW_OTHER_ID = '00000000-0000-4000-8000-000000000103';

function id() {
  return globalThis.crypto?.randomUUID?.()
    || `preview-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function now() {
  return new Date().toISOString();
}

function makeMessage(input: Partial<CommunityMessage> & Pick<CommunityMessage, 'id' | 'authorUsername' | 'body'>): CommunityMessage {
  return {
    clientMessageId: input.clientMessageId || id(),
    authorAccountId: input.authorAccountId || (input.authorUsername === PREVIEW_USERNAME ? PREVIEW_ACCOUNT_ID : `preview-${input.authorUsername}`),
    authorPictureUrl: input.authorPictureUrl || null,
    isOfficial: false,
    isFollowed: false,
    kind: 'text',
    category: 'trading',
    payload: {},
    replyTo: null,
    pinnedAt: null,
    createdAt: now(),
    commentCount: 0,
    viewCount: 0,
    shareCount: 0,
    removed: false,
    reactions: [],
    ...input,
  };
}

const previewProfile: CommunityProfile = {
  accountId: PREVIEW_ACCOUNT_ID,
  username: PREVIEW_USERNAME,
  status: 'active',
  mutedUntil: null,
  joinedAt: new Date(Date.now() - 28 * 86_400_000).toISOString(),
  rulesVersion: 'community-rules-v1',
  isAdmin: false,
};

const messages: CommunityMessage[] = [
  makeMessage({
    id: PREVIEW_POST_ID,
    authorUsername: 'market_maya',
    authorPictureUrl: null,
    body: 'I’m practicing waiting for a clear H1 close before drawing conclusions. What helps you avoid reacting to every small move?',
    category: 'learning',
    createdAt: new Date(Date.now() - 42 * 60_000).toISOString(),
    commentCount: 1,
    reactions: [{ reaction: 'love', count: 3, reacted: false }],
  }),
  makeMessage({
    id: PREVIEW_OTHER_ID,
    authorUsername: 'fx_learner',
    body: 'New here. Which risk-management concepts helped you most when you were learning?',
    category: 'questions',
    createdAt: new Date(Date.now() - 3 * 3_600_000).toISOString(),
    reactions: [{ reaction: 'clap', count: 1, reacted: false }],
  }),
  makeMessage({
    id: PREVIEW_COMMENT_ID,
    authorUsername: PREVIEW_USERNAME,
    body: 'I find it useful to define the invalidation point before entering and keep position sizing consistent.',
    category: 'learning',
    replyTo: {
      id: PREVIEW_POST_ID,
      author_username: 'market_maya',
      body: 'I’m practicing waiting for a clear H1 close before drawing conclusions. What helps you avoid reacting to every small move?',
      kind: 'text',
      removed_at: null,
    },
    createdAt: new Date(Date.now() - 30 * 60_000).toISOString(),
  }),
];

const following = new Set<string>();
const viewDedup = new Map<string, number>();
const blocked = new Set<string>();
const reports: Array<{ id: string; messageId: string; reason: string }> = [];
const notifications: CommunityNotification[] = [{
  id: '00000000-0000-4000-8000-000000000104',
  kind: 'reply',
  message: 'market_maya replied to your community discussion.',
  object_id: PREVIEW_POST_ID,
  post_id: PREVIEW_POST_ID,
  read_at: null,
  created_at: new Date(Date.now() - 12 * 60_000).toISOString(),
}];

function rootPost(message: CommunityMessage) {
  let current = message;
  let depth = 0;
  while (current.replyTo && depth < 3) {
    const parent = messages.find((item) => item.id === current.replyTo?.id);
    if (!parent) break;
    current = parent;
    depth += 1;
  }
  return current;
}

function commentCount(postId: string) {
  return messages.filter((item) => item.replyTo && rootPost(item).id === postId && !item.removed).length;
}

function withCounts(message: CommunityMessage): CommunityMessage {
  return {
    ...message,
    commentCount: commentCount(message.id),
    viewCount: message.viewCount || 0,
    shareCount: message.shareCount || 0,
  };
}

function response(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

export function createCommunityPreviewAccount() {
  return {
    provider: 'google' as const,
    email: 'preview@local.invalid',
    emailVerified: true,
    displayName: 'Local Preview',
    pictureUrl: null,
    communityUsername: PREVIEW_USERNAME,
    status: 'active' as const,
    createdAt: previewProfile.joinedAt,
    lastSignInAt: now(),
  };
}

export async function handleCommunityPreviewRequest(path: string, init?: RequestInit): Promise<Response> {
  const url = new URL(path, 'https://community-preview.local');
  const pathname = url.pathname;
  const method = init?.method || 'GET';
  const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : {};

  if (pathname === '/api/community/me' && method === 'GET') {
    return response(200, { rulesVersion: previewProfile.rulesVersion, profile: previewProfile });
  }
  if (pathname === '/api/community/bootstrap' && method === 'GET') {
    const category = url.searchParams.get('category');
    const feed = url.searchParams.get('feed');
    const visible = messages
      .filter((item) => !item.replyTo && !item.removed && !blocked.has(item.authorUsername))
      .filter((item) => !category || item.category === category)
      .filter((item) => feed !== 'following' || following.has(item.authorUsername))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return response(200, {
      profile: previewProfile,
      messages: visible.map(withCounts),
      nextCursor: null,
      hasMore: false,
      followingEmpty: feed === 'following' && visible.length === 0,
    });
  }
  if (pathname === '/api/community/username' && method === 'GET') {
    return response(200, { available: true, reason: null });
  }
  if (pathname === '/api/community/messages' && method === 'GET') {
    const category = url.searchParams.get('category');
    const feed = url.searchParams.get('feed');
    const visible = messages
      .filter((item) => !item.replyTo && !item.removed && !blocked.has(item.authorUsername))
      .filter((item) => !category || item.category === category)
      .filter((item) => feed !== 'following' || following.has(item.authorUsername))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return response(200, {
      messages: visible.map(withCounts),
      nextCursor: null,
      hasMore: false,
      followingEmpty: feed === 'following' && visible.length === 0,
    });
  }
  if (pathname === '/api/community/messages' && method === 'POST') {
    const post = makeMessage({
      id: id(),
      clientMessageId: String(body.clientMessageId || id()),
      authorAccountId: PREVIEW_ACCOUNT_ID,
      authorUsername: PREVIEW_USERNAME,
      body: String(body.body || ''),
      kind: body.kind as CommunityMessage['kind'],
      category: body.category as CommunityCategory,
      payload: (body.payload || {}) as Record<string, unknown>,
    });
    messages.unshift(post);
    return response(201, { message: withCounts(post), duplicate: false });
  }
  if (pathname === '/api/community/views' && method === 'POST') {
    const messageIds = Array.isArray(body.messageIds) ? body.messageIds.filter((value): value is string => typeof value === 'string') : [];
    const views = [];
    for (const messageId of [...new Set(messageIds)].slice(0, 30)) {
      const post = messages.find((item) => item.id === messageId && !item.replyTo && !item.removed);
      if (!post) continue;
      if (post.authorAccountId !== PREVIEW_ACCOUNT_ID) {
        const key = `${messageId}:${PREVIEW_ACCOUNT_ID}`;
        const lastViewed = viewDedup.get(key) || 0;
        if (Date.now() - lastViewed >= 24 * 60 * 60 * 1000) {
          post.viewCount += 1;
          viewDedup.set(key, Date.now());
        }
      }
      views.push({ messageId, viewCount: post.viewCount });
    }
    return response(200, { views });
  }
  if (pathname === '/api/community/search' && method === 'GET') {
    const query = (url.searchParams.get('q') || '').trim().toLowerCase();
    const kind = url.searchParams.get('kind') as CommunitySearchKind;
    const result: CommunitySearchResults = { posts: [], people: [], topics: [] };
    if (kind === 'posts') {
      result.posts = messages
        .filter((item) => !item.replyTo && !item.removed && item.body.toLowerCase().includes(query))
        .map(withCounts);
    } else if (kind === 'people') {
      const names = [...new Set([...messages.map((item) => item.authorUsername), PREVIEW_USERNAME])]
        .filter((name) => name.toLowerCase().includes(query) && !blocked.has(name));
      result.people = names.map((username) => ({
        accountId: username === PREVIEW_USERNAME ? PREVIEW_ACCOUNT_ID : `preview-${username}`,
        username,
        pictureUrl: null,
      }));
    } else if (kind === 'topics') {
      const labels: Array<[CommunityCategory, string]> = [
        ['trading', 'Trading'],
        ['investing', 'Investing'],
        ['finance', 'Finance'],
        ['market_discussion', 'Market Discussion'],
        ['learning', 'Learning'],
        ['chart_analysis', 'Chart Analysis'],
        ['questions', 'Questions'],
      ];
      result.topics = labels
        .filter(([category, label]) => `${category} ${label}`.toLowerCase().includes(query))
        .map(([id, label]) => ({ id, label }));
    }
    return response(200, result);
  }
  const memberMatch = pathname.match(/^\/api\/community\/members\/([a-z0-9_]{3,24})$/i);
  if (memberMatch && method === 'GET') {
    const username = decodeURIComponent(memberMatch[1]).toLowerCase();
    if (blocked.has(username)) return response(404, { error: 'Community member not found.' });
    const profilePosts = messages.filter((item) => item.authorUsername === username && !item.replyTo && !item.removed);
    return response(200, {
      member: {
        accountId: username === PREVIEW_USERNAME ? PREVIEW_ACCOUNT_ID : `preview-${username}`,
        username,
        pictureUrl: null,
        joinedAt: previewProfile.joinedAt,
        followerCount: [...following].filter((name) => name === username).length,
        followingCount: username === PREVIEW_USERNAME ? following.size : 0,
        isFollowing: following.has(username),
        isCurrentUser: username === PREVIEW_USERNAME,
        posts: profilePosts.map(withCounts),
      },
    });
  }
  const postMatch = pathname.match(/^\/api\/community\/messages\/([^/]+)$/);
  if (postMatch && method === 'GET') {
    const post = messages.find((item) => item.id === decodeURIComponent(postMatch[1]) && !item.removed);
    return post ? response(200, { post: withCounts(post) }) : response(404, { error: 'Post not found.' });
  }
  if (postMatch && method === 'PATCH') {
    const post = messages.find((item) => item.id === decodeURIComponent(postMatch[1]) && item.authorUsername === PREVIEW_USERNAME);
    if (!post) return response(403, { error: 'Only your preview posts can be edited.' });
    post.body = String(body.body || '');
    post.category = body.category as CommunityCategory;
    if ('imageUrl' in body) post.payload = { ...post.payload, imageUrl: body.imageUrl };
    return response(200, { message: withCounts(post) });
  }
  if (postMatch && method === 'DELETE') {
    const post = messages.find((item) => item.id === decodeURIComponent(postMatch[1]) && item.authorUsername === PREVIEW_USERNAME);
    if (!post) return response(403, { error: 'Only your preview content can be deleted.' });
    post.removed = true;
    return response(200, { removed: true });
  }
  const commentsMatch = pathname.match(/^\/api\/community\/messages\/([^/]+)\/comments$/);
  if (commentsMatch && method === 'GET') {
    const postId = decodeURIComponent(commentsMatch[1]);
    const parentId = url.searchParams.get('parentId');
    const comments = messages.filter((item) => item.replyTo
      && (parentId ? item.replyTo.id === parentId : item.replyTo.id === postId)
      && !item.removed);
    return response(200, { comments: comments.map(withCounts), nextCursor: null, hasMore: false });
  }
  if (commentsMatch && method === 'POST') {
    const postId = decodeURIComponent(commentsMatch[1]);
    const parentId = typeof body.replyToId === 'string' ? body.replyToId : postId;
    const parent = messages.find((item) => item.id === parentId);
    if (!parent) return response(404, { error: 'Discussion not found.' });
    const comment = makeMessage({
      id: id(),
      clientMessageId: String(body.clientMessageId || id()),
      authorAccountId: PREVIEW_ACCOUNT_ID,
      authorUsername: PREVIEW_USERNAME,
      body: String(body.body || ''),
      category: parent.category || 'learning',
      replyTo: {
        id: parent.id,
        author_username: parent.authorUsername,
        body: parent.body,
        kind: parent.kind,
        removed_at: null,
      },
    });
    messages.push(comment);
    return response(201, { message: comment, duplicate: false });
  }
  const reactionMatch = pathname.match(/^\/api\/community\/messages\/([^/]+)\/reactions$/);
  if (reactionMatch && method === 'POST') {
    const target = messages.find((item) => item.id === decodeURIComponent(reactionMatch[1]));
    if (!target) return response(404, { error: 'Post not found.' });
    const reaction = String(body.reaction || 'love') as CommunityMessage['reactions'][number]['reaction'];
    const current = target.reactions.find((item) => item.reacted);
    if (current?.reaction === reaction) {
      current.count = Math.max(0, current.count - 1);
      current.reacted = false;
    } else {
      if (current) {
        current.count = Math.max(0, current.count - 1);
        current.reacted = false;
      }
      const next = target.reactions.find((item) => item.reaction === reaction);
      if (next) {
        next.count += 1;
        next.reacted = true;
      } else {
        target.reactions.push({ reaction, count: 1, reacted: true });
      }
    }
    const selectedReaction = target.reactions.find((item) => item.reacted)?.reaction || null;
    return response(200, {
      reacted: selectedReaction !== null,
      selectedReaction,
      reactions: target.reactions.filter((item) => item.count > 0),
    });
  }
  const shareMatch = pathname.match(/^\/api\/community\/messages\/([^/]+)\/shares$/);
  if (shareMatch && method === 'POST') {
    const post = messages.find((item) => item.id === decodeURIComponent(shareMatch[1]) && !item.replyTo && !item.removed);
    if (!post) return response(404, { error: 'Post not found.' });
    post.shareCount += 1;
    return response(200, { shareCount: post.shareCount });
  }
  if (pathname === '/api/community/follows' && method === 'GET') {
    return response(200, { following: [...following].map((username) => ({ accountId: `preview-${username}`, username, createdAt: now() })) });
  }
  if (pathname === '/api/community/follows' && method === 'POST') {
    following.add(String(body.username || '').toLowerCase());
    return response(200, { following: true });
  }
  const unfollowMatch = pathname.match(/^\/api\/community\/follows\/([^/]+)$/);
  if (unfollowMatch && method === 'DELETE') {
    following.delete(decodeURIComponent(unfollowMatch[1]).toLowerCase());
    return response(200, { following: false });
  }
  if (pathname === '/api/community/notifications' && method === 'GET') {
    return response(200, { notifications });
  }
  const readMatch = pathname.match(/^\/api\/community\/notifications\/([^/]+)\/read$/);
  if (readMatch && method === 'POST') {
    const notification = notifications.find((item) => item.id === decodeURIComponent(readMatch[1]));
    if (notification) notification.read_at = now();
    return response(200, { read: true });
  }
  if (pathname === '/api/community/blocks' && method === 'GET') {
    return response(200, { blocks: [...blocked].map((username) => ({ accountId: `preview-${username}`, username, createdAt: now() })) });
  }
  if (pathname === '/api/community/blocks' && method === 'POST') {
    blocked.add(String(body.username || '').toLowerCase());
    return response(200, { blocked: true });
  }
  const unblockMatch = pathname.match(/^\/api\/community\/blocks\/([^/]+)$/);
  if (unblockMatch && method === 'DELETE') {
    blocked.delete(decodeURIComponent(unblockMatch[1]).replace(/^preview-/, ''));
    return response(200, { blocked: false });
  }
  if (pathname === '/api/community/reports' && method === 'POST') {
    reports.push({ id: id(), messageId: String(body.messageId || ''), reason: String(body.reason || '') });
    return response(201, { reported: true });
  }
  if (pathname === '/api/community/upload' && method === 'POST') {
    return response(200, { imageUrl: `data:${String(body.mimeType)};base64,${String(body.data || '')}` });
  }
  return response(501, { error: 'This action is not available in local Community preview.' });
}
