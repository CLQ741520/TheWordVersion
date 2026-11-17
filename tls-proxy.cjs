// TLS 转发代理: 3443 (TLS, 自签证书) -> 127.0.0.1:3001 (明文 HTTP)
// 用途: 让 Cloudflare 以 HTTPS 方式回源, 绕过阿里云对未备案域名的 Host 检测
// 内部请求的 Host 头改写为纯 IP, 双保险
const https = require('https');
const http = require('http');
const fs = require('fs');

https.createServer({
  key: fs.readFileSync('/root/Word-app/certs/privkey.pem'),
  cert: fs.readFileSync('/root/Word-app/certs/fullchain.pem')
}, (req, res) => {
  const up = http.request({
    host: '127.0.0.1',
    port: 3001,
    path: req.url,
    method: req.method,
    headers: { ...req.headers, host: '8.134.124.64:3001' }
  }, r => {
    res.writeHead(r.statusCode, r.headers);
    r.pipe(res);
  });
  up.on('error', () => { res.writeHead(502); res.end(); });
  req.pipe(up);
}).listen(3443, () => console.log('TLS proxy listening on 3443 -> 3001'));
