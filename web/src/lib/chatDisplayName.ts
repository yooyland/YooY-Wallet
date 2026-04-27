/** RN 앱 `resolveChatDisplayNameFromUserDoc` 와 동일 */
export function resolveChatDisplayNameFromUserDoc(
  userId: string,
  userData: Record<string, unknown> | null | undefined
): string {
  const id = String(userId || '').trim();
  if (!id) return '';
  const d = userData && typeof userData === 'object' ? (userData as Record<string, unknown>) : {};
  if (d.useHashInChat === true) return id;
  const chatName = String(d.chatName ?? '').trim();
  const displayName = String(d.displayName ?? '').trim();
  const nickname = String((d as { nickname?: string }).nickname ?? '').trim();
  return chatName || displayName || nickname || id;
}
