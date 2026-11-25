#!/usr/bin/env bash
#
# philosynth-ubuntu.sh — идемпотентный бутстрап PhiloSynth Service на Ubuntu 24.
#
#   bash philosynth-ubuntu.sh            полная установка (можно гонять повторно)
#   bash philosynth-ubuntu.sh start      поднять базу, кэш и оба dev-сервера
#   bash philosynth-ubuntu.sh stop       остановить всё
#   bash philosynth-ubuntu.sh status     что сейчас живо + чего не хватает
#   bash philosynth-ubuntu.sh doctor     только диагностика окружения
#   bash philosynth-ubuntu.sh admin      завести первого администратора
#   bash philosynth-ubuntu.sh stand      стенд биллинга без Stripe (мок 8.2)
#     … stand --stop / --status — доводы уходят в tools/dev-billing.sh как есть
#   bash philosynth-ubuntu.sh accept     приёмка: typecheck + смоуки + проверки
#   bash philosynth-ubuntu.sh systemd    поставить две службы и включить автозапуск
#
# Отчёт в стиле патч-скриптов доков: created / skip / fail.
# Повторный прогон на готовой машине обязан дать одни skip.
#
# Ревизия 2026-11-15 — исходящий прокси своей машины (PHILOSYNTH_PROXY,
#    раздел «Сеть» ниже и §1a руководства): прокси берётся из окружения,
#    apt или прошлого .env, пишется в .env блоком с NODE_USE_ENV_PROXY=1;
#    apt под sudo получает его явно; проверка выхода к API Anthropic;
#    Chrome — из частей chrome/ в репозитории, сеть лишь запасной путь.
#
# Ревизия 2026-09-21 (репозиторий после беседы 10.1):
#  - миграций ДВАДЦАТЬ ОДНА (0000…0020; 0020 — индекс поиска концепций: synthesis_search (tsvector, GIN), индексы точного термина глоссария, 18.1 — после миграции шаг `npm run search:reindex` наполняет индекс; 0019 — предложения и исполнитель: proposals, proposal_events, actor_user_id в element_versions и generation_log, 17.1; 0018 — участники и уведомления: notifications, notification_settings, довод member_invite в auth_tokens, 16.2; 0017 — обсуждение и рецензии: synthesis_members, comments, reviews, review_revisions, review_findings, 16.1; 0016 — редакции тарифов family/edition, 15.4; 0010 — язык интерфейса, 11.2; 0011 — метка тезиса, 12.1;
#    0012 — замечание сторожа рекомендаций, 0013 — находки сторожа кодами, 12.3; 0014 — уникальная пара
#    родословной, 15.1; 0015 — довод смены адреса email_change, 15.3; 0016 — редакции тарифов, 15.4): 0006 — почта (9.1), 0007 — рекомендации
#    критики (10.1), 0008 — дерево генеалогии импортированного файла
#    (2026-09-21, вне бесед), 0009 — element_versions.origin (10.2); шаблонов 264
#    (10.1: + шаблон «Таблицы рекомендаций» и шаблон её составления по готовой
#    прозе; 10.2: + шаблон точечной правки элемента). Прежняя ревизия отстала ещё на 9.1.
#  - ПОСЕВ СБРАСЫВАЕТ КЭШ САМ (12.3, Д-18). Кэш шаблонов и конфигов в Redis
#    бессрочный, но сиды сбрасывают ключи, которые изменили, и работающий
#    сервер читает новые версии без перезапуска. Перезапуск нужен, только
#    если сид сказал «кэш НЕ сброшен» (Redis был недоступен посеву):
#    step_db_content ловит эту строку и предупреждает, если сервер отвечает
#    на health. `stop` перед `git pull` по-прежнему первым — из-за схемы
#    (новый код до миграции). Порядок обновления — в руководстве рядом.
#
# Ревизия 2026-09-15 (репозиторий после беседы 8.7, Фаза 8 закрыта).
#
# ЧЕМ ЭТА МАШИНА ОТЛИЧАЕТСЯ ОТ ТЕЛЕФОНА (deploy/philosynth-termux.sh):
#  - Chrome 131 ставится, значит браузерная приёмка (тесты 84, 86, 87 и
#    прочие) здесь ИДЁТ. На телефоне её нет вовсе, и правка исходника там
#    неисполнима: «правка заканчивается приёмкой».
#  - есть systemd, значит служба переживает перезагрузку. Команда systemd
#    заводит ДВЕ единицы: сервер и клиент. Фоновых работников у PhiloSynth
#    нет (в отличие от ΦilosΦaira с её работником уведомлений).
#  - node-canvas (беседа 4.2, PNG-экспорт) здесь ставится ПРЕБИЛДОМ —
#    сборки из исходников, съедающей на телефоне до десяти минут, не
#    требуется. Но библиотеки cairo/pango всё равно нужны в системе.
#
# Скрипт НЕ предполагает публичного размещения: он поднимает dev-сборку на
# 127.0.0.1. Публичный случай (домен, TLS, webhook Stripe, файрвол, копии)
# — deploy/philosynth-hosting.md, и там отличий больше, чем кажется.

set -euo pipefail

# ── Параметры ────────────────────────────────────────────────────────────
REPO_URL="${REPO_URL:-https://github.com/Ranatar/philosynth.git}"
REPO_DIR="${REPO_DIR:-$HOME/philosynth}"
DB_NAME="${DB_NAME:-philosynth}"
DB_ROLE="${DB_ROLE:-philosynth}"
DB_PASS="${DB_PASS:-philosynth_dev}"   # обязан совпадать с дефолтом server/env.ts
NODE_MIN_MAJOR=22
NODE_MIN_MINOR=18
CHROME_VERSION="${CHROME_VERSION:-131.0.6778.204}"
PORT_SERVER="${PORT_SERVER:-3000}"
PORT_CLIENT="${PORT_CLIENT:-5173}"

# Исходящий прокси ЭТОЙ машины (2026-11-15). Сеть своей машины и сеть
# хостера — разные вещи, поэтому прокси нигде не зашит: пусто — ищется в
# окружении оболочки (https_proxy/HTTPS_PROXY/http_proxy/HTTP_PROXY), затем
# в настройках apt (Acquire::http(s)::Proxy), затем в блоке прокси в .env
# от прошлого прогона; не нашёлся — машина ходит наружу напрямую. off —
# убрать блок прокси из .env. Только HTTP(S)-прокси: SOCKS встроенный fetch
# Node не понимает.
PHILOSYNTH_PROXY="${PHILOSYNTH_PROXY:-}"
NO_PROXY_LOCAL="localhost,127.0.0.1,::1"

