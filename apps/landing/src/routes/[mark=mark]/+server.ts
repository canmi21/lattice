import { dev } from '$app/env';
import { followSymlink, symlinkOf } from '@monoflake/sdk/symlink';
import { pickUrls } from '@monoflake/sdk';
import { MARK_SCOPE } from '../../params';
import type { RequestHandler } from './$types';

// The marks, followed for the browser. See platform's spec/architecture/delivery.md, "A page
// follows the name for the browser".
export const GET: RequestHandler = ({ params }) =>
	followSymlink(symlinkOf(pickUrls(dev).symlink, MARK_SCOPE, params.mark));
