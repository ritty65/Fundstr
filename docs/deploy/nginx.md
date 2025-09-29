# Nginx location snippets for `/creator-hub`

Use the following configuration when the site is proxied through Nginx (e.g. in front of LiteSpeed/Apache or as a standalone origin). It keeps hashed assets cacheable, avoids rewriting JavaScript to HTML, and falls back to the SPA entry point for deep links.

```nginx
location ^~ /creator-hub/assets/ {
  try_files $uri =404;
  add_header Cache-Control "public, max-age=31536000, immutable";
  types {
    application/javascript js mjs;
    text/css css;
    application/wasm wasm;
    image/svg+xml svg;
  }
}

location /creator-hub/ {
  try_files $uri $uri/ /creator-hub/index.html;
}
```

> Tip: if an upstream Apache instance already serves the assets with the correct MIME types, keep this block anyway. It prevents Nginx from rewriting `/creator-hub/assets/*.js` to HTML, which is what causes the blank-screen MIME errors.