# Пакеты: python3 и build-essential — для node-gyp, если пребилд canvas не
# подойдёт; cairo/pango/libpng/librsvg — самому canvas в любом случае;
# unzip — Chrome из частей репозитория (chrome/).
APT_PKGS="postgresql redis-server git curl ca-certificates unzip python3 build-essential \
pkg-config libcairo2-dev libpango1.0-dev libpng-dev libjpeg-dev libgif-dev librsvg2-dev"

C_OK=$'\033[32m'; C_SKIP=$'\033[90m'; C_WARN=$'\033[33m'; C_ERR=$'\033[31m'; C_0=$'\033[0m'
n_created=0; n_skip=0; n_fail=0

ok()   { printf '%s  ✓ %s%s\n'  "$C_OK"   "$1" "$C_0"; n_created=$((n_created+1)); }
skip() { printf '%s  ~ %s%s\n'  "$C_SKIP" "$1" "$C_0"; n_skip=$((n_skip+1)); }
warn() { printf '%s  ! %s%s\n'  "$C_WARN" "$1" "$C_0"; }
die()  { printf '%s  ✗ %s%s\n'  "$C_ERR"  "$1" "$C_0"; n_fail=$((n_fail+1)); exit 1; }
head_() { printf '\n\033[1m── %s\033[0m\n' "$1"; }

SUDO=""
[ "$(id -u)" -eq 0 ] || SUDO="sudo"

# Обращение к базе от имени postgres. Под обычным пользователем — sudo -u,
# под root — su: `$SUDO -u postgres …` при пустом SUDO превращается в
# `-u postgres …`, то есть в «command not found», и все проверки базы
# молча становятся ложными. Поймано живым прогоном.
as_postgres() {
  if [ "$(id -u)" -eq 0 ]; then su postgres -c "$*"
  else sudo -u postgres bash -lc "$*"; fi
}

# ── Сеть: исходящий прокси ───────────────────────────────────────────────
# Зачем это вообще. Сервер ходит к Anthropic и Stripe встроенным fetch, а
# он переменные прокси ИГНОРИРУЕТ, пока не задан NODE_USE_ENV_PROXY=1
# (проверено на 22.23: без флага fetch идёт мимо прокси, с флагом — через
# него). Флаг понимают Node ≥ 22.21 и ≥ 24, поэтому при прокси планка
# версии поднимается. Ещё три ловушки той же природы:
#  - sudo сбрасывает окружение, и apt-get под ним прокси не видит;
#  - curl к 127.0.0.1 при выставленном http_proxy без no_proxy уходит в
#    прокси (curl 8.5 Ubuntu 24 петлю сам не исключает) — health-check
#    врал бы «молчит» при живом сервере;
#  - сервер узнаёт о прокси только из .env (его читают и start, и
#    EnvironmentFile служб), поэтому прокси пишется туда отдельным блоком.
# На хостинге блока нет: там переменные не выставлены, и сервер ходит
# напрямую (deploy/philosynth-hosting.md §3).
PROXY_URL=""; PROXY_SRC=""
ENV_BLOCK_BEGIN="# >>> philosynth-ubuntu.sh: исходящий прокси этой машины"
ENV_BLOCK_END="# <<< philosynth-ubuntu.sh: прокси"

mask_url() { printf '%s' "$1" | sed -E 's#//[^/@]*@#//***@#'; }

dotenv_proxy() {
  [ -f "$REPO_DIR/.env" ] || return 0
  awk -v b="$ENV_BLOCK_BEGIN" -v e="$ENV_BLOCK_END" \
    '$0==b{f=1;next} $0==e{f=0} f&&/^HTTPS_PROXY=/{sub(/^HTTPS_PROXY=/,"");print;exit}' "$REPO_DIR/.env"
}

apt_proxy() {  # $1 = http | https
  command -v apt-config >/dev/null 2>&1 || return 0
  apt-config dump 2>/dev/null | awk -v k="Acquire::$1::Proxy" '$1==k{v=$2; gsub(/[";]/,"",v); print v; exit}'
}

# Приводит адрес к виду http(s)://…; пусто — «прокси нет».
norm_proxy() {
  local raw="${1%/}"
  case "$raw" in
    ""|DIRECT|direct|false) return 0 ;;
    http://*|https://*) printf '%s' "$raw" ;;
    *://*) ;;   # чужая схема — отказ в check_proxy_scheme, не здесь:
                # die в подстановке $(…) погасил бы только подоболочку
    *) printf 'http://%s' "$raw" ;;
  esac
}

check_proxy_scheme() {
  case "${1:-}" in
    socks*) die "прокси $(mask_url "$1") — SOCKS. Встроенный fetch Node его не
      понимает: укажите HTTP-вход того же прокси (у v2rayN и v2rayNG он есть рядом с SOCKS)" ;;
    http://*|https://*|*"://"*) case "$1" in http://*|https://*) ;; *)
      die "прокси $(mask_url "$1"): схема не http(s) — так не поедет" ;; esac ;;
  esac
}

