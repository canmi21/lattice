/**
 * The blurred ground for a clip the tab already knows, chosen before anything is painted.
 *
 * Emits `--clip-ground` (the still to blur behind a remembered clip) and `--clip-hold` (do not
 * show this element until a real frame is ready) on a `[data-clip]` selector per entry, run
 * synchronously in `<head>` before the first `<video>` is parsed. For why it has to be a script,
 * why the property sits on the frame and not the `<video>`, why holding is decided here rather
 * than defaulted in the stylesheet, and the measurements behind all three -- see
 * spec/architecture/video/player.md, "The poster is a fallback, and the wait is a blur".
 */
export const videoGroundScript = `(function(){try{var r=sessionStorage.getItem("state");if(!r)return;var m=JSON.parse(r)["video.at"];if(!m||typeof m!=="object")return;var o="";for(var k in m){var s=m[k]&&m[k].still;if(typeof s!=="string")continue;if(!/^[A-Za-z0-9._-]+$/.test(k))continue;if(!/^data:image\\/[a-z]+;base64,[A-Za-z0-9+/=]+$/.test(s))continue;o+='[data-clip="'+k+'"]{--clip-ground:url("'+s+'");--clip-hold:0}'}if(!o)return;var e=document.createElement("style");e.textContent=o;document.head.appendChild(e)}catch(e){}})()`;
