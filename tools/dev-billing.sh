#!/usr/bin/env bash
#
# dev-billing.sh — локальный стенд биллинга без аккаунта Stripe (беседа 8.2).
#
#   bash tools/dev-billing.sh              поднять: мок Stripe → сервер :3000 → vite
#   bash tools/dev-billing.sh --stop       погасить всё, освободить порты
#   bash tools/dev-billing.sh --status     что живо
#   bash tools/dev-billing.sh --verbose    как без ключа, мок печатает запросы
#
# Отчёт в стиле патч-скриптов доков и philosynth-termux.sh: created / skip /
# fail. Повторный запуск на поднятом стенде обязан дать одни skip (ничего не
# перезапускает, чужие процессы на портах не трогает).
#
# Что делает: читает .env.local (создаёт из .env.local.example, если нет),
# отказывается при STRIPE_SECRET_KEY=sk_live_… (заслон), проверяет PG/Redis,
# поднимает tools/stripe-mock.mjs на STRIPE_MOCK_PORT, сервер строго на :3000
# (прокси vite зашит — 09 §4), vite на VITE_PORT (5199), напоминает про
# npm run seed:admin (8.1) и зовёт npm run seed:plans, если такой скрипт есть
# (тарифы — беседа 8.3; их отсутствие — не отказ стенда).
#
# Чего НЕ делает: не сеет тарифы сам, не правит продуктовый код, не трогает
# .env — стенд живёт в .env.local.
#
# Процессы спавнятся собственными группами (setsid) и гасятся группой —
# иначе tsx/vite оставляют сирот на портах (09 §4, беседы 1.6/5.1/5.2).
# pid-файлы и логи — в .dev-billing/ (в .gitignore).

set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
STATE_DIR="$ROOT/.dev-billing"
ENV_FILE="$ROOT/.env.local"
ENV_EXAMPLE="$ROOT/.env.local.example"
HEALTH_WAIT_SEC="${HEALTH_WAIT_SEC:-60}"

C_OK=$'\033[32m'; C_SKIP=$'\033[90m'; C_WARN=$'\033[33m'; C_ERR=$'\033[31m'; C_0=$'\033[0m'
n_created=0; n_skip=0; n_fail=0
ok()   { printf '%s  ✓ %s%s\n' "$C_OK"   "$1" "$C_0"; n_created=$((n_created+1)); }
skip() { printf '%s  ~ %s%s\n' "$C_SKIP" "$1" "$C_0"; n_skip=$((n_skip+1)); }
warn() { printf '%s  ! %s%s\n' "$C_WARN" "$1" "$C_0"; }
fail() { printf '%s  ✗ %s%s\n' "$C_ERR"  "$1" "$C_0"; n_fail=$((n_fail+1)); }
die()  { fail "$1"; summary; exit 1; }
head_() { printf '\n\033[1m── %s\033[0m\n' "$1"; }
summary() { printf '\n\033[1mИтог:\033[0m created=%d skip=%d fail=%d\n' "$n_created" "$n_skip" "$n_fail"; }

MODE="start"; VERBOSE=""
for a in "$@"; do
  case "$a" in
    --stop) MODE="stop" ;;
    --status) MODE="status" ;;
    --verbose|-v) VERBOSE="--verbose" ;;
    -h|--help) sed -n '2,25p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) printf 'Неизвестный аргумент: %s (см. --help)\n' "$a"; exit 2 ;;
  esac
done

# ── Утилиты портов/процессов ─────────────────────────────────────────────
# Занят ли TCP-порт на 127.0.0.1 — без зависимости от ss/lsof/nc (их может не быть).
port_busy() {
  node -e '
    const s=require("node:net").connect({host:"127.0.0.1",port:+process.argv[1]});
    s.once("connect",()=>{s.destroy();process.exit(0)});
    s.once("error",()=>process.exit(1));
    setTimeout(()=>process.exit(1),700);' "$1" 2>/dev/null
}
http_ok() { curl -fsS --max-time 2 "$1" >/dev/null 2>&1; }
pid_alive() { [ -f "$1" ] && kill -0 "$(cat "$1")" 2>/dev/null; }

