#!/data/data/com.termux/files/usr/bin/bash
#
# philosynth-termux.sh — идемпотентный бутстрап PhiloSynth Service в Termux.
#
#   bash philosynth-termux.sh            полная установка (можно гонять повторно)
#   bash philosynth-termux.sh start      поднять демоны + dev-серверы
#   bash philosynth-termux.sh stop       остановить всё
#   bash philosynth-termux.sh status     что сейчас живо
#   bash philosynth-termux.sh doctor     только диагностика окружения
#   bash philosynth-termux.sh canvas     только сборка/проверка node-canvas
#   bash philosynth-termux.sh admin      завести первого администратора
#   bash philosynth-termux.sh stand      стенд биллинга без Stripe (мок 8.2)
#     … stand --stop / --status — как у tools/dev-billing.sh
#
# Отчёт в стиле патч-скриптов доков: created / skip / fail.
# Повторный прогон на готовой машине обязан дать одни skip.
#
# Ревизия 2026-09-21 (репозиторий после беседы 10.1):
#  - миграций ВОСЕМЬ (0000…0007): 0006 — почта (9.1), 0007 — рекомендации
#    критики (10.1); шаблонов 263 (10.1: + шаблон «Таблицы рекомендаций» и
#    шаблон её составления по готовой прозе). Прежняя ревизия отстала ещё на 9.1.
#  - ПОСЛЕ ПОСЕВА — ПЕРЕЗАПУСК. Кэш шаблонов и конфигов в Redis бессрочный,
#    посев его не сбрасывает; сервер идёт под `tsx watch` и на `git pull`
#    перезапускается сам — ДО посева. step_db_content предупреждает, если
#    сервер отвечает на health. Порядок обновления — в руководстве рядом.
#
# Ревизия 2026-09-15 (репозиторий после беседы 8.7, Фаза 8 закрыта):
#  - server зависит от canvas@3 (беседа 4.2, PNG-экспорт). Пребилдов под
#    android нет — аддон собирается из исходников; отсюда cairo/pango/
#    build-essential в пакетах и отдельный шаг сборки. Без собранного
#    canvas сервер НЕ СТАРТУЕТ вовсе: index.ts статически тянет
#    routes/export.ts → services/export/png-exporter.ts → import "canvas".
#  - .env: добавлена генерация API_KEY_ENCRYPTION_SECRET (BYO-Key, 6.1).
#  - счётчики сидов приведены к факту (261 шаблон).
#
# Что изменилось против ревизии 2026-09-08:
#  - ПЕРВЫЙ АДМИНИСТРАТОР (беседа 8.1). Роль admin иначе НЕ ПОЛУЧИТЬ: в
#    сервисе нет ни регистрации админом, ни ветки «первый вошедший».
#    Прежняя ревизия его не заводила, и на свежем телефоне страница
#    промптов и правка каталогов типов были недостижимы вовсе. Шаг
#    отдельный (step_admin) и НЕ входит в setup по умолчанию: пароль
#    спрашивается с клавиатуры, а setup может идти без человека.
#  - миграций теперь ШЕСТЬ (0000…0005): 0004 завела admin_audit (8.1),
#    0005 заменила is_public на ступень видимости и четыре флага (8.6).
#    Прежняя ревизия сообщала «0000 … 0003» — сообщение врало.
#  - гостевой вход (8.6/8.7): '/' отдаёт стартовую страницу, '/explore' —
#    публичный каталог, '/synthesis/:id' — публичную концепцию. Адрес в
#    домашней сети теперь можно дать кому угодно.
#  - стенд биллинга (8.2): tools/dev-billing.sh поднимает мок Stripe, и
#    пополнение с подписками щёлкаются без аккаунта Stripe.

set -euo pipefail

