---
name: lolipop-cli
description: ロリポップ！デプロイナウの lolipop CLI でアプリをデプロイする手順。CLI の準備 → login → プロジェクト作成 → deploy までを通す。「lolipop でデプロイ」「デプロイナウにデプロイ」「lolipop CLI を使いたい」等で使う。
---

# lolipop CLI でデプロイする

ロリポップ！デプロイナウのコマンドラインツール `lolipop` で、ローカルのアプリを公開する手順。

このスキルに無い詳細は Markdown で取得できるドキュメントを参照する:

- https://deploy.lolipop.jp/docs.md — ロリポップ！デプロイナウのドキュメント全体
- https://deploy.lolipop.jp/docs/cli.md — CLI リファレンス (全コマンド・オプションの詳細)

## 1. CLI を入れる

```bash
npm install -g lolipop
```

実行には Node.js 22.12.0 以上が必要。導入できたら稼働確認する:

```bash
lolipop health   # Operational と出れば OK
```

## 2. デプロイする

アプリのディレクトリで `lolipop deploy` を実行するだけで、ログイン → プロジェクト作成 → デプロイまで通る。

```bash
cd <アプリのディレクトリ>
lolipop deploy
```

- 未ログインなら自動でブラウザが開いて認証する (`lolipop login` で先にログインしてもよい)。
- 対象プロジェクトが未指定なら、一覧から選ぶか「新しいプロジェクトを作成」を選んでその場で作れる。
- 完了するとデプロイの詳細を確認できるダッシュボードの URL が表示される。
- `--dir` 省略時はカレントディレクトリが対象。
- 同じプロジェクトに続けてデプロイすると、進行中 (キューイング中・ビルド中) のデプロイはキャンセルされ、最後の 1 回だけが公開される。

非対話 (CI / スクリプト) や初回からまとめて指定したいときは、プロジェクトを新規作成しながらデプロイできる:

```bash
lolipop deploy --name <name> --framework <framework>
```

フレームワークの一覧は `lolipop frameworks list` で確認する (Next.js は `next`、静的サイトは `static`)。新規作成時はビルド設定 (BuildConfig) もフレームワークの既定値で一緒に作られ、変えたいときだけ次を足す:

- `--install <cmd>` 依存インストールコマンド
- `--build <cmd>` ビルドコマンド
- `--output <dir>` ビルド成果物の出力ディレクトリ
- `--root <dir>` ビルドを実行するディレクトリ (モノレポのサブディレクトリを指すとき)
- `--domain <label>` サブドメイン (省略時は name と同じ)

### 既存プロジェクトにデプロイ

作成済みのプロジェクトには `--project` で id を指定するか、ディレクトリを link しておく:

```bash
lolipop project link <id>       # cwd をプロジェクトに紐付け (以降 --project 省略で解決)
lolipop deploy                  # link 済みなら指定不要

lolipop deploy --project <id>   # link せず直接指定
```

## GitHub 連携 (CLI からは設定できない)

GitHub のリポジトリを接続すると、指定したブランチへの push のたびに自動でデプロイされる。
**接続に対応する `lolipop` コマンドは無い**ため、エージェントが代行できない。ユーザーにブラウザでの操作を依頼する。

1. https://deploy.lolipop.jp/projects/new を開き、GitHub との接続を選ぶ
2. GitHub の画面で、ロリポップ！デプロイナウが GitHub アカウントを確認することを許可する
3. 戻ってきた一覧からデプロイするリポジトリを選ぶ (目的のリポジトリが無ければ、GitHub の画面でアクセスを許可するリポジトリを追加する)
4. プロジェクト名・サブドメイン・フレームワーク・デプロイするブランチを指定して作成する

すでにあるプロジェクトに後から繋ぐときは、プロジェクト詳細画面の「設定」タブの GitHub リポジトリの欄から接続する。
接続したあとは push でデプロイされるので、`lolipop deploy` を重ねて実行する必要はない。
手順の詳細は https://deploy.lolipop.jp/docs/integrations/github.md を参照する。

## アップロードされるファイル

- git 管理下: git が追跡しているファイルと、`.gitignore` で無視されていない未追跡ファイルを含める。追跡済みのファイルは後から `.gitignore` に書いても含まれ続ける。
- git 管理外: 全ファイルを含める。
- `.git` / `node_modules` / `.next` はどちらの場合も常に除外する。
- **`.env` はアップロードされても参照されない**。ビルド・公開時に必要な環境変数は、ダッシュボードのプロジェクト詳細画面「環境変数」タブで設定する。

## アプリ側の要件

- **Next.js は `next.config` で `output: 'standalone'` が必須**。これが無いとビルド成果物が公開できない。フレームワークは `next` を選ぶと出力ディレクトリの既定値 (`.next/standalone`) が自動で入る。
- ローカルの `.next` はアップロードされず、インストールとビルドはデプロイ側で実行される。ビルドコマンドで再生成できる状態にしておく。
- インストール・ビルドコマンドは npm 前提 (pnpm / yarn 非対応)。
- モノレポは `--root <dir>` でアプリのディレクトリを指す。

## 静的サイト (`static`)

サーバ側で実行するプログラムを持たず、HTML / CSS / JavaScript などのファイルをそのまま配信するサイトは、フレームワークに `static` を選ぶ。詳細は https://deploy.lolipop.jp/docs/frameworks/static.md を参照する。

- インストールコマンドとビルドコマンドは既定で空 (実行しない)、出力ディレクトリは `.` (フォルダ直下)。
- ルート URL で表示するページは、出力ディレクトリ直下に `index.html` という名前で置く。無いままデプロイするとルート URL は 404 になり、各 HTML はファイル名のパス (`/about.html` など) で公開される。HTML が 1 つも無いとデプロイは失敗する。
- 名前が `.` で始まるファイル (`.env` など) は公開されない。

## プロジェクトを個別に用意する

デプロイ前にプロジェクトだけ先に作ることもできる:

```bash
lolipop frameworks list
lolipop project create --name <name> --framework <framework>
```

`project create` でサブドメインとビルド設定もまとめて作られる。作成済みの設定は後から `lolipop build-config update` で変更できる。

## よく使うコマンド

| コマンド | 用途 |
| --- | --- |
| `lolipop project list` | 自分のプロジェクト一覧 |
| `lolipop project show` | プロジェクトの詳細 (サブドメイン / ビルド設定 / 最新デプロイ) |
| `lolipop project status` | 現在対象になっているプロジェクトの確認 |
| `lolipop project logs --latest` | 直近デプロイのビルドログ |
| `lolipop build-config update` | ビルド設定の変更 |
| `lolipop domain create <fqdn>` | 独自ドメインを追加し、設定する DNS レコードを表示 |
| `lolipop domain verify <fqdn>` | DNS 設定後に独自ドメインの検証を開始 |
| `lolipop domain list` | 独自ドメインの一覧 (状態 / 検証日時) |
| `lolipop domain delete <fqdn>` | 独自ドメインを削除 (取り消せないため確認する。非対話では `--yes` 必須) |

`--json` を付けると機械処理しやすい JSON 1 行で返る。

## 困ったとき

- `lolipop health` が Operational を返さない → 一時的に応答していない可能性。少し待って再実行する。
- 認証エラー → `lolipop login` でログインし直す。
- デプロイがしばらく QUEUED のまま → ビルドの順番待ち。表示された URL か `lolipop project logs --latest` で進行を確認できる。
- ビルドが環境変数不足で失敗する → ローカルの `.env` は参照されない。ダッシュボードの「環境変数」タブで同じ値を設定する。
