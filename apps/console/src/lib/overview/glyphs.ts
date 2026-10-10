/**
 * The mark each dimension of the timeline is drawn with in its menu: the dashboard the Overview
 * page wears, and for the rest the marks the tip already draws them with -- a run's rocket, the
 * unheard's access point. See spec/console/design.md, "Icons".
 */
import AccessPointIcon from '@tabler/icons-svelte-runes/icons/access-point';
import HeartRateMonitorIcon from '@tabler/icons-svelte-runes/icons/heart-rate-monitor';
import LayoutDashboardIcon from '@tabler/icons-svelte-runes/icons/layout-dashboard';
import RocketIcon from '@tabler/icons-svelte-runes/icons/rocket';
import type { IconComponent } from '../design/optics.ts';
import type { Dimension } from './history.ts';

export const DIMENSION_GLYPHS: Readonly<Record<Dimension, IconComponent>> = {
	overview: LayoutDashboardIcon,
	services: HeartRateMonitorIcon,
	deploys: RocketIcon,
	connectivity: AccessPointIcon,
};
