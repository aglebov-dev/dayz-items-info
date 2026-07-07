using DayzConfig;

var builder = WebApplication.CreateBuilder(args);
builder.Services.AddSingleton<ModelHost>();

var app = builder.Build();

app.UseDefaultFiles();
app.UseStaticFiles();

// Force the model to load eagerly at startup so the first request is fast.
var host = app.Services.GetRequiredService<ModelHost>();
app.Logger.LogInformation("Loaded {Files} files, {Classes} classes, {Listed} listed (scope=2), {Tr} translations.",
    host.Model.ParsedFiles.Count, host.ClassCount, host.ItemClasses.Count, host.Model.Translations?.Count ?? 0);

// ---- API -------------------------------------------------------------------

app.MapGet("/api/status", (ModelHost h) => new
{
    configFolder = h.ConfigFolder,
    files = h.Model.ParsedFiles.Count,
    classes = h.ClassCount,
    itemClasses = h.ItemClasses.Count,
    translations = h.Model.Translations?.Count ?? 0,
    parseErrors = h.Model.Errors.Count,
});

app.MapGet("/api/scopes", (ModelHost h) => SiteExport.Scopes(h.Model));

app.MapGet("/api/classes", (ModelHost h, string? search, string? scope, int? limit) =>
{
    IEnumerable<ConfigClass> q = h.ItemClasses;
    if (!string.IsNullOrWhiteSpace(scope))
        q = q.Where(c => string.Equals(SiteExport.TopScope(c), scope, StringComparison.OrdinalIgnoreCase));

    if (!string.IsNullOrWhiteSpace(search))
    {
        string s = search.Trim();
        q = q.Where(c =>
            c.Name.Contains(s, StringComparison.OrdinalIgnoreCase) ||
            (h.Model.GetString(c, "displayName")?.Contains(s, StringComparison.OrdinalIgnoreCase) ?? false));
    }

    var ordered = q.OrderBy(c => c.Name, StringComparer.OrdinalIgnoreCase).ToList();
    int max = limit is > 0 ? Math.Min(limit.Value, 5000) : 500;
    var items = ordered.Take(max).Select(c => SiteExport.Summary(h.Model, c));

    return Results.Ok(new { total = ordered.Count, shown = Math.Min(max, ordered.Count), items });
});

app.MapGet("/api/class", (ModelHost h, string path) =>
{
    var c = h.Model.FindByPath(path) ?? h.Model.Find(path);
    if (c == null) return Results.NotFound(new { error = $"class '{path}' not found" });
    return Results.Ok(SiteExport.Detail(h.Model, c, h.ConfigFolder));
});

app.Run();


// ---- Model host ------------------------------------------------------------

/// <summary>Loads the config model + translations once and exposes it to the API.</summary>
sealed class ModelHost
{
    public ConfigModel Model { get; }
    public string ConfigFolder { get; }
    public int ClassCount { get; }
    public IReadOnlyList<ConfigClass> ItemClasses { get; }

    public ModelHost(IConfiguration config, ILogger<ModelHost> log)
    {
        var section = config.GetSection("Dayz");
        ConfigFolder = section["ConfigFolder"] ?? Directory.GetCurrentDirectory();
        string? langFolder = section["LanguageFolder"];
        string language = section["Language"] ?? "russian";

        Model = ConfigModel.LoadFolder(ConfigFolder);
        ClassCount = Model.AllClasses().Count();

        if (!string.IsNullOrWhiteSpace(langFolder) && Directory.Exists(langFolder))
        {
            Model.LoadTranslations(langFolder, language);
            log.LogInformation("Translations '{Lang}': {Count} keys.", language, Model.Translations?.Count ?? 0);
        }

        ItemClasses = SiteExport.Listed(Model).ToList();
    }
}