# PROXY_URL — для https-адресов (его и пишем в .env: сервер ходит только по
# https), PROXY_HTTP — для http-адресов (apt-зеркала). Окружение и apt
# задают их раздельно, и склеивать нельзя: прокси, пускающий только CONNECT,
# отвечает 405 на http-зеркала (поймано прогоном за таким прокси).
# PHILOSYNTH_PROXY задаёт оба сразу.
PROXY_HTTP=""
resolve_proxy() {
  local rs="" rh="" src=""
  if [ "$PHILOSYNTH_PROXY" = "off" ]; then PROXY_SRC="off"; return 0; fi
  if [ -n "$PHILOSYNTH_PROXY" ]; then
    rs="$PHILOSYNTH_PROXY"; rh="$PHILOSYNTH_PROXY"; src="PHILOSYNTH_PROXY"
  elif [ -n "${https_proxy:-}${HTTPS_PROXY:-}${http_proxy:-}${HTTP_PROXY:-}" ]; then
    rs="${https_proxy:-${HTTPS_PROXY:-}}"; rh="${http_proxy:-${HTTP_PROXY:-}}"; src="окружение оболочки"
    # задан только http-прокси — по обычаю curl/npm он годится и для https
    [ -z "$rs" ] && rs="$rh"
  else
    rs="$(apt_proxy https)"; rh="$(apt_proxy http)"; src="настройки apt"
    [ -z "$rs" ] && rs="$rh"
    if [ -z "$rs" ]; then rs="$(dotenv_proxy)"; rh=""; src=".env (прошлый прогон)"; fi
  fi
  check_proxy_scheme "$rs"; check_proxy_scheme "$rh"
  PROXY_URL="$(norm_proxy "$rs")"; PROXY_HTTP="$(norm_proxy "$rh")"
  [ -n "$PROXY_URL$PROXY_HTTP" ] || return 0
  PROXY_SRC="$src"
  local np="${no_proxy:-${NO_PROXY:-}}" h
  for h in ${NO_PROXY_LOCAL//,/ }; do
    case ",$np," in *",$h,"*) ;; *) np="${np:+$np,}$h" ;; esac
  done
  export no_proxy="$np" NO_PROXY="$np"
  [ -n "$PROXY_URL" ]  && export https_proxy="$PROXY_URL" HTTPS_PROXY="$PROXY_URL"
  [ -n "$PROXY_HTTP" ] && export http_proxy="$PROXY_HTTP" HTTP_PROXY="$PROXY_HTTP"
  # fetch через прокси — с 22.21 (NODE_USE_ENV_PROXY); 24+ проходит и так
  [ -n "$PROXY_URL" ] && NODE_MIN_MINOR=21
  return 0
}

# Команда от root с прокси. Под root окружение уже экспортировано
# resolve_proxy; под sudo его приходится передать явно — sudo его режет.
# (Прежний `$SUDO -E bash` под root превращался в `-E bash` — «command not
# found», та же грабля, что у as_postgres.)
as_root() {
  if [ "$(id -u)" -eq 0 ]; then "$@"; return; fi
  local e=()
  [ -n "$PROXY_URL" ]  && e+=(https_proxy="$PROXY_URL" HTTPS_PROXY="$PROXY_URL")
  [ -n "$PROXY_HTTP" ] && e+=(http_proxy="$PROXY_HTTP" HTTP_PROXY="$PROXY_HTTP")
  if [ ${#e[@]} -gt 0 ]; then sudo env "${e[@]}" no_proxy="$NO_PROXY" NO_PROXY="$NO_PROXY" "$@"
  else sudo "$@"; fi
}

# systemd есть не всегда: в контейнере (docker, lxc, WSL1) его нет, и
# службами управлять нечем. Скрипт это различает и переходит на pid-файлы,
# а не падает — иначе он не проверяем нигде, кроме настоящей виртуалки.
has_systemd() { [ -d /run/systemd/system ]; }

# ── 0. Диагностика ───────────────────────────────────────────────────────
doctor() {
  head_ "Окружение"
  if [ -r /etc/os-release ]; then
    . /etc/os-release
    case "${ID:-}:${VERSION_ID:-}" in
      ubuntu:24.*) ok "Ubuntu ${VERSION_ID}" ;;
      ubuntu:*)    warn "Ubuntu ${VERSION_ID} — скрипт писан под 24.04, может разойтись в именах пакетов" ;;
      debian:*)    warn "Debian ${VERSION_ID} — обычно проходит, но не проверялось" ;;
      *)           warn "${PRETTY_NAME:-неизвестная система} — скрипт писан под Ubuntu 24.04" ;;
    esac
  else
    warn "/etc/os-release не читается — что за система, неизвестно"
  fi

  if command -v node >/dev/null 2>&1; then
    local v maj min
    v="$(node -v)"; v="${v#v}"; maj="${v%%.*}"; min="${v#*.}"; min="${min%%.*}"
    if [ "$maj" -gt "$NODE_MIN_MAJOR" ] 2>/dev/null \
       || { [ "$maj" -eq "$NODE_MIN_MAJOR" ] && [ "$min" -ge "$NODE_MIN_MINOR" ]; }; then
      ok "node $(node -v)"
    else
      warn "node $(node -v) — нужен ≥ ${NODE_MIN_MAJOR}.${NODE_MIN_MINOR}; ставлю на шаге пакетов"
    fi
  else
    skip "node не найден — поставлю"
  fi

  if [ -n "$PROXY_URL$PROXY_HTTP" ]; then
    ok "исходящий прокси (из: $PROXY_SRC): https → $(mask_url "${PROXY_URL:-напрямую}"), http → $(mask_url "${PROXY_HTTP:-напрямую}"); мимо — $NO_PROXY_LOCAL"
  else
    skip "исходящего прокси нет — наружу напрямую (своя сеть за прокси? PHILOSYNTH_PROXY=http://адрес:порт)"
  fi

  has_systemd && ok "systemd есть — автозапуск возможен (команда systemd)" \
              || warn "systemd нет (контейнер?) — процессы держатся pid-файлами,
      автозапуск после перезагрузки не заведётся"

  local free
  free="$(df -Pm "$HOME" | awk 'NR==2{print $4}')"
  if [ "${free:-0}" -lt 4000 ]; then
    warn "свободно ${free} МБ — мало: node_modules и Chrome просят около 3 ГБ"
  else
    ok "свободно ${free} МБ"
  fi

  local mem
  mem="$(awk '/MemTotal/{print int($2/1024)}' /proc/meminfo 2>/dev/null || echo 0)"
  [ "${mem:-0}" -lt 3500 ] \
    && warn "ОЗУ ${mem} МБ — Chrome в браузерных тестах может не уложиться" \
    || ok "ОЗУ ${mem} МБ"
}

# ── 1. Пакеты ────────────────────────────────────────────────────────────
node_ok() {
  command -v node >/dev/null 2>&1 || return 1
  local v maj min; v="$(node -v)"; v="${v#v}"; maj="${v%%.*}"; min="${v#*.}"; min="${min%%.*}"
  [ "$maj" -gt "$NODE_MIN_MAJOR" ] 2>/dev/null && return 0
  [ "$maj" -eq "$NODE_MIN_MAJOR" ] && [ "$min" -ge "$NODE_MIN_MINOR" ]
}

