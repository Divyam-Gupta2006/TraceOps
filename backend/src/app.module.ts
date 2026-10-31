import { Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { EventsGateway } from './events.gateway';
import { AiRcaService } from './ai-rca.service';
import { TelemetryService } from './telemetry.service';
import { AuthService } from './auth.service';
import { AuthGuard } from './auth.guard';
import { TraceOpsController } from './traceops.controller';

@Module({
  controllers: [TraceOpsController],
  providers: [
    PrismaService,
    EventsGateway,
    AiRcaService,
    TelemetryService,
    AuthService,
    AuthGuard,
  ],
})
export class AppModule {}
