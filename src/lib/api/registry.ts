import type { Endpoint } from "./core";
import { adminEndpoints } from "./modules/admins";
import { auditEndpoints } from "./modules/audit";
import { firmEndpoints } from "./modules/firms";
import { healthEndpoints } from "./modules/health";
import { licenceEndpoints } from "./modules/licences";
import { noticeEndpoints } from "./modules/notices";
import { overviewEndpoints } from "./modules/overview";
import { sessionEndpoints } from "./modules/session";
import { setupEndpoints } from "./modules/setup";
import { joinEndpoints } from "./modules/join";
import { subscriptionEndpoints } from "./modules/subscriptions";
import { supportEndpoints } from "./modules/support";
import { templateEndpoints } from "./modules/templates";
import { usageEndpoints } from "./modules/usage";
import { incidentEndpoints } from "./modules/incidents";
import { releaseEndpoints } from "./modules/releases";
import { configEndpoints } from "./modules/config";
import { privacyEndpoints } from "./modules/privacy";
import { verificationEndpoints } from "./modules/verification";
import { sampleEndpoints } from "./modules/sample";
import { migrationEndpoints } from "./modules/migration";

/** Every /api/admin endpoint. Static paths are listed before parameterised ones inside each module. */
export const ENDPOINTS: Endpoint[] = [
  ...setupEndpoints,
  ...joinEndpoints,
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
  ...usageEndpoints,
  ...incidentEndpoints,
  ...releaseEndpoints,
  ...configEndpoints,
  ...privacyEndpoints,
  ...verificationEndpoints,
  ...sampleEndpoints,
  ...migrationEndpoints,
];
