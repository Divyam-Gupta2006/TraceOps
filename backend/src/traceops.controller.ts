import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Req,
  HttpCode,
  Header,
  UseGuards,
} from '@nestjs/common';
import { TelemetryService } from './telemetry.service';
import { AuthService } from './auth.service';
import { AuthGuard } from './auth.guard';

@Controller()
export class TraceOpsController {
  constructor(
    private readonly telemetry: TelemetryService,
    private readonly auth: AuthService,
  ) {}

  private extractApiKey(req: any): string | undefined {
    const raw =
      req.headers?.['x-traceops-key'] ||
      req.headers?.['x-api-key'] ||
      req.headers?.['authorization'] ||
      req.query?.apiKey ||
      req.query?.key ||
      req.body?.apiKey;
    return typeof raw === 'string' ? raw : undefined;
  }

  // --- Public Authentication Routes ---

  @Post('api/auth/register')
  async register(
    @Body()
    body: {
      email: string;
      password: string;
      name?: string;
    },
  ) {
    return this.auth.register(body);
  }

  @Post('api/auth/login')
  async login(@Body() body: { email: string; password: string }) {
    return this.auth.login(body);
  }

  @Get('api/auth/me')
  @UseGuards(AuthGuard)
  async getMe(@Req() req: any) {
    return this.auth.getMe(req.user.userId);
  }

  // --- Protected Management & Telemetry Routes (Strict AuthGuard) ---

  @Get('api/projects')
  @UseGuards(AuthGuard)
  @Header('Cache-Control', 'no-store, no-cache, must-revalidate')
  async getProjects(@Req() req: any) {
    return this.telemetry.listProjects(req.user.userId, req.user.role);
  }

  @Post('api/projects')
  @UseGuards(AuthGuard)
  async createProject(
    @Req() req: any,
    @Body() body: { name: string; framework?: string },
  ) {
    return this.telemetry.createProject(
      body.name || 'My Production Service',
      body.framework || 'Next.js · Node.js · OpenTelemetry',
      req.user.userId,
    );
  }

  @Get('api/projects/:projectId/credentials')
  @UseGuards(AuthGuard)
  @Header('Cache-Control', 'no-store, no-cache, must-revalidate')
  async getProjectCredentials(
    @Param('projectId') projectId: string,
    @Req() req: any,
  ) {
    return this.telemetry.getProjectCredentials(
      projectId,
      req.user.userId,
      req.user.role,
    );
  }

  @Get('api/projects/:projectId/dashboard')
  @UseGuards(AuthGuard)
  @Header('Cache-Control', 'no-store, no-cache, must-revalidate')
  async getDashboard(
    @Param('projectId') projectId: string,
    @Query('window') window: string,
    @Req() req: any,
  ) {
    return this.telemetry.getProjectDashboard(
      projectId,
      window,
      req.user.userId,
      req.user.role,
    );
  }

  @Post('api/incidents/:id/resolve')
  @UseGuards(AuthGuard)
  async resolveIncident(@Param('id') id: string, @Req() req: any) {
    return this.telemetry.resolveIncident(id, req.user.userId, req.user.role);
  }

  @Post('api/projects/:projectId/simulate')
  @UseGuards(AuthGuard)
  async simulate(
    @Param('projectId') projectId: string,
    @Body() body: { mode: 'normal' | 'incident' },
    @Req() req: any,
  ) {
    return this.telemetry.simulateScenario(
      projectId,
      body.mode || 'normal',
      req.user.userId,
      req.user.role,
    );
  }

  // --- Standard OpenTelemetry OTLP/HTTP Ingestion (API Key Authenticated) ---

  @Post(['v1/traces', 'v1/traces/*', 'api/v1/traces', 'api/traces'])
  @HttpCode(202)
  async ingestTraces(@Req() req: any, @Body() body: any) {
    const apiKey = this.extractApiKey(req);
    const project = await this.telemetry.validateApiKey(apiKey);
    return this.telemetry.ingestOtlpTraces(project.id, body);
  }

  @Post(['v1/logs', 'v1/logs/*', 'api/v1/logs', 'api/logs'])
  @HttpCode(202)
  async ingestLogs(@Req() req: any, @Body() body: any) {
    const apiKey = this.extractApiKey(req);
    const project = await this.telemetry.validateApiKey(apiKey);
    return this.telemetry.ingestOtlpLogs(project.id, body);
  }
}
