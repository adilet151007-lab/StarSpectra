const kk = {
  title: 'Түс және температура', intro: 'Фотодағы жұлдыздың түсін өлшеңіз немесе көк пен қызыл сәуле қатынасының Планк моделіндегі температураға әсерін тексеріңіз.',
  languages: 'Тіл', siteModes: 'Талдау режимі', labModes: 'Өлшеу режимі', constellations: 'Шоқжұлдыздар',
  photoTab: 'Фотодан өлшеу', modelTab: 'Планк моделі', photoHeading: 'Жұлдыз фотосы',
  imageLabel: 'Фото. Жұлдыздың ортасын түртіңіз немесе нүктені меңзер пернелерімен жылжытыңыз.',
  openPhoto: 'Фото ашу', camera: 'Камера', openExample: 'Мысалды ашу', exampleTag: 'Оқу фотосы',
  blueStar: 'Көк жұлдыз', warmStar: 'Жылы түсті жұлдыз', zoom: 'Масштаб',
  photoHint: 'Жұлдыздың ортасын түртіңіз. Көгілдір шеңбер — өлшеу аймағы, сары сақина — фон.',
  radius: 'Апертура', inner: 'Фонның ішкі радиусы', outer: 'Фонның сыртқы радиусы',
  metadata: 'Фото деректері', object: 'Жұлдыз атауы', cameraModel: 'Камера немесе телефон', lens: 'Объектив',
  exposure: 'Экспозиция (с)', wb: 'Ақ түс балансы', photoTime: 'Түсірілім уақыты', timezone: 'Уақыт белдеуі',
  reading: 'Өлшеу', ratio: 'Көк / қызыл', temperature: 'Температура бағасы', calibration: 'Камераны калибрлеу',
  saveReading: 'Журналға қосу', profileHelp: '6 калибрлеу жұлдызы және тексеруге арналған 3 бөлек жұлдыз бар профильді жүктеңіз. Фото мен профильдің камерасы, объективі, пішімі және түсірілім баптаулары сәйкес келуі керек.',
  openProfile: 'JSON импорттау', profileTemplate: 'Профиль үлгісі',
  profileFormat: 'settings жолына ISO / экспозиция (секунд) / ақ түс балансын жазыңыз. Әр жолда жұлдызды, оның B/R мәнін, анықтамалық температурасын және дереккөзін көрсетіңіз.',
  referenceT: 'Анықтамалық, K', estimatedT: 'Баға, K', confirmProfile: 'Түсірілім мен өңдеу баптаулары профильге сәйкес.',
  journal: 'Бақылау журналы', journalHint: 'Өлшемдерді кадр бойынша қосыңыз. CSV осы сеанстың мәндері мен іріктеу себептерін қамтиды.',
  filename: 'Фото', status: 'Мәртебе', remove: 'Жою',
  plotTitle: 'Қатынас және температура', plotLabel: '450 және 650 нм сәуле қатынасының температураға тәуелділік графигі',
  modelSlider: 'Модель температурасы', modelBanner: 'Қара дененің оқу есебі', modelRatio: 'Bλ(450 нм) / Bλ(650 нм) қатынасы',
  modelResult: 'Модель температурасы', experiment: 'Есептік тәжірибе',
  experimentHint: 'Қатынасқа ±5% өзгеріс енгізіп, әр бастапқы T үшін температура бағаларын салыстырыңыз.',
  spectralTitle: 'Спектрлік кластар анықтамалығы', spectralNote: 'Температура ауқымдары жуық. Спектрлік класты спектр сызықтары бойынша нақтылайды.',
  privacy: 'Фото құрылғыда өңделеді',
  opening: 'Фото ашылып жатыр…', openingHeif: 'HEIC декодталып жатыр…',
  empty: 'Бос файл. Басқа сурет таңдаңыз.', 'file-size': '50 МБ-тан кіші сурет таңдаңыз.', resolution: '50 Мп-тан аспайтын сурет таңдаңыз.',
  raw: 'DNG файлы үшін JPEG немесе PNG көшірмесін таңдаңыз.', video: 'Талдау үшін жеке фото таңдаңыз.',
  decoding: 'Сурет ашылмады. JPEG немесе PNG файлын байқап көріңіз.',
  'heif-timeout': 'HEIC өңдеуге тым көп уақыт кетті. JPEG көшірмесін байқап көріңіз.',
  select: 'Жұлдыз ортасын таңдаңыз.', sufficient: 'Тек түс талдауы', insufficient: 'Дерек жеткіліксіз', calibrated: 'Калибрлеумен бағаланды',
  demo: 'Оқу мысалы · синтетикалық жұлдыздар', image: 'Фотодан өлшеу',
  fitRing: 'Фон сақинасы кадрға сыймады. Радиусты кішірейтіңіз немесе басқа нүкте таңдаңыз.',
  transparent: 'Өлшеу аймағында мөлдір пикселдер бар.', readError: 'Аймақ пикселдерін оқу мүмкін болмады.',
  saturated: 'Қанығу қаупі. Кемінде бір арна ≥ 250.', weak: 'Фонды алғаннан кейін арналардың кемінде бірі нөлден аспайды.',
  background: 'Фон біркелкі емес. Сақинаны ауыстырып көріңіз.', unstable: 'Апертура өзгергенде B/R тұрақтылығы расталмады (шек 5%).',
  calibrationNeeded: 'Калибрлеу қажет.', demoOnly: 'Оқу фотосында түс өлшенеді. Температура мысалы Планк моделінде көрсетілген.',
  matchingNeeded: 'Профильдің камерасын, объективін, пішімін және түсірілім баптауларын фото деректерімен салыстырыңыз.',
  profileConfirmation: 'Түсірілім мен өңдеу сәйкестігін калибрлеу бөлімінде растаңыз.',
  qualityFirst: 'Температура бағасын алу үшін өлшеу сапасын жақсартыңыз.', outsideProfile: 'B/R калибрлеу ауқымынан тыс.',
  boundary: 'Баға калибрлеу ауқымының шетіне жақын.', approximateClass: 'Температураға жуық спектрлік класс',
  fitRange: 'Калибрлеу ауқымы', centering: 'Координаттар', radiusChange: 'Радиус өзгерісінің әсері', redShare: 'Қызыл үлесі',
  srgb: 'Түс профилі — sRGB.', embedded: 'Кірістірілген профиль браузер арқылы sRGB-ге түрлендіріледі.',
  assumed: 'Бастапқы профиль белгісіз. Браузердің sRGB мәндері алынады.',
  'heif-assumed': 'HEIC декодерінің RGB мәндері sRGB деп қабылданады.',
  noProfile: 'Калибрлеу профилі ашылмаған.', profileReady: 'Профиль',
  'profile-fields': 'Міндетті өрістер бос. Профиль үлгісін тексеріңіз.',
  'profile-schema': 'Қолдау көрсетілетін профиль нұсқасы — schema 1.',
  'profile-minimum': '6 калибрлеу жұлдызы және тексеруге 3 бөлек жұлдыз қажет.',
  'profile-duplicate': 'Топтарда жұлдыз атаулары қайталанбауы керек.',
  'profile-values': 'B/R және температура оң сан болуы керек.',
  'profile-monotone': 'Калибрлеу нүктелерінің B/R және температурасы бірге өсуі керек.',
  'profile-range': 'Тексеру жұлдызы калибрлеу ауқымынан тыс.',
  'profile-unreadable': 'JSON файлын оқу мүмкін болмады.',
  saved: 'Өлшем журналға қосылды.', exported: 'CSV дайын.', median: 'B/R медианасы',
  modelOutside: 'Қатынас модельдің ауқымында болуы керек.', modelNote: 'Нәтиже қара дене моделіне қатысты.',
};
const ru = {
  zoom: 'Масштаб', opening: 'Открываю фото…', openingHeif: 'Декодирую HEIC…',
  empty: 'Файл пуст. Выбери другой снимок.', 'file-size': 'Выбери фото меньше 50 МБ.', resolution: 'Выбери фото до 50 мегапикселей.',
  raw: 'Для DNG выбери копию в JPEG или PNG.', video: 'Для анализа выбери отдельный фотоснимок.',
  decoding: 'Фото не открылось. Попробуй JPEG или PNG.',
  'heif-timeout': 'Распаковка HEIC заняла слишком много времени. Попробуй JPEG-копию.',
  select: 'Выбери центр звезды.', sufficient: 'Только анализ цвета', insufficient: 'Недостаточно данных', calibrated: 'Оценено с калибровкой',
  demo: 'Учебный пример · синтетические звёзды', image: 'Измерение по фото',
  fitRing: 'Фоновое кольцо выходит за кадр. Уменьши радиус или выбери другую точку.',
  transparent: 'В области измерения есть прозрачные пиксели.', readError: 'Не удалось прочитать пиксели участка.',
  saturated: 'Риск пересвета. Есть канал со значением ≥ 250.', weak: 'После вычитания фона хотя бы один канал не выше нуля.',
  background: 'Фон неоднороден. Попробуй изменить кольцо.', unstable: 'Проверка B/R на другом радиусе не подтвердила устойчивость в пределах 5%.',
  calibrationNeeded: 'Требуется калибровка.', demoOnly: 'На учебном фото можно измерить цвет. Температура показана во вкладке модели Планка.',
  matchingNeeded: 'Сверь камеру, объектив, формат и настройки профиля с данными фото.',
  profileConfirmation: 'Подтверди совпадение съёмки и обработки в разделе калибровки.',
  qualityFirst: 'Для оценки температуры улучши качество измерения.', outsideProfile: 'B/R вне диапазона калибровки.',
  boundary: 'Оценка близка к границе диапазона калибровки.', approximateClass: 'Ближайший класс по диапазону температуры',
  fitRange: 'Диапазон калибровки', centering: 'Координаты', radiusChange: 'Изменение при смене радиуса', redShare: 'Доля красного',
  srgb: 'Цветовой профиль снимка — sRGB.', embedded: 'Браузер преобразует встроенный профиль в sRGB.',
  assumed: 'Исходный профиль неизвестен. Используются значения sRGB браузера.',
  'heif-assumed': 'Значения RGB декодера HEIC приняты за sRGB.',
  noProfile: 'Профиль камеры ещё не загружен.', profileReady: 'Профиль',
  'profile-fields': 'Обязательные поля пусты. Сверь файл с шаблоном.',
  'profile-schema': 'Поддерживается версия профиля schema 1.',
  'profile-minimum': 'Нужно 6 калибровочных звёзд и 3 отдельные звезды для проверки.',
  'profile-duplicate': 'Названия звёзд в группах не должны повторяться.',
  'profile-values': 'B/R и температура должны быть положительными числами.',
  'profile-monotone': 'B/R и температура калибровочных точек должны увеличиваться вместе.',
  'profile-range': 'Проверочная звезда находится за пределами диапазона калибровки.',
  'profile-unreadable': 'Не удалось прочитать JSON.',
  saved: 'Измерение добавлено в журнал.', exported: 'CSV готов.', median: 'Медиана B/R',
  modelOutside: 'Значение должно попадать в диапазон модели.', modelNote: 'Результат относится к модели чёрного тела.',
};
for (const node of document.querySelectorAll('[data-text]')) ru[node.dataset.text] ??= node.textContent;
for (const node of document.querySelectorAll('[data-label]')) ru[node.dataset.label] ??= node.getAttribute('aria-label');

let language = 'ru';
export function t(key) { return (language === 'kk' ? kk[key] : ru[key]) ?? ru[key] ?? key; }
export function numeric(value, digits = 0) {
  if (!Number.isFinite(value)) return '—';
  return new Intl.NumberFormat(language === 'kk' ? 'kk-KZ' : 'ru-RU', {
    maximumFractionDigits: digits, minimumFractionDigits: digits,
  }).format(value);
}

export function translate(value) {
  language = value === 'kk' ? 'kk' : 'ru';
  document.documentElement.lang = language;
  document.title = 'StarSpektra · ' + t('title');
  for (const node of document.querySelectorAll('[data-text]')) node.textContent = t(node.dataset.text);
  for (const node of document.querySelectorAll('[data-label]')) node.setAttribute('aria-label', t(node.dataset.label));
  for (const item of document.querySelectorAll('[data-language]')) item.setAttribute('aria-pressed', String(item.dataset.language === language));
}
