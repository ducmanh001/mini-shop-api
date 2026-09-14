import { validate } from 'class-validator';
import { IsEqualToNewPassword } from './is-equal-to-new-password.decorator';

class ConfirmPasswordTestDto {
  newPassword: string;

  @IsEqualToNewPassword()
  confirmPassword: string;
}

async function validateConfirmPassword(
  newPassword: string,
  confirmPassword: string,
) {
  const dto = new ConfirmPasswordTestDto();
  dto.newPassword = newPassword;
  dto.confirmPassword = confirmPassword;
  return validate(dto);
}

describe('IsEqualToNewPassword', () => {
  it('accepts a confirmPassword that matches newPassword', async () => {
    expect(
      await validateConfirmPassword('NewDemoPass456!', 'NewDemoPass456!'),
    ).toHaveLength(0);
  });

  it('rejects a confirmPassword that does not match newPassword', async () => {
    const errors = await validateConfirmPassword(
      'NewDemoPass456!',
      'SomethingElse!',
    );
    expect(errors.length).toBeGreaterThan(0);
  });
});
