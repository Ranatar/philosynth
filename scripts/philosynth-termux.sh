#!/data/data/com.termux/files/usr/bin/bash
#
# philosynth-termux.sh — идемпотентный бутстрап PhiloSynth Service в Termux.
#
#   bash philosynth-termux.sh            полная установка (можно гонять повторно)
#   bash philosynth-termux.sh start      поднять демоны + dev-серверы
#   bash philosynth-termux.sh stop       остановить всё
#   bash philosynth-termux.sh status     что сейчас живо
#   bash philosynth-termux.sh doctor     только диагностика окружения
#
# Отчёт в стиле патч-скриптов доков: created / skip / fail.
# Повторный прогон на готовой машине обязан дать одни skip.

set -euo pipefail

# ── Параметры ────────────────────────────────────────────────────────────
REPO_URL="${REPO_URL:-https://github.com/Ranatar/philosynth.git}"
REPO_DIR="${REPO_DIR:-$HOME/philosynth}"
PGDATA="${PGDATA:-$PREFIX/var/lib/postgresql}"
REDIS_DIR="$PREFIX/var/lib/redis"
LOG_DIR="$PREFIX/var/log"
DB_NAME="philosynth"
DB_ROLE="philosynth"
DB_PASS="philosynth_dev"          # обязан совпадать с дефолтом server/env.ts
NODE_MIN_MAJOR=22
NODE_MIN_MINOR=18
PKGS="postgresql redis git python curl"

export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=2048}"

C_OK=$'\033[32m'; C_SKIP=$'\033[90m'; C_WARN=$'\033[33m'; C_ERR=$'\033[31m'; C_0=$'\033[0m'
n_created=0; n_skip=0; n_fail=0
ok()   { printf '%s  ✓ %s%s\n'  "$C_OK"   "$1" "$C_0"; n_created=$((n_created+1)); }
skip() { printf '%s  ~ %s%s\n'  "$C_SKIP" "$1" "$C_0"; n_skip=$((n_skip+1)); }
warn() { printf '%s  ! %s%s\n'  "$C_WARN" "$1" "$C_0"; }
die()  { printf '%s  ✗ %s%s\n'  "$C_ERR"  "$1" "$C_0"; n_fail=$((n_fail+1)); exit 1; }
head_() { printf '\n\033[1m── %s\033[0m\n' "$1"; }

