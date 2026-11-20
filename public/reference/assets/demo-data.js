'use strict';

const MINUTE = 60_000;
const TEAMS = {
  payments: { name: 'Платежи', initials: 'ПЛ', color: 'purple', scope: 'SmartPay' },
  network: { name: 'Сеть', initials: 'СЕ', color: 'blue', scope: 'Core Network' },
  platform: { name: 'Платформа', initials: 'ПФ', color: 'cyan', scope: 'Order Hub, Notify API, Каталог, Observability' },
  access: { name: 'Доступ', initials: 'ДО', color: 'green', scope: 'Единый вход' },
  data: { name: 'Данные', initials: 'ДА', color: 'amber', scope: 'Data Hub' },
  coord: { name: 'Координаторы', initials: 'КО', color: 'blue', scope: 'Первичный разбор и маршрутизация' }
};
const STATUSES = { new: 'Новый', work: 'В работе', monitoring: 'Наблюдение', done: 'Решён' };
const PRIORITY = { 1: 'Критический', 2: 'Высокий', 3: 'Средний', 4: 'Низкий' };
const EVENTS = {
  critical: { label: 'Новый критический', icon: 'alert', tone: 'danger' },
  assignment: { label: 'Назначен координаторам', icon: 'userPlus', tone: 'blue' },
  routed: { label: 'Команда обновлена', icon: 'people', tone: 'blue' },
  resolved: { label: 'Решён', icon: 'check', tone: 'green' },
  breached: { label: 'Нарушен SLA', icon: 'clock', tone: 'danger' },
  created: { label: 'Зарегистрирован', icon: 'inbox', tone: 'blue' }
};

const examples = [
  [1048, 'Ошибки при оплате картой', 'SmartPay', 'Москва', 1, 'work', 'payments', 12.8,
    'Доля ошибок оплаты выросла с 2% до 28% за 10 минут. Ошибки затрагивают два платёжных шлюза в Москве.',
    'Ошибки растут, а до срока SLA осталось мало времени.',
    'У команды «Платежи» зона ответственности за оба шлюза.', 'payments', 'high'],
  [1042, 'Потери пакетов в сегменте ядра', 'Core Network', 'Казань', 1, 'work', 'network', -8.3,
    'Мониторинг фиксирует потери пакетов на двух узлах ядра. У сетевой команды есть подтверждение деградации.',
    'SLA уже нарушен, а потери сохраняются.',
    'Команда «Сеть» управляет затронутыми узлами.', 'network', 'high'],
  [1047, 'Недоступна авторизация', 'Единый вход', 'Санкт-Петербург', 1, 'new', 'coord', 24.6,
    'Часть пользователей не может войти в личный кабинет. Мониторинг фиксирует рост ответов 503 от сервиса входа.',
    'Инцидент уровня P1 ожидает передачи профильной команде.',
    'Команда «Доступ» сопровождает единый вход.', 'access', 'high'],
  [1046, 'Растёт очередь обработки заказов', 'Order Hub', 'Москва', 2, 'work', 'platform', 48.2,
    'Очередь заданий растёт после увеличения нагрузки. API заказов отвечает штатно.',
    'Запас времени есть, но растущая очередь может замедлить обработку заказов.',
    'Команда «Платформа» сопровождает очередь и обработчики.', 'platform', 'medium'],
  [1045, 'Задержка доставки уведомлений', 'Notify API', 'Новосибирск', 2, 'monitoring', 'platform', 71.2,
    'Скорость доставки сообщений восстанавливается. Команда следит за задержкой после переключения маршрута.',
    'Показатели улучшаются, дальнейший рост задержки потребует проверки.',
    'Команда «Платформа» владеет сервисом уведомлений.', 'platform', 'medium'],
  [1044, 'Не обновляются отчёты', 'Data Hub', 'Москва', 3, 'new', null, 101.6,
    'В утренних отчётах отсутствуют новые данные. Автоматическая задача обновления завершилась с ошибкой.',
    'Сбой ограничен отчётами, смежные сервисы работают.',
    'Команда «Данные» обслуживает задачи обновления.', 'data', 'low'],
  [1043, 'Ошибки сброса пароля', 'Единый вход', 'Казань', 3, 'work', 'access', 127.4,
    'Часть ссылок сброса пароля истекает раньше срока. Вход с действующим паролем доступен.',
    'Затронута отдельная операция, есть время на проверку.',
    'Команда «Доступ» сопровождает сброс пароля.', 'access', 'low'],
  [1041, 'Рост задержек в каталоге', 'Каталог', 'Екатеринбург', 3, 'monitoring', 'platform', 162.4,
    'У 5% запросов к каталогу время ответа превышает норму. После смены кеша показатель стабилизируется.',
    'После смены кеша доля медленных запросов снизилась.',
    'Команда «Платформа» обслуживает кеш каталога.', 'platform', 'low'],
  [1040, 'Не загружается часть метрик', 'Observability', 'Новосибирск', 4, 'new', 'coord', 220,
    'В панели мониторинга пропали отдельные метрики. Сбор журналов и оповещения продолжают работать.',
    'Проблема ограничена одним набором метрик.',
    'Команда «Платформа» обслуживает сбор метрик.', 'platform', 'low'],
  [1039, 'Повторные записи в витрине', 'Data Hub', 'Москва', 4, 'work', 'data', 240,
    'В аналитической витрине появились дубли. Исходный поток данных обрабатывается штатно.',
    'Затронута только аналитическая витрина.',
    'Команда «Данные» владеет витриной.', 'data', 'low'],
  [1038, 'Сбой обработки возвратов', 'SmartPay', 'Москва', 2, 'done', 'payments', 92,
    'Задания на возврат зависали после обновления маршрутизации. После отката накопившиеся задания обработаны.',
    'Инцидент закрыт, метрики восстановлены.',
    'Команда «Платежи» устранила сбой.', 'payments', 'low'],
  [1037, 'Не работает вход через SSO', 'Единый вход', 'Казань', 2, 'done', 'access', 110,
    'После обновления истёк сертификат одного из узлов SSO. Сертификат заменён, вход проверен.',
    'Инцидент закрыт, вход проверен.',
    'Команда «Доступ» заменила сертификат.', 'access', 'low']
];

