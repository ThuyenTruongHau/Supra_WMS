#!/bin/sh
set -eu

tls_dir=/etc/nginx/tls
mkdir -p "$tls_dir"
if [ ! -s "$tls_dir/server.crt" ] || [ ! -s "$tls_dir/server.key" ]; then
    site_host="${SITE_HOST:-192.168.50.200}"
    case "$site_host" in
        *[!a-zA-Z0-9.-]*|'') echo "Invalid SITE_HOST" >&2; exit 1 ;;
    esac
    if printf '%s' "$site_host" | grep -Eq '^([0-9]{1,3}\.){3}[0-9]{1,3}$'; then
        site_san="IP:$site_host"
    else
        site_san="DNS:$site_host"
    fi
    umask 077
    openssl req -x509 -nodes -newkey rsa:2048 -sha256 -days 825 \
        -keyout "$tls_dir/server.key" -out "$tls_dir/server.crt" \
        -subj "/CN=$site_host" \
        -addext "subjectAltName=DNS:localhost,IP:127.0.0.1,$site_san" \
        -addext 'basicConstraints=critical,CA:TRUE' \
        -addext 'keyUsage=critical,digitalSignature,keyEncipherment,keyCertSign' \
        -addext 'extendedKeyUsage=serverAuth'
    chmod 644 "$tls_dir/server.crt"
fi