# ── 0. Диагностика окружения ─────────────────────────────────────────────
doctor() {
  head_ "Окружение"

  [ -n "${PREFIX:-}" ] && [ -d "$PREFIX" ] \
    || die "PREFIX не задан — это не Termux"
  printf '    Termux PREFIX: %s\n' "$PREFIX"

  local arch; arch="$(uname -m)"
  printf '    Архитектура:   %s\n' "$arch"
  case "$arch" in
    aarch64|x86_64) : ;;
    *) warn "esbuild/rollup публикуют android-arm64, android-arm и android-x64;
      на $arch пребилдов может не быть — vite/tsx не заведутся" ;;
  esac

  local mem_kb mem_gb
  mem_kb="$(awk '/MemTotal/{print $2}' /proc/meminfo 2>/dev/null || echo 0)"
  mem_gb=$((mem_kb / 1024 / 1024))
  printf '    RAM:           ~%s ГБ\n' "$mem_gb"
  [ "$mem_gb" -lt 5 ] && warn "меньше 6 ГБ: 'tsc -b' и 'vite build' вероятно упрутся в OOM.
      Dev-режим (tsx watch + vite dev) обычно проходит. NODE_OPTIONS уже = $NODE_OPTIONS"

  # df на Android возвращает ненулевой код из-за недоступных точек монтирования
  # (stderr скрыт, но статус остаётся) — с pipefail+errexit это молча убивало скрипт.
  # -Pk вместо -Pm: -m не POSIX, у toybox-df его может не быть.
  local free_kb free_mb
  free_kb="$(df -Pk "$HOME" 2>/dev/null | awk 'NR==2{print $4}')" || free_kb=""
  if [ -n "$free_kb" ]; then free_mb=$((free_kb / 1024)); else free_mb="?"; fi
  printf '    Свободно:      %s МБ (нужно ~1500 под node_modules + БД)\n' "$free_mb"

  local rel; rel="$(getprop ro.build.version.release 2>/dev/null || echo '?')"
  local sdk; sdk="$(getprop ro.build.version.sdk 2>/dev/null || echo 0)"
  printf '    Android:       %s (SDK %s)\n' "$rel" "$sdk"
  if [ "$sdk" -ge 31 ] 2>/dev/null; then
    warn "Android 12+: phantom process killer прибивает фоновые процессы Termux.
      У нас их четыре (postgres, redis, tsx watch, vite). Отключить с ПК по adb:
        adb shell settings put global settings_enable_monitor_phantom_procs false
      Без этого падения будут выглядеть как случайные."
  fi

  case "$(realpath "$HOME" 2>/dev/null || echo "$HOME")" in
    /storage/*|/sdcard/*) die "HOME на /sdcard — там нет POSIX-прав, initdb не отработает" ;;
  esac
}

# ── 1. Пакеты Termux ─────────────────────────────────────────────────────
node_ok() {
  command -v node >/dev/null 2>&1 || return 1
  local v maj min
  v="$(node -v)"; v="${v#v}"
  maj="${v%%.*}"; min="${v#*.}"; min="${min%%.*}"
  [ "$maj" -gt "$NODE_MIN_MAJOR" ] && return 0
  [ "$maj" -eq "$NODE_MIN_MAJOR" ] && [ "$min" -ge "$NODE_MIN_MINOR" ] && return 0
  return 1
}

step_packages() {
  head_ "Пакеты"

  if node_ok; then
    skip "node $(node -v) — требование репозитория >=$NODE_MIN_MAJOR.$NODE_MIN_MINOR выполнено"
  else
    if command -v node >/dev/null 2>&1; then
      die "node $(node -v) слишком стар (нужен >=$NODE_MIN_MAJOR.$NODE_MIN_MINOR:
      shared экспортирует .ts напрямую, это работает только через type stripping).
      Обновить:  pkg uninstall nodejs nodejs-lts && pkg install nodejs-lts"
    fi
    pkg install -y nodejs-lts >/dev/null 2>&1 || pkg install -y nodejs-lts
    node_ok || die "после установки node всё ещё < $NODE_MIN_MAJOR.$NODE_MIN_MINOR"
    ok "установлен node $(node -v)"
  fi

  command -v npm >/dev/null 2>&1 || { pkg install -y npm >/dev/null 2>&1; ok "установлен npm"; }

  local missing=""
  for p in $PKGS; do
    dpkg -s "$p" >/dev/null 2>&1 || missing="$missing $p"
  done
  if [ -n "$missing" ]; then
    printf '    ставлю:%s\n' "$missing"
    # shellcheck disable=SC2086
    pkg install -y $missing
    ok "пакеты установлены:$missing"
  else
    skip "postgresql / redis / git / python уже стоят"
  fi

  printf '    postgres %s · redis %s\n' \
    "$(postgres --version 2>/dev/null | awk '{print $3}')" \
    "$(redis-server --version 2>/dev/null | sed 's/.*v=\([^ ]*\).*/\1/')"
}

# ── 2. PostgreSQL ────────────────────────────────────────────────────────
pg_running() { pg_ctl -D "$PGDATA" status >/dev/null 2>&1; }