function makeIncident(example, now, minutesAgo) {
  const [number, title, service, location, priority, status, team, minutes, summary, riskReason, routeReason, suggestedTeam, risk] = example;
  const createdAt = now - minutesAgo * MINUTE;
  return {
    id: 'INC-' + number, title, service, location, priority, status, team, summary,
    riskReason, routeReason, suggestedTeam, risk, createdAt,
    deadline: now + minutes * MINUTE,
    resolvedAt: status === 'done' ? now - 7 * MINUTE : null,
    history: [{ label: 'Зарегистрирован', time: createdAt }]
  };
}

function initialData() {
  const now = Date.now();
  const incidents = examples.map((example, index) => makeIncident(example, now, 5 + index * 3));
  incidents.find(item => item.id === 'INC-1042').slaNotified = true;
  const events = [
    ['critical', 'INC-1048', 2],
    ['assignment', 'INC-1047', 4],
    ['resolved', 'INC-1038', 7],
    ['breached', 'INC-1042', 8.3],
    ['resolved', 'INC-1037', 10]
  ].map(([type, id, offset]) => {
    const item = incidents.find(incident => incident.id === id);
    const time = now - offset * MINUTE;
    if (type === 'resolved') item.resolvedAt = time;
    item.history.unshift({ label: EVENTS[type].label, time });
    return { type, id, time };
  });
  return { incidents, events, lastUpdated: now, lastRead: now - 6 * MINUTE };
}

const simulations = [
  [0, 'Ошибка обработки переводов', 'SmartPay', 'Санкт-Петербург', 1, 'new', null, 18,
    'Платёжный API фиксирует рост ошибок перевода. Успешность снизилась до 72%.',
    'Снижение успешности затрагивает основной платёжный поток.',
    'Команда «Платежи» сопровождает API переводов.', 'payments', 'high'],
  [0, 'Отклоняются токены входа', 'Единый вход', 'Москва', 1, 'new', null, 22,
    'Выросла доля отклонённых токенов входа. Ошибки затрагивают новые пользовательские сессии.',
    'Затронут вход в несколько зависимых сервисов.',
    'Команда «Доступ» обслуживает выдачу и проверку токенов.', 'access', 'high'],
  [0, 'Недоступна обработка заказов', 'Order Hub', 'Казань', 1, 'new', null, 25,
    'Новые заказы не обрабатываются в одном регионе. Ошибки начались после переключения очереди.',
    'Очередь заказов продолжает расти.',
    'Команда «Платформа» отвечает за обработчики.', 'platform', 'high']
];

const aiActions = {
  1048: 'Сверить ошибки двух шлюзов с графиком успешных оплат и передать команде «Платежи» масштаб сбоя.',
  1047: 'Передать команде «Доступ» код 503, регион и ссылку на график ошибок входа.',
  1046: 'Проверить скорость поступления и обработки заказов. При росте задержки подтвердить влияние на клиентов и пересмотреть приоритет.',
  1043: 'Сопоставить время ошибок сброса пароля с INC-1047 и проверить, общий ли у них компонент входа.'
};

function demoArchive(anchor) {
  const sources = [examples[0], examples[1], examples[2], examples[3], examples[4], examples[5], examples[7], examples[8]];
  const ages = [2, 6, 9, 14, 17, 21, 26, 31, 36, 44, 51, 58, 67, 72, 83, 91, 106, 118, 129, 143, 150, 163, 175,
    198, 221, 248, 270, 309, 343, 376, 410, 456, 480, 522, 568, 603, 645, 690];
  return ages.map((hours, index) => {
    const [, , service, , priority, , team, , , , , suggestedTeam] = sources[index % sources.length];
    const resolvedAt = anchor - hours * 60 * MINUTE;
    const duration = (18 + (index * 19) % 132) * MINUTE;
    const createdAt = resolvedAt - duration;
    const deadline = resolvedAt + (index % 5 === 1 ? -37 : 22) * MINUTE;
    return { service, priority, team: team === 'coord' || !team ? suggestedTeam : team, status: 'done', createdAt, deadline, resolvedAt };
  });
}
