/**
 * The mark each view is drawn with in the top bar's menu: every layer stacked for All, then a
 * layer's own -- the machines, what runs on them for everyone, and what is deployed on top. See
 * spec/console/design.md, "Icons".
 */
import BoxIcon from '@tabler/icons-svelte-runes/icons/box';
import CloudIcon from '@tabler/icons-svelte-runes/icons/cloud';
import Server2Icon from '@tabler/icons-svelte-runes/icons/server-2';
import Stack2Icon from '@tabler/icons-svelte-runes/icons/stack-2';
import type { IconComponent } from '../design/optics.ts';
import type { View } from './scope.ts';

export const VIEW_GLYPHS: Readonly<Record<View, IconComponent>> = {
	all: Stack2Icon,
	infra: Server2Icon,
	platform: CloudIcon,
	services: BoxIcon,
};
