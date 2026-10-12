import { getApiHeaders, resolveApiBaseUrl } from './apiAuth';

export interface SupportChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export async function sendSupportChatMessage(messages: SupportChatMessage[]): Promise<string> {
  const response = await fetch(`${resolveApiBaseUrl()}/api/support-chat`, {
    method: 'POST',
    headers: await getApiHeaders(),
    body: JSON.stringify({ messages: messages.slice(-12) }),
  });
  const payload = await response.json() as { reply?: unknown; error?: unknown };
  if (!response.ok) {
    throw new Error(typeof payload.error === 'string' ? payload.error : 'Customer care AI could not respond. Please try again.');
  }
  if (typeof payload.reply !== 'string' || !payload.reply.trim()) {
    throw new Error('Customer care AI returned an invalid reply. Please try again.');
  }
  return payload.reply.trim();
}