# ── Параметры ────────────────────────────────────────────────────────────
REPO_URL="${REPO_URL:-https://github.com/Ranatar/philosynth.git}"
REPO_DIR="${REPO_DIR:-$HOME/philosynth}"
# ${PREFIX:-}, а не $PREFIX: вне Termux переменной нет, и при set -u скрипт
# падал здесь «unbound variable», не доходя до внятной проверки в doctor.
PGDATA="${PGDATA:-${PREFIX:-}/var/lib/postgresql}"
REDIS_DIR="${PREFIX:-}/var/lib/redis"
LOG_DIR="${PREFIX:-}/var/log"
DB_NAME="philosynth"
DB_ROLE="philosynth"
DB_PASS="philosynth_dev"          # обязан совпадать с дефолтом server/env.ts
NODE_MIN_MAJOR=22
NODE_MIN_MINOR=18
# python и build-essential нужны node-gyp; libcairo/pango/libpng — самому canvas
# (в Termux пакет cairo называется libcairo; модуль pkg-config при этом — «cairo»).
PKGS="postgresql redis git python curl build-essential pkg-config libcairo pango libpng"

export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=2048}"
# Параллелизм сборки нативного аддона: телефону хватает двух заданий,
# иначе clang выедает память вместе с постгресом.
export JOBS="${JOBS:-2}"

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
      Dev-режим (tsx watch + vite dev) обычно проходит. Сборка canvas идёт
      в $JOBS задания — при OOM повторить с JOBS=1.
      NODE_OPTIONS уже = $NODE_OPTIONS"

  # df на Android возвращает ненулевой код из-за недоступных точек монтирования
  # (stderr скрыт, но статус остаётся) — с pipefail+errexit это молча убивало скрипт.
  # -Pk вместо -Pm: -m не POSIX, у toybox-df его может не быть.
  local free_kb free_mb
  free_kb="$(df -Pk "$HOME" 2>/dev/null | awk 'NR==2{print $4}')" || free_kb=""
  if [ -n "$free_kb" ]; then free_mb=$((free_kb / 1024)); else free_mb="?"; fi
  printf '    Свободно:      %s МБ (нужно ~2000 под node_modules, БД и сборку canvas)\n' "$free_mb"

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
      packages/shared экспортирует .ts напрямую, это работает только через
      type stripping).
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
    skip "postgresql / redis / git / python / оснастка сборки уже стоят"
  fi

  # Шрифты нужны pango: без них node-canvas нарисует пустые прямоугольники
  # вместо подписей. Пакет необязателен — только предупреждаем.
  if command -v fc-match >/dev/null 2>&1 && fc-match sans >/dev/null 2>&1; then
    skip "fontconfig видит шрифты — подписи в PNG отрисуются"
  else
    warn "шрифтов не видно (fontconfig). PNG-экспорт соберётся, но текст будет
      пустым. Лечится любым ttf: pkg install ttf-dejavu — либо положить .ttf
      в ~/.fonts и выполнить fc-cache -f"
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

  # Артефакты этого скрипта не должны мусорить в git status.
  local excl=".git/info/exclude"
  if [ ! -f "$excl" ] || grep -q '^\.termux-' "$excl"; then
    skip "исключения для .termux-* уже прописаны"
  else
    printf '\n# philosynth-termux.sh\n.termux-npm-stamp\n.termux-server.pid\n.termux-client.pid\nlogs/\n' >> "$excl"
    ok "артефакты скрипта внесены в .git/info/exclude"
  fi

  if [ -f .env ]; then
    skip ".env на месте"
  else
    cp .env.example .env
    ok ".env создан из .env.example"
  fi

  # API_KEY_ENCRYPTION_SECRET (беседа 6.1): пустой секрет — CryptoConfigError
  # при первой же попытке сохранить свой ключ Anthropic. На телефоне BYO-Key
  # обычно и есть способ платить за генерацию, поэтому генерируем сразу.
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
      делает уже сохранённые ключи нечитаемыми — не трогать без нужды)"
  fi

  grep -q '^ANTHROPIC_API_KEY=..*' .env \
    || warn "ANTHROPIC_API_KEY пуст — серверная генерация недоступна.
      Либо вписать ключ в .env, либо ввести свой в интерфейсе (BYO-Key)."
  grep -q '^STRIPE_SECRET_KEY=..*' .env \
    || warn "STRIPE_SECRET_KEY пуст — пополнение баланса и подписки отвечают 503.
      BYO-Key и списание с баланса работают (BILLING_ENFORCE вне production = false)."
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
  printf '    20–60 минут, ~1.2 ГБ. Android-пребилды esbuild и rollup прописаны\n'
  printf '    в lock-файле, а вот canvas@3 (PNG-экспорт, беседа 4.2) их не имеет\n'
  printf '    и компилируется из исходников — это самая долгая часть,\n'
  printf '    подробности следующим шагом.\n'
  if npm install; then
    echo "$cur" > "$stamp"
    ok "зависимости установлены"
  else
    warn "npm install завершился с ошибкой — почти наверняка на сборке canvas.
      Дерево при этом установлено; аддон разбираем отдельным шагом."
  fi
}

