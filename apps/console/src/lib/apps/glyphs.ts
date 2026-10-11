/**
 * The icon each app is drawn with where it is named beside others -- the timeline's tip, a list of
 * what went down -- by what it does rather than by its brand, a package where none is given. See
 * spec/console/design.md, "Icons".
 */
import Activity from '@tabler/icons-svelte-runes/icons/activity';
import Api from '@tabler/icons-svelte-runes/icons/api';
import ArrowsExchange from '@tabler/icons-svelte-runes/icons/arrows-exchange';
import Broadcast from '@tabler/icons-svelte-runes/icons/broadcast';
import Bucket from '@tabler/icons-svelte-runes/icons/bucket';
import Camera from '@tabler/icons-svelte-runes/icons/camera';
import ChartLine from '@tabler/icons-svelte-runes/icons/chart-line';
import Clock from '@tabler/icons-svelte-runes/icons/clock';
import CloudUpload from '@tabler/icons-svelte-runes/icons/cloud-upload';
import Database from '@tabler/icons-svelte-runes/icons/database';
import DatabaseStar from '@tabler/icons-svelte-runes/icons/database-star';
import Gauge from '@tabler/icons-svelte-runes/icons/gauge';
import Heartbeat from '@tabler/icons-svelte-runes/icons/heartbeat';
import LayoutDashboard from '@tabler/icons-svelte-runes/icons/layout-dashboard';
import Link from '@tabler/icons-svelte-runes/icons/link';
import ListCheck from '@tabler/icons-svelte-runes/icons/list-check';
import MapPin from '@tabler/icons-svelte-runes/icons/map-pin';
import Package from '@tabler/icons-svelte-runes/icons/package';
import PlugConnected from '@tabler/icons-svelte-runes/icons/plug-connected';
import Route from '@tabler/icons-svelte-runes/icons/route';
import Server from '@tabler/icons-svelte-runes/icons/server';
import ShieldCheck from '@tabler/icons-svelte-runes/icons/shield-check';
import Sparkles from '@tabler/icons-svelte-runes/icons/sparkles';
import Stack from '@tabler/icons-svelte-runes/icons/stack-2';
import UsersGroup from '@tabler/icons-svelte-runes/icons/users-group';
import Webhook from '@tabler/icons-svelte-runes/icons/webhook';
import World from '@tabler/icons-svelte-runes/icons/world';
import WorldSearch from '@tabler/icons-svelte-runes/icons/world-search';
import WorldWww from '@tabler/icons-svelte-runes/icons/world-www';
import type { IconComponent } from '@canmi/design/components/icon';

const GLYPHS: Readonly<Record<string, IconComponent>> = {
	aka: Link,
	apk: Package,
	apt: Package,
	caddy: ArrowsExchange,
	cdn: World,
	console: LayoutDashboard,
	cron: Clock,
	database: Database,
	deployer: CloudUpload,
	gateway: Api,
	gemini: Sparkles,
	geo: MapPin,
	grok: Sparkles,
	hook: Webhook,
	host: Server,
	keeper: ShieldCheck,
	ledger: ListCheck,
	meter: ChartLine,
	objects: Bucket,
	postgres: Database,
	primary: DatabaseStar,
	probe: Heartbeat,
	quorum: UsersGroup,
	quota: Gauge,
	relay: Broadcast,
	resolver: WorldSearch,
	router: Route,
	shot: Camera,
	site: WorldWww,
	store: Stack,
	telemetry: Activity,
	tunnel: PlugConnected,
};

/** The icon `app` is drawn with: its own, else a package. */
export const glyphOf = (app: string): IconComponent => GLYPHS[app] ?? Package;