# Запуск демона собственной группой процессов; в pid-файл — лидер группы.
spawn_daemon() { # name cmd...
  local name="$1"; shift
  mkdir -p "$STATE_DIR"
  if command -v setsid >/dev/null 2>&1; then
    setsid nohup "$@" > "$STATE_DIR/$name.log" 2>&1 < /dev/null &
  else
    nohup "$@" > "$STATE_DIR/$name.log" 2>&1 < /dev/null &
  fi
  echo $! > "$STATE_DIR/$name.pid"
}

# Гасим группу лидера (setsid → pgid = pid), затем самого лидера, затем детей.
kill_daemon() { # name label port
  local name="$1" label="$2" port="$3" pidf="$STATE_DIR/$1.pid" pid
  if pid_alive "$pidf"; then
    pid="$(cat "$pidf")"
    kill -TERM -- "-$pid" 2>/dev/null || kill -TERM "$pid" 2>/dev/null || true
    pkill -TERM -P "$pid" 2>/dev/null || true
    for _ in 1 2 3 4 5 6 7 8 9 10; do kill -0 "$pid" 2>/dev/null || break; sleep 0.3; done
    if kill -0 "$pid" 2>/dev/null; then
      kill -KILL -- "-$pid" 2>/dev/null || kill -KILL "$pid" 2>/dev/null || true
      pkill -KILL -P "$pid" 2>/dev/null || true
    fi
    rm -f "$pidf"
    ok "$label остановлен (pid $pid)"
  else
    rm -f "$pidf"
    skip "$label не был запущен этим скриптом"
  fi
  if [ -n "$port" ]; then
    for _ in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15; do port_busy "$port" || break; sleep 0.3; done
    if port_busy "$port"; then
      fail "порт $port всё ещё занят — процесс не наш (запущен не этим скриптом); найдите его: ps aux | grep -E \"[s]erver/index|[v]ite|[s]tripe-mock\""
    else
      ok "порт $port свободен"
    fi
  fi
}

# ── Окружение ────────────────────────────────────────────────────────────
load_env() {
  head_ "Окружение стенда"
  if [ -f "$ENV_FILE" ]; then
    skip ".env.local на месте"
  else
    [ -f "$ENV_EXAMPLE" ] || die "нет ни .env.local, ни .env.local.example"
    cp "$ENV_EXAMPLE" "$ENV_FILE"
    ok ".env.local создан из .env.local.example"
  fi
  # shellcheck disable=SC1090
  set -a; . "$ENV_FILE"; set +a

  # Стенд обязан идти в мок, а не в Stripe: значения ниже задаются даже если
  # .env.local их не содержит (старый файл, вычищенные строки).
  export STRIPE_MOCK_PORT="${STRIPE_MOCK_PORT:-3866}"
  export STRIPE_MOCK_SECRET_KEY="${STRIPE_MOCK_SECRET_KEY:-sk_test_mock}"
  export STRIPE_SECRET_KEY="${STRIPE_SECRET_KEY:-$STRIPE_MOCK_SECRET_KEY}"
  export STRIPE_API_BASE="${STRIPE_API_BASE:-http://127.0.0.1:$STRIPE_MOCK_PORT}"
  export STRIPE_MOCK_PI_STATUS="${STRIPE_MOCK_PI_STATUS:-succeeded}"
  export STRIPE_WEBHOOK_SECRET="${STRIPE_WEBHOOK_SECRET:-}"
  export PORT=3000                      # прокси vite зашит на :3000
  export VITE_PORT="${VITE_PORT:-5199}"
  export CLIENT_ORIGIN="${CLIENT_ORIGIN:-http://localhost:$VITE_PORT}"
  export VITE_STRIPE_PUBLISHABLE_KEY="" # dev-режим BillingPage — обязателен для мока
  export NODE_ENV="${NODE_ENV:-development}"

  # ЗАСЛОН: живой ключ Stripe — отказ до любого действия.
  case "$STRIPE_SECRET_KEY" in
    sk_live_*) die "STRIPE_SECRET_KEY начинается с sk_live_ — это живой аккаунт Stripe, стенд с ним не работает. Уберите ключ из .env.local (для стенда нужен фиктивный, например sk_test_mock)" ;;
  esac
  case "$STRIPE_API_BASE" in
    http://127.0.0.1:*|http://localhost:*) : ;;
    *) warn "STRIPE_API_BASE=$STRIPE_API_BASE не локальный — сервер пойдёт не в мок, а в $STRIPE_API_BASE; стенд рассчитан на http://127.0.0.1:$STRIPE_MOCK_PORT" ;;
  esac
  if [ "$STRIPE_SECRET_KEY" != "$STRIPE_MOCK_SECRET_KEY" ]; then
    warn "STRIPE_SECRET_KEY ($STRIPE_SECRET_KEY) ≠ STRIPE_MOCK_SECRET_KEY ($STRIPE_MOCK_SECRET_KEY): мок ответит серверу 401 (bad key)"
  fi
  if [ "$NODE_ENV" = "production" ]; then
    die "NODE_ENV=production: в production пустой STRIPE_WEBHOOK_SECRET → 400, а BILLING_ENFORCE=true по умолчанию; стенд — только development"
  fi
  printf '    мок Stripe: http://127.0.0.1:%s · ключ %s · PaymentIntent → %s · webhook %s\n' \
    "$STRIPE_MOCK_PORT" "$STRIPE_SECRET_KEY" "$STRIPE_MOCK_PI_STATUS" \
    "$([ -n "$STRIPE_WEBHOOK_SECRET" ] && echo 'с подписью' || echo 'без подписи')"
  printf '    сервер: :%s (BILLING_ENFORCE=%s) · vite: :%s · CLIENT_ORIGIN=%s\n' \
    "$PORT" "${BILLING_ENFORCE:-по умолчанию env.ts}" "$VITE_PORT" "$CLIENT_ORIGIN"
}

