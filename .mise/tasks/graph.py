"""What a change reaches: the Rust crates and the TypeScript packages of this repository, and the
edges between them. Read by `verify`, to choose gates, and by `deployable`, to choose images. A
library rather than a task, since it is not executable; see the workspace's architecture/repos.md.
"""

import json
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

# The places a package can sit, from the bottom: one may depend on its own and those before it.
# A package's place is the first segment of its path. See spec/architecture/layers.md.
LAYERS = ("lib", "infra", "platform", "services")

# Where a package's manifest sits: under its layer, `lib/` split by registry, and `apps/` for the
# Workers and Vercel apps, which move at the split. See spec/architecture/layers.md.
PACKAGE_DIRECTORIES = (
	"apps/*",
	*(f"{layer}/{kind}/*" for layer in LAYERS[1:] for kind in ("apps", "libs")),
	"lib/pkgs/*",
)


# Where a deployable app's directory sits: `apps/` until it moves under its layer.
APP_ROOTS = ("apps", *(f"{layer}/apps" for layer in LAYERS[1:]))


def app_directories():
	"""Every app directory, by its name; a name is the app's wherever its layer puts it."""
	found = {}
	for root in APP_ROOTS:
		for directory in sorted((ROOT / root).glob("*/")):
			found[directory.name] = directory
	return found


def app_of(path):
	"""The app `path` sits in, by name, or None for a path in no app."""
	for root in APP_ROOTS:
		if path.startswith(root + "/"):
			rest = path[len(root) + 1 :].split("/")
			return rest[0] if len(rest) > 1 else None
	return None


def layer_of(directory):
	"""The layer `directory` sits in, by its first segment, or None for one not moved yet."""
	first = directory.split("/", 1)[0]
	return first if first in LAYERS else None


def changed(since):
	"""Files the working copy changes, or everything after `since`."""
	command = ["jj", "diff", "--name-only"] + (["--from", since, "--to", "@"] if since else ["-r", "@"])
	output = subprocess.run(command, cwd=ROOT, capture_output=True, text=True, check=True).stdout
	return [line for line in output.splitlines() if line]


def owner(path, directories):
	"""The deepest of `directories` holding `path`, or None."""
	best = None
	for directory in directories:
		if path.startswith(directory + "/") and (best is None or len(directory) > len(best)):
			best = directory
	return best


def dependents(affected, edges):
	"""`affected` and everything that depends on it, through `edges` of dependency -> dependent."""
	queue, seen = list(affected), set(affected)
	while queue:
		for dependent in edges.get(queue.pop(), ()):
			if dependent not in seen:
				seen.add(dependent)
				queue.append(dependent)
	return seen


def rust_graph():
	"""Crate directories, dependency -> dependent edges, and file -> crates that include it."""
	metadata = json.loads(
		subprocess.run(
			["cargo", "metadata", "--no-deps", "--format-version", "1"],
			cwd=ROOT,
			capture_output=True,
			text=True,
			check=True,
		).stdout
	)
	directories, edges, included = {}, {}, {}
	names = {package["name"] for package in metadata["packages"]}
	for package in metadata["packages"]:
		directory = Path(package["manifest_path"]).parent
		directories[str(directory.relative_to(ROOT))] = package["name"]
		for dependency in package["dependencies"]:
			if dependency.get("path") and dependency["name"] in names:
				edges.setdefault(dependency["name"], set()).add(package["name"])
		# A test reading another crate's file depends on it without the manifest saying so.
		for source in directory.rglob("*.rs"):
			if "target" in source.parts:
				continue
			for literal in re.findall(r'include_(?:str|bytes)!\(\s*"([^"]+)"', source.read_text()):
				target = (source.parent / literal).resolve()
				if target.is_relative_to(ROOT):
					included.setdefault(str(target.relative_to(ROOT)), set()).add(package["name"])
	return directories, edges, included


def build_inputs(directories):
	"""Path -> crates whose build script reads it: a relative literal in a `build.rs`, resolved
	from the crate's directory. What a build script embeds is in the binary as much as its source."""
	inputs = {}
	for directory, crate in directories.items():
		script = ROOT / directory / "build.rs"
		if not script.exists():
			continue
		for literal in re.findall(r'"(\.\.?/[^"]+)"', script.read_text()):
			target = (ROOT / directory / literal).resolve()
			if target.exists() and target.is_relative_to(ROOT):
				inputs.setdefault(str(target.relative_to(ROOT)), set()).add(crate)
	return inputs


def node_graph():
	"""Package directories and dependency -> dependent edges among this repository's packages."""
	directories, manifests = {}, {}
	for manifest in sorted({m for one in PACKAGE_DIRECTORIES for m in ROOT.glob(f"{one}/package.json")}):
		data = json.loads(manifest.read_text())
		directories[str(manifest.parent.relative_to(ROOT))] = data["name"]
		manifests[data["name"]] = data
	edges = {}
	for name, data in manifests.items():
		for field in ("dependencies", "devDependencies", "peerDependencies"):
			for dependency in data.get(field, {}):
				if dependency in manifests:
					edges.setdefault(dependency, set()).add(name)
	return directories, edges
