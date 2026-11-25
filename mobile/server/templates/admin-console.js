(() => {
  const statusNode = document.getElementById('status');
  const loginNode = document.getElementById('login');
  const workspaceNode = document.getElementById('workspace');
  const panelNode = document.getElementById('panel');
  const signOutButton = document.getElementById('sign-out');
  const loginForm = document.getElementById('login-form');
  const emailInput = document.getElementById('email');
  const accessTokenKey = 'fxsnap.staff.access-token';
  const refreshTokenKey = 'fxsnap.staff.refresh-token';
  const verifierKey = 'fxsnap.staff.pkce-verifier';
  let config = null;
  let activeTab = 'community';
  let activeConversationId = null;
  let activeEventParticipantsId = null;
  let supportQuery = '';

  function setStatus(message, kind = '') {
    statusNode.textContent = message || '';
    statusNode.className = `status${kind ? ` ${kind}` : ''}`;
  }

  function node(tag, className = '', text = '') {
    const result = document.createElement(tag);
    if (className) result.className = className;
    if (text !== '') result.textContent = String(text);
    return result;
  }

  function actionButton(text, handler, className = 'btn') {
    const button = node('button', className, text);
    button.type = 'button';
    button.addEventListener('click', handler);
    return button;
  }

  function field(labelText, input) {
    const label = node('label');
    label.append(node('span', '', labelText), input);
    return label;
  }

  function input(type, name, value = '') {
    const result = node('input');
    result.type = type;
    result.name = name;
    result.value = value;
    return result;
  }

  function select(name, values, selected) {
    const result = node('select');
    result.name = name;
    for (const [value, label] of values) {
      const option = node('option', '', label);
      option.value = value;
      option.selected = value === selected;
      result.append(option);
    }
    return result;
  }

  function badge(text) {
    return node('span', 'badge', text || '—');
  }

  function card(title, subtitle) {
    const result = node('article', 'item');
    const heading = node('div', 'item-title');
    heading.append(node('strong', '', title || 'Untitled'));
    if (subtitle) heading.append(badge(subtitle));
    result.append(heading);
    return result;
  }

  function emptyMessage(text) {
    return node('div', 'empty', text);
  }

  function formatDate(value) {
    if (!value) return '—';
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toLocaleString();
  }

  function clearTokens() {
    localStorage.removeItem(accessTokenKey);
    localStorage.removeItem(refreshTokenKey);
    localStorage.removeItem(verifierKey);
  }

  async function loadConfig() {
    const response = await fetch('/api/admin/auth-config', { cache: 'no-store' });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || 'Staff sign-in is not configured.');
    config = body;
    return config;
  }

  async function authRequest(path, body) {
    const response = await fetch(`${config.supabaseUrl}/auth/v1/${path}`, {
      method: 'POST',
      headers: {
        apikey: config.publicKey,
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(result.msg || result.message || result.error_description || 'Supabase sign-in failed.');
      error.status = response.status;
      throw error;
    }
    return result;
  }

  async function exchangeMagicLinkCode() {
    const url = new URL(window.location.href);
    const code = url.searchParams.get('code');
    if (!code) return false;
    const verifier = localStorage.getItem(verifierKey);
    window.history.replaceState({}, document.title, url.pathname);
    if (!verifier) throw new Error('This sign-in link was opened in a different browser. Request a new link in this browser.');
    const session = await authRequest('token?grant_type=pkce', {
      auth_code: code,
      code_verifier: verifier,
    });
    localStorage.setItem(accessTokenKey, session.access_token);
    localStorage.setItem(refreshTokenKey, session.refresh_token);
    localStorage.removeItem(verifierKey);
    return true;
  }

  async function refreshSession() {
    const refreshToken = localStorage.getItem(refreshTokenKey);
    if (!refreshToken) return false;
    try {
      const session = await authRequest('token?grant_type=refresh_token', { refresh_token: refreshToken });
      localStorage.setItem(accessTokenKey, session.access_token);
      localStorage.setItem(refreshTokenKey, session.refresh_token);
      return true;
    } catch (error) {
      if ([400, 401, 403].includes(error.status)) {
        clearTokens();
        return false;
      }
      throw new Error(error.message || 'Could not refresh the staff session. Try again.');
    }
  }

  async function api(path, options = {}, canRefresh = true) {
    const headers = { ...(options.headers || {}) };
    const token = localStorage.getItem(accessTokenKey);
    if (token) headers.authorization = `Bearer ${token}`;
    if (options.body !== undefined && typeof options.body !== 'string') {
      headers['content-type'] = 'application/json';
      options = { ...options, body: JSON.stringify(options.body) };
    }
    const response = await fetch(path, { ...options, headers, cache: 'no-store' });
    if (response.status === 401 && canRefresh && await refreshSession()) return api(path, options, false);
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(body.error || `Request failed (${response.status}).`);
      error.status = response.status;
      throw error;
    }
    return body;
  }

  function showLogin(message = '', kind = 'error') {
    loginNode.hidden = false;
    workspaceNode.hidden = true;
    signOutButton.hidden = true;
    if (message) setStatus(message, kind);
  }

  function showWorkspace() {
    loginNode.hidden = true;
    workspaceNode.hidden = false;
    signOutButton.hidden = false;
    setStatus('Signed in to the staff console.', 'success');
    loadTab(activeTab);
  }

  async function verifySession() {
    if (!localStorage.getItem(accessTokenKey)) return showLogin();
    try {
      const access = await api('/api/admin/support/access');
      if (!access.allowed) return showLogin('This account is not authorized for the staff console.');
      showWorkspace();
    } catch (error) {
      if ([401, 403].includes(error.status)) clearTokens();
      showLogin(error.status === 403
        ? 'This account is not authorized for the staff console.'
        : error.message || 'Your staff session could not be verified. Try again.');
    }
  }

  async function sendMagicLink(event) {
    event.preventDefault();
    setStatus('Sending a secure sign-in link…');
    const email = emailInput.value.trim();
    try {
      await loadConfig();
      const random = new Uint8Array(48);
      crypto.getRandomValues(random);
      const verifier = btoa(String.fromCharCode(...random)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
      const challenge = btoa(String.fromCharCode(...new Uint8Array(digest)))
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
      localStorage.setItem(verifierKey, verifier);
      const redirectTo = `${window.location.origin}/admin-console`;
      await authRequest(`otp?redirect_to=${encodeURIComponent(redirectTo)}`, {
        email,
        create_user: false,
        code_challenge: challenge,
        code_challenge_method: 's256',
      });
      setStatus('If this email belongs to an existing Supabase account, a sign-in link is on its way.', 'success');
      loginForm.reset();
    } catch (error) {
      localStorage.removeItem(verifierKey);
      setStatus(error.message || 'Could not send the sign-in link.', 'error');
    }
  }

  async function signOut() {
    const token = localStorage.getItem(accessTokenKey);
    let revocationFailed = false;
    if (token && config) {
      try {
        const response = await fetch(`${config.supabaseUrl}/auth/v1/logout`, {
          method: 'POST',
          headers: { apikey: config.publicKey, authorization: `Bearer ${token}` },
        });
        revocationFailed = !response.ok;
      } catch {
        revocationFailed = true;
      }
    }
    clearTokens();
    activeConversationId = null;
    showLogin(
      revocationFailed
        ? 'Signed out locally, but Supabase could not revoke the session right now.'
        : 'You have been signed out.',
      revocationFailed ? 'error' : 'success',
    );
  }

  function renderPanel(title, description, refresh) {
    panelNode.replaceChildren();
    const heading = node('div', 'panel-head');
    const copy = node('div');
    copy.append(node('h2', '', title), node('div', 'muted', description));
    heading.append(copy);
    if (refresh) heading.append(actionButton('Refresh', refresh));
    panelNode.append(heading);
    return panelNode;
  }

  async function loadTab(tab) {
    activeTab = tab;
    document.querySelectorAll('[data-tab]').forEach((button) => {
      if (button.dataset.tab === tab) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    });
    setStatus('');
    try {
      if (tab === 'community') await renderCommunity();
      else if (tab === 'support') await renderSupport();
      else if (tab === 'events') await renderEvents();
      else await renderAnnouncements();
    } catch (error) {
      setStatus(error.message || 'The selected module could not be loaded.', 'error');
    }
  }

  async function renderCommunity() {
    renderPanel('Community moderation', 'Review member reports and apply account or post actions.', () => loadTab('community'));
    const [reportResult] = await Promise.all([
      api('/api/admin/community/reports'),
    ]);
    const moderationForm = node('form', 'editor');
    moderationForm.append(node('h3', '', 'Member or post action'));
    const actionSelect = select('action', [
      ['warn', 'Warn member'],
      ['mute', 'Mute member'],
      ['suspend', 'Suspend member'],
      ['ban', 'Ban member'],
      ['unmute', 'Unmute member'],
      ['unsuspend', 'Unsuspend member'],
      ['unban', 'Unban member'],
      ['remove_message', 'Remove post'],
      ['pin', 'Pin post'],
      ['unpin', 'Unpin post'],
    ], 'warn');
    const usernameInput = input('text', 'username');
    usernameInput.autocomplete = 'off';
    usernameInput.placeholder = 'Community username';
    const messageIdInput = input('text', 'messageId');
    messageIdInput.placeholder = 'Post UUID (for post actions)';
    const durationInput = input('number', 'durationHours', '24');
    durationInput.min = '1';
    durationInput.max = '8760';
    const explanationInput = node('textarea');
    explanationInput.name = 'explanation';
    explanationInput.maxLength = 1000;
    explanationInput.placeholder = 'Optional moderation note';
    moderationForm.append(
      field('Action', actionSelect),
      node('div', 'grid'),
    );
    moderationForm.lastChild.append(
      field('Username', usernameInput),
      field('Post UUID', messageIdInput),
      field('Mute duration (hours)', durationInput),
      field('Explanation', explanationInput),
    );
    const submit = node('button', 'btn primary', 'Apply action');
    submit.type = 'submit';
    moderationForm.append(submit);
    moderationForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const payload = {
        action: actionSelect.value,
        explanation: explanationInput.value.trim(),
      };
      if (usernameInput.value.trim()) payload.username = usernameInput.value.trim();
      if (messageIdInput.value.trim()) payload.messageId = messageIdInput.value.trim();
      if (['mute'].includes(payload.action)) payload.durationHours = Number(durationInput.value);
      try {
        await api('/api/admin/community/moderation', { method: 'POST', body: payload });
        setStatus('Moderation action applied.', 'success');
        await renderCommunity();
      } catch (error) {
        setStatus(error.message, 'error');
      }
    });
    panelNode.append(moderationForm, node('h3', '', `Open reports (${reportResult.reports.length})`));
    if (!reportResult.reports.length) {
      panelNode.append(emptyMessage('There are no open Community reports.'));
      return;
    }
    const list = node('div', 'stack');
    for (const report of reportResult.reports) {
      const item = card(report.reason || 'Member report', report.status);
      item.append(
        node('p', '', report.explanation || 'No additional explanation provided.'),
        node('div', 'meta', `Reporter ${report.reporter_account_id} · Target ${report.target_account_id} · ${formatDate(report.created_at)}`),
      );
      if (report.message_id) item.append(node('div', 'meta', `Post ${report.message_id}`));
      const actions = node('div', 'actions');
      if (report.message_id) {
        actions.append(actionButton('Remove reported post', async () => {
          if (!window.confirm('Remove this reported post?')) return;
          try {
            await api('/api/admin/community/moderation', {
              method: 'POST',
              body: {
                action: 'remove_message',
                messageId: report.message_id,
                explanation: `Removed from report ${report.id}`,
              },
            });
            await api('/api/admin/community/reports', {
              method: 'PATCH',
              body: { reportId: report.id, status: 'resolved' },
            });
            setStatus('Reported post removed and report resolved.', 'success');
            await renderCommunity();
          } catch (error) {
            setStatus(error.message, 'error');
          }
        }, 'btn danger'));
      }
      for (const [status, label] of [['reviewing', 'Mark reviewing'], ['resolved', 'Resolve'], ['dismissed', 'Dismiss']]) {
        actions.append(actionButton(label, async () => {
          try {
            await api('/api/admin/community/reports', { method: 'PATCH', body: { reportId: report.id, status } });
            await renderCommunity();
          } catch (error) {
            setStatus(error.message, 'error');
          }
        }));
      }
      item.append(actions);
      list.append(item);
    }
    panelNode.append(list);
  }

  async function renderSupport() {
    renderPanel('Support inbox', 'Read and respond to private customer support conversations.', () => loadTab('support'));
    const result = await api(`/api/admin/support/conversations?q=${encodeURIComponent(supportQuery)}`);
    const layout = node('div', 'two-column');
    const list = node('div', 'conversation-list');
    const searchForm = node('form', 'actions');
    const searchInput = input('search', 'q', supportQuery);
    searchInput.placeholder = 'Search username, topic, or message';
    const searchButton = node('button', 'btn', 'Search');
    searchButton.type = 'submit';
    searchForm.append(searchInput, searchButton);
    list.append(searchForm);
    searchForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      supportQuery = searchInput.value.trim();
      activeConversationId = null;
      await renderSupport();
    });
    for (const conversation of result.conversations) {
      const button = node('button', `conversation-button${conversation.id === activeConversationId ? ' selected' : ''}`);
      button.type = 'button';
      button.append(
        node('strong', '', conversation.community_username || conversation.display_name || 'Anonymous member'),
        node('div', 'muted', conversation.latest_message || conversation.topic || 'No messages'),
        node('div', 'meta', `${conversation.status} · ${conversation.unread_count || 0} unread · ${formatDate(conversation.updated_at)}`),
      );
      button.addEventListener('click', async () => {
        activeConversationId = conversation.id;
        await renderSupport();
      });
      list.append(button);
    }
    layout.append(list);
    if (activeConversationId) {
      const conversation = result.conversations.find((item) => item.id === activeConversationId);
      if (!conversation) activeConversationId = null;
    }
    if (activeConversationId) {
      const detail = await api(`/api/admin/support/conversations/${encodeURIComponent(activeConversationId)}`);
      const box = node('section', 'item');
      const person = detail.conversation.community_username || detail.conversation.display_name || detail.conversation.account_id;
      box.append(node('h3', '', person), node('div', 'meta', `${detail.conversation.topic || 'No topic'} · ${detail.conversation.subscription_status || 'unknown'} · ${detail.conversation.platform || 'unknown platform'}`));
      const statusSelect = select('status', [['open', 'Open'], ['pending', 'Pending'], ['resolved', 'Resolved']], detail.conversation.status);
      statusSelect.addEventListener('change', async () => {
        try {
          await api(`/api/admin/support/conversations/${encodeURIComponent(activeConversationId)}`, {
            method: 'PATCH',
            body: { status: statusSelect.value },
          });
          setStatus('Conversation status updated.', 'success');
        } catch (error) {
          setStatus(error.message, 'error');
        }
      });
      box.append(field('Status', statusSelect));
      const messages = node('div', 'messages');
      for (const message of detail.messages) {
        const bubble = node('article', `message ${message.sender_kind === 'admin' ? 'admin' : 'member'}`);
        bubble.append(node('div', 'muted', message.sender_kind === 'admin' ? 'Staff' : person));
        if (message.body) bubble.append(node('p', '', message.body));
        if (message.attachment?.url) {
          try {
            const attachmentUrl = new URL(message.attachment.url);
            if (attachmentUrl.protocol === 'https:') {
              const link = node('a', '', 'View private attachment');
              link.href = attachmentUrl.href;
              link.target = '_blank';
              link.rel = 'noopener noreferrer';
              bubble.append(link);
            }
          } catch {
            setStatus('A support attachment has an invalid URL.', 'error');
          }
        }
        bubble.append(node('time', '', formatDate(message.created_at)));
        messages.append(bubble);
      }
      box.append(messages);
      const replyForm = node('form', 'editor');
      const replyInput = node('textarea');
      replyInput.name = 'reply';
      replyInput.maxLength = 2000;
      replyInput.required = true;
      replyInput.placeholder = 'Write a reply…';
      const send = node('button', 'btn primary', 'Send reply');
      send.type = 'submit';
      replyForm.append(field('Reply', replyInput), send);
      replyForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        try {
          await api(`/api/admin/support/conversations/${encodeURIComponent(activeConversationId)}`, {
            method: 'POST',
            body: { body: replyInput.value.trim(), clientMessageId: crypto.randomUUID() },
          });
          await renderSupport();
        } catch (error) {
          setStatus(error.message, 'error');
        }
      });
      box.append(replyForm);
      layout.append(box);
    } else {
      layout.append(emptyMessage('Select a conversation to view and reply.'));
    }
    panelNode.append(layout);
    if (!result.conversations.length) panelNode.append(emptyMessage('There are no support conversations yet.'));
  }

  async function renderEvents() {
    renderPanel('Events', 'Create, schedule, and manage live event spaces.', () => loadTab('events'));
    const [spacesResult, hostsResult] = await Promise.all([
      api('/api/admin/event-spaces'),
      api('/api/admin/event-spaces/hosts'),
    ]);
    let editingSpace = null;
    const form = node('form', 'editor');
    const formTitle = node('h3', '', 'Create event space');
    const titleInput = input('text', 'title');
    titleInput.required = true;
    titleInput.minLength = 3;
    titleInput.maxLength = 100;
    const topicInput = input('text', 'topic');
    topicInput.required = true;
    topicInput.minLength = 2;
    topicInput.maxLength = 48;
    const descriptionInput = node('textarea');
    descriptionInput.name = 'description';
    descriptionInput.maxLength = 1200;
    const hostSelect = select('hostAccountId', [['', 'Choose an active Community host'], ...hostsResult.hosts.map((host) => [host.accountId, host.username])], '');
    const scheduleInput = input('datetime-local', 'scheduledAt');
    const timezoneInput = input('text', 'timezone', Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
    const waitingLeadInput = input('number', 'waitingLead', '15');
    waitingLeadInput.min = '0';
    waitingLeadInput.max = '10080';
    const durationInput = input('number', 'durationMinutes', '60');
    durationInput.min = '5';
    durationInput.max = '480';
    durationInput.placeholder = 'Optional';
    const visibilityInput = select('visibility', [['public', 'Public'], ['private', 'Private']], 'public');
    const featuredInput = input('checkbox', 'featured');
    const speakingInput = input('checkbox', 'allowSpeakingRequests');
    const commentsInput = input('checkbox', 'commentsEnabled');
    commentsInput.checked = true;
    const fields = node('div', 'grid');
    fields.append(
      field('Title', titleInput),
      field('Topic', topicInput),
      field('Host', hostSelect),
      field('Local session date and time (leave blank for draft)', scheduleInput),
      field('Timezone', timezoneInput),
      field('Waiting-room lead (minutes)', waitingLeadInput),
      field('Expected duration (minutes)', durationInput),
      field('Visibility', visibilityInput),
      field('Description', descriptionInput),
    );
    const toggles = node('div', 'checks');
    for (const [checkbox, text] of [
      [featuredInput, 'Feature this event'],
      [speakingInput, 'Allow speaking requests'],
      [commentsInput, 'Enable comments'],
    ]) {
      const wrapper = node('label', 'check');
      wrapper.append(checkbox, node('span', '', text));
      toggles.append(wrapper);
    }
    const controls = node('div', 'actions');
    const saveButton = node('button', 'btn primary', 'Save draft / schedule');
    saveButton.type = 'submit';
    const liveButton = node('button', 'btn', 'Create and go live');
    liveButton.type = 'button';
    const cancelEditButton = actionButton('Cancel edit', () => {
      editingSpace = null;
      form.reset();
      formTitle.textContent = 'Create event space';
      saveButton.textContent = 'Save draft / schedule';
      liveButton.hidden = false;
      cancelEditButton.hidden = true;
      hostSelect.value = '';
      commentsInput.checked = true;
      timezoneInput.value = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    });
    cancelEditButton.hidden = true;
    controls.append(saveButton, liveButton, cancelEditButton);
    form.append(formTitle, fields, toggles, controls);
    function eventPayload() {
      const scheduledAt = scheduleInput.value ? new Date(scheduleInput.value).toISOString() : null;
      if (!hostSelect.value) throw new Error('Add an active Community host before creating an event.');
      const leadMinutes = Number(waitingLeadInput.value || 0);
      if (!Number.isInteger(leadMinutes) || leadMinutes < 0 || leadMinutes > 10080) {
        throw new Error('Waiting-room lead time must be between 0 and 10,080 minutes.');
      }
      const durationMinutes = durationInput.value.trim() ? Number(durationInput.value) : null;
      if (durationMinutes !== null && (!Number.isInteger(durationMinutes) || durationMinutes < 5 || durationMinutes > 480)) {
        throw new Error('Expected duration must be between 5 and 480 minutes.');
      }
      return {
        title: titleInput.value.trim(),
        description: descriptionInput.value.trim(),
        topic: topicInput.value.trim(),
        visibility: visibilityInput.value,
        hostAccountId: hostSelect.value,
        scheduledAt,
        timezone: timezoneInput.value.trim() || 'UTC',
        waitingRoomOpensAt: scheduledAt
          ? new Date(new Date(scheduledAt).getTime() - leadMinutes * 60_000).toISOString()
          : null,
        durationMinutes,
        allowSpeakingRequests: speakingInput.checked,
        commentsEnabled: commentsInput.checked,
        featured: featuredInput.checked,
        status: scheduledAt ? 'scheduled' : 'draft',
      };
    }
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      try {
        const payload = eventPayload();
        if (editingSpace) {
          const { status, ...changes } = payload;
          await api(`/api/admin/event-spaces/${encodeURIComponent(editingSpace.id)}`, { method: 'PATCH', body: changes });
          if (editingSpace.status === 'draft' && status === 'scheduled') {
            await api(`/api/admin/event-spaces/${encodeURIComponent(editingSpace.id)}`, {
              method: 'PATCH',
              body: {
                action: 'publish',
                scheduledAt: payload.scheduledAt,
                waitingRoomOpensAt: payload.waitingRoomOpensAt,
                timezone: payload.timezone,
              },
            });
          }
        } else {
          await api('/api/admin/event-spaces', { method: 'POST', body: payload });
        }
        setStatus(editingSpace ? 'Event space updated.' : 'Event space saved.', 'success');
        await renderEvents();
      } catch (error) {
        setStatus(error.message, 'error');
      }
    });
    liveButton.addEventListener('click', async () => {
      try {
        const payload = eventPayload();
        payload.status = 'draft';
        payload.scheduledAt = null;
        await api('/api/admin/event-spaces/go-live', { method: 'POST', body: payload });
        setStatus('Live event space created.', 'success');
        await renderEvents();
      } catch (error) {
        setStatus(error.message, 'error');
      }
    });
    function editEvent(space) {
      editingSpace = space;
      formTitle.textContent = `Edit ${space.status} event`;
      titleInput.value = space.title;
      topicInput.value = space.topic;
      descriptionInput.value = space.description || '';
      hostSelect.value = space.host_account_id;
      scheduleInput.value = space.scheduled_at
        ? new Date(new Date(space.scheduled_at).getTime() - new Date(space.scheduled_at).getTimezoneOffset() * 60_000)
          .toISOString().slice(0, 16)
        : '';
      timezoneInput.value = space.timezone || 'UTC';
      const leadMinutes = space.scheduled_at && space.waiting_room_opens_at
        ? Math.max(0, Math.round((Date.parse(space.scheduled_at) - Date.parse(space.waiting_room_opens_at)) / 60_000))
        : 15;
      waitingLeadInput.value = String(leadMinutes);
      durationInput.value = space.duration_minutes ? String(space.duration_minutes) : '';
      visibilityInput.value = space.visibility;
      featuredInput.checked = space.featured;
      speakingInput.checked = space.allow_speaking_requests;
      commentsInput.checked = space.comments_enabled;
      saveButton.textContent = space.status === 'draft' ? 'Save changes / publish if scheduled' : 'Save changes';
      liveButton.hidden = true;
      cancelEditButton.hidden = false;
      form.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    panelNode.append(form, node('h3', '', `Event spaces (${spacesResult.spaces.length})`));
    if (!spacesResult.spaces.length) {
      panelNode.append(emptyMessage('No event spaces have been created.'));
      return;
    }
    const list = node('div', 'stack');
    for (const space of spacesResult.spaces) {
      const item = card(space.title, space.status);
      item.append(node('p', '', space.description || space.topic), node('div', 'meta', `${space.host_name} · ${space.visibility} · ${formatDate(space.scheduled_at)}`));
      const actions = node('div', 'actions');
      const actionByStatus = {
        draft: [['publish', 'Publish'], ['cancel', 'Cancel']],
        scheduled: [['open_waiting_room', 'Open waiting room'], ['cancel', 'Cancel']],
        waiting_room_open: [['start_live', 'Start live'], ['cancel', 'Cancel']],
        live: [['end_live', 'End live']],
        ended: [['archive', 'Archive']],
        cancelled: [['archive', 'Archive']],
      };
      if (['draft', 'scheduled'].includes(space.status)) {
        actions.append(actionButton('Edit', () => editEvent(space)));
      }
      if (['waiting_room_open', 'live'].includes(space.status)) {
        actions.append(actionButton(
          activeEventParticipantsId === space.id ? 'Hide participants' : 'Manage participants',
          async () => {
            activeEventParticipantsId = activeEventParticipantsId === space.id ? null : space.id;
            await renderEvents();
          },
        ));
      }
      for (const [action, label] of actionByStatus[space.status] || []) {
        const button = actionButton(label, async () => {
          try {
            if (action === 'cancel' && !window.confirm(`Cancel "${space.title}"?`)) return;
            await api(`/api/admin/event-spaces/${encodeURIComponent(space.id)}`, { method: 'PATCH', body: { action } });
            await renderEvents();
          } catch (error) {
            setStatus(error.message, 'error');
          }
        }, action === 'cancel' ? 'btn danger' : 'btn');
        if (action === 'publish' && !space.scheduled_at) button.disabled = true;
        actions.append(button);
      }
      if (actions.childNodes.length) item.append(actions);
      if (activeEventParticipantsId === space.id && ['waiting_room_open', 'live'].includes(space.status)) {
        try {
          const result = await api(`/api/admin/event-spaces/${encodeURIComponent(space.id)}/participants`);
          const roster = node('div', 'stack');
          if (!result.roster.length) roster.append(emptyMessage('No participants are waiting in this room.'));
          for (const participant of result.roster) {
            const participantCard = card(participant.displayName || participant.accountId, participant.status);
            participantCard.append(node('div', 'meta', participant.online ? 'Online' : 'Offline'));
            const participantActions = node('div', 'actions');
            const moderate = async (action) => {
              try {
                await api(`/api/admin/event-spaces/${encodeURIComponent(space.id)}/participants/${encodeURIComponent(participant.accountId)}`, {
                  method: 'POST',
                  body: { action },
                });
                await renderEvents();
              } catch (error) {
                setStatus(error.message, 'error');
              }
            };
            if (participant.status === 'waiting' && space.status === 'live') {
              participantActions.append(actionButton('Admit', () => moderate('admit'), 'btn primary'));
            }
            if (['listener', 'speaker_requested'].includes(participant.status) && space.status === 'live') {
              participantActions.append(actionButton('Approve speaker', () => moderate('approve_speaker')));
            }
            if (participant.status === 'speaker_requested') {
              participantActions.append(actionButton('Decline request', () => moderate('decline_speaker')));
            }
            if (participant.status === 'speaker') {
              participantActions.append(actionButton('Remove speaking access', () => moderate('remove_speaker')));
            }
            if (participant.status !== 'removed') {
              participantActions.append(actionButton('Remove from room', () => moderate('remove'), 'btn danger'));
            }
            if (participantActions.childNodes.length) participantCard.append(participantActions);
            roster.append(participantCard);
          }
          item.append(node('h3', '', 'Room participants'), roster);
        } catch (error) {
          item.append(node('p', 'status error', error.message || 'Could not load participants.'));
        }
      }
      list.append(item);
    }
    panelNode.append(list);
  }

  async function renderAnnouncements() {
    renderPanel('Announcements', 'Draft and publish in-app messages and optional push notifications.', () => loadTab('announcements'));
    const result = await api('/api/admin/system-announcements');
    let editingAnnouncement = null;
    let idempotencyKey = crypto.randomUUID();
    const form = node('form', 'editor');
    const formTitle = node('h3', '', 'Create announcement');
    const typeInput = select('type', [
      ['product', 'Product update'],
      ['maintenance', 'Maintenance'],
      ['educational', 'Educational'],
      ['urgent', 'Urgent'],
    ], 'product');
    const titleInput = input('text', 'title');
    titleInput.required = true;
    titleInput.maxLength = 100;
    const messageInput = node('textarea');
    messageInput.required = true;
    messageInput.maxLength = 2000;
    const destinationInput = select('destination', [
      ['home', 'Home'],
      ['community', 'Community'],
      ['analysis', 'Analysis'],
      ['events', 'Events'],
      ['profile', 'Profile'],
      ['notification_center', 'Notification center'],
    ], 'home');
    const audienceInput = select('audience', [['all', 'All active devices'], ['recently_active', 'Recently active']], 'all');
    const daysInput = input('number', 'audienceDays', '30');
    daysInput.min = '1';
    daysInput.max = '365';
    const postIdInput = input('text', 'postId');
    postIdInput.maxLength = 36;
    postIdInput.placeholder = 'Optional Community post UUID';
    const audienceEstimate = node('span', 'muted', 'Preview the audience before publishing.');
    const channelInputs = [
      ['in_app_banner', 'In-app banner'],
      ['notification_center', 'Notification center'],
      ['push', 'Push notification'],
    ].map(([name, label]) => {
      const checkbox = input('checkbox', name);
      checkbox.checked = name !== 'push';
      const wrapper = node('label', 'check');
      wrapper.append(checkbox, node('span', '', label));
      return [name, checkbox, wrapper];
    });
    const fields = node('div', 'grid');
    fields.append(field('Type', typeInput), field('Destination', destinationInput), field('Audience', audienceInput), field('Recent activity window (days)', daysInput), field('Title', titleInput), field('Message', messageInput));
    const previewRow = node('div', 'actions');
    previewRow.append(
      actionButton('Preview audience', async () => {
        audienceEstimate.textContent = 'Estimating eligible devices…';
        try {
          const query = new URLSearchParams({
            audience: audienceInput.value,
            days: daysInput.value || '30',
          });
          const estimate = await api(`/api/admin/system-announcements/audience-count?${query}`);
          audienceEstimate.textContent = `Estimated recipients: ${estimate.count}`;
        } catch (error) {
          audienceEstimate.textContent = error.message || 'Audience estimate unavailable.';
        }
      }),
      audienceEstimate,
    );
    const channels = node('div', 'checks');
    channels.append(node('span', 'muted', 'Delivery channels:'));
    for (const [, , wrapper] of channelInputs) channels.append(wrapper);
    const submit = node('button', 'btn primary', 'Save draft');
    submit.type = 'submit';
    const publish = actionButton('Save and publish now', async () => {
      if (!window.confirm('Publish this announcement now? Selected recipients will be created and accepted push messages cannot be recalled.')) return;
      await saveAnnouncement(true);
    }, 'btn primary');
    const cancelEdit = actionButton('Cancel edit', () => {
      editingAnnouncement = null;
      form.reset();
      formTitle.textContent = 'Create announcement';
      submit.textContent = 'Save draft';
      publish.hidden = false;
      cancelEdit.hidden = true;
      for (const [name, checkbox] of channelInputs) checkbox.checked = name !== 'push';
      audienceInput.value = 'all';
      destinationInput.value = 'home';
      daysInput.value = '30';
      postIdInput.value = '';
      audienceEstimate.textContent = 'Preview the audience before publishing.';
      idempotencyKey = crypto.randomUUID();
    });
    cancelEdit.hidden = true;

    function announcementPayload() {
      return {
        type: typeInput.value,
        title: titleInput.value.trim(),
        message: messageInput.value.trim(),
        destination: destinationInput.value,
        destinationParams: destinationInput.value === 'community' && postIdInput.value.trim()
          ? { postId: postIdInput.value.trim() }
          : {},
        audience: audienceInput.value,
        audienceDays: Number(daysInput.value),
        channels: Object.fromEntries(channelInputs.map(([name, checkbox]) => [name, checkbox.checked])),
      };
    }

    async function saveAnnouncement(publishNow) {
      const payload = announcementPayload();
      try {
        let announcementId = editingAnnouncement?.id;
        if (editingAnnouncement) {
          await api(`/api/admin/system-announcements/${encodeURIComponent(editingAnnouncement.id)}`, {
            method: 'PATCH',
            body: { action: 'update', announcement: payload },
          });
        } else {
          const saved = await api('/api/admin/system-announcements', {
            method: 'POST',
            headers: { 'idempotency-key': idempotencyKey },
            body: payload,
          });
          announcementId = saved.announcement.id;
        }
        if (publishNow && announcementId) {
          await api(`/api/admin/system-announcements/${encodeURIComponent(announcementId)}`, {
            method: 'PATCH',
            body: { action: 'publish' },
          });
        }
        idempotencyKey = crypto.randomUUID();
        setStatus(publishNow ? 'Announcement published.' : 'Announcement draft saved.', 'success');
        await renderAnnouncements();
      } catch (error) {
        setStatus(error.message || 'Could not save this announcement.', 'error');
      }
    }

    function editAnnouncement(announcement) {
      if (announcement.status !== 'draft') return;
      editingAnnouncement = announcement;
      formTitle.textContent = 'Edit announcement draft';
      typeInput.value = announcement.type;
      titleInput.value = announcement.title;
      messageInput.value = announcement.message;
      destinationInput.value = announcement.destination;
      audienceInput.value = announcement.audience;
      daysInput.value = String(announcement.audienceDays || 30);
      postIdInput.value = announcement.destination_params?.postId || '';
      for (const [name, checkbox] of channelInputs) checkbox.checked = Boolean(announcement.channels?.[name]);
      submit.textContent = 'Save draft';
      publish.hidden = true;
      cancelEdit.hidden = false;
      form.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    form.append(formTitle, fields);
    form.append(field('Optional Community post ID (Community destination only)', postIdInput));
    form.append(previewRow, channels, submit, publish, cancelEdit);
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      await saveAnnouncement(false);
    });
    panelNode.append(form, node('h3', '', `Announcements (${result.announcements.length})`));
    if (!result.announcements.length) {
      panelNode.append(emptyMessage('No system announcements yet.'));
      return;
    }
    const list = node('div', 'stack');
    for (const announcement of result.announcements) {
      const item = card(announcement.title, announcement.status);
      item.append(
        node('p', '', announcement.message),
        node('div', 'meta', `${announcement.type} · ${announcement.audience} · ${announcement.destination} · ${formatDate(announcement.published_at || announcement.created_at)}`),
        node('div', 'meta', `${announcement.recipient_count || 0} recipients · ${announcement.read_count || 0} read · Push ${announcement.push_queued || 0} queued / ${announcement.push_accepted || 0} accepted / ${announcement.push_delivered || 0} delivered / ${announcement.push_failed || 0} failed`),
      );
      const actions = node('div', 'actions');
      if (announcement.status === 'draft') {
        actions.append(actionButton('Edit', () => editAnnouncement(announcement)));
        actions.append(actionButton('Publish', async () => {
          if (!window.confirm(`Publish "${announcement.title}" now? Selected recipients will be created and accepted push messages cannot be recalled.`)) return;
          try {
            await api(`/api/admin/system-announcements/${encodeURIComponent(announcement.id)}`, { method: 'PATCH', body: { action: 'publish' } });
            setStatus('Announcement published.', 'success');
            await renderAnnouncements();
          } catch (error) {
            setStatus(error.message, 'error');
          }
        }, 'btn primary'));
      }
      if (['draft', 'published'].includes(announcement.status)) {
        actions.append(actionButton('Cancel', async () => {
          if (!window.confirm(`Cancel delivery for "${announcement.title}"? Push messages already accepted by Expo cannot be recalled.`)) return;
          try {
            await api(`/api/admin/system-announcements/${encodeURIComponent(announcement.id)}`, { method: 'PATCH', body: { action: 'cancel' } });
            setStatus('Announcement cancelled.', 'success');
            await renderAnnouncements();
          } catch (error) {
            setStatus(error.message, 'error');
          }
        }, 'btn danger'));
      }
      if (actions.childNodes.length) item.append(actions);
      list.append(item);
    }
    panelNode.append(list);
  }

  loginForm.addEventListener('submit', sendMagicLink);
  signOutButton.addEventListener('click', signOut);
  document.querySelectorAll('[data-tab]').forEach((button) => {
    button.addEventListener('click', () => loadTab(button.dataset.tab));
  });

  (async () => {
    try {
      await loadConfig();
      const errorDescription = new URL(window.location.href).searchParams.get('error_description');
      if (errorDescription) {
        window.history.replaceState({}, document.title, window.location.pathname);
        showLogin('The sign-in link could not be used. Request a new one.');
        return;
      }
      await exchangeMagicLinkCode();
      await verifySession();
    } catch (error) {
      showLogin(error.message || 'Staff sign-in could not be initialized.');
    }
  })();
})();