step_packages() {
  head_ "Пакеты системы"
  local missing=""
  for p in $APT_PKGS; do
    dpkg -s "$p" >/dev/null 2>&1 || missing="$missing $p"
  done
  if [ -z "$missing" ]; then
    skip "все пакеты уже стоят"
  else
    as_root apt-get update -qq
    # shellcheck disable=SC2086
    as_root apt-get install -y -qq $missing >/dev/null
    ok "поставлены:$missing"
  fi

  if node_ok; then
    skip "node $(node -v) годится"
  else
    # NodeSource, а не apt: в репозитории Ubuntu 24 лежит Node 18, а проекту
    # нужен 22.18+ (см. package.json engines); за прокси — 22.21+.
    curl -fsSL https://deb.nodesource.com/setup_22.x | as_root bash - >/dev/null
    as_root apt-get install -y -qq nodejs >/dev/null
    node_ok || die "node так и не встал в нужной версии: $(node -v 2>&1)"
    ok "node $(node -v) из NodeSource"
  fi
}

# ── 2. Chrome 131 ────────────────────────────────────────────────────────
# ИМЕННО эта сборка: браузерные тесты (5.2 и далее) писаны под неё, а
# puppeteer-core версии не подбирает. Ставим в кэш пользователя, а не в
# систему, — так же, как его находят тесты.
chrome_path() {
  echo "$HOME/.cache/puppeteer/chrome/linux-${CHROME_VERSION}/chrome-linux64/chrome"
}

step_chrome() {
  head_ "Chrome ${CHROME_VERSION}"
  if [ -x "$(chrome_path)" ]; then
    skip "уже на месте: $(chrome_path)"
    return
  fi
  cd "$REPO_DIR" 2>/dev/null || cd "$HOME"
  # Сначала — из частей в репозитории (chrome/, положены 2026-10-14): сеть
  # не нужна вовсе, а через прокси 166 МБ — самое долгое во всей установке.
  if [ -f chrome/SHA256SUMS ] && grep -q "Chrome for Testing ${CHROME_VERSION}" chrome/README.md 2>/dev/null; then
    if (cd chrome && sha256sum -c --quiet SHA256SUMS) >/dev/null 2>&1; then
      local tmp; tmp="$(mktemp -d)"
      cat chrome/chrome-linux64.zip.part* > "$tmp/chrome.zip"
      mkdir -p "$HOME/.cache/puppeteer/chrome/linux-${CHROME_VERSION}"
      unzip -q -o "$tmp/chrome.zip" -d "$HOME/.cache/puppeteer/chrome/linux-${CHROME_VERSION}"
      rm -rf "$tmp"
      if [ -x "$(chrome_path)" ]; then
        ok "Chrome ${CHROME_VERSION} из частей репозитория → $(chrome_path)"
        return
      fi
      warn "части chrome/ распаковались не туда — ставлю из сети"
    else
      warn "части chrome/ не сошлись с chrome/SHA256SUMS (неполный клон?) — ставлю из сети"
    fi
  fi
  npx --yes @puppeteer/browsers install "chrome@${CHROME_VERSION}" \
      --path "$HOME/.cache/puppeteer" >/dev/null \
    || die "не удалось поставить Chrome ${CHROME_VERSION}"
  [ -x "$(chrome_path)" ] || die "Chrome поставлен, но не там, где ждут тесты"
  ok "Chrome ${CHROME_VERSION} → $(chrome_path)"
}

# ── 3. PostgreSQL ────────────────────────────────────────────────────────
pg_running() { as_postgres "psql -tAc 'select 1'" >/dev/null 2>&1; }

pg_start() {
  if has_systemd; then
    $SUDO systemctl start postgresql >/dev/null 2>&1 || true
  else
    local cl; cl="$(ls /etc/postgresql 2>/dev/null | head -1)"
    [ -n "$cl" ] && $SUDO pg_ctlcluster "$cl" main start >/dev/null 2>&1 || true
  fi
}

step_postgres() {
  head_ "PostgreSQL"
  pg_running || pg_start
  sleep 2
  pg_running || die "PostgreSQL не отвечает. Посмотрите: journalctl -u postgresql -n 30"
  ok "сервер отвечает"

  if as_postgres "psql -tAc \"SELECT 1 FROM pg_roles WHERE rolname='$DB_ROLE'\"" | grep -q 1; then
    skip "роль $DB_ROLE есть"
  else
    as_postgres "psql -qc \"CREATE ROLE $DB_ROLE LOGIN PASSWORD '$DB_PASS'\"" >/dev/null
    ok "роль $DB_ROLE заведена"
  fi
  # Пароль выравниваем всегда: DATABASE_URL в .env должен сойтись с базой,
  # а роль могла остаться от прежней установки с другим паролем.
  as_postgres "psql -qc \"ALTER ROLE $DB_ROLE PASSWORD '$DB_PASS'\"" >/dev/null

  if as_postgres "psql -tAc \"SELECT 1 FROM pg_database WHERE datname='$DB_NAME'\"" | grep -q 1; then
    skip "база $DB_NAME есть"
  else
    as_postgres "createdb -O $DB_ROLE $DB_NAME"
    ok "база $DB_NAME заведена"
  fi

  # Единственность логина держится на lower() — локаль базы обязана
  # сворачивать кириллицу. На glibc это так, но проверить дешевле, чем
  # потом разбирать двух пользователей под одним адресом.
  local folded
  folded="$(PGPASSWORD="$DB_PASS" psql -h 127.0.0.1 -U "$DB_ROLE" -d "$DB_NAME" \
            -tAc "select lower('ИВАН')" 2>/dev/null || echo "")"
  if [ "$folded" = "иван" ]; then
    ok "локаль сворачивает кириллицу (lower('ИВАН') = 'иван')"
  else
    die "lower('ИВАН') вернул «${folded}» — локаль базы не сворачивает кириллицу.
      Два разных человека смогут завестись под одним адресом. Пересоздайте
      базу с локалью ru_RU.UTF-8 или C.UTF-8 на glibc."
  fi
}

# ── 4. Redis ─────────────────────────────────────────────────────────────
step_redis() {
  head_ "Redis"
  if redis-cli ping >/dev/null 2>&1; then
    skip "отвечает"
    return
  fi
  if has_systemd; then
    $SUDO systemctl start redis-server >/dev/null 2>&1 || true
  else
    redis-server --daemonize yes >/dev/null 2>&1 || true
  fi
  sleep 2
  redis-cli ping >/dev/null 2>&1 && ok "поднят" \
    || warn "не отвечает. Сервер поднимется и без него (кэш промптов работает
      на отказ-открыт, урок 0.3b), но лучше починить: journalctl -u redis-server"
}

