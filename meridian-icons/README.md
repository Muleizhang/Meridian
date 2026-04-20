# Meridian 图标资源包

## 文件清单

### Favicon
- `favicon.ico` — 多尺寸 ICO (16/32/48),放到 `app/` 根目录
- `favicon.svg` — 现代浏览器优先用 SVG
- `favicon-16.png` / `favicon-32.png` / `favicon-48.png`

### App icon
- `icon-180.png` — Apple touch icon
- `icon-192.png` — Android / PWA
- `icon-256.png` / `icon-512.png` / `icon-1024.png`
- `icon.svg` — 无限缩放矢量源

### 社交分享
- `og-image.png` (1200×630) — Open Graph / Twitter Card
- `og-image.svg` — 矢量源,可改文案

### 深色模式
- `icon-dark.svg` / `icon-dark-512.png`

## Next.js 15 App Router 接入

### 方法一:File-based(推荐)

把文件放到 `app/` 根目录,Next.js 自动生成 meta:

```
app/
├── favicon.ico          ← 自动注册 favicon
├── icon.svg             ← 重命名自 icon.svg
├── apple-icon.png       ← 重命名自 icon-180.png
└── opengraph-image.png  ← 重命名自 og-image.png
```

Next.js 会自动扫描这些文件并注入 `<link>` 和 `<meta>` 标签,无需手写。

### 方法二:手动 metadata

```ts
// app/layout.tsx
export const metadata = {
  title: 'Meridian',
  description: "A private atlas of places we've been.",
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: '32x32' },
      { url: '/favicon.svg', type: 'image/svg+xml' },
    ],
    apple: '/icon-180.png',
  },
  openGraph: {
    images: [{ url: '/og-image.png', width: 1200, height: 630 }],
  },
};
```

## 配色参考

```css
--meridian-ink:   #2F4A3A;  /* 主色 墨绿 */
--meridian-paper: #F5F1E8;  /* 底色 米白 */
--meridian-clay:  #B8704A;  /* 标记点 赭石 */

/* 深色模式 */
--meridian-ink-dark:   #1A2520;
--meridian-paper-dark: #F5F1E8;
--meridian-clay-dark:  #D4906A;
```

这套色直接拿去做整站的基础色板也合适。
