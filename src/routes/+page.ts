/**
 * The page is one static shell: every interactive part (the WebGL scene,
 * scroll rig, controls) mounts on the client, and nothing reads request
 * data. Prerendering turns the per-request server render into a static
 * HTML file served straight from the CDN — the same markup, without a
 * function invocation and its cold start on every visit.
 */
export const prerender = true;