# ── 5. Репозиторий и .env ────────────────────────────────────────────────
step_repo() {
  head_ "Репозиторий"
  if [ -d "$REPO_DIR/.git" ]; then
    skip "$REPO_DIR склонирован (git pull делаю НЕ я — локальные правки дороже)"
  else
    git clone "$REPO_URL" "$REPO_DIR"
    ok "склонирован в $REPO_DIR"
  fi
  cd "$REPO_DIR"

  local excl=".git/info/exclude"
  if grep -q '^\.ubuntu-' "$excl" 2>/dev/null; then
    skip "исключения для .ubuntu-* прописаны"
  else
    printf '\n# philosynth-ubuntu.sh\n.ubuntu-server.pid\n.ubuntu-client.pid\nlogs/\n' >> "$excl"
    ok "артефакты скрипта внесены в .git/info/exclude"
  fi

  if [ -f .env ]; then
    skip ".env на месте"
  else
    cp .env.example .env
    ok ".env создан из .env.example"
  fi

  if grep -q '^API_KEY_ENCRYPTION_SECRET=..*' .env; then
    skip "API_KEY_ENCRYPTION_SECRET задан"
  else
    local secret
    secret="$(node -e 'console.log(require("node:crypto").randomBytes(32).toString("hex"))')"
    awk -v s="$secret" '/^API_KEY_ENCRYPTION_SECRET=/{print "API_KEY_ENCRYPTION_SECRET=" s; next} {print}' \
      .env > .env.tmp && mv .env.tmp .env
    grep -q '^API_KEY_ENCRYPTION_SECRET=..*' .env \
      || die "не удалось вписать API_KEY_ENCRYPTION_SECRET в .env"
    ok "сгенерирован API_KEY_ENCRYPTION_SECRET (32 байта hex; смена секрета
      делает уже сохранённые ключи Anthropic нечитаемыми — не трогать без нужды)"
  fi

  # 13.2 (Д-67): .env, созданный до 13.2, переменных TRUST_PROXY/HOST не несёт.
  # Локальная сборка без прокси перед сервером: заголовкам X-Forwarded-For не
  # верим (false — умолчание кода; строка в .env — чтобы было что включить за
  # своим прокси), слушаем как прежде (HOST пуст — все интерфейсы).
  if grep -q '^TRUST_PROXY=' .env; then
    skip "TRUST_PROXY задан"
  else
    printf '\n# 13.2: доверие заголовкам прокси — только за своим Caddy (deploy/philosynth-hosting.md)\nTRUST_PROXY=false\nHOST=\n' >> .env
    ok "в .env дописаны TRUST_PROXY=false и HOST= (локальная сборка без прокси)"
  fi

  step_proxy_dotenv

  grep -q '^ANTHROPIC_API_KEY=..*' .env \
    || warn "ANTHROPIC_API_KEY пуст — серверная генерация недоступна.
      Либо вписать ключ в .env, либо ввести свой в интерфейсе (BYO-Key)."
  grep -q '^STRIPE_SECRET_KEY=..*' .env \
    || warn "STRIPE_SECRET_KEY пуст — пополнение и подписки отвечают 503.
      Для проверки платного пути поднимите стенд: bash $0 stand"
}

# Блок прокси в .env (2026-11-15). TRUST_PROXY выше — про ВХОДЯЩИЙ прокси
# (Caddy перед сервером), этот блок — про ИСХОДЯЩИЙ (сервер → Anthropic,
# Stripe). Пишется только при найденном прокси, держится между метками и
# правится целиком; чужой HTTPS_PROXY вне меток не трогается.
strip_proxy_block() {
  awk -v b="$ENV_BLOCK_BEGIN" -v e="$ENV_BLOCK_END" \
    '$0==b{f=1;next} f&&$0==e{f=0;next} !f' .env > .env.tmp && mv .env.tmp .env
}

step_proxy_dotenv() {
  local have; have="$(dotenv_proxy)"
  if [ "$PROXY_SRC" = "off" ]; then
    if grep -qxF "$ENV_BLOCK_BEGIN" .env; then
      strip_proxy_block; ok "блок прокси убран из .env (PHILOSYNTH_PROXY=off) — сервер ходит напрямую"
    else
      skip "блока прокси в .env нет"
    fi
    return
  fi
  if [ -z "$PROXY_URL" ]; then
    skip "исходящего прокси нет — сервер ходит наружу напрямую"
    return
  fi
  if [ -z "$have" ] && grep -q '^HTTPS_PROXY=' .env; then
    skip "в .env свой HTTPS_PROXY вне блока скрипта — не трогаю (NODE_USE_ENV_PROXY=1 там же?)"
    return
  fi
  if [ "$have" = "$PROXY_URL" ]; then
    skip "прокси в .env: $(mask_url "$PROXY_URL")"
    return
  fi
  strip_proxy_block
  # Серверу нужен только HTTPS_PROXY: к Anthropic и Stripe он ходит по https.
  # пустая строка-отбивка — только если её ещё нет (иначе каждый цикл off/on копил бы их)
  [ -n "$(tail -n 1 .env)" ] && printf '\n' >> .env
  printf '%s\n# Только для своей сети. На хостинге блока быть не должно (philosynth-hosting.md §3).\nHTTPS_PROXY=%s\nNO_PROXY=%s\nNODE_USE_ENV_PROXY=1\n%s\n' \
    "$ENV_BLOCK_BEGIN" "$PROXY_URL" "$NO_PROXY_LOCAL" "$ENV_BLOCK_END" >> .env
  ok "в .env записан исходящий прокси $(mask_url "$PROXY_URL") (из: $PROXY_SRC) + NODE_USE_ENV_PROXY=1"
}

# Выход к API Anthropic — тем же путём, что у сервера: node, встроенный
# fetch, окружение из .env. Ключ не шлётся; 401 значит «дошли».
step_egress() {
  head_ "Выход к API Anthropic"
  cd "$REPO_DIR"
  command -v node >/dev/null 2>&1 || { skip "node ещё нет — проверю в следующий раз"; return; }
  local res code
  res="$(set -a; . ./.env; set +a; node -e '
    const base = (process.env.ANTHROPIC_BASE_URL || "https://api.anthropic.com").replace(/\/$/, "");
    fetch(base + "/v1/messages", { method: "POST", body: "{}",
      headers: { "content-type": "application/json", "anthropic-version": "2023-06-01" },
      signal: AbortSignal.timeout(20000) })
    .then(async r => console.log(r.status + " " + (await r.text()).slice(0, 160).replace(/\s+/g, " ")))
    .catch(e => console.log("ERR " + (e.cause?.code || e.name || e.message)));
  ' 2>/dev/null || echo "ERR node")"
  code="${res%% *}"
  local via="напрямую"
  grep -q '^NODE_USE_ENV_PROXY=1' .env && via="через прокси из .env"
  case "$code" in
    401) ok "API Anthropic достижим $via (401 без ключа — так и должно быть)" ;;
    403) warn "API Anthropic ответил 403 ($via): ${res#* }
      Обычно это отказ по стране выхода. Своя сеть за прокси — задайте его:
      PHILOSYNTH_PROXY=http://адрес:порт bash $0   (у VirtualBox NAT хост — 10.0.2.2)" ;;
    ERR) warn "до API Anthropic не дошли ($via): ${res#ERR }
      Проверьте прокси (bash $0 doctor) или ANTHROPIC_BASE_URL в .env" ;;
    *)   ok "API Anthropic отвечает $via (код $code)" ;;
  esac
}

