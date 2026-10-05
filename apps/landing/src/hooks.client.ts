import type { ClientInit } from '@sveltejs/kit/hooks';
import { prepareBrowserRuntime } from '@canmi/web/compat';

export const init: ClientInit = prepareBrowserRuntime;
