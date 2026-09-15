/**
 * `%`/`_` là wildcard của SQL `LIKE`/`ILIKE` — escape chúng thành ký tự literal trước khi nhét vào
 * `%<value>%` để keyword người dùng gõ (vd "50%_off") không vô tình đổi nghĩa câu query
 * (api-contract.md: "% và _ trong q được xử lý như ký tự literal"). `\` escape trước tiên vì nó là
 * ký tự escape của chính `ILIKE ... ESCAPE '\'`.
 */
export function escapeIlikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}
