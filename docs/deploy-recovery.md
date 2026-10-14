# Восстановление автоматического deploy: 14 октября 2026

## Подтверждённые факты

- Последние 10 запусков Actions: 18–21 сентября, все failure. Последний: https://github.com/aknilamok-stack/touchspace-chat-app/actions/runs/35593871478 .
- Изучены полные логи последнего запуска (job 106314142931) и запуска 18 сентября 35322458382 (job 105527803212). В обоих Prepare SSH успешен, затем TCP/SSH timeout на chat.touchspace.biz:7551 и exit 255. Runner: GitHub-hosted Ubuntu, Azure northcentralus.
- Последний SSH ожидал примерно 135 секунд. Удалённая команда touchspace-deploy не начала выполняться.
- Это сбой установления соединения, до аутентификации. Успешный Prepare SSH подтверждает запись файлов, но не корректность ключа, known_hosts или разрешения root.
- Ошибка DNS resolution не записана; фактические адреса назначения в старых логах отсутствуют. Домен мог разрешаться в неверный адрес, прокси/CDN или недоступный адрес.
- В workflow жёстко заданы host/port/user. Порт 7551 совпадает с docs/transfer-handoff-checklist.md. Нет доказательств, что надо менять его на 22.
- В дереве репозитория нет реализации touchspace-deploy. scripts/install-server.sh устанавливает Docker, меняет env и запускает Compose, но не настраивает SSH listener, firewall, Actions runner или touchspace-deploy.
- docs/production-deploy.md описывает Postgres, тогда как текущий docker-compose.prod.yml и installer используют MySQL. Эти инструкции нельзя считать доказательством состояния сервера.
- Текущее состояние сайта, серверная версия приложения и правила сети не проверены: нет доступа к консоли сервера. Отсутствие успешных Actions не означает, что приложение выключено или не обновлялось вручную.

## Необходимые проверки: без изменения сервера

Работать через существующий административный доступ или консоль провайдера. Не закрывать текущую SSH-сессию.

1. В панели провайдера подтвердить публичный IP целевого сервера. Сравнить с A/AAAA chat.touchspace.biz и адресами из нового DNS/TCP шага Actions. Если включён HTTP CDN/proxy, использовать для SSH отдельное DNS-only имя; не менять веб-домен вслепую.

2. На Ubuntu проверить реальный listener и конфигурацию, включая socket activation:

```bash
sudo ss -lntp
sudo /usr/sbin/sshd -t
sudo /usr/sbin/sshd -T | rg '^(port|listenaddress|permitrootlogin|pubkeyauthentication)'
sudo systemctl status ssh.service ssh.socket --no-pager
sudo journalctl -u ssh.service -u ssh.socket --since '30 minutes ago' --no-pager
```

ss показывает фактический порт/адрес; sshd -T — конфигурацию, которую могут уточнять Match-блоки. Проверить listener для той IP-семьи, которую использует клиент. Не менять sshd ради соответствия документу до выяснения рабочего административного порта.

3. Проверить активный firewall и внешние правила:

```bash
sudo ufw status verbose
sudo nft list ruleset
sudo iptables -S
```

Последние две команды зависят от установленного firewall. В панели хостинга проверить security group/ACL, NAT forwarding внешнего TCP 7551 на реальный SSH listener, географические ограничения. Если используется fail2ban — проверить активные jail и запреты. Не отключать firewall целиком.

4. Во время одного диагностического запуска наблюдать SSH-трафик:

```bash
sudo timeout 60 tcpdump -nn -i any 'tcp port 7551'
```

При NAT заменить порт на серверный. Не сохранять payload; достаточно заголовков.
- SYN не приходит: сверить IP назначения; затем внешний firewall, NAT, маршрут, ограничения провайдера.
- SYN приходит, SYN-ACK не уходит: проверить локальный firewall и listener.
- SYN-ACK уходит, ACK не приходит: проверить обратный маршрут и фильтрацию.
- TCP handshake проходит: проверить SSH banner/журнал; только затем ключ, host key, пользователя и authorized_keys.
Сам факт timeout не позволяет выбрать один из этих вариантов.

5. Проверить существующее приложение независимо от SSH deploy:

```bash
curl --max-time 15 -I https://chat.touchspace.biz/login
```

На сервере, из фактического каталога установки:
```bash
git rev-parse HEAD
git status --short
sudo docker compose -f docker-compose.prod.yml ps
sudo nginx -t
command -v touchspace-deploy
```

Проверить реализацию touchspace-deploy (она может быть forced command в authorized_keys), каталог, ветку, backup и обработку ошибок. Не публиковать env, приватные ключи или полные чувствительные логи. HTTP ответ и контейнеры сами по себе не подтверждают работу чатов: дополнительно проверить вход, отправку/получение сообщения и вложение тестовой учётной записью.

