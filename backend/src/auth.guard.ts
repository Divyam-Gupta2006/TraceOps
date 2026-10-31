import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthService } from './auth.service';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private authService: AuthService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const authHeader = req.headers['authorization'];
    if (!authHeader) {
      throw new UnauthorizedException('Missing Authorization header');
    }

    const payload = this.authService.verifyToken(authHeader);
    if (!payload) {
      throw new UnauthorizedException('Invalid or expired authentication token');
    }

    req.user = payload;
    return true;
  }
}

@Injectable()
export class OptionalAuthGuard implements CanActivate {
  constructor(private authService: AuthService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const authHeader = req.headers['authorization'];
    if (authHeader) {
      const payload = this.authService.verifyToken(authHeader);
      if (payload) {
        req.user = payload;
      }
    }
    return true;
  }
}