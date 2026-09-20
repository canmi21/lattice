/**
 * A measurement this tab already took, painted before the server's default is ever seen.
 *
 * A document load paints what the server sent, and a server cannot measure text -- so the first
 * frame of a reload was the default shape and the real one arrived after hydration. The tab knows
 * better and has since the first article of the sitting; this is what lets it say so in time.
 *
 * It emits custom properties rather than widths on elements, because it runs in `<head>` before
 * any of those elements is parsed. The markup reads each one with the default as its fallback, so
 * a tab with nothing stored is exactly the page that was served. See
 * spec/styling/first-paint.md, "A measurement is a fact about this sitting, and it is kept like
 * one", and `lib/client/ground.ts` for the same shape.
 */

/**
 * Two measurements, both stored under `measured` in the tab record.
 *
 * The rail is keyed by the article's own name, which is the last path segment, because a shape
 * measured from one article's headings says nothing about another's. The homepage's thumbnails
 * are one list and need no key beyond the page.
 *
 * `of` is not checked here. It is a string of every heading, which this has no way to know before
 * the page it belongs to exists -- so a republished article can be painted from a stale shape for
 * the frames until hydration, which then answers `undefined` and settles it. That is the same
 * settle a first visit gets, arrived at one beat later.
 */
export const measuredGroundScript = `(function(){try{var r=sessionStorage.getItem("state");if(!r)return;var m=JSON.parse(r).measured;if(!m||typeof m!=="object")return;var p=location.pathname.replace(/\\/+$/,"");var o="";var rail=m["article.rail."+p.split("/").pop()];if(rail&&rail.value&&rail.value.widths instanceof Array){var w=rail.value.widths;for(var i=0;i<w.length;i++){if(typeof w[i]!=="number"||!isFinite(w[i]))continue;o+="--toc-bar-"+i+":"+(w[i]/16)+"rem;"}}var home=p===""?m["home.thumbnails"]:null;if(home&&home.value instanceof Array){for(var a=0;a<home.value.length;a++){var bars=home.value[a];if(!(bars instanceof Array))continue;for(var b=0;b<bars.length;b++){var s=bars[b];if(!s||typeof s.width!=="number"||typeof s.gap!=="number")continue;o+="--card-"+a+"-"+b+"-w:"+(s.width/16)+"rem;--card-"+a+"-"+b+"-g:"+(s.gap/16)+"rem;"}}}if(!o)return;var e=document.createElement("style");e.textContent=":root{"+o+"}";document.head.appendChild(e)}catch(e){}})()`;
