using System.Text.Encodings.Web;
using System.Text.Json;
using DayzConfig;

// Static-site generator: parses the DayZ config, resolves translations, and writes a
// self-contained folder (data.json + copied frontend) that can be uploaded to any static
// host and browsed offline — no ASP.NET backend required.

var jsonRead = new JsonSerializerOptions { PropertyNameCaseInsensitive = true };
string settingsPath = File.Exists("appsettings.json")
    ? "appsettings.json"
    : Path.Combine(AppContext.BaseDirectory, "appsettings.json");

var root = JsonSerializer.Deserialize<RootSettings>(File.ReadAllText(settingsPath), jsonRead)
           ?? throw new InvalidOperationException("appsettings.json could not be read.");
var s = root.Dayz;

string configFolder = s.ConfigFolder ?? throw new InvalidOperationException("Dayz:ConfigFolder is required.");
string frontendFolder = Path.GetFullPath(s.FrontendFolder ?? "../DayzConfigWeb/wwwroot");
string outDir = Path.GetFullPath(s.OutputFolder ?? "dist");

Console.WriteLine($"[static-gen] parsing {configFolder}");
var model = ConfigModel.LoadFolder(configFolder);

if (!string.IsNullOrWhiteSpace(s.LanguageFolder) && Directory.Exists(s.LanguageFolder))
{
    model.LoadTranslations(s.LanguageFolder, s.Language ?? "russian");
    Console.WriteLine($"[static-gen] translations: {model.Translations?.Count ?? 0} keys");
}

var site = SiteExport.BuildSite(model, configFolder);
int listedCount = SiteExport.Listed(model).Count();

Directory.CreateDirectory(outDir);

var jsonWrite = new JsonSerializerOptions
{
    Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping, // keep Cyrillic readable
    WriteIndented = false,
};
string dataPath = Path.Combine(outDir, "data.json");
File.WriteAllText(dataPath, JsonSerializer.Serialize(site, jsonWrite));

// Copy the shared frontend, then write the static data source (replaces the API one).
foreach (var name in new[] { "index.html", "styles.css", "app.js" })
{
    string src = Path.Combine(frontendFolder, name);
    if (File.Exists(src)) File.Copy(src, Path.Combine(outDir, name), overwrite: true);
    else Console.WriteLine($"[static-gen] WARNING: frontend file not found: {src}");
}
File.WriteAllText(Path.Combine(outDir, "datasource.js"), StaticDataSourceJs);

long size = new FileInfo(dataPath).Length;
Console.WriteLine($"[static-gen] {listedCount} classes (scope=2), data.json {size / 1024.0:F0} KB");
Console.WriteLine($"[static-gen] wrote static site to: {outDir}");
return 0;


record DayzSettings(
    string? ConfigFolder, string? LanguageFolder, string? Language,
    string? FrontendFolder, string? OutputFolder);
record RootSettings(DayzSettings Dayz);

partial class Program
{
    // Static data source: same window.DS contract as the API version, but reads data.json.
    private const string StaticDataSourceJs = """
        "use strict";
        // Static data source: reads a pre-generated data.json (no server needed).
        let _data = null;
        async function _load() {
          if (!_data) {
            const r = await fetch("data.json");
            if (!r.ok) throw new Error("data.json " + r.status);
            _data = await r.json();
          }
          return _data;
        }
        window.DS = {
          mode: "static",
          async status() {
            const d = await _load();
            return { configFolder: "(статическая сборка)", files: d.generatedFiles,
                     classes: d.classesCount, itemClasses: d.classes.length, translations: d.translations };
          },
          async scopes() { return (await _load()).scopes; },
          async classes({ search, scope, limit } = {}) {
            const d = await _load();
            let items = d.classes;
            if (scope) { const sc = scope.toLowerCase(); items = items.filter(c => (c.scope || "").toLowerCase() === sc); }
            if (search) { const s = search.toLowerCase(); items = items.filter(c =>
              c.name.toLowerCase().includes(s) || (c.display || "").toLowerCase().includes(s)); }
            const total = items.length, max = limit || 5000;
            return { total, shown: Math.min(max, total), items: items.slice(0, max) };
          },
          async detail(path) { return (await _load()).details[path] || null; },
        };
        """;
}