# ── 6. Зависимости ───────────────────────────────────────────────────────
canvas_loads() { ( cd "$REPO_DIR" && node -e 'require("canvas").createCanvas(2,2)' ) >/dev/null 2>&1; }

step_npm() {
  head_ "npm install"
  cd "$REPO_DIR"
  if [ -d node_modules ] && canvas_loads; then
    skip "зависимости на месте, canvas грузится"
    return
  fi
  npm install --no-audit --no-fund
  # Без рабочего canvas сервер НЕ СТАРТУЕТ вовсе: index.ts статически тянет
  # routes/export.ts → services/export/png-exporter.ts → import "canvas".
  canvas_loads || die "canvas не грузится. Обычно не хватает системной
      библиотеки: проверьте, что стоят libcairo2-dev, libpango1.0-dev,
      librsvg2-dev, и повторите npm rebuild canvas"
  ok "зависимости установлены, canvas грузится"
}

# ── 7. Схема и наполнение ────────────────────────────────────────────────
psql_db() { PGPASSWORD="$DB_PASS" psql -h 127.0.0.1 -U "$DB_ROLE" -d "$DB_NAME" "$@"; }

step_db_content() {
  head_ "Схема и наполнение"
  cd "$REPO_DIR"
  set -a; . ./.env; set +a

  npx --yes drizzle-kit migrate
  ok "миграции применены — 0000_initial … 0020 (drizzle ведёт учёт сам,
      повторный прогон no-op). 0004 — admin_audit (8.1), 0005 — ступень
      видимости вместо is_public (8.6), 0006 — почта: auth_tokens и
      mail_outbox (9.1), 0007 — рекомендации критики (10.1), 0008 — дерево
      генеалогии импортированного файла, 0009 — происхождение версии элемента
      (10.2), 0010 — язык интерфейса (11.2), 0011 — метка тезиса (12.1),
      0012 — замечание сторожа рекомендаций, 0013 — его находки кодами (12.3),
      0014 — уникальная пара родословной (15.1), 0015 — довод смены адреса (15.3), 0016 — редакции тарифов family/edition (15.4), 0017 — обсуждение и рецензии (16.1), 0018 — участники и уведомления (16.2)"

  # 18.1: индекс поиска концепций наполняет скрипт, а не миграция 0020 —
  # текст капсулы снимает тот же код, что зовут писатели. Идемпотентен:
  # на пустой базе — «концепций: 0», после обновления дописывает недостающее.
  npm run search:reindex -- --missing
  ok "индекс поиска концепций наполнен (npm run search:reindex)"

  # 12.3 (Д-18): вывод сидов копится — в нём строка о сбросе кэша реестра
  # (pipefail включён: отказ сида по-прежнему роняет шаг)
  local seed_log
  seed_log="$(mktemp)"
  npm run seed:prompts  2>&1 | tee -a "$seed_log"
  npm run seed:configs  2>&1 | tee -a "$seed_log"
  npm run seed:taxonomy 2>&1 | tee -a "$seed_log"
  ok "сиды прогнаны (264 шаблона, 27 конфигов, 18+29 типов таксономии)"

  # Кэш реестра шаблонов и конфигов в Redis БЕССРОЧНЫЙ (10.1). С 12.3 (Д-18)
  # сиды сбрасывают ключи, которые изменили, сами — работающий сервер читает
  # новые версии без перезапуска, и предупреждать не о чем. Громко — только
  # если сид сказал, что кэш НЕ сброшен (Redis был недоступен посеву), а
  # сервер при этом отвечает: он остался бы на прежних версиях при новом коде
  # (dev-сервер под tsx watch перезапускается на `git pull`, то есть ДО посева).
  # 0008: новый код читает syntheses.file_genealogy во всех выборках строки
  # синтеза — между `git pull` и миграцией запущенный сервер отвечал ошибкой
  # «column does not exist» на всё, что касается синтезов (health при этом
  # зелёный: он таблиц не трогает). После миграции ошибки уходят сами —
  # поэтому `stop` перед `git pull` остаётся первым шагом обновления.
  if grep -q "НЕ сброшен\|НЕ ПОЛНОСТЬЮ" "$seed_log"; then
    if curl -fsS "http://127.0.0.1:$PORT_SERVER/api/v1/health" >/dev/null 2>&1; then
      warn "посев НЕ сбросил кэш реестра (см. строку «⚠ Кэш …» выше), а сервер
      запущен: посеянные версии шаблонов и конфигов он увидит только после
      перезапуска —  bash $0 stop && bash $0 start"
    else
      warn "посев не сбросил кэш реестра (Redis был недоступен). Сервер не
      запущен — при старте он прогреет кэш заново, делать ничего не нужно"
    fi
  fi
  rm -f "$seed_log"

  npm run seed:plans
  ok "тарифы посеяны (3 плана; активны только при заданных STRIPE_PRICE_*)"
  # 15.4 (Д-74/Д-75): сид создаёт ОТСУТСТВУЮЩИЕ планы и не переписывает
  # существующие — после первого посева тарифы правятся админкой (вкладка
  # «Тарифы» на /admin/prompts): название и «открыт для покупки» на месте,
  # цена/период/квоты — на месте без живых подписок, иначе «Новая редакция».
  # Правка server/config/plans.ts или STRIPE_PRICE_* после посева ничего не
  # меняет — сид лишь напечатает предупреждение о расхождении. Привести
  # цены стоящей службы к plans.ts — вручную: npm run plans:sync (показ),
  # затем -- --apply (2026-11-25; меняет цены в Stripe — не автоматом).

  local admins
  admins="$(psql_db -tAc "select count(*) from users where role = 'admin'" 2>/dev/null || echo "?")"
  if [ "$admins" = "0" ]; then
    warn "администраторов в базе НЕТ. Роль admin иначе не получить — ни
      регистрацией, ни правкой в интерфейсе. Заведите: bash $0 admin"
  else
    skip "администраторы есть ($admins)"
  fi
}

