import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';

const root = resolve(process.argv[2] || process.cwd());
const port = Number(process.argv[3] || process.env.PORT || 3001);

const contentTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.webp', 'image/webp'],
  ['.ico', 'image/x-icon'],
]);

function resolvePath(urlPath) {
  const pathname = decodeURIComponent(new URL(urlPath, 'http://127.0.0.1').pathname);
  const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const filePath = normalize(join(root, relative));
  if (filePath !== root && !filePath.startsWith(root + sep)) return null;
  if (existsSync(filePath) && statSync(filePath).isFile()) return filePath;
  if (!extname(filePath)) {
    const htmlPath = filePath + '.html';
    if (existsSync(htmlPath) && statSync(htmlPath).isFile()) return htmlPath;
  }
  return join(root, '404.html');
}

const server = createServer((req, res) => {
  const filePath = resolvePath(req.url || '/');
  if (!filePath || !existsSync(filePath)) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Not found');
    return;
  }

  const is404 = filePath.endsWith(`${sep}404.html`);
  res.writeHead(is404 ? 404 : 200, {
    'content-type': contentTypes.get(extname(filePath).toLowerCase()) || 'application/octet-stream',
  });
  createReadStream(filePath).pipe(res);
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Serving ${root} at http://127.0.0.1:${port}`);
});
