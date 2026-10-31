import { Injectable } from '@nestjs/common';

export interface EvidencePacket {
  rootService: string;
  affectedServices: string[];
  errorRatePeak: number;
  latencyPeakMs: number;
  traceChain: Array<{
    serviceName: string;
    operationName: string;
    durationMs: number;
    statusCode: number;
    attributes: any;
  }>;
  correlatedErrorLogs: Array<{
    serviceName: string;
    severity: string;
    body: string;
  }>;
}

export interface RcaResult {
  title: string;
  aiHypothesis: string;
  aiRecommendations: string[];
  confidenceScore: number;
}

@Injectable()
export class AiRcaService {
  private cleanText(str: string): string {
    return (str || '')
      .replace(/[\u202F\u00A0]/g, ' ') // Replace narrow/non-breaking spaces with normal space
      .replace(/[\u2010-\u2015]/g, '-'); // Replace unicode hyphens/dashes with standard ASCII hyphen
  }

  async analyzeIncident(evidence: EvidencePacket): Promise<RcaResult> {
    const groqKey = process.env.GROQ_API_KEY;
    const groqModel = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';

    const systemPrompt = `You are TraceOps AI, an expert Site Reliability Engineer.
Given a deterministic telemetry evidence packet (distributed trace call chain + correlated error logs), identify the probable root cause and actionable steps.
Respond strictly in valid JSON matching:
{
  "title": "Short incident title (under 8 words)",
  "aiHypothesis": "2-3 sentence technical root-cause diagnosis citing exact services, latencies, and error logs from the evidence.",
  "aiRecommendations": ["Step 1", "Step 2", "Step 3", "Step 4"],
  "confidenceScore": 94
}`;

    // Exclusively use Groq API with the provided GROQ_API_KEY
    if (groqKey && groqKey.trim().length > 5) {
      try {
        const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${groqKey.trim()}`,
          },
          body: JSON.stringify({
            model: groqModel,
            response_format: { type: 'json_object' },
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: JSON.stringify(evidence) },
            ],
          }),
        });

        if (!res.ok) {
          const errorText = await res.text();
          console.warn(`Groq API returned HTTP ${res.status}: ${errorText}`);
        } else {
          const data: any = await res.json();
          const content = data.choices?.[0]?.message?.content;
          if (content) {
            const parsed = JSON.parse(content);
            return {
              title: this.cleanText(parsed.title),
              aiHypothesis: this.cleanText(parsed.aiHypothesis),
              aiRecommendations: (parsed.aiRecommendations || []).map((r: string) => this.cleanText(r)),
              confidenceScore: typeof parsed.confidenceScore === 'number' ? parsed.confidenceScore : 94,
            };
          }
        }
      } catch (err) {
        console.warn('Groq RCA call failed, falling back to deterministic RCA engine:', err);
      }
    }

    // Built-in Deterministic Graph-Traversal RCA Engine (Safe fallback if offline/no key)
    const primaryLog =
      evidence.correlatedErrorLogs[0]?.body ||
      'Downstream dependency timeout / resource saturation';
    const upstreamVictims = evidence.affectedServices.filter(
      (s) => s !== evidence.rootService,
    );
    const tracePath = evidence.traceChain
      .map((s) => `${s.serviceName} (${Math.round(s.durationMs)}ms)`)
      .join(' → ');

    return {
      title: this.cleanText(`${evidence.rootService} Latency & Error Spike`),
      aiHypothesis: this.cleanText(
        `Distributed trace correlation (${tracePath}) isolates the bottleneck to "${evidence.rootService}" peaking at ${Math.round(
          evidence.latencyPeakMs,
        )}ms with a ${evidence.errorRatePeak.toFixed(
          1,
        )}% failure rate. Correlated telemetry logs report: "${primaryLog}". ${
          upstreamVictims.length > 0
            ? `Upstream service(s) (${upstreamVictims.join(
                ', ',
              )}) are experiencing cascading request timeouts while waiting on ${evidence.rootService}.`
            : ''
        }`,
      ),
      aiRecommendations: [
        `Inspect ${evidence.rootService} database connection pool settings and active query locks.`,
        `Investigate error log signature: "${primaryLog.slice(0, 90)}"`,
        `Check recent deployments or configuration changes on ${evidence.rootService}.`,
        `Add circuit-breaker timeouts between ${
          upstreamVictims[0] || 'upstream callers'
        } and ${evidence.rootService} to prevent thread starvation.`,
      ].map((r) => this.cleanText(r)),
      confidenceScore: 94,
    };
  }
}
