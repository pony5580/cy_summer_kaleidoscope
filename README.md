# SUMMER KALEIDOSCOPE ― グループ展紹介サイト

鎌倉 Cy Kamakura（Art Gallery & Restaurant）で開催するグループ展のご案内サイトです。
1ページ完結の LP スタイル。`index.html` / `styles.css` / `app.js` / `assets/` で構成します。
デザインは `flyer.png`（クリーム × ビビッドレッド × ゴールデンイエロー／幾何学モチーフ）に準拠。

## 技術

- **Tailwind CSS**（Play CDN）でスタイリング、カスタム部分のみ `styles.css`
- **バニラ JS**（`app.js`）で Hero 図形のスクロール連動パララックス＋リング回転、
  セクションのフェードイン（`prefers-reduced-motion` を尊重）
- フォント: **Jost**（Futura に最も近い無料の幾何学サンセリフ）＋ Zen Kaku Gothic New

> Play CDN は閲覧時に `cdn.tailwindcss.com` を読み込みます。手軽ですが本番では
> Tailwind CLI でビルドした CSS に差し替えると軽量・オフライン対応になります
> （`npx tailwindcss -i in.css -o assets/tailwind.css --minify`）。

## 掲載情報（フライヤーより）

- 会期: 2026.8.8（土）– 8.23（日）
- 時間: 14:00 – 24:00 / 水曜休
- 会場: Cy Kamakura（Art Gallery & Restaurant・鎌倉）
- 参加作家（6名）: Spiralarts / Azusa / MOJO / Abumi / KUKU. / cpnnn_

## ローカルで確認する

`index.html` をブラウザで直接開くだけでも表示できます。

```sh
python3 -m http.server 8000   # → http://localhost:8000
```

## 中身の差し替え

- 展覧会名・会期・本文 … `index.html` のテキストを直接編集
- 配色・フォント … `styles.css` 先頭の `:root { ... }` 変数を変更
- 画像 … `assets/` に置いて参照
  - `assets/ogp.jpg`（SNSシェア用・1200×630px 推奨）
  - 作家サムネイルは `.artist-card__thumb` を `<img>` に置き換え
- 住所・電話番号 … `Access` セクションの「（住所を記入してください）」等を編集
- Google マップ … `Access` のプレースホルダーを埋め込み iframe に置き換え
- **QRコード** … `assets/qr.svg` は現在フライヤー由来の仮のコード。公開後、確定したサイトURLで
  再生成して差し替える（例: `qrencode` や各種QR生成サービスで本番URLのQRを作成）

## 無料で公開する（おすすめ順）

いずれも無料枠・独自ドメインなしで公開できます。

### 1. Cloudflare Pages / Netlify（ドラッグ&ドロップ）
1. アカウントを作成
2. このフォルダをそのままアップロード（build command は空でOK）
3. 発行された `https://xxx.pages.dev` / `https://xxx.netlify.app` で公開

### 2. GitHub Pages
1. GitHub にリポジトリを作成しこのフォルダを push
2. Settings → Pages → Branch を `main` / `/ (root)` に設定
3. `https://<ユーザー名>.github.io/<リポジトリ名>/` で公開

公開URLが確定したら、そのURLでQRコードを作り直して `assets/qr.svg` を差し替えてください。
独自ドメインもいずれのサービスでも後から無料で接続できます。
