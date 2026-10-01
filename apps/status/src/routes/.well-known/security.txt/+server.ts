import { securityResponse } from '@canmi/security';
import type { RequestHandler } from './$types';

// Every host answers its own; see spec/architecture/firewall.md, "Every host answers its own
// security.txt".
export const GET: RequestHandler = ({ request }) => securityResponse(request, 'status');
