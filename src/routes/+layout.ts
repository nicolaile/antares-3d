/**
 * Every page is a static shell: the interactive parts mount on the client
 * and nothing reads request data, so each one is built to HTML ahead of time.
 */
export const prerender = true;