step_postgres() {
  head_ "PostgreSQL"

  if [ -f "$PGDATA/PG_VERSION" ]; then
    skip "кластер уже инициализирован ($PGDATA, PG $(cat "$PGDATA/PG_VERSION"))"
  else
    mkdir -p "$PGDATA" "$LOG_DIR"
    # ICU-провайдер даёт вменяемую сортировку кириллицы; Termux собирает PG с --with-icu.
    # Если провайдер недоступен — откат на C (побайтовая сортировка, для dev годится).
    if initdb -D "$PGDATA" --encoding=UTF8 \
         --locale-provider=icu --icu-locale=ru-RU \
         --auth-local=trust --auth-host=scram-sha-256 >/dev/null 2>&1; then
      ok "initdb выполнен (collation: ICU ru-RU)"
    elif initdb -D "$PGDATA" --encoding=UTF8 --locale=C \
         --auth-local=trust --auth-host=scram-sha-256 >/dev/null 2>&1; then
      ok "initdb выполнен (collation: C — ICU недоступен, кириллица сортируется побайтово)"
    else
      die "initdb не отработал; лог: $LOG_DIR/pg.log"
    fi
  fi

  if pg_running; then
    skip "сервер уже слушает"
  else
    pg_ctl -D "$PGDATA" -l "$LOG_DIR/pg.log" -o "-p 5432" -w start >/dev/null 2>&1 \
      || die "postgres не поднялся; смотрите $LOG_DIR/pg.log"
    ok "сервер поднят (лог: $LOG_DIR/pg.log)"
  fi

  # Роль. Суперюзер по умолчанию — текущий android-uid, не 'postgres'.
  if psql -d postgres -tAc "SELECT 1 FROM pg_roles WHERE rolname='$DB_ROLE'" | grep -q 1; then
    skip "роль $DB_ROLE существует"
  else
    createuser -s "$DB_ROLE"
    ok "создана роль $DB_ROLE (superuser — нужен для CREATE EXTENSION pg_trgm)"
  fi
  psql -d postgres -qc "ALTER ROLE $DB_ROLE PASSWORD '$DB_PASS'" >/dev/null

  if psql -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'" | grep -q 1; then
    skip "БД $DB_NAME существует"
  else
    createdb -O "$DB_ROLE" "$DB_NAME"
    ok "создана БД $DB_NAME"
  fi

  # Тот самый риск, ради которого всё затевалось: contrib в сборке Termux есть.
  if psql -d "$DB_NAME" -tAc \
       "SELECT 1 FROM pg_available_extensions WHERE name='pg_trgm'" | grep -q 1; then
    skip "pg_trgm доступен (миграция 0000 его создаёт)"
  else
    die "pg_trgm не найден — сборка postgresql без contrib, миграция 0000 упадёт"
  fi
}

# ── 3. Redis ─────────────────────────────────────────────────────────────
step_redis() {
  head_ "Redis"
  if redis-cli ping >/dev/null 2>&1; then
    skip "уже отвечает на PING"
    return
  fi
  mkdir -p "$REDIS_DIR" "$LOG_DIR"
  # Персистентность выключена намеренно: Redis здесь кэш Registry, rate-limiter
  # и reconnect-буфер стрима — всё fail-open. Меньше износ флеша.
  redis-server --daemonize yes --dir "$REDIS_DIR" \
    --logfile "$LOG_DIR/redis.log" --save '' --appendonly no
  sleep 1
  redis-cli ping >/dev/null 2>&1 || die "redis не поднялся; лог: $LOG_DIR/redis.log"
  ok "поднят (без персистентности, лог: $LOG_DIR/redis.log)"
}

# ── 4. Репозиторий ───────────────────────────────────────────────────────
step_repo() {
  head_ "Репозиторий"
  if [ -d "$REPO_DIR/.git" ]; then
    skip "$REPO_DIR уже склонирован (git pull делаю НЕ я — локальные правки дороже)"
  else
    git clone "$REPO_URL" "$REPO_DIR"
    ok "склонирован в $REPO_DIR"
  fi
  cd "$REPO_DIR"

  if [ -f .env ]; then
    skip ".env на месте"
  else
    cp .env.example .env
    ok ".env создан из .env.example (ANTHROPIC_API_KEY пуст — генерация недоступна,
      остальное работает; вписать позже)"
  fi
}

# ── 5. Зависимости ───────────────────────────────────────────────────────
step_npm() {
  head_ "npm install"
  cd "$REPO_DIR"
  local stamp=".termux-npm-stamp" cur
  cur="$(sha256sum package-lock.json | awk '{print $1}')" || cur="?"
  if [ -d node_modules ] && [ -f "$stamp" ] && [ "$(cat "$stamp")" = "$cur" ]; then
    skip "node_modules соответствуют package-lock.json"
    return
  fi
  printf '    15–30 минут, ~1 ГБ. Нативные части — только esbuild и rollup,\n'
  printf '    их android-пребилды уже прописаны в lock-файле; компилировать нечего.\n'
  npm install
  echo "$cur" > "$stamp"
  ok "зависимости установлены"
}

