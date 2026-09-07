#!/bin/bash
# RETIRED 2026-09-07.
#
# This script used to run a SECOND, user-space nginx from /home/jaime/nginx.
# Its config had "listen 80 default_server", so starting it stole port 80 from
# the system nginx and took EVERY site on this box offline (alqueriavillacarmen,
# tourtovalencia, hermesv3, cortex-dev, ...). It also never listened on 443.
#
# marketing-generation is now served by the SYSTEM nginx, like every other site:
#   config : /etc/nginx/sites-available/marketing-generation.menustudioai.com
#   enabled: /etc/nginx/sites-enabled/marketing-generation.menustudioai.com
#   public : https://marketing-generation.menustudioai.com  (LE cert, auto-renew)
#   direct : http://<host>:7100
#   app    : uvicorn app.main:app on 127.0.0.1:9105
#
# Use these instead:
#   sudo nginx -t                    # validate config
#   sudo systemctl reload nginx      # apply config changes
#   sudo systemctl status nginx      # health
echo "run-nginx.sh is RETIRED - marketing-generation is served by the system nginx." >&2
echo "Use: sudo nginx -t && sudo systemctl reload nginx" >&2
echo "Config: /etc/nginx/sites-available/marketing-generation.menustudioai.com" >&2
exit 1
