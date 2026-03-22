import { Body, Controller, Post } from '@nestjs/common';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  login(
    @Body()
    body: {
      login: string;
      password: string;
    },
  ) {
    return this.authService.login(body.login, body.password);
  }

  @Post('change-password')
  changePassword(
    @Body()
    body: {
      userId: string;
      currentPassword: string;
      newPassword: string;
    },
  ) {
    return this.authService.changePassword(
      body.userId,
      body.currentPassword,
      body.newPassword,
    );
  }
}
