// Settings for making the app icons from public/app-icon.png, a hand-drawn icon. The icons are made
// once and committed, so the image library never becomes a dependency. After changing the drawing, run:
//   pnpm dlx @vite-pwa/assets-generator@2.0.0
// It's a plain object rather than defineConfig, since the generator isn't installed here.
const dark = { background: '#0c0a09' };

export default {
  headLinkOptions: { preset: '2023' },
  preset: {
    transparent: { sizes: [64, 192, 512], favicons: [[48, 'favicon.ico']] },
    // Maskable and Apple icons get padding and a solid background, as the platforms crop them.
    maskable: { sizes: [512], padding: 0.3, resizeOptions: dark },
    apple: { sizes: [180], padding: 0.15, resizeOptions: dark },
  },
  images: ['public/app-icon.png'],
};
