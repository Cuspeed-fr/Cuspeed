// robots.txt : tout est indexable, plan du site déclaré.
export function GET({ site }) {
  const plan = new URL("/sitemap-index.xml", site).href;
  return new Response(`User-agent: *\nAllow: /\n\nSitemap: ${plan}\n`, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
