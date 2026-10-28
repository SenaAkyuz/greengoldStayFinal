import { Controller, Param, Post, Req, UseGuards } from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Request } from 'express';
import { Public } from '../common/route-metadata';
import { IntegrationWebhookRateGuard } from '../common/integration-webhook-rate.guard';
import { WebhookIngestionService } from './webhook-ingestion.service';
import type { WebhookQuery } from './adapters/provider-adapter.interface';

/**
 * Provider-neutral webhook ingestion yüzeyi — public (auth YOK, @Public), ama
 * gerçek auth işini imza doğrulaması yapar (bkz. WebhookIngestionService).
 *
 * Route hotel/integration'ı ASLA public_widget_key ile çözmez — yalnızca
 * hotel_integrations.webhook_routing_id (ayrı, imzalı bir routing kimliği).
 * :provider registry'de yoksa 404; kayıtlıysa ama `configured=false` ise
 * (SynXis) 503 'provider_not_configured' döner.
 */
@Public()
@UseGuards(ThrottlerGuard, IntegrationWebhookRateGuard)
@Controller('integrations/webhooks')
export class WebhookIngestionController {
  constructor(private readonly ingestion: WebhookIngestionService) {}

  // POST /integrations/webhooks/:provider/:routingId
  @Post(':provider/:routingId')
  async receive(
    @Param('provider') provider: string,
    @Param('routingId') routingId: string,
    @Req() req: RawBodyRequest<Request>,
  ) {
    return this.ingestion.ingest(
      provider,
      routingId,
      req.rawBody,
      req.headers,
      flatQuery(req.query),
    );
  }
}

/** Express query'sini düz string sözlüğe indirger (dizi/nesne değerler atılır). */
function flatQuery(query: Request['query']): WebhookQuery {
  const out: WebhookQuery = {};
  for (const [key, value] of Object.entries(query ?? {})) {
    if (typeof value === 'string') out[key] = value;
  }
  return out;
}
