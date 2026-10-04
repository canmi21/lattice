import { securityFor } from '@canmi/robots';
import type { RequestHandler } from './$types';

// Every host answers its own; see spec/architecture/robots.md.
export const GET: RequestHandler = ({ request }) => securityFor(request, 'status');