## Конкретное решение по результатам

- Неверный DNS / proxy: отдельное SSH DNS-only имя или подтверждённый IP в repository variable DEPLOY_HOST. Обновить DEPLOY_KNOWN_HOSTS только после сверки отпечатка через консоль сервера; для нестандартного порта нужна запись [host]:port. Не использовать StrictHostKeyChecking=no.
- Неверный порт: DEPLOY_PORT = подтверждённый внешний SSH-порт. Не открывать 22 лишь потому, что он стандартный.
- sshd не слушает ожидаемый адрес: исправить listener/socket конфигурацию, проверить sshd -t и второй административный вход до закрытия первой сессии.
- Сеть закрыта для GitHub-hosted runners: предпочтительно выделенный изолированный deploy runner с фиксированным исходящим IP в разрешённой сети. Разрешить только этот IP на SSH-порту в локальном и внешнем firewall. Альтернатива — GitHub larger runner с выделенным статическим диапазоном, если доступен для аккаунта. Не добавлять единственный случайный IP ubuntu-latest как постоянное решение и не открывать SSH всему интернету.
- Для self-hosted runner использовать отдельную машину/сегмент с минимумом прав, не production host. Репозиторий публичный: runner не должен исполнять недоверенные PR, fork или произвольные ветки; ограничить группу и доступ, предпочтительно одноразовые runners. Текущий workflow допускает только main и не запускается на pull_request. Изменить runs-on только после настройки и проверки конкретного runner; предлагаемый patch сохраняет ubuntu-latest.
- После восстановления TCP проверить доверенный host key и ключ доступа. Переход с root на отдельного пользователя полезен, но требует согласованной серверной настройки ограниченной команды и прав; DEPLOY_USER позволяет это сделать без переписывания workflow. Права Docker фактически дают широкие привилегии, не считать членство в docker ограниченной ролью.

Официальные сведения о сетях runners: https://docs.github.com/en/actions/reference/runners/github-hosted-runners .

## Что меняет предлагаемый workflow

- DNS/TCP preflight выводит адреса и результат по каждой IP-семье с таймаутом 5 секунд на адрес. Успех хотя бы одного адреса не подтверждает SSH-аутентификацию и не гарантирует выбор этого адреса SSH-клиентом.
- Ручной workflow_dispatch по умолчанию diagnose_only=true: не читает SSH secrets и не вызывает touchspace-deploy. Push main сохраняет deploy.
- Защита main предотвращает ручной deploy с другой ветки.
- DEPLOY_HOST / DEPLOY_PORT / DEPLOY_USER — repository variables с прежними значениями по умолчанию. Новые secrets не нужны.
- Secrets передаются через environment, а не подставляются непосредственно в shell-код.
- BatchMode и IdentitiesOnly исключают интерактивный ввод и посторонние ключи; StrictHostKeyChecking сохраняет проверку сервера.
- ConnectTimeout=15 и ConnectionAttempts=1 ограничивают ожидание подключения; keepalive помогает обнаружить потерю связи после подключения.
- Concurrency не допускает параллельные deploy этого workflow и не прерывает текущий deploy новым push.
- contents:read явно ограничивает GITHUB_TOKEN; always cleanup удаляет SSH-файлы.

Это улучшение диагностики и управления deploy, а не исправление неизвестного серверного firewall. Не меняет приложение, базу, installer или команду touchspace-deploy.

## Порядок ввода и критерий восстановления

1. Проверить и принять PR; merge main запускает обычный deploy. Поэтому до merge выполнить серверные проверки и подтвердить, что touchspace-deploy безопасен для текущего состояния.
2. После merge запускать workflow_dispatch с diagnose_only=true для наблюдения сети; режим не обновляет приложение.
3. Исправить только выявленную DNS/listener/firewall/NAT проблему. Подготовить backup базы и uploads до первого реального deploy; текущий Compose запускает prisma db push при старте backend, что требует отдельной проверки совместимости схемы.
4. Запустить workflow_dispatch с diagnose_only=false. Не перезапускать старые сентябрьские runs для выката: не установлен контракт выбора версии внутри touchspace-deploy.
5. Проверить успешный SSH и exit code серверного скрипта, затем серверный commit, состояние контейнеров и пользовательский сценарий. Зафиксировать фактически развернутую версию; только зелёный TCP preflight не означает восстановленный deploy.

Не использовать INIT_ADMIN=1, reset:local-workspace, docker compose down -v или переустановку для устранения SSH timeout: это не исправляет сеть и может уничтожить данные.
