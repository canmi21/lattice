/**
 * The blurred ground for a clip the tab already knows, chosen before anything is painted.
 *
 * A clip shows a blur until it decodes a frame. Which blur is the right one depends on where the
 * tab left it: the build's thumbhash is a picture of the first frame, and a reader returning to a
 * clip they left at fourteen seconds should see a picture of *that*. `video.svelte` reads the
 * record and swaps the two, but it reads it during hydration, so a returning reader got the
 * thumbhash first and their own frame a moment later -- one blur replacing another, which is a
 * visible event in aid of hiding one.
 *
 * **There is no way to make that decision without script.** `sessionStorage` is a JavaScript API
 * and nothing declarative reads it: no media query, no attribute selector, no server that could
 * have been told. What there is instead is *when* the script runs. This one is inline in `<head>`
 * and synchronous, so it has finished before the parser reaches the first `<video>` and long
 * before the first paint -- the same ground the theme script stands on, and as early as any
 * decision about a document can be made.
 *
 * It emits two values per remembered clip. `--clip-ground` is the picture to blur behind it, and
 * `--clip-hold` says that element must not show itself until something says the frame is the right
 * one -- because a clip this tab has watched is about to be seeked, and the frame it paints in the
 * meantime is the cover the blur was put there to avoid.
 *
 * **Holding is declared here rather than defaulted in the stylesheet**, and that is the whole
 * reason this part is in the head script. Holding every clip by default and releasing them from a
 * component means every reader waits for hydration to see a picture: measured, a fresh clip has a
 * decoded frame at 68ms and hydration on a long article finishes at 335ms, so defaulting to held
 * cost five times the wait in order to fix a case that reader does not have. A clip with nothing
 * remembered is never held, and is on screen as soon as it decodes, with no script involved.
 *
 * It emits values, not appearance. Each entry becomes a `--clip-ground` on a selector matching
 * that clip, and whether anything is drawn with it stays `video.svelte`'s business -- which is
 * what keeps the blur from reappearing behind the letterbox bars in full screen, where the
 * component deliberately draws no ground at all.
 *
 * Both halves of every entry are checked against a whitelist before they reach the stylesheet.
 * The record is same-origin and the reader's own, which is not the same as trusted: a value that
 * can put arbitrary text inside a selector or a `url()` is a value that can write arbitrary CSS,
 * and "it got there through our own code" is an argument about today.
 */
export const videoGroundScript = `(function(){try{var r=sessionStorage.getItem("state");if(!r)return;var m=JSON.parse(r)["video.at"];if(!m||typeof m!=="object")return;var o="";for(var k in m){var s=m[k]&&m[k].still;if(typeof s!=="string")continue;if(!/^[A-Za-z0-9._-]+$/.test(k))continue;if(!/^data:image\\/[a-z]+;base64,[A-Za-z0-9+/=]+$/.test(s))continue;o+='video[data-clip="'+k+'"]{--clip-ground:url("'+s+'");--clip-hold:0}'}if(!o)return;var e=document.createElement("style");e.textContent=o;document.head.appendChild(e)}catch(e){}})()`;
