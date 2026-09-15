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

# Пакеты: python3 и build-essential — для node-gyp, если пребилд canvas не
# подойдёт; cairo/pango/libpng/librsvg — самому canvas в любом случае.
APT_PKGS="postgresql redis-server git curl ca-certificates python3 build-essential \
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
    $SUDO apt-get update -qq
    # shellcheck disable=SC2086
    $SUDO apt-get install -y -qq $missing >/dev/null
    ok "поставлены:$missing"
  fi

  if node_ok; then
    skip "node $(node -v) годится"
  else
    # NodeSource, а не apt: в репозитории Ubuntu 24 лежит Node 18, а проекту
    # нужен 22.18+ (см. package.json engines).
    curl -fsSL https://deb.nodesource.com/setup_22.x | $SUDO -E bash - >/dev/null
    $SUDO apt-get install -y -qq nodejs >/dev/null
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

  grep -q '^ANTHROPIC_API_KEY=..*' .env \
    || warn "ANTHROPIC_API_KEY пуст — серверная генерация недоступна.
      Либо вписать ключ в .env, либо ввести свой в интерфейсе (BYO-Key)."
  grep -q '^STRIPE_SECRET_KEY=..*' .env \
    || warn "STRIPE_SECRET_KEY пуст — пополнение и подписки отвечают 503.
      Для проверки платного пути поднимите стенд: bash $0 stand"
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
  ok "миграции применены — 0000_initial … 0005 (drizzle ведёт учёт сам,
      повторный прогон no-op). 0004 — admin_audit (8.1), 0005 — ступень
      видимости вместо is_public (8.6)"

  npm run seed:prompts
  npm run seed:configs
  npm run seed:taxonomy
  ok "сиды прогнаны (261 шаблон, 27 конфигов, 18+29 типов таксономии)"

  npm run seed:plans
  ok "тарифы посеяны (3 плана; активны только при заданных STRIPE_PRICE_*)"

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
  if BOOTSTRAP_ADMIN_EMAIL="$email" BOOTSTRAP_ADMIN_PASSWORD="$pass" npm run seed:admin; then
    ok "администратор заведён или уже был (подробности выше)"
    printf '    Следующих назначайте вкладкой «Доступ» в /admin/prompts:\n'
    printf '    вторым прогоном скрипта второго администратора НЕ завести.\n'
  else
    die "seed:admin отказал — читайте его сообщение выше"
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
      nohup npm run dev:server > logs/server.log 2>&1 &
      echo $! > "$PID_SERVER"; ok "dev:server → :$PORT_SERVER (logs/server.log)"
    fi
    if alive "$PID_CLIENT"; then
      skip "dev:client уже запущен (pid $(cat "$PID_CLIENT"))"
    else
      nohup npm run dev -w client -- --host > logs/client.log 2>&1 &
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
  [ -n "$lan" ] && printf '    В сети:    http://%s:%s  (нужен npm run dev:client -- --host)\n' "$lan" "$PORT_CLIENT"
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
      pkill -P "$(cat "$p")" 2>/dev/null || true
      kill "$(cat "$p")" 2>/dev/null || true
      rm -f "$p"; ok "остановлен $(basename "$p" .pid)"
    else
      skip "$(basename "$p" .pid) не запущен"
    fi
  done
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
case "${1:-setup}" in
  setup)
    doctor; step_packages; step_postgres; step_redis
    step_repo; step_npm; step_chrome; step_db_content
    summary
    printf '\nДальше:  bash %s start\n' "$0"
    printf 'И один раз: bash %s admin  — без администратора недостижимы\n' "$0"
    printf '            страница промптов и правка каталогов типов.\n'
    ;;
  start)   cmd_start;   summary ;;
  stop)    cmd_stop;    summary ;;
  status)  cmd_status;  summary ;;
  doctor)  doctor;      summary ;;
  admin)   step_admin;  summary ;;
  stand)   shift; step_stand "${1:-}"; summary ;;
  accept)  step_accept; summary ;;
  systemd) step_systemd; summary ;;
  *) printf 'Использование: bash %s [setup|start|stop|status|doctor|admin|stand|accept|systemd]\n' "$0"; exit 2 ;;
esac