check_deps() {
  head_ "Зависимости"
  [ -d "$ROOT/node_modules" ] || die "node_modules нет — npm install"
  [ -f "$ROOT/node_modules/vite/bin/vite.js" ] || die "vite не установлен (node_modules/vite/bin/vite.js) — npm install"
  [ -d "$ROOT/node_modules/tsx" ] || die "tsx не установлен — npm install"
  skip "node_modules, vite, tsx на месте"

  local pg_host pg_port
  pg_host="$(printf '%s' "${DATABASE_URL:-}" | sed -E 's#.*@([^:/]+):?([0-9]*)/.*#\1#')"
  pg_port="$(printf '%s' "${DATABASE_URL:-}" | sed -E 's#.*@([^:/]+):?([0-9]*)/.*#\2#')"
  [ -n "$pg_port" ] || pg_port=5432
  if port_busy "$pg_port" || { [ "$pg_host" != "localhost" ] && [ "$pg_host" != "127.0.0.1" ]; }; then
    skip "PostgreSQL слушает $pg_host:$pg_port"
  else
    die "PostgreSQL не слушает $pg_host:$pg_port — поднимите его (docker compose up -d / pg_ctlcluster 16 main start) и смигрируйте: npm run db:migrate"
  fi
  local redis_port
  redis_port="$(printf '%s' "${REDIS_URL:-redis://localhost:6379}" | sed -E 's#.*:([0-9]+).*#\1#')"
  if port_busy "$redis_port"; then
    skip "Redis слушает :$redis_port"
  else
    warn "Redis не слушает :$redis_port — сервер стартует (кэш и лимитер fail-open), но поднять стоит: redis-server --daemonize yes --save ''"
  fi
}

# ── Шаги стенда ──────────────────────────────────────────────────────────
step_mock() {
  head_ "Мок Stripe"
  if pid_alive "$STATE_DIR/stripe-mock.pid" && http_ok "http://127.0.0.1:$STRIPE_MOCK_PORT/__mock/health"; then
    skip "уже запущен (pid $(cat "$STATE_DIR/stripe-mock.pid"))"; return
  fi
  if port_busy "$STRIPE_MOCK_PORT"; then
    if http_ok "http://127.0.0.1:$STRIPE_MOCK_PORT/__mock/health"; then
      skip "на :$STRIPE_MOCK_PORT уже отвечает мок Stripe, запущенный не этим скриптом — используем его"
    else
      die "порт $STRIPE_MOCK_PORT занят чужим процессом"
    fi
    return
  fi
  spawn_daemon stripe-mock node "$ROOT/tools/stripe-mock.mjs" --port "$STRIPE_MOCK_PORT" --bearer "$STRIPE_MOCK_SECRET_KEY" --pi-status "$STRIPE_MOCK_PI_STATUS" $VERBOSE
  for _ in $(seq 1 30); do http_ok "http://127.0.0.1:$STRIPE_MOCK_PORT/__mock/health" && break; sleep 0.2; done
  http_ok "http://127.0.0.1:$STRIPE_MOCK_PORT/__mock/health" || die "мок не поднялся; лог: $STATE_DIR/stripe-mock.log"
  ok "мок Stripe → http://127.0.0.1:$STRIPE_MOCK_PORT  ($STATE_DIR/stripe-mock.log)"
}

step_server() {
  head_ "Сервер (Hono, :$PORT)"
  local health="http://127.0.0.1:$PORT/api/v1/health"
  if pid_alive "$STATE_DIR/server.pid" && http_ok "$health"; then
    skip "уже запущен (pid $(cat "$STATE_DIR/server.pid"))"; return
  fi
  if port_busy "$PORT"; then
    if http_ok "$health"; then
      warn "на :$PORT уже отвечает сервер, запущенный не этим скриптом — он работает СО СВОИМ окружением (STRIPE_API_BASE может смотреть не в мок). Остановите его или примите как есть"
      skip "сервер не перезапускаю"
    else
      die "порт $PORT занят чужим процессом, а сервер обязан быть на :$PORT (прокси vite)"
    fi
    return
  fi
  # Не `npm run dev:server` (tsx watch — обёртка над node, сирота при kill; 09 §4 1.6/5.1):
  # процесс и есть сервер.
  ( cd "$ROOT/server" && spawn_daemon server node --import tsx index.ts )
  local i=0
  while [ $i -lt "$HEALTH_WAIT_SEC" ]; do http_ok "$health" && break; sleep 1; i=$((i+1)); done
  if http_ok "$health"; then
    ok "сервер → http://127.0.0.1:$PORT  ($STATE_DIR/server.log)"
  else
    die "сервер не ответил на health за ${HEALTH_WAIT_SEC}с; хвост лога:
$(tail -n 20 "$STATE_DIR/server.log" 2>/dev/null)"
  fi
}

step_vite() {
  head_ "Клиент (vite, :$VITE_PORT)"
  local url="http://127.0.0.1:$VITE_PORT/"
  if pid_alive "$STATE_DIR/vite.pid" && http_ok "$url"; then
    skip "уже запущен (pid $(cat "$STATE_DIR/vite.pid"))"; return
  fi
  if port_busy "$VITE_PORT"; then
    die "порт $VITE_PORT занят (чужой vite или сирота прошлого запуска): bash tools/dev-billing.sh --stop, затем ps aux | grep '[v]ite'"
  fi
  # Бинарь vite из КОРНЕВОГО node_modules (воркспейс), без npx-обёртки (09 §4, 1.7).
  ( cd "$ROOT/client" && spawn_daemon vite node "$ROOT/node_modules/vite/bin/vite.js" --port "$VITE_PORT" --strictPort --host 127.0.0.1 )
  for _ in $(seq 1 60); do http_ok "$url" && break; sleep 0.5; done
  if http_ok "$url"; then
    ok "vite → http://localhost:$VITE_PORT  ($STATE_DIR/vite.log)"
  else
    die "vite не поднялся; лог: $STATE_DIR/vite.log"
  fi
}

step_seeds() {
  head_ "Посевы и администратор"
  if node -e 'const p=require("./package.json");process.exit(p.scripts&&p.scripts["seed:plans"]?0:1)' 2>/dev/null; then
    if npm run -s seed:plans; then ok "тарифы посеяны (npm run seed:plans)"; else fail "npm run seed:plans завершился с ошибкой — см. вывод выше"; fi
  else
    warn "npm-скрипта seed:plans нет (его заводит беседа 8.3) — раздел «Подписка» на странице биллинга будет ПУСТ. Это не отказ стенда: пополнение, webhook и заслоны тарифов не требуют"
  fi
  if [ -n "${BOOTSTRAP_ADMIN_PASSWORD:-}" ]; then
    printf '    администратор: npm run seed:admin — идемпотентен (BOOTSTRAP_ADMIN_EMAIL=%s задан в .env.local)\n' "${BOOTSTRAP_ADMIN_EMAIL:-?}"
  else
    printf '    администратор (8.1): без него нет /admin/prompts и вкладок «Каталоги»/«Доступ».\n'
    printf '      BOOTSTRAP_ADMIN_EMAIL=admin@localhost BOOTSTRAP_ADMIN_PASSWORD=<≥8 символов> npm run seed:admin\n'
  fi
}

print_next() {
  printf '\n\033[1mСтенд поднят.\033[0m\n'
  printf '  1. Откройте http://localhost:%s → регистрация → «Биллинг».\n' "$VITE_PORT"
  printf '  2. Пополнение: любая сумма → «Подтвердить платёж» (dev-режим, publishable key пуст) → баланс вырос, транзакция в истории.\n'
  printf '  3. Подписка (после seed:plans, беседа 8.3) висит в «ожидает оплаты» — активирует её webhook:\n'
  printf '       node tools/stripe-emit.mjs invoice.paid <sub_…>          (id — из GET /billing/subscription или лога мока)\n'
  printf '       node tools/stripe-emit.mjs customer.subscription.deleted <sub_…>\n'
  printf '  4. Логи: %s/{stripe-mock,server,vite}.log · погасить: bash tools/dev-billing.sh --stop\n' "$STATE_DIR"
}

cmd_status() {
  head_ "Статус"
  pid_alive "$STATE_DIR/stripe-mock.pid" && ok "мок Stripe pid $(cat "$STATE_DIR/stripe-mock.pid") · :$STRIPE_MOCK_PORT $(port_busy "$STRIPE_MOCK_PORT" && echo занят || echo свободен)" || skip "мок Stripe не запущен · :$STRIPE_MOCK_PORT $(port_busy "$STRIPE_MOCK_PORT" && echo занят || echo свободен)"
  pid_alive "$STATE_DIR/server.pid" && ok "сервер pid $(cat "$STATE_DIR/server.pid") · :$PORT $(port_busy "$PORT" && echo занят || echo свободен)" || skip "сервер не запущен · :$PORT $(port_busy "$PORT" && echo занят || echo свободен)"
  pid_alive "$STATE_DIR/vite.pid" && ok "vite pid $(cat "$STATE_DIR/vite.pid") · :$VITE_PORT $(port_busy "$VITE_PORT" && echo занят || echo свободен)" || skip "vite не запущен · :$VITE_PORT $(port_busy "$VITE_PORT" && echo занят || echo свободен)"
}

cmd_stop() {
  head_ "Остановка стенда"
  kill_daemon vite "vite" "$VITE_PORT"
  kill_daemon server "сервер" "$PORT"
  kill_daemon stripe-mock "мок Stripe" "$STRIPE_MOCK_PORT"
}

# ── main ─────────────────────────────────────────────────────────────────
case "$MODE" in
  start)
    load_env; check_deps; step_mock; step_server; step_vite; step_seeds
    summary
    [ "$n_fail" -eq 0 ] && print_next
    exit "$([ "$n_fail" -eq 0 ] && echo 0 || echo 1)"
    ;;
  stop)
    load_env; cmd_stop; summary
    exit "$([ "$n_fail" -eq 0 ] && echo 0 || echo 1)"
    ;;
  status)
    load_env; cmd_status; summary
    ;;
esac
