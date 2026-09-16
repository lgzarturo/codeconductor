import type { RiskLevel } from './risk-classifier';

export type CoordinationLevel = 'small' | 'tracked';
export type DeliveryRoute = 'read-only' | CoordinationLevel | 'openspec';

export interface DeliveryRouteInput {
  readonly authorized: boolean;
  readonly coordination: CoordinationLevel;
  readonly risk: RiskLevel;
  readonly openspecRequested?: boolean;
}

export interface DeliveryRouteDecision {
  readonly route: DeliveryRoute;
  readonly risk: RiskLevel;
}

/**
 * Choose delivery coordination without changing the independently classified
 * risk. OpenSpec is explicit; read-only work never enters a delivery route.
 */
export function selectDeliveryRoute(input: DeliveryRouteInput): DeliveryRouteDecision {
  if (!input.authorized) return { route: 'read-only', risk: input.risk };
  if (input.openspecRequested) return { route: 'openspec', risk: input.risk };
  return { route: input.coordination, risk: input.risk };
}
