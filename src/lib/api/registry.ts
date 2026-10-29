import type { Endpoint } from "./core";
import { adminEndpoints } from "./modules/admins";
import { auditEndpoints } from "./modules/audit";
import { firmEndpoints } from "./modules/firms";
import { healthEndpoints } from "./modules/health";
import { licenceEndpoints } from "./modules/licences";
import { noticeEndpoints } from "./modules/notices";
import { overviewEndpoints } from "./modules/overview";
import { sessionEndpoints } from "./modules/session";
import { subscriptionEndpoints } from "./modules/subscriptions";
import { supportEndpoints } from "./modules/support";
import { templateEndpoints } from "./modules/templates";

/** Every /api/admin endpoint. Static paths are listed before parameterised ones inside each module. */
export const ENDPOINTS: Endpoint[] = [
  ...sessionEndpoints,
  ...overviewEndpoints,
  ...firmEndpoints,
  ...subscriptionEndpoints,
  ...licenceEndpoints,
  ...supportEndpoints,
  ...noticeEndpoints,
  ...healthEndpoints,
  ...templateEndpoints,
  ...auditEndpoints,
  ...adminEndpoints,
];
