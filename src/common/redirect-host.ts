/**
 * How a same-origin redirect decided outside the router (a server action's
 * response) is followed. The router installs itself when it navigates so the
 * redirect renders in place; without one, the browser loads the document.
 */
type RedirectHost = (href: string) => void;

let redirectHost: RedirectHost | undefined;

export function configureRedirectHost(host: RedirectHost): void {
  redirectHost = host;
}

/** Follow an absolute same-origin `href`. */
export function followSameOriginRedirect(href: string): void {
  if (redirectHost) redirectHost(href);
  else location.assign(href);
}
