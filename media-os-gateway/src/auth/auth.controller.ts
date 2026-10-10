import {
  Body,
  Controller,
  Get,
  Global,
  HttpCode,
  Module,
  Param,
  Patch,
  Post,
  Req,
} from '@nestjs/common'
import type { Request } from 'express'
import { Public } from '../common/security.js'
import { AuthService, type Identity } from './auth.service.js'
export interface AuthRequest extends Request {
  user: Identity
}
@Controller('v1/auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}
  @Public() @Post('login') @HttpCode(200) login(@Body() b: unknown) {
    return this.auth.login(b)
  }
  @Get('me') me(@Req() r: AuthRequest) {
    return { user: r.user }
  }
  @Post('logout') @HttpCode(200) logout(@Req() r: AuthRequest) {
    return this.auth.logout(r.user)
  }
  @Post('password') @HttpCode(200) password(@Req() r: AuthRequest, @Body() b: unknown) {
    return this.auth.changePassword(r.user, b)
  }
  @Get('users') users() {
    return this.auth.users()
  }
  @Post('users') create(@Req() r: AuthRequest, @Body() b: unknown) {
    return this.auth.createUser(r.user, b)
  }
  @Patch('users/:id') update(@Req() r: AuthRequest, @Param('id') id: string, @Body() b: unknown) {
    return this.auth.updateUser(r.user, id, b)
  }
}
@Global()
@Module({ controllers: [AuthController], providers: [AuthService], exports: [AuthService] })
export class AuthModule {}
