// Generator for public/og-image.png. Run from the StarDustWebsite directory:
//   node scripts/gen-og-image.mjs
// LinkedIn and other crawlers cache previews; refresh them after deploying.
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

// Satori only needs a React-element-shaped tree, so no `react` import is needed.
function h(type, props, ...children) {
  const flat = children.length === 1 ? children[0] : children;
  return { type, props: { ...props, children: flat } };
}

const websiteRoot = process.cwd();
const { ImageResponse } = await import(
  pathToFileURL(
    path.join(websiteRoot, 'node_modules/next/dist/compiled/@vercel/og/index.node.js'),
  ).href
);

const iconSvg = readFileSync(path.join(websiteRoot, 'app/icon.svg'), 'utf8');
const iconDataUri = `data:image/svg+xml;base64,${Buffer.from(iconSvg).toString('base64')}`;

// Satori needs raw TTF bytes, not the woff2 next/font self-hosts (OFL, see fonts/OFL.txt).
const fontDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fonts');
const poppinsRegular = readFileSync(path.join(fontDir, 'Poppins-Regular.ttf'));
const poppinsSemiBold = readFileSync(path.join(fontDir, 'Poppins-SemiBold.ttf'));

const bg = '#07060c';
const text = '#ededed';
const textDim = '#aaaaaa';
const indexed = '#2fd4bd';

const element = h(
  'div',
  {
    style: {
      width: '1200px',
      height: '630px',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: bg,
      backgroundImage:
        'radial-gradient(circle at 50% 35%, rgba(47,212,189,0.16) 0%, rgba(7,6,12,0) 60%)',
      fontFamily: 'Poppins',
    },
  },
  h('img', { src: iconDataUri, width: 168, height: 168, style: { marginBottom: 36 } }),
  h(
    'div',
    {
      style: {
        display: 'flex',
        fontSize: 76,
        fontWeight: 600,
        color: text,
        letterSpacing: '-0.02em',
      },
    },
    'StarDust',
  ),
  h(
    'div',
    {
      style: {
        display: 'flex',
        marginTop: 22,
        fontSize: 30,
        fontWeight: 400,
        color: textDim,
        textAlign: 'center',
        maxWidth: 920,
      },
    },
    'Dynamic fields, queried at native SQL index speed',
  ),
  h(
    'div',
    {
      style: {
        display: 'flex',
        alignItems: 'center',
        marginTop: 40,
        fontSize: 22,
        color: indexed,
      },
    },
    h('span', { style: { display: 'flex', marginRight: 10 } }, '$'),
    'composer require damarbob/stardust:^0.3@alpha',
  ),
);

const image = new ImageResponse(element, {
  width: 1200,
  height: 630,
  fonts: [
    { name: 'Poppins', data: poppinsRegular, weight: 400, style: 'normal' },
    { name: 'Poppins', data: poppinsSemiBold, weight: 600, style: 'normal' },
  ],
});
const buffer = Buffer.from(await image.arrayBuffer());
const outPath = path.join(websiteRoot, 'public/og-image.png');
writeFileSync(outPath, buffer);
console.log('wrote', outPath, buffer.length, 'bytes');
