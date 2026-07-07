# DayZ Config Explorer (веб)

ASP.NET Core приложение поверх парсера [`DayzConfigParser`](../DayzConfigParser): список
классов с поиском справа, карточка выбранного класса слева (свойства с учётом наследования,
слоты и совместимые предметы). Плейсхолдеры переводов (`$STR_…`) подменяются на русский из
`stringtable.csv`.

## Запуск

```powershell
cd D:\dayz-sources\_tools\DayzConfigWeb
dotnet run -c Release -- --urls http://localhost:5173
# открыть http://localhost:5173
```

Пути к данным — в [`appsettings.json`](appsettings.json):

| Ключ | Значение |
|---|---|
| `Dayz:ConfigFolder` | папка с `config.cpp` (по умолчанию `kr_weaponpack_cfg`) |
| `Dayz:LanguageFolder` | папка со `stringtable.csv` (`kr_weaponpack/.../data/language`) |
| `Dayz:Language` | колонка перевода (`russian`) |

## Как устроено

- **`Program.cs`** — грузит модель один раз при старте (`ModelHost`), применяет переводы,
  отдаёт статику из `wwwroot` и JSON‑API.
- **`wwwroot/`** — SPA без сборки: `index.html` + `styles.css` + `app.js` (vanilla JS).

### API

| Метод | Ответ |
|---|---|
| `GET /api/status` | папка конфигов, число файлов/классов/переводов (для диагностики) |
| `GET /api/scopes` | области верхнего уровня (`cfgWeapons`, `CfgVehicles`, …) + счётчики |
| `GET /api/classes?search=&scope=&limit=` | список классов‑предметов (имя, путь, область, `displayName`) |
| `GET /api/class?path=cfgWeapons.kr_FN_F2000` | карточка: свойства (с флагом наследования и источником), цепочка наследования, `slots` (сырые) и `slotGroups` (логические) |

«Классы‑предметы» = прямые потомки области (глубина 2) **с `scope = 2`** (реальные,
спавнящиеся предметы); базовые/абстрактные классы и вложенные под‑блоки (`OpticsInfo`,
`DamageSystem`) в список не попадают. Фильтр и формирование JSON — в общем
[`SiteExport`](../DayzConfigParser/Export.cs), который используют и live‑API, и генератор
статики.

Фронтенд обращается к данным только через `window.DS` (см. `wwwroot/datasource.js`), поэтому
тот же `app.js`/`index.html`/`styles.css` работает и в live‑режиме (через API), и в статике
(через `data.json`). Статическую сборку делает [`DayzConfigStaticGen`](../DayzConfigStaticGen)
— папку `dist/` можно залить на любой хостинг без бэкенда.

Список грузится целиком при открытии страницы; в пустой карточке показан статус загрузки
(число классов/переводов и путь `ConfigFolder`, если данных нет). Слоты по умолчанию
показаны **сгруппированными** в логические точки крепления; чекбокс «показать все слоты»
переключает на сырой список из `attachments[]`.

## Переводы (в модели)

Загрузка и подмена живут в парсере, поэтому доступны и в CLI, и в вебе:

- `TranslationTable.LoadFolder(langFolder, "russian")` — рекурсивно читает все
  `stringtable.csv` (потоковый CSV‑парсер: кавычки, `""`, переносы строк).
- `ConfigModel.LoadTranslations(langFolder)` → `ApplyTranslations` проставляет
  `ScalarValue.Display` для строк‑плейсхолдеров (`$STR_…`/`#STR_…`).
- `ScalarValue.Effective` / `AsString()` возвращают перевод, если он есть, иначе исходный
  ключ. `Raw` сохраняет оригинал.
