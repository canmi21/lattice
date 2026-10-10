/**
 * Each facet's contract address, worked out by the production build: the facet's name, its
 * revision, and its parameters' and answer's types as TypeScript reads them, written out whole --
 * every field, optional or not, and every literal -- so the address moves when what the facet
 * takes or gives does, and with nothing else. Nobody keeps a schema beside a facet; its type is
 * the schema. See spec/architecture/console.md, "A component asks for its facet".
 */
import { fileURLToPath } from 'node:url';
import { contractAddress } from '@canmi/addresses/build';
import ts from 'typescript';

const FILE = fileURLToPath(new URL('../src/lib/server/facets.ts', import.meta.url));

const OPTIONS: ts.CompilerOptions = {
	target: ts.ScriptTarget.ESNext,
	module: ts.ModuleKind.ESNext,
	moduleResolution: ts.ModuleResolutionKind.Bundler,
	allowImportingTsExtensions: true,
	strict: true,
	noEmit: true,
	skipLibCheck: true,
	types: [],
	lib: ['lib.esnext.d.ts', 'lib.dom.d.ts'],
};

const PRIMITIVE =
	ts.TypeFlags.String |
	ts.TypeFlags.Number |
	ts.TypeFlags.Boolean |
	ts.TypeFlags.BigInt |
	ts.TypeFlags.Undefined |
	ts.TypeFlags.Null |
	ts.TypeFlags.Void |
	ts.TypeFlags.Any |
	ts.TypeFlags.Unknown |
	ts.TypeFlags.Never |
	ts.TypeFlags.BooleanLiteral;

/** `type` written out as data: a primitive by name, a literal by value, the rest by parts. */
export function shapeOf(checker: ts.TypeChecker, type: ts.Type, path: ts.Type[] = []): unknown {
	if (type.isStringLiteral() || type.isNumberLiteral()) return { literal: type.value };
	if (type.flags & PRIMITIVE) return checker.typeToString(type);
	// A type within itself, as a tree's node holds its children, is said once.
	if (path.includes(type)) return 'itself';
	const within = [...path, type];
	if (type.isUnion() || type.isIntersection()) {
		const parts = type.types.map((one) => JSON.stringify(shapeOf(checker, one, within)));
		return { [type.isUnion() ? 'anyOf' : 'allOf']: parts.toSorted() };
	}
	const reference = type as ts.TypeReference;
	if (checker.isArrayType(type) || checker.isTupleType(type)) {
		const items = checker.getTypeArguments(reference).map((one) => shapeOf(checker, one, within));
		return checker.isArrayType(type) ? { array: items[0] } : { tuple: items };
	}
	if (type.getCallSignatures().length > 0) return 'function';
	const fields = checker
		.getPropertiesOfType(type)
		.map((field) => {
			const optional = (field.flags & ts.SymbolFlags.Optional) !== 0;
			return [
				`${field.name}${optional ? '?' : ''}`,
				shapeOf(checker, checker.getTypeOfSymbol(field), within),
			] as const;
		})
		.toSorted(([a], [b]) => a.localeCompare(b));
	const keyed = checker
		.getIndexInfosOfType(type)
		.map((info) => [
			`[${checker.typeToString(info.keyType)}]`,
			shapeOf(checker, info.type, within),
		]);
	return Object.fromEntries([...fields, ...keyed]);
}

/** The number a facet's `revision` is written as, read off its declaration. */
function revisionOf(field: ts.Symbol): number {
	const declaration = field.valueDeclaration;
	const call =
		declaration && ts.isPropertyAssignment(declaration) ? declaration.initializer : undefined;
	const literal = call && ts.isCallExpression(call) ? call.arguments[0] : undefined;
	const revision =
		literal && ts.isObjectLiteralExpression(literal)
			? literal.properties.find(
					(one): one is ts.PropertyAssignment =>
						ts.isPropertyAssignment(one) && one.name.getText() === 'revision',
				)
			: undefined;
	const value = revision?.initializer;
	if (!value || !ts.isNumericLiteral(value)) {
		throw new Error(`the ${field.name} facet has no revision written as a number`);
	}
	return Number(value.text);
}

/** The type of `field` on one entry of a table, read where `source` declares it. */
function fieldOf(checker: ts.TypeChecker, source: ts.SourceFile, entry: ts.Symbol, field: string) {
	const type = checker.getTypeOfSymbolAtLocation(entry, source).getProperty(field);
	return type && checker.getTypeOfSymbolAtLocation(type, source);
}

/**
 * Each facet's parameters and answer, and each stream's message, as data, by name: `FACETS` and
 * `STREAMS` read off `file`.
 */
export function contracts(file = FILE): Record<string, { revision: number; contract: unknown }> {
	const program = ts.createProgram([file], OPTIONS);
	const checker = program.getTypeChecker();
	const source = program.getSourceFile(file);
	const module = source && checker.getSymbolAtLocation(source);
	const table = (name: string) => {
		const found = module && checker.getExportsOfModule(module).find((one) => one.name === name);
		if (!source || !found) throw new Error(`no ${name} in ${file}`);
		return checker.getTypeOfSymbolAtLocation(found, source).getProperties();
	};
	if (!source) throw new Error(`no ${file}`);
	const facets = table('FACETS').map((entry) => {
		const signature = fieldOf(checker, source, entry, 'read')?.getCallSignatures()[0];
		if (!signature) throw new Error(`the ${entry.name} facet has no read`);
		const params = signature.getParameters()[1];
		const answer = signature.getReturnType();
		const contract = {
			params: params ? shapeOf(checker, checker.getTypeOfSymbol(params)) : {},
			answer: shapeOf(checker, checker.getAwaitedType(answer) ?? answer),
		};
		return [entry.name, { revision: revisionOf(entry), contract }] as const;
	});
	const streams = table('STREAMS').map((entry) => {
		const message = fieldOf(checker, source, entry, 'message');
		if (!message) throw new Error(`the ${entry.name} stream has no message`);
		const contract = { message: shapeOf(checker, checker.getNonNullableType(message)) };
		return [entry.name, { revision: revisionOf(entry), contract }] as const;
	});
	return Object.fromEntries([...facets, ...streams]);
}

/** Every facet's and stream's address, as the build states it to the pages and the Worker alike. */
export function facetAddresses(file = FILE): Record<string, string> {
	return Object.fromEntries(
		Object.entries(contracts(file)).map(([name, { revision, contract }]) => [
			name,
			contractAddress(name, revision, contract),
		]),
	);
}
