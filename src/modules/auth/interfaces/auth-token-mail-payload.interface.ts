/** Raw token KHÔNG nằm ở đây — nó nằm ở `secret_ciphertext`, mã hóa riêng. */
export interface AuthTokenMailPayload {
  username: string;
  templateVersion: 1;
}
