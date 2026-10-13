/**
 * A static shell: the WebGL scene, scroll rig and controls mount on the
 * client, so the page is served as prebuilt HTML from the CDN, without a
 * function invocation and its cold start on every visit.
 */
export const prerender = true;
