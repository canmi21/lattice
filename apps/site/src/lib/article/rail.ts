export function railEndOffset(
	viewportHeight: number,
	railHeight: number,
	articleBottom: number,
): number {
	const restingBottom = (viewportHeight + railHeight) / 2;
	return Math.min(0, articleBottom - restingBottom);
}

export function railTop(viewportHeight: number, railHeight: number, articleBottom: number): number {
	return (
		(viewportHeight - railHeight) / 2 + railEndOffset(viewportHeight, railHeight, articleBottom)
	);
}

/**
 * Where the return control rests, measured from the top of the viewport.
 *
 * See spec/styling.md, "The return control rests level with the title", for why it sits there,
 * what `clearance` means, and why the two expressions below meet exactly where they do.
 */
export function homeRestingCenter(
	restingCenter: number,
	viewportHeight: number,
	tocHeight: number,
	clearance: number,
): number {
	const restingTocTop = Math.max(0, (viewportHeight - tocHeight) / 2);
	return Math.min(restingCenter, Math.max(restingTocTop / 2, restingTocTop - clearance));
}

export function homeCenter(
	restingCenter: number,
	viewportHeight: number,
	tocHeight: number,
	articleBottom: number,
	clearance: number,
): number {
	return (
		homeRestingCenter(restingCenter, viewportHeight, tocHeight, clearance) +
		railEndOffset(viewportHeight, tocHeight, articleBottom)
	);
}

/**
 * The rail's geometry, run once before the page is painted.
 *
 * A deliberate second copy of `railEndOffset` and `homeRestingCenter` above, minified into a
 * string because it is inlined into the document head -- the alternative is a first frame with
 * both controls at their untouched CSS positions and a jump when hydration corrects them. It is
 * the one place in this file where a rule is written twice, so a change to either function is a
 * change here as well.
 */
export const articleRailScript = `(function(){requestAnimationFrame(function(){var n=document.querySelector(".toc-nav"),h=document.querySelector(".home-slot"),a=document.querySelector("article"),t=a&&a.querySelector("h1");if(!n||!h||!a||!t||getComputedStyle(n).display==="none")return;var r=parseFloat(getComputedStyle(document.documentElement).fontSize)||16,z=n.getBoundingClientRect().height,b=a.getBoundingClientRect().bottom,o=Math.min(0,b-(innerHeight+z)/2);n.style.setProperty("--toc-end-offset",o/r+"rem");var q=t.getBoundingClientRect(),l=parseFloat(getComputedStyle(t).lineHeight)||q.height,c=q.top+scrollY+l/2,u=Math.max(0,(innerHeight-z)/2),k=h.getBoundingClientRect().height/2+r,e=Math.min(c,Math.max(u/2,u-k))+o,p=parseFloat(getComputedStyle(h).top);h.style.setProperty("--home-offset",(e-p)/r+"rem")})})()`;
