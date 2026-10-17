// dist/ のビルド結果を、claude.ai に公開する1枚のページ（dist/meal-log.html）にまとめる。
// 公開時に <!doctype html>…<body> の枠が付くので、ここではページの中身だけを書く。
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const dir = new URL('../dist/assets/', import.meta.url).pathname
const files = readdirSync(dir)
const js = files.filter((f) => f.endsWith('.js')).map((f) => readFileSync(join(dir, f), 'utf8'))
const css = files.filter((f) => f.endsWith('.css')).map((f) => readFileSync(join(dir, f), 'utf8'))
if (js.length !== 1) throw new Error(`JS は1ファイルの想定です: ${files.join(', ')}`)

// スクリプト中の "</script" で HTML の解釈が途切れないようにする
const safeJs = js[0].replace(/<\/script/gi, '<\\/script')
const page = `<title>ごはん記録</title>
<meta name="claude:viewport-fit-sides" content="cover">
<style>${css.join('\n')}</style>
<div id="root"></div>
<script type="module">${safeJs}</script>
`
const out = new URL('../dist/meal-log.html', import.meta.url).pathname
writeFileSync(out, page)
console.log(`wrote ${out} (${(page.length / 1024).toFixed(0)} KB)`)