# ── 5b. node-canvas ──────────────────────────────────────────────────────
canvas_loads() { node -e 'require("canvas").createCanvas(2,2)' >/dev/null 2>&1; }

step_canvas() {
  head_ "node-canvas (PNG-экспорт)"
  cd "$REPO_DIR"

  if canvas_loads; then
    skip "аддон собран и грузится"
    return
  fi

  # Библиотеки проверяем ДО сборки: иначе node-gyp падает на середине
  # с малочитаемым выводом компоновщика.
  local lib
  for lib in cairo pango pangocairo; do
    pkg-config --exists "$lib" 2>/dev/null \
      || die "нет $lib (pkg-config его не видит).
      Поставьте: pkg install build-essential pkg-config libcairo pango libpng"
  done

  printf '    Пребилдов node-canvas под android нет (публикуются только macOS\n'
  printf '    x64/arm64, Linux x86-64 glibc и Windows) — собираем из исходников:\n'
  printf '    10–40 минут, JOBS=%s.\n' "$JOBS"
  printf '    Без аддона сервер не стартует ВООБЩЕ: index.ts статически тянет\n'
  printf '    routes/export.ts → png-exporter.ts → import "canvas".\n'

  # build_from_source именно переменной окружения: prebuild-install читает
  # npm_config_*, а незнакомый ключ командной строки npm встречает руганью.
  npm_config_build_from_source=true npm rebuild canvas --foreground-scripts \
    || die "сборка canvas не прошла. Что смотреть:
      1) память — повторить с JOBS=1;
      2) node-gyp тянет заголовки node с nodejs.org, нужна сеть;
      3) ошибки компоновки в логе выше обычно означают недостающий пакет
         (libpng / cairo / pango)."

  canvas_loads || die "canvas собрался, но не грузится; покажите вывод:
      node -e 'require(\"canvas\")'"
  ok "canvas собран из исходников и загружается"
}

# ── 6. Миграция и сиды ───────────────────────────────────────────────────
step_db_content() {
  head_ "Схема и сиды"
  cd "$REPO_DIR"
  set -a; . ./.env; set +a          # сиды читают process.env, .env знает только drizzle-kit

  npx --yes drizzle-kit migrate
  ok "миграции применены — 0000_initial … 0007 (drizzle ведёт учёт сам,
      повторный прогон no-op). 0004 — admin_audit (8.1), 0005 — ступень
      видимости вместо is_public (8.6), 0006 — почта: auth_tokens и
      mail_outbox (9.1), 0007 — рекомендации критики (10.1)"

  # Сиды идемпотентны по построению: created/updated/skip/fail.
  npm run seed:prompts
  npm run seed:configs
  npm run seed:taxonomy
  ok "сиды прогнаны (263 шаблона: 107 базовых + 146 разделов + 6 обогащения
      + 2 трансформации + 2 рекомендаций; 27 конфигов; 18+29 типов таксономии)"

  # 10.1: кэш реестра шаблонов и конфигов в Redis БЕССРОЧНЫЙ, посев его не
  # сбрасывает — сбрасывает только старт сервера (warmCache). Причём dev-сервер
  # (tsx watch) перезапускается сам на `git pull`, то есть ДО посева: служба
  # останется на прежних версиях при уже новом коде. Поэтому — громко.
  if curl -fsS "http://localhost:3000/api/v1/health" >/dev/null 2>&1; then
    warn "сервер сейчас запущен: посеянные версии шаблонов и конфигов он увидит
      только после перезапуска —  bash $0 stop && bash $0 start"
  fi

  # Тарифы (8.3): без STRIPE_PRICE_* в .env планы сеются неактивными и
  # скрипт сам печатает громкое предупреждение — здесь не дублируем.
  npm run seed:plans
  ok "тарифы посеяны (subscription_plans, 3 плана; активны только с STRIPE_PRICE_*)"

  # Администратор (8.1) НЕ заводится здесь: пароль спрашивается с
  # клавиатуры, а setup должен уметь идти без человека. Но промолчать
  # нельзя — без админа недостижимы страница промптов и правка каталогов.
  local admins
  admins="$(psql -d "$DB_NAME" -tAc \
    "select count(*) from users where role = 'admin'" 2>/dev/null || echo "?")"
  if [ "$admins" = "0" ]; then
    warn "администраторов в базе НЕТ. Роль admin иначе не получить —
      ни регистрацией, ни правкой в интерфейсе. Заведите первого:
      bash $0 admin"
  elif [ "$admins" = "?" ]; then
    warn "не удалось сосчитать администраторов (база не отвечает?)"
  else
    skip "администраторы есть ($admins)"
  fi
}

