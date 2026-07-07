# DayZ Config Static Site Generator

Собирает **статический сайт** (без бэкенда) из конфигов DayZ: парсер строит данные,
переводит плейсхолдеры и пишет `dist/` — папку, которую можно залить на любой статический
хостинг (GitHub Pages, S3, nginx…) и смотреть онлайн.

## Как это работает

- Проект — консольное приложение, но **генерация запускается автоматически после билда**
  (MSBuild‑таргет `GenerateStaticSite`, `AfterTargets="Build"`). То есть достаточно собрать
  проект в IDE — `dist/` обновится.
- В `dist/`:
  - `data.json` — весь контент (список классов + карточки), построенный
    [`SiteExport.BuildSite`](../DayzConfigParser/Export.cs);
  - `index.html`, `styles.css`, `app.js` — фронтенд, **скопированный** из
    [`../DayzConfigWeb/wwwroot`](../DayzConfigWeb/wwwroot) (один исходник на live и static);
  - `datasource.js` — статическая реализация `window.DS` (читает `data.json` вместо API).

Фронтенд одинаковый для live‑веба и статики; отличается только `datasource.js`
(API‑версия в `wwwroot`, static‑версия пишется генератором).

## Сборка

В IDE: собрать проект `DayzConfigStaticGen` → `dist/` готов.

CLI:
```powershell
cd D:\dayz-sources\_tools\DayzConfigStaticGen
dotnet build                      # соберёт и сгенерирует dist/
dotnet build -p:SkipSiteGen=true  # только сборка, без генерации
```

Пути и язык — в [`appsettings.json`](appsettings.json) (`ConfigFolder`, `LanguageFolder`,
`Language`, `FrontendFolder`, `OutputFolder`). Читается из папки проекта при запуске.

## Публикация

Залейте **содержимое `dist/`** на статический хостинг. Включите gzip на сервере — `data.json`
(~10 МБ) сжимается до ~0.6 МБ. Локальная проверка:
```powershell
python -m http.server 5174 --directory dist
# http://localhost:5174
```

## Только `scope = 2`

В список попадают лишь классы с `scope = 2` (реальные, спавнящиеся предметы) — базовые и
абстрактные классы исключены. Фильтр — `SiteExport.IsListed`, общий и для live‑веба, и для
статики. Предметы в слотах тоже отфильтрованы по `scope = 2`, чтобы каждая ссылка вела на
существующую карточку.