# ── 8. Первый администратор (беседа 8.1) ─────────────────────────────────
step_admin() {
  head_ "Первый администратор"
  cd "$REPO_DIR"
  set -a; . ./.env; set +a

  local email pass pass2
  printf '  email администратора: '; read -r email
  [ -n "$email" ] || die "email не задан"
  printf '  пароль (не отображается, минимум 8 знаков): '
  stty -echo 2>/dev/null || true; read -r pass; stty echo 2>/dev/null || true; printf '\n'
  printf '  пароль ещё раз: '
  stty -echo 2>/dev/null || true; read -r pass2; stty echo 2>/dev/null || true; printf '\n'
  [ "$pass" = "$pass2" ] || die "пароли не совпали"

  # Пароль уходит ПЕРЕМЕННОЙ, а не доводом: довод виден в списке процессов
  # и оседает в истории оболочки (bootstrap-admin.ts требует именно так).
  BOOTSTRAP_ADMIN_EMAIL="$email" BOOTSTRAP_ADMIN_PASSWORD="$pass" npm run seed:admin || \
    die "seed:admin отказал — читайте его сообщение выше"

  # Код возврата 0 доказательством НЕ считается: при переезде скрипта в
  # подпапку его сторож isDirectRun перестал узнавать собственный путь,
  # main() не запускался, а выход был нулевым — и обёртка бодро врала
  # «администратор заведён». Спрашиваем базу.
  local n
  n="$(psql_db -tAc "select count(*) from users where role='admin' and email='$email'" 2>/dev/null || echo 0)"
  if [ "$n" = "1" ]; then
    ok "администратор $email есть в базе, роль admin"
    printf '    Следующих назначайте вкладкой «Доступ» в /admin/prompts:\n'
    printf '    вторым прогоном скрипта второго администратора НЕ завести.\n'
  else
    die "seed:admin отработал без ошибки, но администратора $email в базе НЕТ.
      Это не ваша опечатка — это поломка скрипта; смотрите его вывод выше"
  fi
  unset pass pass2
}

# ── 9. Стенд биллинга (беседа 8.2) ───────────────────────────────────────
step_stand() {
  head_ "Стенд биллинга"
  cd "$REPO_DIR"
  [ -f tools/dev-billing.sh ] || die "tools/dev-billing.sh нет — репозиторий старше 8.2"
  bash tools/dev-billing.sh "${1:-}" || die "dev-billing.sh отказал"
  ok "стенд: доводы --stop и --status уходят в dev-billing.sh как есть"
}

# ── 10. Приёмка ──────────────────────────────────────────────────────────
# То, чего нет на телефоне. Здесь Chrome есть, значит браузерные тесты идут,
# и правило «правка исходника заканчивается приёмкой» исполнимо.
step_accept() {
  head_ "Приёмка"
  cd "$REPO_DIR"
  [ -x "$(chrome_path)" ] || warn "Chrome ${CHROME_VERSION} не на месте —
      браузерные тесты не пойдут: bash $0 setup поставит"

  npm run typecheck        && ok "typecheck чист"        || die "typecheck не прошёл"
  npm run typecheck:scripts && ok "typecheck:scripts чист" || die "typecheck:scripts не прошёл"
  npm run check:dotfiles   && ok "check:dotfiles"        || die "check:dotfiles не прошёл"
  python3 scripts/checks/check-map-04.py  && ok "карта 04 сходится" || warn "check-map-04 ругается"
  python3 scripts/checks/css-parity-audit.py && ok "css-parity" || warn "css-parity ругается"

  printf '\n  Браузерные наборы запускайте по одному, они небыстрые:\n'
  printf '    node tests/test-87-requests2-12.mjs   # витрина и гостевой доступ\n'
  printf '    node tests/test-86-requests2-14.mjs   # модель публичности\n'
  printf '    node tests/test-84-requests2-10.mjs   # управление содержимым\n'
  printf '  Каждому нужен живой сервер на :%s и vite — поднимите start.\n' "$PORT_SERVER"
}

# ── 11. Старт / стоп / состояние ─────────────────────────────────────────
PID_SERVER="$REPO_DIR/.ubuntu-server.pid"
PID_CLIENT="$REPO_DIR/.ubuntu-client.pid"
alive() { [ -f "$1" ] && kill -0 "$(cat "$1")" 2>/dev/null; }

cmd_start() {
  cd "$REPO_DIR"
  mkdir -p logs
  step_postgres
  step_redis
  canvas_loads || warn "canvas не грузится — сервер не поднимется (bash $0 setup)"

  if has_systemd && systemctl is-enabled philosynth-server >/dev/null 2>&1; then
    $SUDO systemctl start philosynth-server philosynth-client
    ok "службы systemd подняты (journalctl -u philosynth-server -f)"
  else
    set -a; . ./.env; set +a
    if alive "$PID_SERVER"; then
      skip "dev:server уже запущен (pid $(cat "$PID_SERVER"))"
    else
      setsid nohup npm run dev:server > logs/server.log 2>&1 &
      echo $! > "$PID_SERVER"; ok "dev:server → :$PORT_SERVER (logs/server.log)"
    fi
    if alive "$PID_CLIENT"; then
      skip "dev:client уже запущен (pid $(cat "$PID_CLIENT"))"
    else
      setsid nohup npm run dev -w client -- --host > logs/client.log 2>&1 &
      echo $! > "$PID_CLIENT"; ok "dev:client → :$PORT_CLIENT (logs/client.log)"
    fi
  fi

  sleep 5
  if curl -fsS "http://127.0.0.1:$PORT_SERVER/api/v1/health" >/dev/null 2>&1; then
    ok "health-check отвечает"
  else
    warn "health-check молчит — tsx поднимается небыстро, смотрите logs/server.log"
  fi

  printf '\n    Локально:  \033[1mhttp://127.0.0.1:%s\033[0m\n' "$PORT_CLIENT"
  local lan; lan="$(hostname -I 2>/dev/null | awk '{print $1}')"
  [ -n "$lan" ] && printf '    В сети:    http://%s:%s\n' "$lan" "$PORT_CLIENT"
  printf '\n    Без входа открыты «/», «/explore» и «/synthesis/:id» (8.6/8.7).\n'
  printf '    Гостю не показываются стоимость, токены, логи и запросы к\n'
  printf '    модели — это потолок, а не настройка автора.\n'
}

