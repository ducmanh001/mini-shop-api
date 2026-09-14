import { validate } from 'class-validator';
import { IsDifferentFromCurrentPassword } from './is-different-from-current-password.decorator';

class NewPasswordTestDto {
  currentPassword: string;

  @IsDifferentFromCurrentPassword()
  newPassword: string;
}

async function validateNewPassword(
  currentPassword: string,
  newPassword: string,
) {
  const dto = new NewPasswordTestDto();
  dto.currentPassword = currentPassword;
  dto.newPassword = newPassword;
  return validate(dto);
}

describe('IsDifferentFromCurrentPassword', () => {
  it('accepts a newPassword that differs from currentPassword', async () => {
    expect(
      await validateNewPassword('OldDemoPass123!', 'NewDemoPass456!'),
    ).toHaveLength(0);
  });

  it('rejects a newPassword equal to currentPassword', async () => {
    const errors = await validateNewPassword('SamePass123!', 'SamePass123!');
    expect(errors.length).toBeGreaterThan(0);
  });
});