# ── 6b. Первый администратор (беседа 8.1) ────────────────────────────────
# Отдельная команда, а не шаг setup: bootstrap-admin.ts требует пароль
# ПЕРЕМЕННОЙ ОКРУЖЕНИЯ, а не доводом (довод виден в списке процессов и
# оседает в истории оболочки), и спрашивать его надо с клавиатуры.
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

  # Скрипт сам печатает created / updated / skip / fail и ставит код
  # возврата; заслон «в базе уже есть админ с другим email» — его.
  BOOTSTRAP_ADMIN_EMAIL="$email" BOOTSTRAP_ADMIN_PASSWORD="$pass" npm run seed:admin || \
    die "seed:admin отказал — читайте его сообщение выше"

  # Код возврата 0 доказательством НЕ считается: при переезде скрипта в
  # подпапку его сторож isDirectRun перестал узнавать собственный путь,
  # main() не запускался, а выход был нулевым — и обёртка бодро врала
  # «администратор заведён». Спрашиваем базу.
  local n
  n="$(psql -d "$DB_NAME" -tAc "select count(*) from users where role='admin' and email='$email'" 2>/dev/null || echo 0)"
  if [ "$n" = "1" ]; then
    ok "администратор $email есть в базе, роль admin"
    printf '    Вкладка «Доступ» в /admin/prompts — назначение следующих\n'
    printf '    администраторов; вторым скриптом второго НЕ завести.\n'
  else
    die "seed:admin отработал без ошибки, но администратора $email в базе НЕТ.
      Это не ваша опечатка — это поломка скрипта; смотрите его вывод выше"
  fi
  unset pass pass2
}

# ── 6c. Стенд биллинга без Stripe (беседа 8.2) ───────────────────────────
# tools/dev-billing.sh поднимает мок Stripe и переключает на него
# STRIPE_API_BASE. После этого пополнение, подписка, отмена и
# возобновление щёлкаются на настоящем коде — деньги ненастоящие.
step_stand() {
  head_ "Стенд биллинга"
  cd "$REPO_DIR"
  [ -x tools/dev-billing.sh ] || [ -f tools/dev-billing.sh ] \
    || die "tools/dev-billing.sh нет — репозиторий старше беседы 8.2"
  bash tools/dev-billing.sh "${1:-}" || die "dev-billing.sh отказал"
  ok "стенд: доводы --stop и --status передаются в dev-billing.sh как есть"
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

  # Дешёвая проверка: без аддона сервер упадёт на импорте, а в логе будет
  # ERR_DLOPEN_FAILED — лучше сказать об этом здесь.
  canvas_loads || warn "canvas не грузится — сервер не поднимется.
      Почините: bash $0 canvas"

  command -v termux-wake-lock >/dev/null 2>&1 && termux-wake-lock || true

  set -a; . ./.env; set +a

  if alive "$PID_SERVER"; then
    skip "dev:server уже запущен (pid $(cat "$PID_SERVER"))"
  else
    setsid nohup npm run dev:server > logs/server.log 2>&1 &
    echo $! > "$PID_SERVER"
    ok "dev:server → http://localhost:3000  (logs/server.log)"
  fi

  if alive "$PID_CLIENT"; then
    skip "dev:client уже запущен (pid $(cat "$PID_CLIENT"))"
  else
    setsid nohup npm run dev -w client -- --host > logs/client.log 2>&1 &
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
  printf '    С другого устройства в той же сети — по адресу выше\n'
  printf '\n    После 8.6/8.7 адрес можно давать кому угодно: без входа\n'
  printf '    открыты «/» (рассказ о проекте, живые карточки, цены),\n'
  printf '    «/explore» (публичный каталог) и «/synthesis/:id» (публичная\n'
  printf '    концепция). Гостю не показываются стоимость, токены, логи и\n'
  printf '    запросы к модели — это потолок, а не настройка автора.\n'
}

