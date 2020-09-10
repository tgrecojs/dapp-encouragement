# Deployment steps

1. Set up a Linux server as described in the [Validator Guide](https://github.com/Agoric/agoric-sdk/wiki/Validator-Guide).  This won't be an actual validator, but it has many of the same system dependencies.
2. Install the ag-solo: `agoric install`
3. Start the ag-solo via systemd, `/etc/systemd/system/agoric-dapp-api.service`:
```
[Unit]
Description=Agoric Dapp API server
Requires=network-online.target
After=network-online.target

[Service]
WorkingDirectory=/home/dappapi/dapp-encouragement
Restart=on-failure
User=dappapi
Group=dappapi
PermissionsStartOnly=true
ExecStart=/home/dappapi/dapp-encouragement/start.sh
ExecReload=/bin/kill -HUP $MAINPID
KillSignal=SIGTERM

[Install]
WantedBy=multi-user.target
```
4. Install the on-chain contract: `agoric deploy api/contract.js`
5. Start the API server on a local port: `API_HOST=127.0.0.1 API_PORT=5000 agoric deploy --enable-unsafe-plugins api/deploy.js`
6. Test http://127.0.0.1:5000
7. Set up a reverse proxy, such as Nginx (`apt install nginx`) from TLS `https://encouragement.testnet.agoric.com` to http://127.0.0.1:5000 with the following `/home/dappapi/encouragement.nginx` config file (edited to taste):
```
# this section is needed to proxy web-socket connections
map $http_upgrade $connection_upgrade {
        default upgrade;
        ''      close;
}
# HTTP
server {
  listen 80;
  return 301 https://$host$request_uri;
}
server {
#        listen 80 default_server;
#        listen [::]:80 default_server ipv6only=on;
        listen 443;
        server_name _; # encouragement.testnet.agoric.com;

        ssl on;
        ssl_certificate /etc/ssl/encouragement.testnet.agoric.com.pem;
        ssl_certificate_key /etc/ssl/encouragement.testnet.agoric.com.key;
        ssl_session_cache  builtin:1000  shared:SSL:10m;
    ssl_protocols  TLSv1 TLSv1.1 TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!eNULL:!EXPORT:!CAMELLIA:!DES:!MD5:!PSK:!RC4;
    ssl_prefer_server_ciphers on;

        
        location / {
            proxy_pass http://127.0.0.1:5000;
            proxy_http_version 1.1;
            proxy_ssl_server_name on;
            proxy_set_header Upgrade $http_upgrade; #for websockets
            proxy_set_header Connection $connection_upgrade;
            proxy_set_header X-Forwarded-For $remote_addr;
            proxy_set_header Host $host;
        }
}
```
