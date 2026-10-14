# Chrome 131 для браузерных харнессов

Архив `chrome-linux64.zip` (Chrome for Testing 131.0.6778.204, linux64,
165 908 146 байт, sha256
`fba7d5e87cdcf0dc974c9ac8a0a9dbcf5686c935455d5e6beed337c6ada88bc2`)
разбит на части по 45 МБ — GitHub не принимает файлы крупнее 100 МБ.
Харнессы ждут ТОЛЬКО эту версию (09 §4): иные Chrome/Chromium дают
расхождения в тач-событиях и раскладке графа.

Сборка и распаковка (из корня репозитория):

```bash
cat chrome/chrome-linux64.zip.part* > chrome-linux64.zip
sha256sum -c <(echo "fba7d5e87cdcf0dc974c9ac8a0a9dbcf5686c935455d5e6beed337c6ada88bc2  chrome-linux64.zip")
mkdir -p ~/.cache/puppeteer/chrome/linux-131.0.6778.204
unzip -q chrome-linux64.zip -d ~/.cache/puppeteer/chrome/linux-131.0.6778.204
rm chrome-linux64.zip          # *.zip в .gitignore, в репозиторий не попадёт
npm i --no-save puppeteer-core@23
```

Харнессы ищут бинарник в `~/.cache/puppeteer/chrome/linux-131.0.6778.204/
chrome-linux64/chrome`; иной путь — переменная `CHROME_PATH`. Целостность
частей — `sha256sum -c chrome/SHA256SUMS`.