cmd_stop() {
  cd "$REPO_DIR" 2>/dev/null || true
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
  redis-cli shutdown nosave >/dev/null 2>&1 && ok "redis остановлен" || skip "redis не запущен"
  pg_running && { pg_ctl -D "$PGDATA" -m fast stop >/dev/null; ok "postgres остановлен"; } \
             || skip "postgres не запущен"
  command -v termux-wake-unlock >/dev/null 2>&1 && termux-wake-unlock || true
}

cmd_status() {
  head_ "Статус"
  pg_running && ok "postgres слушает" || skip "postgres не запущен"
  redis-cli ping >/dev/null 2>&1 && ok "redis отвечает" || skip "redis не запущен"
  ( cd "$REPO_DIR" 2>/dev/null && canvas_loads ) && ok "canvas грузится" \
    || skip "canvas не собран (bash $0 canvas)"
  alive "$PID_SERVER" && ok "dev:server pid $(cat "$PID_SERVER")" || skip "dev:server не запущен"
  alive "$PID_CLIENT" && ok "dev:client pid $(cat "$PID_CLIENT")" || skip "dev:client не запущен"

  # Две вещи, отсутствие которых выглядит как «ничего не работает», а на
  # деле означает «не доделана установка»: без администратора недостижима
  # админка (8.1), без активных тарифов пуст раздел подписки (8.3).
  if pg_running; then
    local admins plans
    admins="$(psql -d "$DB_NAME" -tAc \
      "select count(*) from users where role = 'admin'" 2>/dev/null || echo "?")"
    plans="$(psql -d "$DB_NAME" -tAc \
      "select count(*) from subscription_plans where is_active" 2>/dev/null || echo "?")"
    [ "$admins" = "0" ] && warn "администраторов нет — bash $0 admin" \
                        || ok "администраторов: $admins"
    [ "$plans" = "0" ] && skip "активных тарифов нет: раздел подписки пуст,
      пока не заведены STRIPE_PRICE_* (npm run stripe:create-prices)" \
                       || ok "активных тарифов: $plans"
  fi
}

summary() {
  printf '\n\033[1mИтог:\033[0m created=%d skip=%d fail=%d\n' "$n_created" "$n_skip" "$n_fail"
}

# ── main ─────────────────────────────────────────────────────────────────
case "${1:-setup}" in
  setup)
    doctor; step_packages; step_postgres; step_redis
    step_repo; step_npm; step_canvas; step_db_content
    summary
    printf '\nДальше:  bash %s start\n' "$0"
    printf 'И один раз: bash %s admin  — без администратора недостижимы\n' "$0"
    printf '            страница промптов и правка каталогов типов.\n'
    ;;
  start)  cmd_start;   summary ;;
  stop)   cmd_stop;    summary ;;
  status) cmd_status;  summary ;;
  doctor) doctor;      summary ;;
  canvas) step_canvas; summary ;;
  admin)  step_admin;  summary ;;
  stand)  shift; step_stand "${1:-}"; summary ;;
  *) printf 'Использование: bash %s [setup|start|stop|status|doctor|canvas|admin|stand]\n' "$0"; exit 2 ;;
esac
