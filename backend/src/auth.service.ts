import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from './prisma.service';
import * as bcrypt from 'bcryptjs';
import * as jwt from 'jsonwebtoken';

export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  role: string;
}

@Injectable()
export class AuthService {
  private readonly jwtSecret: string;

  constructor(private prisma: PrismaService) {
    const isProduction = process.env.NODE_ENV === 'production';
    const secret = process.env.JWT_SECRET;

    if (!secret) {
      if (isProduction) {
        throw new Error(
          'FATAL: JWT_SECRET environment variable is required in production. Startup halted for security.',
        );
      }
      console.warn(
        '⚠️ [SECURITY WARNING] JWT_SECRET is not configured. Using temporary development secret. DO NOT USE IN PRODUCTION.',
      );
      this.jwtSecret = 'traceops_jwt_secret_dev_2026_secure_key_10x';
    } else {
      if (isProduction && secret.length < 32) {
        throw new Error(
          'FATAL: JWT_SECRET in production must be at least 32 characters long for cryptographic security.',
        );
      }
      this.jwtSecret = secret;
    }
  }

  async register(data: {
    email: string;
    password: string;
    name?: string;
  }) {
    if (!data.email || !data.password) {
      throw new BadRequestException('Email and password are required.');
    }
    const email = data.email.trim().toLowerCase();
    if (data.password.length < 6) {
      throw new BadRequestException('Password must be at least 6 characters.');
    }

    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictException('An account with this email already exists.');
    }

    // Role Security:
    // All registrations through public API endpoints strictly receive the USER role.
    // There is no mechanism to claim or obtain ADMIN privileges via HTTP registration.
    // Administrators must be provisioned out-of-band via the server-side CLI tool.
    const role = 'USER';

    const passwordHash = await bcrypt.hash(data.password, 10);

    const user = await this.prisma.user.create({
      data: {
        email,
        name: data.name?.trim() || null,
        passwordHash,
        role,
      },
    });

    const token = this.generateToken(user);
    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    };
  }

  async login(data: { email: string; password: string }) {
    if (!data.email || !data.password) {
      throw new BadRequestException('Email and password are required.');
    }
    const email = data.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      throw new UnauthorizedException('Invalid email or password.');
    }

    const isMatch = await bcrypt.compare(data.password, user.passwordHash);
    if (!isMatch) {
      throw new UnauthorizedException('Invalid email or password.');
    }

    const token = this.generateToken(user);
    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    };
  }

  verifyToken(token: string): { userId: string; email: string; role: string } | null {
    try {
      const cleanToken = token.replace(/^Bearer\s+/i, '').trim();
      return jwt.verify(cleanToken, this.jwtSecret) as any;
    } catch {
      return null;
    }
  }

  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true, role: true, createdAt: true },
    });
    if (!user) {
      throw new UnauthorizedException('User not found.');
    }
    return user;
  }

  private generateToken(user: { id: string; email: string; role: string }): string {
    return jwt.sign(
      { userId: user.id, email: user.email, role: user.role },
      this.jwtSecret,
      { expiresIn: '7d' },
    );
  }
}
