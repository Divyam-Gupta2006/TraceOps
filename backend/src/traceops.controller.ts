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
} from '@nestjs/common';
import { TelemetryService } from './telemetry.service';

@Controller()
export class TraceOpsController {
  constructor(private readonly telemetry: TelemetryService) {}

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

  @Get('api/projects')
  @Header('Cache-Control', 'no-store, no-cache, must-revalidate')
  async getProjects() {
    return this.telemetry.listProjects();
  }

  @Post('api/projects')
  async createProject(@Body() body: { name: string; framework?: string }) {
    return this.telemetry.createProject(
      body.name || 'My Production Service',
      body.framework || 'Next.js · Node.js · OpenTelemetry',
    );
  }

  @Get('api/projects/:projectId/dashboard')
  @Header('Cache-Control', 'no-store, no-cache, must-revalidate')
  async getDashboard(
    @Param('projectId') projectId: string,
    @Query('window') window?: string,
  ) {
    return this.telemetry.getProjectDashboard(projectId, window);
  }

  @Post('api/incidents/:id/resolve')
  async resolveIncident(@Param('id') id: string) {
    return this.telemetry.resolveIncident(id);
  }

  @Post('api/projects/:projectId/simulate')
  async simulate(
    @Param('projectId') projectId: string,
    @Body() body: { mode: 'normal' | 'incident' },
  ) {
    return this.telemetry.simulateScenario(projectId, body.mode || 'normal');
  }

  // Standard OpenTelemetry OTLP/HTTP Trace Receiver with flexible route aliases
  @Post(['v1/traces', 'v1/traces/*', 'api/v1/traces', 'api/traces'])
  @HttpCode(202)
  async ingestTraces(@Req() req: any, @Body() body: any) {
    const apiKey = this.extractApiKey(req);
    const project = await this.telemetry.validateApiKey(apiKey);
    return this.telemetry.ingestOtlpTraces(project.id, body);
  }

  // Standard OpenTelemetry OTLP/HTTP Log Receiver with flexible route aliases
  @Post(['v1/logs', 'v1/logs/*', 'api/v1/logs', 'api/logs'])
  @HttpCode(202)
  async ingestLogs(@Req() req: any, @Body() body: any) {
    const apiKey = this.extractApiKey(req);
    const project = await this.telemetry.validateApiKey(apiKey);
    return this.telemetry.ingestOtlpLogs(project.id, body);
  }
}