# ── 6. Миграция и сиды ───────────────────────────────────────────────────
step_db_content() {
  head_ "Схема и сиды"
  cd "$REPO_DIR"
  set -a; . ./.env; set +a          # сиды читают process.env, .env знает только drizzle-kit

  npx --yes drizzle-kit migrate
  ok "миграции применены (drizzle ведёт учёт сам — повторный прогон no-op)"

  # Сиды идемпотентны по построению: created/updated/skip/fail.
  npm run seed:prompts
  npm run seed:configs
  npm run seed:taxonomy
  ok "сиды прогнаны (253 шаблона, 27 конфигов, 18+29 типов таксономии)"
}

# ── 7. Старт / стоп / статус ─────────────────────────────────────────────
PID_SERVER="$REPO_DIR/.termux-server.pid"
PID_CLIENT="$REPO_DIR/.termux-client.pid"

alive() { [ -f "$1" ] && kill -0 "$(cat "$1")" 2>/dev/null; }

cmd_start() {
  cd "$REPO_DIR"
  mkdir -p logs
  step_postgres                   # оба шага идемпотентны — на живой системе дадут skip
  step_redis

  command -v termux-wake-lock >/dev/null 2>&1 && termux-wake-lock || true

  set -a; . ./.env; set +a

  if alive "$PID_SERVER"; then
    skip "dev:server уже запущен (pid $(cat "$PID_SERVER"))"
  else
    nohup npm run dev:server > logs/server.log 2>&1 &
    echo $! > "$PID_SERVER"
    ok "dev:server → http://localhost:3000  (logs/server.log)"
  fi

  if alive "$PID_CLIENT"; then
    skip "dev:client уже запущен (pid $(cat "$PID_CLIENT"))"
  else
    nohup npm run dev:client > logs/client.log 2>&1 &
    echo $! > "$PID_CLIENT"
    ok "dev:client → http://localhost:5173  (logs/client.log)"
  fi

  sleep 4
  if curl -fsS http://localhost:3000/api/v1/health >/dev/null 2>&1; then
    ok "health-check отвечает: $(curl -fsS http://localhost:3000/api/v1/health)"
  else
    warn "health-check пока молчит — tsx поднимается небыстро, смотрите logs/server.log"
  fi
  printf '\n    Открывайте в браузере телефона: \033[1mhttp://localhost:5173\033[0m\n'
  printf '    С другого устройства в той же сети: npm run dev:client -- --host\n'
}

cmd_stop() {
  cd "$REPO_DIR" 2>/dev/null || true
  for p in "$PID_CLIENT" "$PID_SERVER"; do
    if alive "$p"; then
      pkill -P "$(cat "$p")" 2>/dev/null || true
      kill "$(cat "$p")" 2>/dev/null || true
      rm -f "$p"; ok "остановлен $(basename "$p" .pid)"
    else
      skip "$(basename "$p" .pid) не запущен"
    fi
  done
  redis-cli shutdown nosave >/dev/null 2>&1 && ok "redis остановлен" || skip "redis не запущен"
  pg_running && { pg_ctl -D "$PGDATA" -m fast stop >/dev/null; ok "postgres остановлен"; } \
             || skip "postgres не запущен"
  command -v termux-wake-unlock >/dev/null 2>&1 && termux-wake-unlock || true
}

cmd_status() {
  head_ "Статус"
  pg_running && ok "postgres слушает" || skip "postgres не запущен"
  redis-cli ping >/dev/null 2>&1 && ok "redis отвечает" || skip "redis не запущен"
  alive "$PID_SERVER" && ok "dev:server pid $(cat "$PID_SERVER")" || skip "dev:server не запущен"
  alive "$PID_CLIENT" && ok "dev:client pid $(cat "$PID_CLIENT")" || skip "dev:client не запущен"
}

summary() {
  printf '\n\033[1mИтог:\033[0m created=%d skip=%d fail=%d\n' "$n_created" "$n_skip" "$n_fail"
}

# ── main ─────────────────────────────────────────────────────────────────
case "${1:-setup}" in
  setup)
    doctor; step_packages; step_postgres; step_redis
    step_repo; step_npm; step_db_content
    summary
    printf '\nДальше:  bash %s start\n' "$0"
    ;;
  start)  cmd_start;  summary ;;
  stop)   cmd_stop;   summary ;;
  status) cmd_status; summary ;;
  doctor) doctor;     summary ;;
  *) printf 'Использование: bash %s [setup|start|stop|status|doctor]\n' "$0"; exit 2 ;;
esac