cmd_stop() {
  cd "$REPO_DIR" 2>/dev/null || true
  if has_systemd && systemctl is-active philosynth-server >/dev/null 2>&1; then
    $SUDO systemctl stop philosynth-server philosynth-client || true
    ok "службы systemd остановлены"
  fi
  for p in "$PID_CLIENT" "$PID_SERVER"; do
    if alive "$p"; then
      # Гасим ПРОЦЕССНУЮ ГРУППУ, а не одиночный pid: npm рождает внука
      # (npm → sh → vite), и убийство родителя оставляет vite держать порт.
      # Ровно так и вышло: старый vite на 127.0.0.1:5173 пережил stop, новый
      # уехал на 5174, а проброс VirtualBox смотрел на 5173.
      local pid; pid="$(cat "$p")"
      kill -- -"$pid" 2>/dev/null || kill "$pid" 2>/dev/null || true
      sleep 2
      kill -0 "$pid" 2>/dev/null && { kill -9 -- -"$pid" 2>/dev/null || true; }
      rm -f "$p"; ok "остановлен $(basename "$p" .pid)"
    else
      skip "$(basename "$p" .pid) не запущен"
    fi
  done
  # Заслон: если порт остался занят, следующий запуск уедет на 5174, и
  # проброс VirtualBox (он смотрит строго на 5173) упрётся в чужой процесс.
  local busy
  busy="$( (ss -ltnp 2>/dev/null || true) | grep -E ":($PORT_CLIENT|$PORT_SERVER)\b" || true)"
  if [ -n "$busy" ]; then
    warn "порт ещё занят — следующий запуск уедет на соседний:
$busy
      Снимите вручную: kill <pid> (или kill -9), затем повторите start"
  else
    ok "порты $PORT_SERVER и $PORT_CLIENT свободны"
  fi

  printf '  PostgreSQL и Redis НЕ гашу: они системные службы, их держат\n'
  printf '  другие потребители. Нужно — systemctl stop postgresql redis-server\n'
}

cmd_status() {
  head_ "Состояние"
  pg_running && ok "postgres отвечает" || skip "postgres не запущен"
  redis-cli ping >/dev/null 2>&1 && ok "redis отвечает" || skip "redis не запущен"
  canvas_loads && ok "canvas грузится" || skip "canvas не собран"
  [ -x "$(chrome_path)" ] && ok "Chrome ${CHROME_VERSION} на месте" \
                          || skip "Chrome ${CHROME_VERSION} нет — браузерная приёмка не пойдёт"

  if has_systemd && systemctl is-enabled philosynth-server >/dev/null 2>&1; then
    systemctl is-active philosynth-server >/dev/null 2>&1 \
      && ok "служба philosynth-server активна" || skip "служба philosynth-server не активна"
  else
    alive "$PID_SERVER" && ok "dev:server pid $(cat "$PID_SERVER")" || skip "dev:server не запущен"
    alive "$PID_CLIENT" && ok "dev:client pid $(cat "$PID_CLIENT")" || skip "dev:client не запущен"
  fi

  # Две вещи, отсутствие которых выглядит как «ничего не работает», а на
  # деле значит «установка не доделана».
  if pg_running; then
    local admins plans
    admins="$(psql_db -tAc "select count(*) from users where role='admin'" 2>/dev/null || echo "?")"
    plans="$(psql_db -tAc "select count(*) from subscription_plans where is_active" 2>/dev/null || echo "?")"
    [ "$admins" = "0" ] && warn "администраторов нет — bash $0 admin" || ok "администраторов: $admins"
    [ "$plans" = "0" ] && skip "активных тарифов нет: раздел подписки пуст, пока
      не заведены STRIPE_PRICE_* (npm run stripe:create-prices)" \
                       || ok "активных тарифов: $plans"
  fi
}

# ── 12. systemd ──────────────────────────────────────────────────────────
step_systemd() {
  head_ "Автозапуск"
  has_systemd || die "systemd нет — автозапуск завести нечем (контейнер?).
      Держите процессы через start, они переживут выход из сессии, но не
      перезагрузку."
  cd "$REPO_DIR"
  local user; user="$(id -un)"

  for unit in server client; do
    local f="/etc/systemd/system/philosynth-${unit}.service"
    if [ -f "$f" ]; then skip "$f уже есть"; continue; fi
    $SUDO tee "$f" >/dev/null <<EOF
[Unit]
Description=PhiloSynth ${unit}
After=network.target postgresql.service redis-server.service
Wants=postgresql.service redis-server.service

[Service]
Type=simple
User=${user}
WorkingDirectory=${REPO_DIR}
EnvironmentFile=${REPO_DIR}/.env
ExecStart=/usr/bin/npm run dev:${unit}
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
    ok "заведена служба philosynth-${unit}"
  done

  $SUDO systemctl daemon-reload
  $SUDO systemctl enable philosynth-server philosynth-client >/dev/null 2>&1
  ok "автозапуск включён (journalctl -u philosynth-server -f)"
  warn "EnvironmentFile читает .env построчно и НЕ понимает кавычек и
      подстановок — значение с пробелом или с \$ приедет не тем, чем
      выглядит. Держите в .env простые значения."
}

summary() { printf '\n\033[1mИтог:\033[0m created=%d skip=%d fail=%d\n' "$n_created" "$n_skip" "$n_fail"; }

# ── main ─────────────────────────────────────────────────────────────────
resolve_proxy

case "${1:-setup}" in
  setup)
    doctor; step_packages; step_postgres; step_redis
    step_repo; step_npm; step_egress; step_chrome; step_db_content
    summary
    printf '\nДальше:  bash %s start\n' "$0"
    printf 'И один раз: bash %s admin  — без администратора недостижимы\n' "$0"
    printf '            страница промптов и правка каталогов типов.\n'
    ;;
  start)   cmd_start;   summary ;;
  stop)    cmd_stop;    summary ;;
  status)  cmd_status; step_egress; summary ;;
  doctor)  doctor;      summary ;;
  admin)   step_admin;  summary ;;
  stand)   shift; step_stand "${1:-}"; summary ;;
  accept)  step_accept; summary ;;
  systemd) step_systemd; summary ;;
  *) printf 'Использование: bash %s [setup|start|stop|status|doctor|admin|stand|accept|systemd]\n' "$0"; exit 2 ;;
esac
