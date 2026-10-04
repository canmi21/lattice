import { dev } from '$app/environment';
import { followSymlink, symlinkOf } from '@canmi/symlink';
import { pickUrls } from '@canmi/urls';
import type { RequestHandler } from './$types';

// This page's marks, followed for the browser. See spec/architecture/delivery.md, "A page follows
// the name for the browser".
export const GET: RequestHandler = ({ params }) =>
	followSymlink(symlinkOf(pickUrls(dev).symlink, 'status', params.mark));
