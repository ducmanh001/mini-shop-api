/**
 * Chuẩn hoá object thành chuỗi ổn định (key sort đệ quy) trước khi hash, để cùng nội dung logic
 * luôn ra cùng SHA-256 bất kể client gửi field theo thứ tự nào — dùng chung cho checkout (PR12)
 * và chat (PR15), xem CODING_STANDARD.md mục 23. Hàm hash thật (`crypto.createHash('sha256')`)
 * nằm ở service của từng module vì "kết quả cũ khi trùng key" khác nhau giữa order và chat message.
 */
export function canonicalizeForHash(payload: unknown): string {
  return JSON.stringify(sortKeysDeep(payload));
}

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeysDeep);
  }
  if (value !== null && typeof value === 'object') {
    return Object.keys(value)
      .sort()
      .reduce<Record<string, unknown>>((sorted, key) => {
        sorted[key] = sortKeysDeep((value as Record<string, unknown>)[key]);
        return sorted;
      }, {});
  }
  return value;
}
