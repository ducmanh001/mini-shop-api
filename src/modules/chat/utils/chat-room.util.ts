/**
 * Room Socket.IO của một conversation — chỉ để group emit, room ID không phải authorization (quyền
 * join luôn qua `ChatAccessService.assertCanJoinConversation()` trước khi `client.join()`, xem
 * api-contract.md mục "Support chat").
 */
export function conversationRoom(conversationId: string): string {
  return `conversation:${conversationId}`;
}
