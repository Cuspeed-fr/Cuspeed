// robots.txt : tout est indexable, plan du site déclaré.
// Sur une adresse de test (CUSPEED_ESSAI=1), tout est interdit aux moteurs.
export function GET({ site }) {
  if (process.env.CUSPEED_ESSAI === "1") {
    return new Response("User-agent: *\nDisallow: /\n", { headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
  const plan = new URL("/sitemap-index.xml", site).href;
  return new Response(`User-agent: *\nAllow: /\n\nSitemap: ${plan}\n`, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
