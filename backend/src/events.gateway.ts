
import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayInit,
  SubscribeMessage,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Injectable, Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { PrismaService } from './prisma.service';
import { AuthService } from './auth.service';

interface SocketUser {
  userId: string;
  role: string;
}

@Injectable()
@WebSocketGateway({
  cors: {
    origin: [
      'http://localhost:3000',
      'http://localhost:3001',
      'https://trace-ops-three.vercel.app',
    ],
    credentials: true,
  },
})
export class EventsGateway implements OnGatewayInit {

  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(EventsGateway.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
  ) {}

  afterInit(server: Server) {
    server.use(async (socket, next) => {
      try {
        const token = socket.handshake.auth?.token;

        if (typeof token !== 'string' || !token.trim()) {
          return next(new Error('Unauthorized'));
        }

        const payload = this.authService.verifyToken(token);

        if (!payload?.userId) {
          return next(new Error('Unauthorized'));
        }

        const user = await this.prisma.user.findUnique({
          where: { id: payload.userId },
          select: { id: true, role: true },
        });

        if (!user) {
          return next(new Error('Unauthorized'));
        }

        socket.data.user = {
          userId: user.id,
          role: user.role,
        } satisfies SocketUser;

        next();
      } catch {
        next(new Error('Unauthorized'));
      }
    });

    this.logger.log('Authenticated WebSocket gateway initialized');
  }

  async handleConnection(client: Socket) {
    this.logger.debug(`Authenticated socket connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.debug(`Socket disconnected: ${client.id}`);
  }

@SubscribeMessage('project:join')
async handleJoinProject(
  @ConnectedSocket() client: Socket,
  @MessageBody() data: { projectId?: string },
) {
    const user = client.data.user as SocketUser | undefined;
    const projectId = data?.projectId;

    if (!user || typeof projectId !== 'string' || !projectId.trim()) {
      client.emit('project:join:error', {
        message: 'Invalid project or unauthorized connection.',
      });
      return;
    }

    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, ownerId: true },
    });

    if (!project) {
      client.emit('project:join:error', {
        message: 'Project not found.',
      });
      return;
    }

    if (user.role !== 'ADMIN' && project.ownerId !== user.userId) {
      client.emit('project:join:error', {
        message: 'You do not have access to this project.',
      });
      return;
    }

    await client.join(`project:${projectId}`);

    client.emit('project:join:success', { projectId });
  }

  emitTelemetryUpdate(projectId: string, payload: any) {
    this.server
      ?.to(`project:${projectId}`)
      .emit(`telemetry:${projectId}`, payload);
  }

  emitIncidentCreated(projectId: string, incident: any) {
    this.server
      ?.to(`project:${projectId}`)
      .emit(`incident:${projectId}`, incident);
  }
}