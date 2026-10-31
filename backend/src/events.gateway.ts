import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server } from 'socket.io';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class EventsGateway {
  @WebSocketServer()
  server: Server;

  emitTelemetryUpdate(projectId: string, payload: any) {
    this.server?.emit(`telemetry:${projectId}`, payload);
    this.server?.emit('telemetry:stream', { projectId, ...payload });
  }

  emitIncidentCreated(projectId: string, incident: any) {
    this.server?.emit(`incident:${projectId}`, incident);
    this.server?.emit('incident:stream', { projectId, ...incident });
  }
}
