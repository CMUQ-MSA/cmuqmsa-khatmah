FROM nginxinc/nginx-unprivileged:1.27-alpine

USER root

COPY nginx.conf /etc/nginx/nginx.conf
COPY index.html app.js styles.css sw.js manifest.json  /usr/share/nginx/html/
COPY logo.png khatmah_logo.png icon-192.png icon-512.png  /usr/share/nginx/html/

RUN printf 'ok\n' > /usr/share/nginx/html/healthz \
    && chown -R nginx:nginx /usr/share/nginx/html

USER nginx


EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/healthz >/dev/null || exit 1
